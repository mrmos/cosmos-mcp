/**
 * MCP prompts: ready-made starting messages that clients show as slash
 * commands (for example `/mcp__cosmos__moodboard` in Claude Code).
 *
 * The server instructions already teach the search/recommendation loop. A
 * prompt gives a new user one obvious way to start it without knowing what to
 * ask for.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function moodboardPromptText(brief: string, save: boolean, name?: string): string {
  const steps = [
    `Build a moodboard on cosmos.so for this brief: "${brief}".`,
    "",
    "1. Call cosmos_whoami to learn whether you can save.",
    "2. Decide whether the brief is a named subject (a brand, a place, a person) or a mood. Use that to choose the mix of search and recommendations from the server instructions.",
    "3. Seed with cosmos_search. Look at the best candidates with cosmos_view_images before you choose. Pass few ids.",
  ];
  if (save) {
    steps.push(
      `4. If you are signed in, create a private collection${name ? ` named "${name}"` : ""} with cosmos_create_cluster and save the keepers with cosmos_save_elements.`,
      "5. Grow it in short rounds: a batch from cosmos_cluster_recommendations, then a fresh batch from cosmos_search. Stop at about 30 elements.",
      "6. If you are not signed in, do not ask for a token in chat. Ask the user to run `npx cosmos-mcp login` in their own terminal, then continue.",
      "7. Finish with the collection link and two or three sentences on the direction you took.",
    );
  } else {
    steps.push(
      "4. Widen the set with cosmos_similar_elements from the strongest images.",
      "5. Do not save anything. Present a shortlist of about 12 images as cosmos.so links, grouped into two or three named directions.",
    );
  }
  return steps.join("\n");
}

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "moodboard",
    {
      title: "Build a moodboard",
      description:
        "Research a brief on cosmos.so and build a moodboard. Saves to a new private collection when you are signed in and save is on.",
      argsSchema: {
        brief: z.string().describe('What the board is about, for example "warm brutalist interiors".'),
        save: z
          .string()
          .optional()
          .describe('"yes" to save to a new private collection (needs sign-in). Anything else only shows a shortlist.'),
        name: z.string().optional().describe("Name for the new collection. Optional."),
      },
    },
    ({ brief, save, name }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: moodboardPromptText(brief, /^(y|yes|true|1)$/i.test(save?.trim() ?? ""), name?.trim() || undefined),
          },
        },
      ],
    }),
  );
}
