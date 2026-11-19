# cosmos plugin

This plugin connects Claude Code to [cosmos.so](https://www.cosmos.so), a site for collecting images. It adds the cosmos-mcp server, which can search Cosmos, find similar images, show images to the model, and save collections to your account. It also adds a `moodboard` skill that guides a full moodboard session. The plugin is unofficial and is not affiliated with Cosmos.

## What it runs

The plugin starts one local MCP server with `npx -y cosmos-mcp@<version>`. The version is pinned in `.mcp.json`. On first use, npx downloads that version of the [cosmos-mcp](https://www.npmjs.com/package/cosmos-mcp) package from `registry.npmjs.org`. The source is at [github.com/mrmos/cosmos-mcp](https://github.com/mrmos/cosmos-mcp).

## What it sends and fetches

- Search terms, ids and collection changes go to `api.cosmos.so`, the private GraphQL endpoint of the cosmos.so web app.
- `cosmos_view_images` fetches image thumbnails from `cdn.cosmos.so`.
- If you sign in, your cosmos.so token goes to `api.cosmos.so` and to no other host.
- The server has no telemetry and sends nothing to the plugin author.

## Sign in

Search and browsing work without an account. To save, run `npx cosmos-mcp login` in your own terminal. The command stores the token in `~/.config/cosmos-mcp/config.json`, and only your user account can read it. The plugin itself stores no credential.

## Privacy

See the [privacy policy](https://github.com/mrmos/cosmos-mcp#privacy-policy).
