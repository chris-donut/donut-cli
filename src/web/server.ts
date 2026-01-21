/**
 * Donut CLI Web Server
 *
 * HTTP server that exposes MCP tools via REST API and provides
 * a chat-first UI for interacting with Claude agents.
 * Uses Node's built-in http module for compatibility with both Node and Bun.
 * Binds to localhost only for security.
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { TOOLS, executeToolHandler } from "../mcp-external/server.js";
import { WebSessionStore } from "./session-store.js";
import { ChatHandler, AGENT_DISPLAY, ChatRequest } from "./chat-handler.js";
import { getTurnkeyAuthProvider } from "../mcp-external/auth/turnkey.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get package version
const packageJsonPath = join(__dirname, "../../package.json");
let VERSION = "1.0.0";
try {
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  VERSION = pkg.version || VERSION;
} catch {
  // Use default if package.json not found
}

// Load embedded HTML UI
let embeddedUI = "";
try {
  embeddedUI = readFileSync(join(__dirname, "ui/index.html"), "utf-8");
} catch {
  // Will be populated during build
}

// Initialize session store and chat handler (lazy)
const sessionStore = new WebSessionStore();
let chatHandler: ChatHandler | null = null;

function getChatHandler(): ChatHandler {
  if (!chatHandler) {
    chatHandler = new ChatHandler(sessionStore);
  }
  return chatHandler;
}

// CORS headers for localhost development
function setCorsHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// JSON response helper
function jsonResponse(
  res: ServerResponse,
  data: unknown,
  status = 200
): void {
  setCorsHeaders(res);
  res.setHeader("Content-Type", "application/json");
  res.statusCode = status;
  res.end(JSON.stringify(data, null, 2));
}

// HTML response helper
function htmlResponse(
  res: ServerResponse,
  html: string,
  status = 200
): void {
  setCorsHeaders(res);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.statusCode = status;
  res.end(html);
}

// Read request body
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

/**
 * Handle incoming HTTP requests
 */
async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method || "GET";

  // Handle CORS preflight
  if (method === "OPTIONS") {
    setCorsHeaders(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  // Log request
  console.log(`${method} ${path}`);

  // Route: GET / - Serve embedded UI
  if (method === "GET" && path === "/") {
    if (!embeddedUI) {
      htmlResponse(
        res,
        "<html><body><h1>Donut Web UI</h1><p>UI not loaded. Run from dist directory.</p></body></html>"
      );
      return;
    }
    htmlResponse(res, embeddedUI);
    return;
  }

  // Route: GET /api/health - Health check with feature flags
  if (method === "GET" && path === "/api/health") {
    const handler = getChatHandler();
    jsonResponse(res, {
      status: "ok",
      version: VERSION,
      timestamp: new Date().toISOString(),
      features: {
        chat: handler.isAvailable(),
        chatUnavailableReason: handler.getUnavailableReason(),
        tools: true,
      },
    });
    return;
  }

  // Route: GET /api/tools - List all tools
  if (method === "GET" && path === "/api/tools") {
    const tools = TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
    jsonResponse(res, { tools, count: tools.length });
    return;
  }

  // Route: POST /api/tools/:name - Invoke a tool
  const toolMatch = path.match(/^\/api\/tools\/([a-z_]+)$/);
  if (method === "POST" && toolMatch) {
    const toolName = toolMatch[1];

    // Validate tool exists
    const tool = TOOLS.find((t) => t.name === toolName);
    if (!tool) {
      jsonResponse(res, { error: `Tool not found: ${toolName}` }, 404);
      return;
    }

    // Parse request body
    let args: Record<string, unknown> = {};
    try {
      const body = await readBody(req);
      if (body) {
        const parsed = JSON.parse(body);
        args = parsed.arguments || parsed;
      }
    } catch (e) {
      jsonResponse(
        res,
        { error: "Invalid JSON in request body", details: String(e) },
        400
      );
      return;
    }

    // Execute tool with timeout
    const startTime = Date.now();
    const TIMEOUT_MS = 30000;

    try {
      const result = await Promise.race([
        executeToolHandler(toolName, args),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Tool execution timed out (30s)")),
            TIMEOUT_MS
          )
        ),
      ]);

      const executionTime = Date.now() - startTime;

      jsonResponse(res, {
        success: true,
        tool: toolName,
        executionTime,
        result,
      });
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);

      jsonResponse(
        res,
        {
          success: false,
          tool: toolName,
          executionTime,
          error: message,
        },
        error instanceof Error && error.message.includes("timed out")
          ? 504
          : 500
      );
    }
    return;
  }

  // =========================================================================
  // MCP Protocol Endpoint (JSON-RPC 2.0)
  // =========================================================================

  // Route: POST /mcp - MCP protocol endpoint for Claude Code integration
  if (method === "POST" && path === "/mcp") {
    let rpcRequest: {
      jsonrpc: string;
      id: string | number;
      method: string;
      params?: Record<string, unknown>;
    };

    try {
      const body = await readBody(req);
      rpcRequest = JSON.parse(body);

      if (rpcRequest.jsonrpc !== "2.0") {
        jsonResponse(res, {
          jsonrpc: "2.0",
          id: rpcRequest.id || null,
          error: { code: -32600, message: "Invalid Request: jsonrpc must be '2.0'" },
        }, 400);
        return;
      }
    } catch (e) {
      jsonResponse(res, {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error: Invalid JSON" },
      }, 400);
      return;
    }

    const { id, method: rpcMethod, params } = rpcRequest;

    // Handle MCP initialize
    if (rpcMethod === "initialize") {
      const authProvider = getTurnkeyAuthProvider();
      const authStatus = await authProvider.getAuthStatus();

      jsonResponse(res, {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: "donut",
            version: VERSION,
          },
          // Include auth status for client awareness
          _donut: {
            authenticated: authStatus.isAuthenticated,
            authMode: authStatus.mode,
            userEmail: authStatus.userEmail,
            hint: authStatus.isAuthenticated ? undefined : "Run `donut auth` to connect your wallet",
          },
        },
      });
      return;
    }

    // Handle MCP initialized notification
    if (rpcMethod === "notifications/initialized") {
      // Notifications don't require a response, but we'll acknowledge
      res.statusCode = 204;
      res.end();
      return;
    }

    // Handle tools/list
    if (rpcMethod === "tools/list") {
      const tools = TOOLS.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));
      jsonResponse(res, {
        jsonrpc: "2.0",
        id,
        result: { tools },
      });
      return;
    }

    // Handle tools/call
    if (rpcMethod === "tools/call") {
      const toolName = params?.name as string;
      const toolArgs = params?.arguments as Record<string, unknown> | undefined;

      if (!toolName) {
        jsonResponse(res, {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "Invalid params: tool name is required" },
        }, 400);
        return;
      }

      // Check authentication status
      const authProvider = getTurnkeyAuthProvider();
      const authMode = authProvider.getAuthMode();

      if (authMode === "none") {
        // User has never authenticated - require auth
        jsonResponse(res, {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32001,
            message: "Authentication required. Run `donut auth` first to connect your wallet."
          },
        }, 401);
        return;
      }

      // If in Turnkey mode, check if token is valid
      if (authMode === "turnkey" && !authProvider.isAuthenticated()) {
        jsonResponse(res, {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32001,
            message: "Session expired. Run `donut auth` to re-authenticate."
          },
        }, 401);
        return;
      }

      // Validate tool exists
      const tool = TOOLS.find((t) => t.name === toolName);
      if (!tool) {
        jsonResponse(res, {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Tool not found: ${toolName}` },
        }, 404);
        return;
      }

      try {
        const result = await executeToolHandler(toolName, toolArgs);
        jsonResponse(res, {
          jsonrpc: "2.0",
          id,
          result,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        jsonResponse(res, {
          jsonrpc: "2.0",
          id,
          error: { code: -32000, message },
        });
      }
      return;
    }

    // Unknown method
    jsonResponse(res, {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not found: ${rpcMethod}` },
    }, 404);
    return;
  }

  // =========================================================================
  // Chat Endpoints
  // =========================================================================

  // Route: POST /api/chat - Send message and stream response
  if (method === "POST" && path === "/api/chat") {
    const handler = getChatHandler();

    // Parse request body
    let request: ChatRequest;
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body);
      request = {
        sessionId: parsed.sessionId || "",
        message: parsed.message || "",
        agentType: parsed.agentType,
      };

      if (!request.message) {
        jsonResponse(res, { error: "Message is required" }, 400);
        return;
      }
    } catch (e) {
      jsonResponse(
        res,
        { error: "Invalid JSON in request body", details: String(e) },
        400
      );
      return;
    }

    // Stream response via SSE
    await handler.streamChat(res, request);
    return;
  }

  // Route: GET /api/agents - Get agent type information
  if (method === "GET" && path === "/api/agents") {
    jsonResponse(res, {
      agents: AGENT_DISPLAY,
      defaultAgent: "strategy_builder",
    });
    return;
  }

  // =========================================================================
  // Session Endpoints
  // =========================================================================

  // Route: GET /api/sessions - List all sessions
  if (method === "GET" && path === "/api/sessions") {
    try {
      const sessions = await sessionStore.listSessions();
      jsonResponse(res, { sessions });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      jsonResponse(res, { error: message }, 500);
    }
    return;
  }

  // Route: POST /api/sessions - Create new session
  if (method === "POST" && path === "/api/sessions") {
    try {
      let title: string | undefined;
      try {
        const body = await readBody(req);
        if (body) {
          const parsed = JSON.parse(body);
          title = parsed.title;
        }
      } catch {
        // Ignore body parsing errors - title is optional
      }

      const session = await sessionStore.createSession(title);
      jsonResponse(res, { session }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      jsonResponse(res, { error: message }, 500);
    }
    return;
  }

  // Route: GET /api/sessions/:id - Get session details
  const sessionMatch = path.match(/^\/api\/sessions\/([a-zA-Z0-9_-]+)$/);
  if (method === "GET" && sessionMatch) {
    const sessionId = sessionMatch[1];
    try {
      const session = await sessionStore.getSession(sessionId);
      if (!session) {
        jsonResponse(res, { error: "Session not found" }, 404);
        return;
      }
      jsonResponse(res, { session });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      jsonResponse(res, { error: message }, 500);
    }
    return;
  }

  // Route: DELETE /api/sessions/:id - Delete session
  if (method === "DELETE" && sessionMatch) {
    const sessionId = sessionMatch[1];
    try {
      await sessionStore.deleteSession(sessionId);
      jsonResponse(res, { success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("ENOENT")) {
        jsonResponse(res, { error: "Session not found" }, 404);
      } else {
        jsonResponse(res, { error: message }, 500);
      }
    }
    return;
  }

  // 404 for unknown routes
  jsonResponse(
    res,
    {
      error: "Not found",
      path,
      hint: "Available endpoints: GET /, GET /api/health, GET /api/tools, POST /api/tools/:name, POST /mcp, POST /api/chat, GET /api/sessions, POST /api/sessions, GET /api/sessions/:id",
    },
    404
  );
}

export interface WebServerOptions {
  port?: number;
  hostname?: string;
}

/**
 * Start the web server
 */
export function startWebServer(options: WebServerOptions = {}): void {
  const port = options.port || 4567;
  const hostname = options.hostname || "127.0.0.1";

  // Initialize chat handler to check availability
  const handler = getChatHandler();
  const chatAvailable = handler.isAvailable();

  const server = createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      console.error("Request handler error:", error);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "Internal server error" }));
    });
  });

  server.listen(port, hostname, () => {
    console.log(`
🍩 Donut Web Server v${VERSION}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  URL:     http://${hostname}:${port}
  Tools:   ${TOOLS.length} available
  Chat:    ${chatAvailable ? "✓ enabled" : "✗ disabled (set ANTHROPIC_API_KEY)"}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Press Ctrl+C to stop
`);
  });

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    server.close(() => {
      process.exit(0);
    });
  });

  process.on("SIGTERM", () => {
    console.log("\nShutting down...");
    server.close(() => {
      process.exit(0);
    });
  });
}
