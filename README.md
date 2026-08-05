# cosmos-mcp

[![npm version](https://img.shields.io/npm/v/cosmos-mcp.svg)](https://www.npmjs.com/package/cosmos-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-6E56CF)](https://modelcontextprotocol.io/)

**Build moodboards with an AI agent.** cosmos-mcp is an unofficial [Model Context Protocol](https://modelcontextprotocol.io/) server for [cosmos.so](https://www.cosmos.so), the visual discovery site. It lets Claude, Cursor and any other MCP client search Cosmos, find similar images, and save collections to your account.

Search and browsing need no setup. You add a token only when you want to save.

[![Add to Cursor](https://img.shields.io/badge/Add%20to-Cursor-000000?logo=cursor&logoColor=white)](https://cursor.com/en/install-mcp?name=cosmos&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImNvc21vcy1tY3AiXX0%3D)
[![Add to Claude Code](https://img.shields.io/badge/Add%20to-Claude%20Code-D97757?logo=anthropic&logoColor=white)](#install)

One command for Claude Code:

```bash
claude mcp add cosmos -- npx -y cosmos-mcp
```

## Unofficial. Not affiliated with Cosmos.

Read this before you install:

- Cosmos publishes no API. This server calls the same private GraphQL endpoint the cosmos.so web app uses. Cosmos can change or remove that endpoint at any time, and this server will break when it does.
- Write access reuses **your own browser session token** (the `Authorization` header). There is no OAuth and no scoping: the token can do everything your account can.
- You are responsible for the [cosmos.so Terms of Service](https://www.cosmos.so/terms). Use your own account and your own data. Do not scrape.
- Use at your own risk, including the risk of account restrictions. The [LICENSE](LICENSE) gives no warranty.

## What it does

On Cosmos, people save images, videos and products. Each saved item is an **element**. Elements are grouped into **collections**, which can nest. Cosmos calls a collection a *cluster* in its API, so the tool names use that word; this page says "collection".

The server gives an agent tools for that model. In one turn, an agent can:

1. Search Cosmos for "warm brutalist interiors".
2. Find images that look like the best result.
3. Look at each image and reject the weak ones.
4. Create a collection and save the keepers.

You describe what you want. The agent builds the moodboard.

It suits three jobs:

- **Research**: find reference for a brief without clicking through a site.
- **Curation**: sort saved work into collections and move elements between them.
- **Discovery**: start from one image you like and find more like it.

## Install

For Claude Code:

```bash
claude mcp add cosmos -- npx -y cosmos-mcp
```

Add `-e COSMOS_AUTHORIZATION="Bearer paste_your_token_here"` to enable the write tools, or run `npx cosmos-mcp login` later (see [Authentication](#authentication)).

Every other client uses the same JSON config:

```json
{
  "mcpServers": {
    "cosmos": {
      "command": "npx",
      "args": ["-y", "cosmos-mcp"],
      "env": {
        "COSMOS_AUTHORIZATION": "Bearer paste_your_token_here"
      }
    }
  }
}
```

Where to put it:

- **Claude Code**: `.mcp.json` at your project root. This file is usually committed, so keep tokens out of it: use `claude mcp add -e`, `login`, or `.gitignore` it.
- **Claude Desktop**: `claude_desktop_config.json`, at `~/Library/Application Support/Claude/` on macOS or `%APPDATA%\Claude\` on Windows. Restart the app afterwards.
- **Cursor**: `~/.cursor/mcp.json` for every project, or `.cursor/mcp.json` for one.

Leave out the `env` block if you only want search and browsing, or if you signed in with `login`.

### From a local clone

Requires [Bun](https://bun.com):

```bash
git clone https://github.com/mrmos/cosmos-mcp.git
cd cosmos-mcp
bun install
claude mcp add cosmos -- bun run /absolute/path/to/cosmos-mcp/index.ts
```

Use absolute paths: MCP clients do not reliably resolve relative ones. A local clone reads `.env`, so you can leave `env` out of the client config.

## Authentication

Skip this until you want to save something. Every tool without an **A** in the [Tools](#tools) tables works right now.

Cosmos has no API keys and no OAuth. The web app authenticates with a bearer token in the `Authorization` header, so this server reuses yours.

### Sign in

```bash
npx cosmos-mcp login
```

It walks you through copying the token, hides your input, verifies it against cosmos.so, and saves it only if it works. The credential goes in `~/.config/cosmos-mcp/config.json`, written owner-only, and is never printed back. You can also pipe it in from a password manager: `pbpaste | npx cosmos-mcp login`.

```bash
npx cosmos-mcp status    # which credential is in use, and whether it still works
npx cosmos-mcp logout    # remove it
```

To copy the token (`login` prints these steps too):

1. Sign in at [cosmos.so](https://www.cosmos.so), then open DevTools (`Cmd+Option+I` on macOS, `F12` elsewhere).
2. In the **Network** tab, reload the page and click any request to `api.cosmos.so`.
3. Under **Request Headers**, copy the whole `Authorization` value. It begins with `Bearer `.

Do not copy the `Cookie` header: its `AWSALB` values are load-balancer routing and will not sign you in.

The server reads a credential from three places; the first one wins:

1. The `COSMOS_AUTHORIZATION` environment variable, set by an MCP client's `env` block.
2. A `.env` file next to the package, for local clones.
3. `~/.config/cosmos-mcp/config.json`, written by `login`.

### Handling the token

Treat it like a password: anyone holding it can act as you on Cosmos.

- Never commit it, not to `.mcp.json`, a dotfile repo, or a screenshot.
- Don't paste it into a chat message. That writes it into transcripts and sends it to a model provider. Use the `env` block, `.env`, or `login` instead.
- It expires. When write tools report "not signed in", copy a fresh one.
- Revoke it by signing out of that browser session on cosmos.so.

The token is sent to `api.cosmos.so` and nowhere else. This server has no telemetry and writes nothing to disk beyond the credential file `login` saves.

Why no password login? Cosmos has a login mutation, but using it would put your password through a third-party tool, and Cosmos rate-limits login attempts: scripted logins are exactly what its defences catch. A session token is narrower and revocable.

### Environment variables

Copy [`.env.example`](.env.example) to `.env` for a documented starting point. Nothing is required.

| Variable | Default | What it does |
| --- | --- | --- |
| `COSMOS_AUTHORIZATION` | unset | The whole `Authorization` header value, `Bearer ` and all. The credential; unlocks every **A** tool. |
| `COSMOS_COOKIE` | unset | A full session-bearing `Cookie` header, if you have one. The `AWSALB` cookies alone are not enough. |
| `COSMOS_USER_ID` | unset | Your numeric Cosmos user id. Optional; skips the `me` lookup on first use. |
| `COSMOS_ENDPOINT` | `https://api.cosmos.so/graphql` | GraphQL endpoint. Override only for a mock or proxy. |
| `COSMOS_TIMEOUT_MS` | `30000` | Per-request timeout in milliseconds. |
| `COSMOS_CLIENT_NAME` | `cosmos-web` | Sent as `x-client-name`. The API rejects unknown clients; leave it alone. |
| `COSMOS_USER_AGENT` | a desktop Chrome string | Sent as `User-Agent`. |

## Tools

**A** means the tool needs a credential (`COSMOS_AUTHORIZATION`). Everything else works signed out. Without a credential, an **A** tool returns an error that explains the fix.

### Find things

| Tool | What it does | |
| --- | --- | :-: |
| `cosmos_search` | Search every public element by keyword. Filter by content type and colour. | |
| `cosmos_search_clusters` | Search public collections. Someone has often already built the board you want. | |
| `cosmos_search_users` | Find people by name or handle. | |
| `cosmos_search_all` | Search collections, people and elements at once. | |
| `cosmos_similar_elements` | Give it one image you like; it returns images that look like it. | |
| `cosmos_element_saved_by` | Which public collections hold an image, and who saved it. Finds people with the taste you want. | |
| `cosmos_browse_boards` | Browse 800+ curated collections, by category if you pass one. | |
| `cosmos_conversational_search` | Describe a brief in a sentence; get images grouped into named directions. Experimental. | A |
| `cosmos_explore` | The featured feed. Pass a category to narrow it. | |
| `cosmos_spotlights` | Editorial collections, such as "Rooms Lit Only by Lamps". | |
| `cosmos_categories` | The 17 subject areas, such as Fashion and Interiors. | |
| `cosmos_suggested_searches` | Search phrases Cosmos promotes. Thin signed out. | |
| `cosmos_cluster_recommendations` | What Cosmos thinks belongs in a collection you already started. | A |

### Read things

| Tool | What it does | |
| --- | --- | :-: |
| `cosmos_get_element` | One element in full: media, caption, source URL and author. | |
| `cosmos_get_cluster` | One collection: name, owner, size, cover and subcollections. | |
| `cosmos_list_cluster_elements` | Page through the elements in a collection. | |
| `cosmos_get_user` | A public profile: bio, links and top collections. | |
| `cosmos_list_user_clusters` | The collections on a profile. Partial list when signed out. | |
| `cosmos_view_images` | Return elements as real images so the model can look at them. Costs tokens; pass few ids. | |

### Build collections

| Tool | What it does | |
| --- | --- | :-: |
| `cosmos_create_cluster` | Create an empty collection. Private by default. | A |
| `cosmos_save_elements` | Add elements to one collection. | A |
| `cosmos_save_url` | Save an image or page from anywhere on the web. Returns the new element id. | A |
| `cosmos_organize_elements` | Add and remove elements across collections in one call. | A |
| `cosmos_update_cluster` | Rename a collection, or change its description, privacy or cover. | A |
| `cosmos_nest_cluster` | Put a collection inside another, or pull it back out. | A |
| `cosmos_delete_cluster` | Delete a collection. Permanent. Needs `confirm: true`. | A |
| `cosmos_find_clusters_for_element` | Which of your collections an element can go in, and which already hold it. | A |
| `cosmos_quick_connect_suggestion` | Ask Cosmos where an element belongs. | A |

### Your account

| Tool | What it does | |
| --- | --- | :-: |
| `cosmos_whoami` | Report what the server can do now. Works signed out. Call it first. | |
| `cosmos_my_library` | Everything you have saved. | A |
| `cosmos_list_my_clusters` | Your collections, private ones included. | A |
| `cosmos_following_feed` | Recent saves by the people you follow. | A |
| `cosmos_activity` | Your notifications. | A |
| `cosmos_follow_user` | Follow or unfollow a person. | A |
| `cosmos_follow_cluster` | Follow or unfollow a collection. | A |
| `cosmos_pin_cluster` | Pin one of your collections to your profile, or unpin it. | A |

Tools return JSON and fill `structuredContent` for clients that read it. Paging works the same everywhere: pass the `nextCursor` from one call as the `cursor` of the next.

## Example prompts

- "Build me a moodboard about warm brutalist interiors and save it to a new private collection."
- "Search Cosmos for 90s Japanese book covers, show me the twelve best as images, and save the ones I pick to a collection called Type Refs."
- "Find this element on Cosmos, then pull twenty visually similar ones and tell me the common thread."
- "What's in my Colour Studies collection? Group it by dominant colour."
- "Look at this user's public collections and summarise their taste in three sentences."
- "Take everything I saved this week and file it into the right existing collection."

## Development

Requires [Bun](https://bun.com).

```bash
bun install          # install dependencies
bun run dev          # run the server from source, restarting on change
bun test             # run tests
bun run typecheck    # tsc --noEmit
bun run build        # bundle to dist/index.js for Node
```

The server speaks MCP over stdio. Anything on stdout that is not a JSON-RPC frame corrupts the protocol, so log to stderr.

To smoke-test the built artifact:

```bash
bun run build
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}\n' \
  | node dist/index.js
```

You should see `cosmos-mcp ready on stdio` on stderr and a JSON-RPC result containing `serverInfo` on stdout.

### Project layout

```
index.ts                 entrypoint: stdio transport
src/
  config.ts              environment variables to CosmosConfig
  errors.ts              CosmosError, and the mapping from GraphQL codes to kinds
  normalize.ts           API shapes to the flatter shapes tools return
  server.ts              McpServer construction and tool registration
  graphql/
    client.ts            HTTP client, auth headers, viewer resolution
    fragments.ts         shared GraphQL fragments
  tools/
    kit.ts               shared helpers: ok/fail/guard, common arguments
    account.ts           whoami, library, feed, activity
    browse.ts            search, explore, elements, users, clusters
    curate.ts            create, save, organise
scripts/
  probe-schema.ts        schema discovery against the live API
docs/
  har-ops/               reverse-engineered GraphQL operation reference
test/
```

See [docs/README.md](docs/README.md) for where the operation reference came from.

## Questions

**Does cosmos.so have an API?** No. Cosmos publishes no public API, issues no API keys, and turns off GraphQL introspection. This server calls the same private endpoint the website calls.

**Do I need an API key?** No, there are none to get. Search and browsing need nothing. To save, copy your own session token from the browser: see [Authentication](#authentication).

**Does it work without signing in?** Yes. 18 of the 36 tools work signed out: search, collections, public profiles, images.

**Which MCP clients does it support?** Any client that speaks MCP over stdio.

**Can this get my account banned?** There is some risk; Cosmos promises this endpoint to no one. Use your own account at a normal pace, and read the [disclaimer](#unofficial-not-affiliated-with-cosmos).

**Will it break?** Probably, one day, when Cosmos changes the endpoint. [CONTRIBUTING.md](CONTRIBUTING.md) explains how to check an operation against the live API and send a fix.

## Contributing

Bug reports and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md), especially the part about verifying a GraphQL operation against the live API before adding one.

## License

MIT. See [LICENSE](LICENSE).

Not affiliated with or endorsed by Cosmos.
