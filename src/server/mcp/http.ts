import {
  createMcpHandler,
  generateProtectedResourceMetadata,
  withMcpAuth,
} from "mcp-handler";
import {
  MCP_METADATA_PATH,
  readMcpConfig,
  type AuthConfig,
  type McpConfig,
} from "@/lib/mcp/config";
import { makeTokenVerifier, type TokenVerifier } from "@/lib/mcp/auth";
import {
  MCP_TOOL_NAMES,
  MCP_TOOL_SECURITY_SCHEMES,
  registerTools,
} from "@/server/mcp/tools";

type ProtocolHandler = (request: Request) => Response | Promise<Response>;

type McpHttpDependencies = {
  readConfig: () => McpConfig;
  protocolHandler: ProtocolHandler;
  tokenVerifier: (config: AuthConfig) => TokenVerifier;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function isToolsListRequest(request: Request) {
  if (
    request.method !== "POST" ||
    !request.headers.get("content-type")?.includes("application/json")
  ) {
    return false;
  }

  try {
    const body = await request.clone().json();
    return isRecord(body) && body.method === "tools/list";
  } catch {
    return false;
  }
}

function addToolSecuritySchemes(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.result)) return;
  const tools = payload.result.tools;
  if (!Array.isArray(tools)) return;

  return {
    ...payload,
    result: {
      ...payload.result,
      tools: tools.map((tool) => {
        if (!isRecord(tool) || !MCP_TOOL_NAMES.includes(tool.name as never)) {
          return tool;
        }
        return {
          ...tool,
          securitySchemes: MCP_TOOL_SECURITY_SCHEMES,
        };
      }),
    },
  };
}

function transformToolsListBody(body: string, contentType: string | null) {
  if (contentType?.includes("text/event-stream")) {
    let changed = false;
    const transformed = body.replace(/^data: (.+)$/gm, (line, data: string) => {
      try {
        const payload = addToolSecuritySchemes(JSON.parse(data));
        if (!payload) return line;
        changed = true;
        return `data: ${JSON.stringify(payload)}`;
      } catch {
        return line;
      }
    });
    return changed ? transformed : undefined;
  }

  try {
    const payload = addToolSecuritySchemes(JSON.parse(body));
    return payload ? JSON.stringify(payload) : undefined;
  } catch {
    return;
  }
}

/**
 * The installed MCP SDK serializes tool `_meta` but not top-level
 * `securitySchemes`. ChatGPT reads the standard top-level field from the
 * `tools/list` response, so add it only to the registered tools.
 */
async function exposeToolSecuritySchemes(
  request: Request,
  handler: ProtocolHandler,
) {
  const isToolsList = await isToolsListRequest(request);
  const response = await handler(request);
  if (!isToolsList || !response.ok) return response;

  try {
    const body = await response.clone().text();
    const transformed = transformToolsListBody(
      body,
      response.headers.get("content-type"),
    );
    if (!transformed) return response;

    return new Response(transformed, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(
        [...response.headers].filter(([name]) => name !== "content-length"),
      ),
    });
  } catch {
    return response;
  }
}

export function createMcpProtocolHandler(): ProtocolHandler {
  const handler = createMcpHandler(
    (server) => registerTools(server),
    {
      serverInfo: { name: "broco-finance-readonly", version: "1.0.0" },
      instructions:
        "Consultas financieras privadas y exclusivamente de lectura. Respeta los rangos y límites declarados por cada herramienta.",
      maxSubscriptions: 0,
    },
  );
  return (request) => exposeToolSecuritySchemes(request, handler);
}

const protocolHandler = createMcpProtocolHandler();

let cachedVerifier: { key: string; verifier: TokenVerifier } | undefined;

function verifierKey(config: AuthConfig) {
  return JSON.stringify({
    issuer: config.issuer,
    audience: config.audience,
    subjects: [...config.allowedSubjects].sort(),
    emails: [...config.allowedEmails].sort(),
    emailClaim: config.emailClaim,
    emailVerifiedClaim: config.emailVerifiedClaim,
  });
}

function getTokenVerifier(config: AuthConfig) {
  const key = verifierKey(config);
  if (!cachedVerifier || cachedVerifier.key !== key) {
    cachedVerifier = { key, verifier: makeTokenVerifier(config) };
  }
  return cachedVerifier.verifier;
}

const defaultDependencies: McpHttpDependencies = {
  readConfig: readMcpConfig,
  protocolHandler,
  tokenVerifier: getTokenVerifier,
};

function unavailable(status: 404 | 503) {
  return Response.json(
    { error: status === 404 ? "Not found" : "Service unavailable" },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/** Builds the MCP route handler with injectable boundaries for security tests. */
export function createMcpHttpHandler(
  dependencies: McpHttpDependencies = defaultDependencies,
) {
  return async (request: Request) => {
    const config = dependencies.readConfig();
    if (config.status === "disabled" || config.status === "killed") {
      return unavailable(404);
    }
    if (config.status === "misconfigured") return unavailable(503);

    const authenticatedHandler = withMcpAuth(
      dependencies.protocolHandler,
      dependencies.tokenVerifier(config.auth),
      {
        required: true,
        requiredScopes: [config.requiredScope],
        resourceUrl: new URL(config.resourceUrl).origin,
        resourceMetadataPath: MCP_METADATA_PATH,
      },
    );
    const response = await authenticatedHandler(request);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

const metadataHeaders = {
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
};

/** Builds the RFC 9728 Protected Resource Metadata handlers. */
export function createProtectedResourceMetadataHandlers(
  readConfig: () => McpConfig = readMcpConfig,
) {
  return {
    GET() {
      const config = readConfig();
      if (config.status === "disabled" || config.status === "killed") {
        return unavailable(404);
      }
      if (config.status === "misconfigured") return unavailable(503);

      const metadata = generateProtectedResourceMetadata({
        authServerUrls: [config.auth.issuer],
        resourceUrl: config.resourceUrl,
        additionalMetadata: {
          resource_name: "Broco Finance MCP (solo lectura)",
          scopes_supported: [config.requiredScope],
          bearer_methods_supported: ["header"],
        },
      });
      return Response.json(metadata, { headers: metadataHeaders });
    },
    OPTIONS() {
      const config = readConfig();
      if (config.status === "disabled" || config.status === "killed") {
        return unavailable(404);
      }
      if (config.status === "misconfigured") return unavailable(503);
      return new Response(null, { status: 204, headers: metadataHeaders });
    },
  };
}

export const handleMcpRequest = createMcpHttpHandler();
export const protectedResourceMetadata =
  createProtectedResourceMetadataHandlers();
