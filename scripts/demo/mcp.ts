/**
 * Shared plumbing for the demo capture scripts: start the built server in an
 * empty temp package, talk MCP JSON-RPC to it over stdio, and turn
 * cosmos_view_images output into small JPEGs for the animation.
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { configPath } from "../../src/auth-store";

export const ROOT = resolve(import.meta.dir, "../..");
export const DEMO = join(ROOT, "scripts/demo");
const FFMPEG = Bun.which("ffmpeg") ?? "/opt/homebrew/bin/ffmpeg";

export interface DemoServer {
  serverInfo: { name: string; version: string };
  tmp: string;
  callTool: (name: string, args: object) => Promise<any>;
  close: () => void;
}

/**
 * Starts dist/index.js from a copy in an empty temp package, so it cannot pick
 * up a repo-level .env (the server reads ../.env relative to dist/index.js).
 * Signed out, XDG_CONFIG_HOME points at an empty dir. Signed in, that dir gets
 * a copy of the login the user saved with `cosmos-mcp login`.
 */
export async function startServer({ signedIn }: { signedIn: boolean }): Promise<DemoServer> {
  if (!existsSync(join(ROOT, "dist/index.js"))) await Bun.$`bun run build`.cwd(ROOT);

  const tmp = mkdtempSync(join(tmpdir(), "cosmos-mcp-demo-"));
  mkdirSync(join(tmp, "pkg/dist"), { recursive: true });
  mkdirSync(join(tmp, "config/cosmos-mcp"), { recursive: true });
  copyFileSync(join(ROOT, "dist/index.js"), join(tmp, "pkg/dist/index.js"));
  if (signedIn) {
    if (!existsSync(configPath())) throw new Error("no saved login: run `bun run index.ts login` first");
    copyFileSync(configPath(), join(tmp, "config/cosmos-mcp/config.json"));
  }

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

  const send = (msg: object) => {
    proc.stdin.write(JSON.stringify(msg) + "\n");
    proc.stdin.flush();
  };
  const request = (method: string, params: object): Promise<any> => {
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
  };
  const close = () => {
    proc.kill();
    rmSync(tmp, { recursive: true, force: true });
  };

  try {
    const init = await request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "cosmos-mcp-demo-capture", version: "1.0.0" },
    });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    console.error(`connected to ${init.serverInfo?.name} ${init.serverInfo?.version}`);
    return {
      serverInfo: init.serverInfo,
      tmp,
      close,
      async callTool(name, args) {
        const result = await request("tools/call", { name, arguments: args });
        if (result.isError) throw new Error(`${name} failed: ${result.content?.[0]?.text}`);
        return result;
      },
    };
  } catch (err) {
    close();
    throw err;
  }
}

export interface Tile {
  id: number;
  url: string;
  caption: string | null;
  owner: string | null;
  source: unknown;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  asset: string;
  width: number;
  height: number;
}

/**
 * Saves the images from a cosmos_view_images result as 300px JPEGs in
 * scripts/demo/<assetDir>/ and returns one tile per element that had an image.
 * `elements` are the listing items the ids came from, for captions and links.
 */
export async function saveViewedImages(server: DemoServer, view: any, elements: any[], assetDir: string): Promise<Tile[]> {
  const dir = join(DEMO, assetDir);
  mkdirSync(dir, { recursive: true });

  // Pair each image block with the text block before it ("Element <id> — ...").
  const images = new Map<number, { data: string }>();
  let currentId: number | null = null;
  for (const block of view.content) {
    if (block.type === "text") {
      const m = /^Element (\d+)/.exec(block.text);
      currentId = m ? Number(m[1]) : null;
    } else if (block.type === "image" && currentId !== null) {
      images.set(currentId, { data: block.data });
    }
  }

  const tiles: Tile[] = [];
  for (const e of elements) {
    const img = images.get(e.id);
    if (!img) continue;
    const raw = join(server.tmp, `${e.id}.src`);
    await Bun.write(raw, Buffer.from(img.data, "base64"));
    const file = join(dir, `${e.id}.jpg`);
    await Bun.$`${FFMPEG} -loglevel error -y -i ${raw} -frames:v 1 -vf scale=300:-2:flags=lanczos -q:v 5 ${file}`;
    const probe = await Bun.$`${FFMPEG} -i ${file} 2>&1 || true`.text();
    const dim = /, (\d+)x(\d+)/.exec(probe);
    tiles.push({
      id: e.id,
      url: e.url,
      caption: e.caption ?? null,
      owner: e.owner?.username ?? null,
      source: e.source,
      imageUrl: e.media?.url ?? null,
      thumbnailUrl: e.media?.thumbnailUrl ?? null,
      asset: `${assetDir}/${e.id}.jpg`,
      width: dim ? Number(dim[1]) : 300,
      height: dim ? Number(dim[2]) : 300,
    });
  }
  return tiles;
}
