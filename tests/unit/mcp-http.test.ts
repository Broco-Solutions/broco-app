import type { AuthInfo } from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EnabledMcpConfig, McpConfig } from "@/lib/mcp/config";
import {
  createMcpHttpHandler,
  createMcpProtocolHandler,
  createProtectedResourceMetadataHandlers,
} from "@/server/mcp/http";
import {
  MCP_TOOL_NAMES,
  MCP_TOOL_SECURITY_SCHEMES,
} from "@/server/mcp/tools";
import { MCP_DIAGNOSTIC_LOGGING_ENV } from "@/lib/mcp/diagnostics";

const enabled: EnabledMcpConfig = {
  status: "ok",
  resourceUrl: "https://broco.example/api/mcp",
  requiredScope: "mcp:read",
  auth: {
    issuer: "https://example.auth0.com/",
    audience: "https://broco.example/api/mcp",
    emailClaim: "email",
    emailVerifiedClaim: "email_verified",
  },
};

const authInfo = (scopes: string[]): AuthInfo => ({
  token: "token",
  clientId: "chatgpt",
  scopes,
  expiresAt: Math.floor(Date.now() / 1000) + 60,
});

async function readJsonRpcPayload(response: Response) {
  const body = await response.text();
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = body
      .split("\n")
      .find((line) => line.startsWith("data: "))
      ?.slice("data: ".length);
    if (!data) throw new Error("La respuesta SSE no contiene un evento MCP");
    return JSON.parse(data) as unknown;
  }
  return JSON.parse(body) as unknown;
}

function handler(config: McpConfig, auth?: AuthInfo) {
  const protocol = vi.fn(async () => new Response("protocol-ok"));
  const tokenVerifier = vi.fn(() => async () => auth);
  return {
    protocol,
    tokenVerifier,
    run: createMcpHttpHandler({
      readConfig: () => config,
      protocolHandler: protocol,
      tokenVerifier,
    }),
  };
}

describe("HTTP MCP protegido", () => {
  it.each(["disabled", "killed"] as const)(
    "devuelve 404 y no autentica cuando está %s",
    async (status) => {
      const test = handler({ status });
      const response = await test.run(new Request(enabled.resourceUrl));
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(test.tokenVerifier).not.toHaveBeenCalled();
      expect(test.protocol).not.toHaveBeenCalled();
    },
  );

  it("devuelve 503 genérico cuando la configuración está incompleta", async () => {
    const test = handler({ status: "misconfigured", reason: "invalid_issuer" });
    const response = await test.run(new Request(enabled.resourceUrl));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Service unavailable" });
  });

  it("desafía con metadata RFC 9728 cuando falta o no vale el JWT", async () => {
    const test = handler(enabled);
    const response = await test.run(new Request(enabled.resourceUrl));
    expect(response.status).toBe(401);
    const challenge = response.headers.get("www-authenticate");
    expect(challenge).toContain(
      'resource_metadata="https://broco.example/.well-known/oauth-protected-resource"',
    );
    expect(challenge).toContain('scope="mcp:read"');
    await expect(response.text()).resolves.not.toContain("protocol-ok");
    expect(test.protocol).not.toHaveBeenCalled();
  });

  it("rechaza scope incorrecto con 403", async () => {
    const test = handler(enabled, authInfo(["profile"]));
    const response = await test.run(
      new Request(enabled.resourceUrl, {
        headers: { Authorization: "Bearer token" },
      }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toContain("insufficient_scope");
    expect(test.protocol).not.toHaveBeenCalled();
  });

  it("solo invoca el protocolo con identidad permitida y mcp:read", async () => {
    const test = handler(enabled, authInfo(["mcp:read"]));
    const response = await test.run(
      new Request(enabled.resourceUrl, {
        headers: { Authorization: "Bearer token" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("protocol-ok");
    expect(test.protocol).toHaveBeenCalledOnce();
  });

  it("expone los securitySchemes en el payload real de tools/list", async () => {
    const run = createMcpHttpHandler({
      readConfig: () => enabled,
      protocolHandler: createMcpProtocolHandler(),
      tokenVerifier: () => async () => authInfo(["mcp:read"]),
    });
    const response = await run(
      new Request(enabled.resourceUrl, {
        method: "POST",
        headers: {
          Accept: "application/json, text/event-stream",
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = (await readJsonRpcPayload(response)) as {
      result: { tools: Array<{ name: string; securitySchemes?: unknown }> };
    };
    expect(payload.result.tools.map((tool) => tool.name)).toEqual(MCP_TOOL_NAMES);
    for (const tool of payload.result.tools) {
      expect(tool.securitySchemes).toEqual(MCP_TOOL_SECURITY_SCHEMES);
    }
  });
});

describe("Protected Resource Metadata", () => {
  it("queda oculta con el kill switch", () => {
    const routes = createProtectedResourceMetadataHandlers(() => ({ status: "killed" }));
    expect(routes.GET().status).toBe(404);
    expect(routes.OPTIONS().status).toBe(404);
  });

  it("publica issuer, resource, scope, bearer header y CORS", async () => {
    const routes = createProtectedResourceMetadataHandlers(() => enabled);
    const response = routes.GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    await expect(response.json()).resolves.toMatchObject({
      resource: enabled.resourceUrl,
      authorization_servers: [enabled.auth.issuer],
      scopes_supported: ["mcp:read", "mcp:write"],
      bearer_methods_supported: ["header"],
    });
    expect(routes.OPTIONS().status).toBe(204);
  });
});

describe("diagnóstico temporal MCP", () => {
  let info: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete process.env[MCP_DIAGNOSTIC_LOGGING_ENV];
    info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete process.env[MCP_DIAGNOSTIC_LOGGING_ENV];
    vi.restoreAllMocks();
  });

  function diagnosticEvents() {
    return info.mock.calls
      .filter((call: unknown[]) => call[0] === "MCP_DIAG")
      .map((call: unknown[]) => JSON.parse(String(call[1])) as Record<string, unknown>);
  }

  it("no registra eventos cuando la variable no es exactamente true", async () => {
    const test = handler(enabled, authInfo(["mcp:read"]));
    await test.run(new Request(enabled.resourceUrl));
    expect(info).not.toHaveBeenCalled();
  });

  it("registra el ciclo initialize sin secretos", async () => {
    process.env[MCP_DIAGNOSTIC_LOGGING_ENV] = "true";
    const test = handler(enabled, {
      ...authInfo(["mcp:read", "mcp:write"]),
      extra: { sub: "auth0|sensitive-subject" },
    });
    const response = await test.run(
      new Request(enabled.resourceUrl, {
        method: "POST",
        headers: {
          Authorization: "Bearer sensitive-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {},
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(diagnosticEvents().map((event: Record<string, unknown>) => event.event)).toEqual([
      "request_received",
      "auth_success",
      "initialize_success",
      "request_complete",
    ]);
    const serialized = JSON.stringify(info.mock.calls);
    expect(serialized).not.toContain("sensitive-token");
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("sensitive-subject");
    expect(diagnosticEvents().at(-1)).toMatchObject({
      event: "request_complete",
      status: 200,
      auth: {
        authorizationPresent: true,
        tokenVerified: true,
        scopes: ["mcp:read", "mcp:write"],
        hasSub: true,
        subjectAllowed: true,
      },
    });
  });

  it("registra tools/list con el conteo sin alterar la respuesta", async () => {
    process.env[MCP_DIAGNOSTIC_LOGGING_ENV] = "true";
    const tools = Array.from({ length: 35 }, (_, index) => ({
      name: `tool_${index}`,
      inputSchema: { type: "object" },
    }));
    const test = handler(enabled, authInfo(["mcp:read", "mcp:write"]));
    test.protocol.mockResolvedValueOnce(
      new Response(`data: ${JSON.stringify({ result: { tools } })}\n\n`, {
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
    const response = await test.run(
      new Request(enabled.resourceUrl, {
        method: "POST",
        headers: {
          Authorization: "Bearer sensitive-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"tool_34"');
    expect(diagnosticEvents()).toContainEqual(
      expect.objectContaining({
        event: "tools_list_success",
        toolCount: 35,
      }),
    );
  });
});
