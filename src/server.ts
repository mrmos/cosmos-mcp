import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadConfig, type CosmosConfig } from "./config";
import { CosmosClient } from "./graphql/client";
import type { ToolContext } from "./tools/kit";
import { registerAccountTools } from "./tools/account";
import { registerBrowseTools } from "./tools/browse";
import { registerCurateTools } from "./tools/curate";
import { registerManageTools } from "./tools/manage";

export const SERVER_NAME = "cosmos-mcp";
export const SERVER_VERSION = "0.1.0";

const INSTRUCTIONS = `Browse and curate cosmos.so, a visual discovery site, for moodboarding.

Vocabulary: an "element" is a saved image, video or product. A "cluster" is a
collection of elements — the moodboard. Clusters can nest via subclusters.

Typical flow: cosmos_search or cosmos_explore to find elements, cosmos_similar_elements
to widen a direction you like, cosmos_create_cluster to open a board, then
cosmos_save_elements to fill it. cosmos_view_images renders elements as actual
images when you need to judge them visually — it costs tokens, so pass few ids.

To save something from outside Cosmos — an image URL the user found on the web —
use cosmos_save_url. cosmos_update_cluster renames or re-describes a board and
cosmos_nest_cluster arranges boards inside boards; cosmos_delete_cluster is
permanent and needs explicit confirmation.

Browsing, search and public profiles work signed out. Anything that writes, and
anything touching private or personal data, needs COSMOS_COOKIE configured.`;

export function createServer(config: CosmosConfig = loadConfig()): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );

  const ctx: ToolContext = { client: new CosmosClient(config) };

  registerAccountTools(server, ctx);
  registerBrowseTools(server, ctx);
  registerCurateTools(server, ctx);
  registerManageTools(server, ctx);

  return server;
}
