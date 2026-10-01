import { randomUUID } from "node:crypto";

export type McpDiagnosticPhase =
  | "initialize"
  | "tools/list"
  | "tools/call"
  | "metadata"
  | "unknown";

export type McpDiagnosticAuth = {
  authorizationPresent: boolean;
  tokenVerified: boolean;
  scopes: string[];
  hasSub: boolean;
  hasEmail: boolean;
  emailVerified: boolean;
  subjectAllowed: boolean;
};

export type McpDiagnosticContext = {
  requestId: string;
  startedAt: number;
  method: string;
  path: string;
  phase: McpDiagnosticPhase;
  auth: McpDiagnosticAuth;
};

export const MCP_DIAGNOSTIC_LOGGING_ENV = "BROCO_MCP_DIAGNOSTIC_LOGGING";

const emptyAuth = (): McpDiagnosticAuth => ({
  authorizationPresent: false,
  tokenVerified: false,
  scopes: [],
  hasSub: false,
  hasEmail: false,
  emailVerified: false,
  subjectAllowed: false,
});

export function isMcpDiagnosticLoggingEnabled() {
  return process.env[MCP_DIAGNOSTIC_LOGGING_ENV] === "true";
}

export function normalizeDiagnosticScopes(scopes: readonly string[] | undefined) {
  return [...new Set((scopes ?? []).filter((scope) => typeof scope === "string"))].sort();
}

export async function detectMcpDiagnosticPhase(
  request: Request,
): Promise<McpDiagnosticPhase> {
  if (request.url.includes("/.well-known/oauth-protected-resource")) {
    return "metadata";
  }
  if (request.method !== "POST") return "unknown";

  try {
    const body = await request.clone().json();
    if (body && typeof body === "object" && "method" in body) {
      const method = (body as { method?: unknown }).method;
      if (method === "initialize" || method === "tools/list" || method === "tools/call") {
        return method;
      }
    }
  } catch {
    // The original request is intentionally left untouched; phase is unknown.
  }
  return "unknown";
}

export async function startMcpDiagnostic(request: Request) {
  const phase = await detectMcpDiagnosticPhase(request);
  return startMcpDiagnosticForPhase(request, phase);
}

export function startMcpDiagnosticForPhase(
  request: Request,
  phase: McpDiagnosticPhase,
) {
  const context: McpDiagnosticContext = {
    requestId: randomUUID(),
    startedAt: Date.now(),
    method: request.method,
    path: new URL(request.url).pathname,
    phase,
    auth: {
      ...emptyAuth(),
      authorizationPresent: Boolean(request.headers.get("authorization")),
    },
  };

  logMcpDiagnostic("request_received", context);
  return context;
}

export function logMcpDiagnostic(
  event: string,
  context: McpDiagnosticContext,
  extra: Record<string, unknown> = {},
) {
  if (!isMcpDiagnosticLoggingEnabled()) return;

  console.info(
    "MCP_DIAG",
    JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      requestId: context.requestId,
      method: context.method,
      path: context.path,
      phase: context.phase,
      ...extra,
    }),
  );
}

export function finishMcpDiagnostic(
  context: McpDiagnosticContext,
  status: number,
  errorCode?: string,
) {
  logMcpDiagnostic("request_complete", context, {
    status,
    durationMs: Date.now() - context.startedAt,
    auth: context.auth,
    ...(errorCode ? { errorCode } : {}),
  });
}

export function authDiagnosticSnapshot(
  context: McpDiagnosticContext,
  auth: Partial<McpDiagnosticAuth> & { scopes?: readonly string[] },
) {
  context.auth = {
    ...context.auth,
    ...auth,
    scopes: normalizeDiagnosticScopes(auth.scopes),
  };
  return context.auth;
}

export function logMcpIdentityDiagnostic(extra: Record<string, unknown>) {
  if (!isMcpDiagnosticLoggingEnabled()) return;

  console.info(
    "MCP_DIAG",
    JSON.stringify({
      event: "identity_resolution",
      timestamp: new Date().toISOString(),
      ...extra,
    }),
  );
}
