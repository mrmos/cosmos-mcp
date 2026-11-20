/**
 * Copies the package.json version into every file that repeats it. `npm version`
 * runs this, and test/catalog.test.ts fails if the files drift.
 */

import { join } from "node:path";
import pkg from "../package.json" with { type: "json" };

const root = join(import.meta.dir, "..");
const v = pkg.version;

async function edit(path: string, change: (json: any) => void) {
  const file = Bun.file(join(root, path));
  const json = await file.json();
  change(json);
  await Bun.write(file, JSON.stringify(json, null, 2) + "\n");
}

await edit("server.json", (s) => {
  s.version = v;
  for (const p of s.packages) p.version = v;
});
await edit("plugin/.claude-plugin/plugin.json", (p) => {
  p.version = v;
});
await edit("plugin/.mcp.json", (m) => {
  m.mcpServers.cosmos.args = ["-y", `${pkg.name}@${v}`];
});
console.error(`Synced version ${v}.`);
