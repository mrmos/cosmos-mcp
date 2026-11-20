/**
 * Second demo GIF, step 1 of 2: "find more like my board", from real tool output.
 *
 * Regenerate it with:
 *
 *   bun run scripts/demo/capture-similar.ts && \
 *     bun run scripts/demo/render.ts scripts/demo/capture-similar.json docs/demo-similar.gif
 *
 * Unlike capture.ts this one runs signed in, because it reads one of your own
 * boards: run `bun run index.ts login` first. The board is private, so the
 * GIF shows images that are not public domain; only publish it if you have
 * the right to.
 *
 * It calls cosmos_get_cluster on the board link, cosmos_list_cluster_elements
 * for a strip of the board's own images, cosmos_cluster_recommendations for
 * images like it, and cosmos_view_images on the ones shown. Every call is
 * read-only.
 *
 * Which images appear: by default the first images on the board and the first
 * recommendations. DEMO_SEEDS and DEMO_PICK (comma-separated element ids)
 * choose them instead, which is how the committed GIF was made: the
 * recommendations are a long, mixed list, and a person picked eight that read
 * well at thumbnail size.
 */
import { rmSync } from "node:fs";
import { join } from "node:path";
import { DEMO, saveViewedImages, startServer } from "./mcp";

const BOARD = process.argv[2] ?? "https://www.cosmos.so/meemoh/glove-and-haunted-glass";
const PROMPT = process.env.DEMO_PROMPT ?? "Find me more images like my board, glove & haunted glass.";
const SEEDS = 4;
const KEEP = 8; // cosmos_view_images takes at most eight ids
const ids = (raw: string | undefined) => (raw ? raw.split(",").map((s) => Number(s.trim())) : null);
const wantSeeds = ids(process.env.DEMO_SEEDS);
const wantPick = ids(process.env.DEMO_PICK);

const isImage = (e: any) =>
  (e.media?.kind === "image" || e.media?.kind === "animated") && !e.media?.nsfw && e.media?.thumbnailUrl;

/** The listed elements with these ids, in that order, or the first `n` images. */
function choose(items: any[], want: number[] | null, n: number): any[] {
  if (!want) return items.filter(isImage).slice(0, n);
  const byId = new Map(items.map((e) => [e.id, e]));
  const missing = want.filter((id) => !byId.has(id));
  if (missing.length) throw new Error(`not in the listing: ${missing.join(", ")}`);
  return want.map((id) => byId.get(id));
}

const server = await startServer({ signedIn: true });
try {
  const clusterArgs = { url: BOARD };
  const clusterRes = await server.callTool("cosmos_get_cluster", clusterArgs);
  const cluster = clusterRes.structuredContent.cluster;
  console.error(`board: ${cluster.name} (${cluster.elementCount} elements, private: ${cluster.isPrivate})`);

  const listArgs = { clusterId: cluster.id, limit: 20 };
  const listRes = await server.callTool("cosmos_list_cluster_elements", listArgs);
  const seeds = choose(listRes.structuredContent.items ?? [], wantSeeds, SEEDS);

  const recArgs = { clusterId: cluster.id };
  const recRes = await server.callTool("cosmos_cluster_recommendations", recArgs);
  const recs: any[] = recRes.structuredContent.items ?? [];
  const picked = choose(recs, wantPick, KEEP);
  console.error(`${recs.length} recommendations, showing ${picked.length}`);

  const seedView = await server.callTool("cosmos_view_images", { elementIds: seeds.map((e) => e.id), previewWidth: 300 });
  const viewArgs = { elementIds: picked.map((e) => e.id), previewWidth: 400 };
  const view = await server.callTool("cosmos_view_images", viewArgs);

  rmSync(join(DEMO, "assets-similar"), { recursive: true, force: true });
  const seedTiles = await saveViewedImages(server, seedView, seeds, "assets-similar");
  const tiles = await saveViewedImages(server, view, picked, "assets-similar");
  if (tiles.length < picked.length) throw new Error(`only ${tiles.length} of ${picked.length} images rendered`);

  const shortIds = (list: number[]) => (list.length <= 2 ? list.join(", ") : `${list[0]}, ${list[1]}, …${list.length - 2} more`);
  const capture = {
    capturedAt: new Date().toISOString(),
    server: server.serverInfo,
    signedIn: true,
    prompt: PROMPT,
    // What the chat column shows, one entry per tool call. `reveal` says what
    // appears on the right when the call returns.
    calls: [
      {
        tool: "cosmos_get_cluster",
        args: BOARD.replace(/^https?:\/\/(www\.)?/, ""),
        result: `→ "${cluster.name}" · ${cluster.elementCount} elements · ${cluster.isPrivate ? "private" : "public"}`,
        reveal: "header",
      },
      {
        tool: "cosmos_list_cluster_elements",
        args: `cluster ${cluster.id} · limit ${listArgs.limit}`,
        result: `→ ${listRes.structuredContent.items?.length ?? 0} elements`,
        reveal: "seeds",
      },
      {
        tool: "cosmos_cluster_recommendations",
        args: `cluster ${cluster.id}`,
        result: `→ ${recs.length} recommendations`,
      },
      {
        tool: "cosmos_view_images",
        args: `[${shortIds(viewArgs.elementIds)}]`,
        result: `→ ${String(view.structuredContent?.summary ?? view.content[0]?.text).replace(/\.$/, "")}`,
        reveal: "tiles",
      },
    ],
    done: `Done. ${tiles.length} images like your board, ready to save.`,
    board: { name: cluster.name, url: cluster.url, elementCount: cluster.elementCount, isPrivate: cluster.isPrivate },
    seedsLabel: "Your board",
    tilesLabel: "More like this",
    footer: "Replay of real tool output",
    cardNote: "Unofficial. Replay of real tool output",
    calledTools: {
      cluster: { arguments: clusterArgs, summary: clusterRes.structuredContent.summary },
      list: { arguments: listArgs, summary: listRes.structuredContent.summary },
      recommendations: { arguments: recArgs, summary: recRes.structuredContent.summary },
      view: { arguments: viewArgs, summary: view.structuredContent?.summary ?? view.content[0]?.text },
    },
    seeds: seedTiles,
    tiles,
  };
  await Bun.write(join(DEMO, "capture-similar.json"), JSON.stringify(capture, null, 2) + "\n");
  console.error(`wrote capture-similar.json: ${seedTiles.length} board images, ${tiles.length} recommendations`);
} finally {
  server.close();
}
process.exit(0);
