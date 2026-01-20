#!/usr/bin/env node
/**
 * Donut MCP Server Entry Point
 *
 * This file re-exports the server for the bin entry.
 * Run via: node dist/mcp-external/server.js
 * Or via: donut-mcp (after npm link)
 */

export * from "./server.js";
