/**
 * Builds the Claude Desktop extension (cosmos-mcp.mcpb).
 *
 *   bun run build:mcpb
 *
 * Claude Desktop runs the extension with its own Node, so users who have no
 * Node install can still use the server, and the token goes in a masked
 * settings field instead of a hand-edited JSON file.
 *
 * The bundle is the same dist/index.js that npm ships, plus mcpb/manifest.json
 * with the version copied from package.json.
 */

import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import pkg from "../package.json" with { type: "json" };

const root = join(import.meta.dir, "..");
const stage = join(root, "build", "mcpb");
const out = join(root, `cosmos-mcp-${pkg.version}.mcpb`);

rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, "server"), { recursive: true });

cpSync(join(root, "dist", "index.js"), join(stage, "server", "index.js"));
cpSync(join(root, "LICENSE"), join(stage, "LICENSE"));

const manifest = await Bun.file(join(root, "mcpb", "manifest.json")).json();
manifest.version = pkg.version;
await Bun.write(join(stage, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

await Bun.$`bunx @anthropic-ai/mcpb@2.1.2 validate ${join(stage, "manifest.json")}`;
await Bun.$`bunx @anthropic-ai/mcpb@2.1.2 pack ${stage} ${out}`;
console.error(`Wrote ${out}`);
