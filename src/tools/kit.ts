import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { CosmosClient } from "../graphql/client";
import { CosmosError } from "../errors";

export interface ToolContext {
  client: CosmosClient;
}

/** Every `src/tools/*.ts` module exports one of these and is wired up in server.ts. */
export type ToolRegistrar = (server: McpServer, ctx: ToolContext) => void;

/**
 * Successful result. The JSON goes in the text block because most clients only
 * render text; `structuredContent` carries the same payload for clients that
 * read it.
 */
export function ok(summary: string, data: unknown): CallToolResult {
  const payload = { summary, ...(data as object) };
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as Record<string, unknown>,
  };
}

/**
 * Failure result. Returns `isError` rather than throwing so the agent sees the
 * remediation text (how to set COSMOS_COOKIE, say) instead of a bare stack.
 */
export function fail(error: unknown): CallToolResult {
  const message =
    error instanceof CosmosError
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error);
  const kind = error instanceof CosmosError ? error.kind : "unknown";
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error: kind, message }, null, 2) }],
  };
}

/** Wraps a handler so no tool can reject and kill the transport. */
export function guard<A>(handler: (args: A) => Promise<CallToolResult>) {
  return async (args: A): Promise<CallToolResult> => {
    try {
      return await handler(args);
    } catch (err) {
      return fail(err);
    }
  };
}

/** Reusable argument fragments, so paging behaves the same across every tool. */
export const cursorArg = z
  .string()
  .optional()
  .describe("Opaque cursor from a previous call's `nextCursor`. Omit for the first page.");

export const limitArg = z
  .number()
  .int()
  .min(1)
  .max(50)
  .optional()
  .describe("Items per page (1-50). Defaults to 20.");

export const previewWidthArg = z
  .number()
  .int()
  .min(80)
  .max(2000)
  .optional()
  .describe("Width in px for generated thumbnailUrl values. Defaults to 400.");

export const DEFAULT_LIMIT = 20;
export const DEFAULT_PREVIEW_WIDTH = 400;

/**
 * Resolves the user a tool should act as. Accepts an explicit username for
 * read-only lookups; falls back to the signed-in viewer.
 */
export async function resolveUserId(
  client: CosmosClient,
  username: string | undefined,
  operation: string,
): Promise<number> {
  if (username) return client.userIdForUsername(username);
  const viewer = await client.requireViewer(operation);
  return viewer.id;
}

/**
 * Optional viewer id for queries that personalise results but do not require
 * sign-in (`isFollowed`, `isSaved` and friends). Returns null when signed out.
 */
export async function optionalViewerId(client: CosmosClient): Promise<number | null> {
  try {
    const viewer = await client.viewer();
    return viewer?.id ?? null;
  } catch {
    return null;
  }
}
