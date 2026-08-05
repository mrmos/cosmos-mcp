#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./src/server";
import { runCli } from "./src/cli";

const exitCode = await runCli(process.argv.slice(2));

// A subcommand ran. Only `undefined` means "start the server".
if (exitCode !== null) {
  process.exit(exitCode);
}

const server = createServer();
await server.connect(new StdioServerTransport());

// stdout is the transport; anything else written there corrupts the protocol.
process.stderr.write("cosmos-mcp ready on stdio\n");
