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
import {
  getAuthDiagnostic,
  makeTokenVerifier,
  type TokenVerifier,
} from "@/lib/mcp/auth";
import {
  authDiagnosticSnapshot,
  finishMcpDiagnostic,
  logMcpDiagnostic,
  startMcpDiagnostic,
  startMcpDiagnosticForPhase,
} from "@/lib/mcp/diagnostics";
import {
  MCP_TOOL_NAMES,
  MCP_TOOL_SECURITY_SCHEMES,
  registerTools,
  WRITE_MCP_TOOL_NAMES,
} from "@/server/mcp/tools";
import { MCP_WRITE_SCOPE } from "@/lib/mcp/config";

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
        if (!isRecord(tool)) {
          return tool;
        }
        const isRead = MCP_TOOL_NAMES.includes(tool.name as never);
        const isWrite = WRITE_MCP_TOOL_NAMES.includes(tool.name as never);
        if (!isRead && !isWrite) return tool;
        return {
          ...tool,
          securitySchemes: isWrite
            ? [{ type: "oauth2", scopes: ["mcp:read", MCP_WRITE_SCOPE] }]
            : MCP_TOOL_SECURITY_SCHEMES,
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

export function createMcpProtocolHandler(writeEnabled = false): ProtocolHandler {
  const handler = createMcpHandler(
    (server) => registerTools(server, undefined, { writeEnabled }),
    {
      serverInfo: { name: "broco-finance-mcp", version: "1.1.0" },
      instructions:
        writeEnabled
          ? "Gestión privada de Broco: consultas y cambios controlados. Respeta scopes, confirmaciones y límites."
          : "Consultas financieras privadas y exclusivamente de lectura. Respeta los rangos y límites declarados por cada herramienta.",
      maxSubscriptions: 0,
    },
  );
  return (request) => exposeToolSecuritySchemes(request, handler);
}

const readProtocolHandler = createMcpProtocolHandler(false);
const writeProtocolHandler = createMcpProtocolHandler(true);

let cachedVerifier: { key: string; verifier: TokenVerifier } | undefined;

function verifierKey(config: AuthConfig) {
  return JSON.stringify({
    issuer: config.issuer,
    audience: config.audience,
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
  protocolHandler: readProtocolHandler,
  tokenVerifier: getTokenVerifier,
};

function unavailable(status: 404 | 503) {
  return Response.json(
    { error: status === 404 ? "Not found" : "Service unavailable" },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function requestErrorCode(status: number, authErrorCode?: string) {
  if (status === 403) return "INSUFFICIENT_SCOPE";
  if (status === 401) return authErrorCode ?? "INTERNAL_AUTH_ERROR";
  return undefined;
}

function withMetadataDiagnostic(
  request: Request | undefined,
  handler: () => Response,
) {
  if (!request) return handler();
  const diagnostic = startMcpDiagnosticForPhase(request, "metadata");
  let status = 500;
  try {
    const response = handler();
    status = response.status;
    return response;
  } finally {
    finishMcpDiagnostic(diagnostic, status);
  }
}

async function logSuccessfulMcpPhase(
  context: Awaited<ReturnType<typeof startMcpDiagnostic>>,
  response: Response,
) {
  if (!response.ok || context.phase === "unknown" || context.phase === "metadata") {
    return;
  }
  if (context.phase === "initialize") {
    logMcpDiagnostic("initialize_success", context, { status: response.status });
    return;
  }
  if (context.phase !== "tools/list") return;

  try {
    const body = await response.clone().text();
    const dataLine = body
      .split("\n")
      .find((line) => line.startsWith("data: "));
    const payload = dataLine
      ? JSON.parse(dataLine.slice("data: ".length))
      : JSON.parse(body);
    const tools = payload?.result?.tools;
    if (!Array.isArray(tools)) throw new Error("missing_tools");
    logMcpDiagnostic("tools_list_success", context, {
      status: response.status,
      toolCount: tools.length,
    });
  } catch {
    logMcpDiagnostic("tools_list_error", context, {
      errorCode: "MALFORMED_RESPONSE",
    });
  }
}

/** Builds the MCP route handler with injectable boundaries for security tests. */
export function createMcpHttpHandler(
  dependencies: McpHttpDependencies = defaultDependencies,
) {
  return async (request: Request) => {
    const diagnostic = await startMcpDiagnostic(request);
    let finalStatus = 500;
    let finalErrorCode: string | undefined;
    let authErrorCode: string | undefined;

    try {
    const config = dependencies.readConfig();
    if (config.status === "disabled" || config.status === "killed") {
      finalStatus = 404;
      return unavailable(404);
    }
    if (config.status === "misconfigured") {
      finalStatus = 503;
      return unavailable(503);
    }

    const selectedProtocol = dependencies === defaultDependencies && config.status === "ok" && config.writeEnabled
      ? writeProtocolHandler
      : dependencies.protocolHandler;
    const baseTokenVerifier = dependencies.tokenVerifier(config.auth);
    const diagnosticTokenVerifier: TokenVerifier = async (authRequest, bearerToken) => {
      const authInfo = await baseTokenVerifier(authRequest, bearerToken);
      const authDiagnostic = getAuthDiagnostic(authRequest);
      const snapshot = authDiagnosticSnapshot(diagnostic, {
        authorizationPresent: authDiagnostic?.authorizationPresent ?? Boolean(bearerToken),
        tokenVerified: authDiagnostic?.tokenVerified ?? Boolean(authInfo),
        scopes: authDiagnostic?.scopes ?? authInfo?.scopes ?? [],
        hasSub: authDiagnostic?.hasSub ?? Boolean(authInfo?.extra?.sub),
        subjectAllowed: authDiagnostic?.subjectAllowed ?? Boolean(authInfo),
      });
      authErrorCode = authDiagnostic?.errorCode;
      if (snapshot.tokenVerified) {
        logMcpDiagnostic("auth_success", diagnostic, { auth: snapshot });
      } else {
        logMcpDiagnostic("auth_failure", diagnostic, {
          auth: snapshot,
          errorCode: authDiagnostic?.errorCode ?? "INTERNAL_AUTH_ERROR",
        });
      }
      return authInfo;
    };
    const authenticatedHandler = withMcpAuth(
      selectedProtocol,
      diagnosticTokenVerifier,
      {
        required: true,
        requiredScopes: [config.requiredScope],
        resourceUrl: new URL(config.resourceUrl).origin,
        resourceMetadataPath: MCP_METADATA_PATH,
      },
    );
    const response = await authenticatedHandler(request);
    finalStatus = response.status;
    finalErrorCode = requestErrorCode(finalStatus, authErrorCode);
    await logSuccessfulMcpPhase(diagnostic, response);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
    } catch (error) {
      finalErrorCode = "INTERNAL_AUTH_ERROR";
      throw error;
    } finally {
      finishMcpDiagnostic(diagnostic, finalStatus, finalErrorCode);
    }
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
    GET(request?: Request) {
      return withMetadataDiagnostic(request, () => {
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
            scopes_supported: [config.requiredScope, MCP_WRITE_SCOPE],
            bearer_methods_supported: ["header"],
          },
        });
        return Response.json(metadata, { headers: metadataHeaders });
      });
    },
    OPTIONS(request?: Request) {
      return withMetadataDiagnostic(request, () => {
        const config = readConfig();
        if (config.status === "disabled" || config.status === "killed") {
          return unavailable(404);
        }
        if (config.status === "misconfigured") return unavailable(503);
        return new Response(null, { status: 204, headers: metadataHeaders });
      });
    },
  };
}

export const handleMcpRequest = createMcpHttpHandler();
export const protectedResourceMetadata =
  createProtectedResourceMetadataHandlers();
