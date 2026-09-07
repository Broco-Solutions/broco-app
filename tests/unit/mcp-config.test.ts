import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readMcpConfig } from "@/lib/mcp/config";

const MCP_ENV_KEYS = [
  "BROCO_MCP_KILL",
  "BROCO_MCP_ENABLED",
  "BROCO_MCP_WRITE_ENABLED",
  "BROCO_MCP_AUTH0_ISSUER",
  "BROCO_MCP_RESOURCE_URL",
  "BROCO_MCP_AUTH0_AUDIENCE",
  "BROCO_MCP_ALLOWED_SUBJECTS",
  "BROCO_MCP_ALLOWED_EMAILS",
  "BROCO_MCP_AUTH0_EMAIL_CLAIM",
  "BROCO_MCP_AUTH0_EMAIL_VERIFIED_CLAIM",
] as const;

const original = new Map<string, string | undefined>();

function enableValidConfig() {
  process.env.BROCO_MCP_ENABLED = "true";
  process.env.BROCO_MCP_AUTH0_ISSUER = "https://example.auth0.com";
  process.env.BROCO_MCP_RESOURCE_URL = "https://broco.example/api/mcp";
  process.env.BROCO_MCP_AUTH0_AUDIENCE = "https://broco.example/api/mcp";
  process.env.BROCO_MCP_ALLOWED_SUBJECTS = "auth0|authorized";
}

beforeEach(() => {
  for (const key of MCP_ENV_KEYS) {
    original.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of MCP_ENV_KEYS) {
    const value = original.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  original.clear();
});

describe("configuración MCP", () => {
  it("está desactivada por defecto", () => {
    expect(readMcpConfig()).toEqual({ status: "disabled" });
  });

  it("el kill switch prevalece incluso sobre una configuración válida", () => {
    enableValidConfig();
    process.env.BROCO_MCP_KILL = "true";
    expect(readMcpConfig()).toEqual({ status: "killed" });
  });

  it("falla cerrada ante issuer inválido, audience distinto o allowlist vacía", () => {
    enableValidConfig();
    process.env.BROCO_MCP_AUTH0_ISSUER = "http://example.auth0.com";
    expect(readMcpConfig()).toMatchObject({
      status: "misconfigured",
      reason: "invalid_issuer",
    });

    enableValidConfig();
    process.env.BROCO_MCP_AUTH0_AUDIENCE = "https://otro.example/api/mcp";
    expect(readMcpConfig()).toMatchObject({
      status: "misconfigured",
      reason: "audience_resource_mismatch",
    });

    enableValidConfig();
    process.env.BROCO_MCP_RESOURCE_URL = "https://broco.example/otra-ruta";
    process.env.BROCO_MCP_AUTH0_AUDIENCE =
      "https://broco.example/otra-ruta";
    expect(readMcpConfig()).toMatchObject({
      status: "misconfigured",
      reason: "invalid_resource",
    });

    enableValidConfig();
    delete process.env.BROCO_MCP_ALLOWED_SUBJECTS;
    expect(readMcpConfig()).toMatchObject({
      status: "misconfigured",
      reason: "empty_allowlist",
    });
  });

  it("normaliza issuer, listas y emails autorizados", () => {
    enableValidConfig();
    process.env.BROCO_MCP_ALLOWED_SUBJECTS = " auth0|one, auth0|two ";
    process.env.BROCO_MCP_ALLOWED_EMAILS = " PERSONA@EXAMPLE.COM ";
    const config = readMcpConfig();
    expect(config.status).toBe("ok");
    if (config.status !== "ok") return;
    expect(config.auth.issuer).toBe("https://example.auth0.com/");
    expect([...config.auth.allowedSubjects]).toEqual(["auth0|one", "auth0|two"]);
    expect([...config.auth.allowedEmails]).toEqual(["persona@example.com"]);
    expect(config.requiredScope).toBe("mcp:read");
    expect(config.writeEnabled).toBe(false);
  });

  it("habilita escritura sólo con el flag explícito", () => {
    enableValidConfig();
    process.env.BROCO_MCP_WRITE_ENABLED = "true";
    expect(readMcpConfig()).toMatchObject({ status: "ok", writeEnabled: true });
  });
});
