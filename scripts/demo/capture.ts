/**
 * Demo GIF, step 1 of 2: capture real tool output.
 *
 * Regenerate the README demo with:
 *
 *   bun run scripts/demo/capture.ts && bun run scripts/demo/render.ts
 *
 * This starts the built server (dist/index.js) signed in, talks MCP JSON-RPC to
 * it over stdio, runs cosmos_search once per query, then calls
 * cosmos_view_images on the chosen results and stores the returned images,
 * shrunk with ffmpeg, in scripts/demo/assets/. Everything the animation shows
 * comes from scripts/demo/capture.json.
 *
 * The brief is a real one: a reference board for a site hero with a chrome
 * pointing-glove cursor and a glitchy CRT-glass orb. The queries are the ones
 * an agent would split that brief into, and two of their results are already
 * on that board. The images are not public domain.
 *
 * It runs signed in (run `bun run index.ts login` first) because Cosmos
 * personalizes search: signed out, the same queries return other images, and
 * none from that board.
 *
 * Which images appear: PICK below (or DEMO_PICK, comma-separated element ids
 * in display order) chooses them from the search results, which is how the
 * committed GIF was made. With your own queries as arguments and no DEMO_PICK,
 * the script takes the first images of each query in turn.
 *
 * Network: one read-only search per query, plus one
 * cosmos_view_images call.
 */
import { rmSync } from "node:fs";
import { join } from "node:path";
import { DEMO, saveViewedImages, startServer } from "./mcp";

const customQueries = process.argv.slice(2);
const QUERIES = customQueries.length > 0 ? customQueries : [
  "chrome pointing hand",
  "glitch CRT",
  "chromatic aberration glass",
];
const PROMPT =
  process.env.DEMO_PROMPT ?? "Moodboard for a site hero: a chrome pointing-glove cursor and a glitchy CRT-glass orb.";
const PICK = process.env.DEMO_PICK
  ? process.env.DEMO_PICK.split(",").map((s) => Number(s.trim()))
  : customQueries.length > 0
    ? null
    : [1120601128, 1051226712, 1833414104, 1425210929, 983892966, 461120264, 1502361040, 1231349542];
const KEEP = 8; // cosmos_view_images takes at most eight ids
const LIMIT = 40;

const isImage = (e: any) =>
  (e.media?.kind === "image" || e.media?.kind === "animated") && !e.media?.nsfw && e.media?.thumbnailUrl;

const server = await startServer({ signedIn: true });
try {
  const searches: { query: string; summary: string; totalCount: number | null; items: any[] }[] = [];
  for (const query of QUERIES) {
    const res = await server.callTool("cosmos_search", { query, contentType: "IMAGE", limit: LIMIT });
    const data = res.structuredContent;
    searches.push({ query, summary: data.summary, totalCount: data.totalCount ?? null, items: data.items ?? [] });
    console.error(`"${query}": ${data.items?.length ?? 0} of ${data.totalCount ?? "?"}`);
  }

  let picked: any[];
  if (PICK) {
    const byId = new Map(searches.flatMap((s) => s.items).map((e) => [e.id, e]));
    const missing = PICK.filter((id) => !byId.has(id));
    if (missing.length) throw new Error(`not in these search results: ${missing.join(", ")}. Set DEMO_PICK.`);
    picked = PICK.map((id) => byId.get(id));
  } else {
    // Round-robin over the queries, so each one shows.
    const lists = searches.map((s) => s.items.filter(isImage));
    picked = [];
    for (let i = 0; picked.length < KEEP && lists.some((l) => i < l.length); i++) {
      for (const l of lists) if (l[i] && picked.length < KEEP && !picked.includes(l[i])) picked.push(l[i]);
    }
  }
  picked = picked.slice(0, KEEP);

  const viewArgs = { elementIds: picked.map((e) => e.id), previewWidth: 400 };
  const view = await server.callTool("cosmos_view_images", viewArgs);
  rmSync(join(DEMO, "assets"), { recursive: true, force: true });
  const tiles = await saveViewedImages(server, view, picked, "assets");
  if (tiles.length < picked.length) throw new Error(`only ${tiles.length} of ${picked.length} images rendered`);

  const shortIds = (ids: number[]) => (ids.length <= 2 ? ids.join(", ") : `${ids[0]}, ${ids[1]}, …${ids.length - 2} more`);
  const capture = {
    capturedAt: new Date().toISOString(),
    server: server.serverInfo,
    signedIn: true,
    prompt: PROMPT,
    // What the chat column shows, one entry per tool call.
    calls: [
      ...searches.map((s) => ({
        tool: "cosmos_search",
        args: `"${s.query}"`,
        result: `→ ${s.items.length} of ${s.totalCount ?? "?"}`,
      })),
      {
        tool: "cosmos_view_images",
        args: `[${shortIds(viewArgs.elementIds)}]`,
        result: `→ ${String(view.structuredContent?.summary ?? view.content[0]?.text).replace(/\.$/, "")}`,
        reveal: "tiles",
      },
    ],
    done: `Done. ${tiles.length} images: chrome hands, CRT glitch, glass.`,
    footer: "Replay of real tool output",
    cardNote: "Unofficial. Replay of real tool output",
    searches: searches.map((s) => ({ query: s.query, summary: s.summary, totalCount: s.totalCount, returned: s.items.length })),
    view: { arguments: viewArgs, summary: view.structuredContent?.summary ?? view.content[0]?.text },
    tiles,
  };
  await Bun.write(join(DEMO, "capture.json"), JSON.stringify(capture, null, 2) + "\n");
  console.error(`wrote capture.json with ${tiles.length} tiles from ${searches.length} searches`);
} finally {
  server.close();
}
process.exit(0);
