import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadConfig, type CosmosConfig } from "./config";
import { CosmosClient } from "./graphql/client";
import type { ToolContext } from "./tools/kit";
import { registerAccountTools } from "./tools/account";
import { registerBrowseTools } from "./tools/browse";
import { registerCurateTools } from "./tools/curate";
import { registerManageTools } from "./tools/manage";

export const SERVER_NAME = "cosmos-mcp";
export const SERVER_VERSION = "0.1.1";

const INSTRUCTIONS = `Browse and curate cosmos.so, a visual discovery site, for moodboarding.

Vocabulary: an "element" is a saved image, video or product. A "cluster" is a
collection of elements — the moodboard. Clusters can nest via subclusters.

HOW TO BUILD A GOOD COLLECTION — alternate search and recommendations, about 50/50.

Two forces, and a board needs both:

  SEARCH (cosmos_search) holds the BRIEF. It is literal about the words the user
  gave you. On its own it produces a generic board, because relevance ranking
  tracks popularity and every query returns its niche's greatest hits.

  RECOMMENDATIONS (cosmos_cluster_recommendations) hold the TASTE. Cosmos reads the
  board's visual content and returns what belongs with it. The curation is far
  better than search. But run alone it becomes an echo chamber: recommendations
  feeding on recommendations make the board self-similar, and it visibly starts
  repeating itself. It also drifts — a board seeded with a few glitchy images
  amplified into abstract glitch art and lost the brief entirely.

FIRST, ASK WHAT KIND OF BRIEF IT IS. This decides the mix:

  A NAMED SUBJECT — "Sega Dreamcast", a brand, a person, a place, a era-plus-thing.
  There is a right answer, and an image either shows it or does not. Recommendations
  match on visual feel and have no idea what the words mean, so for "Dreamcast" they
  return other 90s consoles, retro TVs, anime — adjacent, wrong. MEASURED: only ~25
  of ~270 recommendations for a Dreamcast board actually showed Dreamcast material.
  So: lean on search (60-70%), and FILTER every recommendation before saving it —
  keep it only if its caption still names the subject or something in its world
  (for Dreamcast: sega, jet set radio, shenmue, sonic, vmu...). Discard the rest and
  spend that budget on more search instead.

  A MOOD OR AESTHETIC — "live life to the fullest", "1980s neon", "sleep". There is
  no keyword to verify against and no single right answer; what matters is feel.
  Here the engine is at its best. Lean on recommendations (60-70%) and do not filter
  by caption — you would only be throwing away its judgement.

So ALTERNATE them, and for a mood brief aim near half and half:

  1. Seed with cosmos_search. Look at candidates with cosmos_view_images before
     choosing — captions mislead, pictures do not. Verify the seed actually shows
     what the user asked for; everything downstream inherits its direction.
  2. Create the board with cosmos_create_cluster and cosmos_save_elements.
  3. Then loop: a batch from cosmos_cluster_recommendations, a fresh batch from
     search, and repeat. Recommendations re-compute as the board grows, and each
     new search batch injects material the engine has not seen, which is what stops
     the echo. Four or five short rounds beats one long run of either.

Push the mix toward recommendations for a canonical theme, and toward search when
the brief is specific or deliberately off-canon. Never go to either extreme.

cosmos_similar_elements does the same amplification from a single image, when one
picture captures the direction better than a word does.

WHEN TO PUSH BACK TOWARD SEEDING. Amplification converges on the canonical reading
of a theme — it finds the most-agreed-upon version. That is usually what you want.
It is not what you want when the brief is deliberately off-canon ("irregular",
"unexpected", "underground"), because the engine sands those edges off. In that
case inject a fresh seed batch between amplify passes to hold the direction, and
tell the user you are trading some polish for fidelity to the brief.

SPECIALIST SUBJECTS: search by name, not by category. Cosmos indexes captions, and
captions credit artists. For "1970s Eastern European underground photography",
geography terms returned Slim Aarons in Saint-Tropez; searching Boris Mikhailov,
Zofia Rydet and Josef Koudelka returned the real thing. Seed from the canon's names,
then amplify.

Rarity is a filter, not a query. Asking for "rare" or "deep cuts" in the search
term still returns popular results — measured on one board, deliberately obscure
queries still averaged 38 saves per element. If the user wants obscure, check
candidates with cosmos_element_saved_by and keep the ones few boards have saved.

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
