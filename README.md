# cosmos-mcp

[![npm version](https://img.shields.io/npm/v/cosmos-mcp.svg)](https://www.npmjs.com/package/cosmos-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-6E56CF)](https://modelcontextprotocol.io/)

**Build moodboards with an AI agent.** cosmos-mcp is an unofficial
[Model Context Protocol](https://modelcontextprotocol.io/) server for
[cosmos.so](https://www.cosmos.so), the visual discovery site. It gives Claude, Cursor
and any other MCP client the ability to search Cosmos, find similar images, and save
collections to your account.

Search and browsing work with no setup. You add a cookie only when you want to save.

## Unofficial. Not affiliated with Cosmos.

This project is not affiliated with, endorsed by, or supported by Cosmos. Read this
before you install it:

- Cosmos publishes no API and issues no API keys. This server calls the same
  undocumented private GraphQL endpoint the cosmos.so web app uses. That endpoint can
  change or disappear at any time, without warning, and this server will break when it
  does.
- Write access works by reusing **your own browser session cookie**. There is no OAuth
  flow and no scoping. The cookie grants everything your account can do.
- You are responsible for complying with the
  [cosmos.so Terms of Service](https://www.cosmos.so/terms). Use it with your own
  account and your own data. Do not scrape.
- Use at your own risk, including the risk of account restrictions. See the
  [LICENSE](LICENSE): no warranty.

## What it does

On Cosmos, people save images, videos and products. Cosmos calls each saved item an
**element**. People group elements into **collections**. A collection can hold other
collections.

Cosmos calls a collection a *cluster* in its own API, so the tool names use that word:
`cosmos_get_cluster` reads a collection. This page says "collection" throughout.

This server gives an AI agent tools for that model. In one turn, an agent can:

1. Search Cosmos for "warm brutalist interiors".
2. Find images that look like the best result.
3. Look at each image and reject the weak ones.
4. Create a collection.
5. Save the images that remain.

You do not open the site yourself. You describe what you want, and the agent builds the
moodboard.

### Who this is for

Designers, art directors and anyone who collects visual reference. It suits three jobs:

- **Research.** Find reference for a brief without clicking through a site.
- **Curation.** Sort saved work into collections, and move elements between them.
- **Discovery.** Start from one image you like and find more like it.

## Install

### Claude Code

Command form:

```bash
claude mcp add cosmos -- npx -y cosmos-mcp
```

With a cookie, so the write tools work:

```bash
claude mcp add cosmos -e COSMOS_COOKIE="paste-your-cookie-header-here" -- npx -y cosmos-mcp
```

JSON form, in `.mcp.json` at the root of your project:

```json
{
  "mcpServers": {
    "cosmos": {
      "command": "npx",
      "args": ["-y", "cosmos-mcp"],
      "env": {
        "COSMOS_COOKIE": "paste-your-cookie-header-here"
      }
    }
  }
}
```

`.mcp.json` is checked into the repo by convention. If you put a cookie in it, add it to
`.gitignore` first.

### Claude Desktop

Edit `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "cosmos": {
      "command": "npx",
      "args": ["-y", "cosmos-mcp"],
      "env": {
        "COSMOS_COOKIE": "paste-your-cookie-header-here"
      }
    }
  }
}
```

Restart Claude Desktop afterwards.

### Cursor

Edit `~/.cursor/mcp.json` for every project, or `.cursor/mcp.json` for one:

```json
{
  "mcpServers": {
    "cosmos": {
      "command": "npx",
      "args": ["-y", "cosmos-mcp"],
      "env": {
        "COSMOS_COOKIE": "paste-your-cookie-header-here"
      }
    }
  }
}
```

### From a local clone, with Bun

```bash
git clone https://github.com/mrmos/cosmos-mcp.git
cd cosmos-mcp
bun install
```

Then point your client at it. Use absolute paths — MCP clients do not reliably resolve
relative ones:

```json
{
  "mcpServers": {
    "cosmos": {
      "command": "/opt/homebrew/bin/bun",
      "args": ["run", "/absolute/path/to/cosmos-mcp/index.ts"],
      "env": {
        "COSMOS_COOKIE": "paste-your-cookie-header-here"
      }
    }
  }
}
```

Or with Claude Code:

```bash
claude mcp add cosmos -- bun run /absolute/path/to/cosmos-mcp/index.ts
```

A local clone reads `.env`, so you can leave `env` out of the client config entirely.

## Authentication

Skip this section until you want to save something. Every tool without an **A** in the
[Tools](#tools) tables works right now.

Cosmos has no API keys. The web app authenticates with a session cookie, so that is what
this server reuses.

### Getting the cookie

1. Open [cosmos.so](https://www.cosmos.so) in a browser and sign in.
2. Open DevTools (`Cmd+Option+I` on macOS, `F12` on Windows and Linux).
3. Go to the **Network** tab.
4. Reload the page, or click around until requests appear.
5. Click any request to `api.cosmos.so`.
6. Find **Request Headers**, then the `Cookie` header.
7. Copy the **whole value**. It is a long `name=value; name=value; ...` string. Copy all
   of it, not one cookie out of it.
8. Set `COSMOS_COOKIE` to that string.

Check it worked by asking your agent to run `cosmos_whoami`. It should come back with
your username.

### Handling the cookie

- **It is a credential.** Treat it exactly like a password. Anyone holding it can act as
  you on Cosmos.
- **Never commit it.** Not to `.mcp.json`, not to a dotfile repo, not to a screenshot in
  an issue.
- **Do not paste it into a chat message.** Put it in your MCP client's `env` block or in
  a local `.env` file. Pasting it into a conversation writes it into transcripts and
  sends it to a model provider.
- **It expires.** Sessions do not last forever. When the write tools start reporting
  "not signed in", go back to step 1 and paste a fresh one.
- **Revoke it by signing out** of that browser session on cosmos.so.

The cookie is sent to `api.cosmos.so` and nowhere else. This server has no telemetry and
writes nothing to disk.

### Environment variables

Copy [`.env.example`](.env.example) to `.env` for a documented starting point. Nothing
is required.

| Variable | Default | What it does |
| --- | --- | --- |
| `COSMOS_COOKIE` | unset | The whole `Cookie` request header from a signed-in browser session. Unlocks every "needs auth" tool. |
| `COSMOS_AUTHORIZATION` | unset | The whole `Authorization` header value, scheme included. An alternative to the cookie for accounts on bearer tokens. |
| `COSMOS_USER_ID` | unset | Your numeric Cosmos user id. Optional. Setting it skips the `me` lookup on first use, saving a round trip. |
| `COSMOS_ENDPOINT` | `https://api.cosmos.so/graphql` | GraphQL endpoint. Override only to point at a mock or a proxy. |
| `COSMOS_TIMEOUT_MS` | `30000` | Per-request timeout in milliseconds. |
| `COSMOS_CLIENT_NAME` | `cosmos-web` | Sent as `x-client-name`. The API rejects unknown clients, so leave it alone. |
| `COSMOS_USER_AGENT` | a desktop Chrome string | Sent as `User-Agent`. |

## Tools

Cosmos calls a collection a *cluster*, so the tool names do too.

**A** in the last column means the tool needs `COSMOS_COOKIE`. Everything else works
signed out. Without a cookie, an **A** tool returns an error that explains how to fix it.

### Find things

| Tool | What it does | |
| --- | --- | :-: |
| `cosmos_search` | Search every public element by keyword. Filter by content type and colour. | |
| `cosmos_search_clusters` | Search public collections. Someone has often already built the board you want. | |
| `cosmos_search_users` | Find people by name or handle. | |
| `cosmos_search_all` | Search collections, people and elements at once. Use it when you do not know which you want. | |
| `cosmos_similar_elements` | Give it one image you like. It returns images that look like it. | |
| `cosmos_element_saved_by` | Show which public collections hold an image, and who saved it. Use it to find people with the taste you want. | |
| `cosmos_browse_boards` | Browse 800+ curated collections, by category if you pass one. Boards, not single images. | |
| `cosmos_conversational_search` | Describe a brief in a sentence. Returns images grouped into named directions. Experimental. | A |
| `cosmos_explore` | The featured feed. What Cosmos is showing right now. Pass a category to narrow it. | |
| `cosmos_spotlights` | Editorial collections, such as "Rooms Lit Only by Lamps". | |
| `cosmos_categories` | The 17 subject areas, such as Fashion and Interiors. | |
| `cosmos_suggested_searches` | Search phrases Cosmos promotes. Mostly personal, so it is thin signed out. | |
| `cosmos_cluster_recommendations` | What Cosmos thinks belongs in a collection you already started. | A |

### Read things

| Tool | What it does | |
| --- | --- | :-: |
| `cosmos_get_element` | One element in full: media, caption, source URL and author. | |
| `cosmos_get_cluster` | One collection: name, owner, size, cover and subcollections. | |
| `cosmos_list_cluster_elements` | Page through the elements in a collection. | |
| `cosmos_get_user` | A public profile: bio, links and top collections. | |
| `cosmos_list_user_clusters` | The collections on a profile. Signed out you get a partial list. | |
| `cosmos_view_images` | Return elements as real images, so the model can look at them. Costs tokens. Pass few ids. | |

### Build collections

| Tool | What it does | |
| --- | --- | :-: |
| `cosmos_create_cluster` | Create an empty collection. Private by default. | A |
| `cosmos_save_elements` | Add elements to one collection. | A |
| `cosmos_save_url` | Save an image or page from anywhere on the web. Returns the new element id. | A |
| `cosmos_organize_elements` | Add and remove elements across collections in one call. Removes as well as adds. | A |
| `cosmos_update_cluster` | Rename a collection, or change its description, privacy or cover. | A |
| `cosmos_nest_cluster` | Put a collection inside another, or pull it back out. | A |
| `cosmos_delete_cluster` | Delete a collection. Permanent. Needs `confirm: true`. | A |
| `cosmos_find_clusters_for_element` | Show which of your collections an element can go in, and which already hold it. | A |
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

Tools return JSON. They also fill `structuredContent` for clients that read it. Paging
works the same everywhere: pass the `nextCursor` from one call as the `cursor` of the
next.

## Example prompts

- "Build me a moodboard about warm brutalist interiors and save it to a new private
  collection."
- "Search Cosmos for 90s Japanese book covers, show me the twelve best as images, and
  save the ones I pick to a collection called Type Refs."
- "Find this element on Cosmos, then pull twenty visually similar ones and tell me what
  the common thread is."
- "What's in my Colour Studies collection? Group it by dominant colour."
- "Look at the public collections of this user and summarise their taste in three
  sentences."
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

The server speaks MCP over stdio. Anything written to stdout that is not a JSON-RPC
frame corrupts the protocol, so log to stderr.

To check the built artifact by hand:

```bash
bun run build
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}\n' \
  | node dist/index.js
```

You should see `cosmos-mcp ready on stdio` on stderr and a JSON-RPC result containing
`serverInfo` on stdout.

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

### Does cosmos.so have an API?

No. Cosmos publishes no public API and issues no API keys. It also turns off GraphQL
introspection. This server calls the same private endpoint the cosmos.so website calls.

### Do I need an API key?

No. There are no API keys to get. Search and browsing need nothing. To save work to your
account, you copy your own session cookie from the browser. See
[Authentication](#authentication).

### Does it work without signing in?

Yes. 18 of the 36 tools work signed out. You can search Cosmos, open collections, read
public profiles and look at images before you configure anything.

### Which MCP clients does it support?

Any client that speaks MCP over stdio. The install section covers Claude Code, Claude
Desktop and Cursor.

### Can this get my Cosmos account banned?

It uses a private API, so there is some risk. Cosmos does not promise this endpoint to
anyone. Use it with your own account, at a normal pace, and read the
[disclaimer](#unofficial-not-affiliated-with-cosmos).

### Will it break?

Probably, one day. Cosmos can change the endpoint at any time and owes no notice. See
[CONTRIBUTING.md](CONTRIBUTING.md) for how to check an operation against the live API and
send a fix.

## Contributing

Bug reports and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) —
please read the part about verifying a GraphQL operation against the live API before
adding one.

## License

MIT. See [LICENSE](LICENSE).

Not affiliated with or endorsed by Cosmos.
