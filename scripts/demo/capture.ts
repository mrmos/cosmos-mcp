/**
 * Demo GIF, step 1 of 2: capture real tool output.
 *
 * Regenerate the README demo with:
 *
 *   bun run scripts/demo/capture.ts && bun run scripts/demo/render.ts
 *
 * This starts the built server (dist/index.js) signed out, talks MCP JSON-RPC to
 * it over stdio, and runs cosmos_search for a few candidate briefs until one
 * returns enough public-domain images. Only results whose
 * `source.isPublicDomain === true` are kept, because the GIF is committed to a
 * public repo. It then calls cosmos_view_images on the chosen ids and stores the
 * returned images, shrunk with ffmpeg, in scripts/demo/assets/. Everything the
 * animation shows comes from scripts/demo/capture.json.
 *
 * Network: a few read-only, public requests to api.cosmos.so (one search per
 * brief tried, plus one cosmos_view_images call).
 */
import { mkdtempSync, mkdirSync, copyFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");
const DEMO = join(ROOT, "scripts/demo");
const ASSETS = join(DEMO, "assets");
const FFMPEG = Bun.which("ffmpeg") ?? "/opt/homebrew/bin/ffmpeg";

// Tried in order; the first with at least MIN public-domain images wins.
// Pass briefs as arguments to override the list.
//
// Why these briefs: the GIF is committed to a public repository, so it shows
// only images that Cosmos flags `isPublicDomain`. Cosmos sets that flag only on
// images from The Public Domain Review, so most design briefs return none. On
// 2026-11-19, of 40 image results: "warm brutalist interiors" 0, "bauhaus color
// study" 0, "paper marbling patterns" 0, "antique type specimen" 2, "Ernst
// Haeckel" 9, "Maria Sibylla Merian" 11, "scientific illustration plates" 12.
//
// Searching an artist's name, not a description, is also what the server
// instructions tell agents to do for specialist subjects, so the GIF shows a
// designer's brief in the prompt and the name the agent actually searched.
const BRIEFS = process.argv.slice(2).length > 0 ? process.argv.slice(2) : [
  "Ernst Haeckel",
  "Maria Sibylla Merian",
  "scientific illustration plates",
];

/** What the user types in the GIF, for each default brief. Others get a generic line. */
const PROMPTS: Record<string, string> = {
  "Ernst Haeckel": "Moodboard for a jellyfish-inspired textile print. Start from Ernst Haeckel's sea creatures.",
  "Maria Sibylla Merian": "Moodboard for a botanical packaging range. Start from Maria Sibylla Merian's insect plates.",
  "scientific illustration plates": "Moodboard for a museum identity: antique scientific illustration plates.",
};
const promptFor = (brief: string) => PROMPTS[brief] ?? `Build me a moodboard: "${brief}"`;
const MIN = 8;
const KEEP = 8; // cosmos_view_images takes at most eight ids
const LIMIT = 40;

// ---------------------------------------------------------------------------
// Start the server signed out.

if (!existsSync(join(ROOT, "dist/index.js"))) {
  await Bun.$`bun run build`.cwd(ROOT);
}

// Copy the bundle into an empty temp package so it cannot pick up a repo-level
// .env (the server reads ../.env relative to dist/index.js), and point
// XDG_CONFIG_HOME at an empty dir so no stored login is found.
const tmp = mkdtempSync(join(tmpdir(), "cosmos-mcp-demo-"));
mkdirSync(join(tmp, "pkg/dist"), { recursive: true });
mkdirSync(join(tmp, "config"));
copyFileSync(join(ROOT, "dist/index.js"), join(tmp, "pkg/dist/index.js"));

const env: Record<string, string> = {};
for (const [k, v] of Object.entries(process.env)) {
  if (v !== undefined && !k.startsWith("COSMOS_")) env[k] = v;
}
env.XDG_CONFIG_HOME = join(tmp, "config");

const proc = Bun.spawn(["node", join(tmp, "pkg/dist/index.js"), "serve"], {
  cwd: tmp,
  env,
  stdin: "pipe",
  stdout: "pipe",
  stderr: "inherit",
});

// ---------------------------------------------------------------------------
// Minimal newline-delimited JSON-RPC client.

let nextId = 1;
const pending = new Map<number, (msg: any) => void>();

(async () => {
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of proc.stdout) {
    buf += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (typeof msg.id === "number" && pending.has(msg.id)) {
        pending.get(msg.id)!(msg);
        pending.delete(msg.id);
      }
    }
  }
})();

function send(msg: object) {
  proc.stdin.write(JSON.stringify(msg) + "\n");
  proc.stdin.flush();
}

function request(method: string, params: object): Promise<any> {
  const id = nextId++;
  const done = new Promise<any>((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`${method} timed out`)), 60_000);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      if (msg.error) rej(new Error(`${method}: ${JSON.stringify(msg.error)}`));
      else res(msg.result);
    });
  });
  send({ jsonrpc: "2.0", id, method, params });
  return done;
}

async function callTool(name: string, args: object) {
  const result = await request("tools/call", { name, arguments: args });
  if (result.isError) throw new Error(`${name} failed: ${result.content?.[0]?.text}`);
  return result;
}

// ---------------------------------------------------------------------------

try {
  const init = await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "cosmos-mcp-demo-capture", version: "1.0.0" },
  });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  console.error(`connected to ${init.serverInfo?.name} ${init.serverInfo?.version}`);

  let chosen: { query: string; args: object; summary: string; totalCount: number | null; items: any[]; pd: any[] } | null =
    null;
  const tried: { query: string; returned: number; publicDomain: number }[] = [];

  for (const query of BRIEFS) {
    const args = { query, contentType: "IMAGE", limit: LIMIT };
    const res = await callTool("cosmos_search", args);
    const data = res.structuredContent;
    const items: any[] = data.items ?? [];
    const pd = items.filter(
      (e) => e.source?.isPublicDomain === true && e.media?.kind === "image" && !e.media?.nsfw && e.media?.thumbnailUrl,
    );
    tried.push({ query, returned: items.length, publicDomain: pd.length });
    console.error(`"${query}": ${items.length} results, ${pd.length} public domain`);
    if (process.env.DEMO_DEBUG) {
      const hosts = (list: any[]) =>
        list.map((e) => { try { return new URL(e.source?.url).host; } catch { return "-"; } }).join(" ");
      console.error(`  pd hosts: ${hosts(pd)}`);
      console.error(`  all hosts: ${hosts(items)}`);
    }
    if (pd.length >= MIN) {
      chosen = { query, args, summary: data.summary, totalCount: data.totalCount ?? null, items, pd };
      break;
    }
  }
  if (!chosen) throw new Error(`no brief returned ${MIN}+ public-domain images: ${JSON.stringify(tried)}`);

  const picked = chosen.pd.slice(0, KEEP);
  const viewArgs = { elementIds: picked.map((e) => e.id), width: 400 };
  const view = await callTool("cosmos_view_images", viewArgs);

  // Pair each image block with the text block before it ("Element <id> — ...").
  rmSync(ASSETS, { recursive: true, force: true });
  mkdirSync(ASSETS, { recursive: true });
  const images = new Map<number, { data: string; mimeType: string }>();
  let currentId: number | null = null;
  for (const block of view.content) {
    if (block.type === "text") {
      const m = /^Element (\d+)/.exec(block.text);
      currentId = m ? Number(m[1]) : null;
    } else if (block.type === "image" && currentId !== null) {
      images.set(currentId, { data: block.data, mimeType: block.mimeType });
    }
  }

  const tiles = [];
  for (const e of picked) {
    const img = images.get(e.id);
    if (!img) continue;
    const raw = join(tmp, `${e.id}.src`);
    await Bun.write(raw, Buffer.from(img.data, "base64"));
    const file = `${e.id}.jpg`;
    await Bun.$`${FFMPEG} -loglevel error -y -i ${raw} -vf scale=300:-2:flags=lanczos -q:v 5 ${join(ASSETS, file)}`;
    const probe = await Bun.$`${FFMPEG} -i ${join(ASSETS, file)} 2>&1 || true`.text();
    const dim = /, (\d+)x(\d+)/.exec(probe);
    tiles.push({
      id: e.id,
      url: e.url,
      caption: e.caption,
      owner: e.owner?.username ?? null,
      source: e.source,
      imageUrl: e.media?.url ?? null,
      thumbnailUrl: e.media?.thumbnailUrl ?? null,
      asset: `assets/${file}`,
      width: dim ? Number(dim[1]) : 300,
      height: dim ? Number(dim[2]) : 300,
    });
  }
  if (tiles.length < MIN) throw new Error(`only ${tiles.length} images rendered`);

  const capture = {
    capturedAt: new Date().toISOString(),
    server: init.serverInfo,
    signedIn: false,
    triedBriefs: tried,
    brief: chosen.query,
    prompt: promptFor(chosen.query),
    search: {
      tool: "cosmos_search",
      arguments: chosen.args,
      summary: chosen.summary,
      totalCount: chosen.totalCount,
      returned: chosen.items.length,
      publicDomain: chosen.pd.length,
    },
    view: {
      tool: "cosmos_view_images",
      arguments: viewArgs,
      summary: view.structuredContent?.summary ?? view.content[0]?.text,
    },
    tiles,
  };
  await Bun.write(join(DEMO, "capture.json"), JSON.stringify(capture, null, 2) + "\n");
  console.error(`wrote capture.json with ${tiles.length} tiles for "${chosen.query}"`);
  console.error(`assets: ${readdirSync(ASSETS).length} files`);
} finally {
  proc.kill();
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(0);
