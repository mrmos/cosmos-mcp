---
name: moodboard
description: Build a visual moodboard on cosmos.so from a design brief, with the cosmos MCP tools. Use when the user asks for a moodboard, visual references, inspiration images, or a Cosmos collection for a project.
---

# Build a moodboard on cosmos.so

Use the `cosmos` MCP tools from this plugin.

1. Call `cosmos_whoami`. It says whether you can save. Search and viewing work signed out.
2. Decide what kind of brief it is:
   - A named subject (a brand, a place, a person, an artist): rely mostly on search. Search by names, because Cosmos indexes captions and captions credit artists.
   - A mood or an aesthetic: rely more on `cosmos_cluster_recommendations` after the board has a few good images.
3. Seed with `cosmos_search`. Look at the strongest candidates with `cosmos_view_images` before you choose. It returns real images and costs many tokens, so pass at most eight ids.
4. Widen the set with `cosmos_similar_elements` from the best images.
5. If the user wants to save and you are signed in, create a private collection with `cosmos_create_cluster` and add the keepers with `cosmos_save_elements`. Grow it in short rounds that alternate recommendations and fresh searches.
6. If the user wants to save and you are not signed in, ask the user to run `npx cosmos-mcp login` in their own terminal. Never ask for a token in chat.
7. Finish with the collection link, or with a shortlist of cosmos.so links grouped into two or three named directions.

Do not call `cosmos_delete_cluster` unless the user asks to delete a collection and confirms it.
