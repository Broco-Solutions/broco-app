import { z } from "zod";

export const MCP_REQUIRED_SCOPE = "mcp:read";
export const MCP_WRITE_SCOPE = "mcp:write";
export const MCP_DEFAULT_PAGE_SIZE = 20;
export const MCP_MAX_RESULTS = 50;
export const MCP_MAX_PAGE = 1_000;
export const MCP_MAX_RANGE_DAYS = 366;
export const MCP_ROUTE_PATH = "/api/mcp";
export const MCP_METADATA_PATH = "/.well-known/oauth-protected-resource";

export type AuthConfig = {
  issuer: string;
  acceptedIssuers: string[];
  audience: string;
  emailClaim: string;
  emailVerifiedClaim: string;
};

export type EnabledMcpConfig = {
  status: "ok";
  auth: AuthConfig;
  resourceUrl: string;
  requiredScope: typeof MCP_REQUIRED_SCOPE;
  writeEnabled?: boolean;
};

export type McpConfig =
  | { status: "disabled" }
  | { status: "killed" }
  | { status: "misconfigured"; reason: string }
  | EnabledMcpConfig;

const claimNameSchema = z.string().trim().min(1).max(200);

function parseHttpsUrl(raw: string | undefined, kind: "issuer" | "resource") {
  const parsed = z.string().trim().url().safeParse(raw);
  if (!parsed.success) return null;

  try {
    const url = new URL(parsed.data);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }

    if (kind === "issuer") {
      url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
    } else if (url.pathname === "/") {
      return null;
    } else {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }

    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Reads MCP configuration for every request. Within a running deployment the
 * kill switch is evaluated on every request, but Vercel applies changed
 * environment variables only after a new deployment. Every missing or
 * inconsistent value fails closed.
 */
export function readMcpConfig(): McpConfig {
  if (process.env.BROCO_MCP_KILL === "true") return { status: "killed" };
  if (process.env.BROCO_MCP_ENABLED !== "true") return { status: "disabled" };

  const issuer = parseHttpsUrl(
    process.env.BROCO_MCP_AUTH0_ISSUER,
    "issuer",
  );
  const legacyIssuer = parseHttpsUrl(
    process.env.BROCO_MCP_AUTH0_LEGACY_ISSUER,
    "issuer",
  );
  const resourceUrl = parseHttpsUrl(
    process.env.BROCO_MCP_RESOURCE_URL,
    "resource",
  );
  const audience = process.env.BROCO_MCP_AUTH0_AUDIENCE?.trim();
  const emailClaim = claimNameSchema.safeParse(
    process.env.BROCO_MCP_AUTH0_EMAIL_CLAIM?.trim() || "email",
  );
  const emailVerifiedClaim = claimNameSchema.safeParse(
    process.env.BROCO_MCP_AUTH0_EMAIL_VERIFIED_CLAIM?.trim() ||
      "email_verified",
  );

  if (!issuer) {
    return { status: "misconfigured", reason: "invalid_issuer" };
  }
  if (!legacyIssuer || legacyIssuer === issuer) {
    return { status: "misconfigured", reason: "invalid_legacy_issuer" };
  }
  if (!resourceUrl || new URL(resourceUrl).pathname !== MCP_ROUTE_PATH) {
    return { status: "misconfigured", reason: "invalid_resource" };
  }
  if (!audience || audience !== resourceUrl) {
    return { status: "misconfigured", reason: "audience_resource_mismatch" };
  }
  if (!emailClaim.success || !emailVerifiedClaim.success) {
    return { status: "misconfigured", reason: "invalid_email_claim" };
  }

  return {
    status: "ok",
    auth: {
      issuer,
      acceptedIssuers: [issuer, legacyIssuer],
      audience,
      emailClaim: emailClaim.data,
      emailVerifiedClaim: emailVerifiedClaim.data,
    },
    resourceUrl,
    requiredScope: MCP_REQUIRED_SCOPE,
    // Writes are opt-in. Vercel applies environment changes on a new deployment.
    writeEnabled: process.env.BROCO_MCP_WRITE_ENABLED === "true",
  };
}
