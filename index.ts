#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./src/server";

const server = createServer();
const transport = new StdioServerTransport();

await server.connect(transport);

// stdout is the transport; anything else written there corrupts the protocol.
process.stderr.write("cosmos-mcp ready on stdio\n");
