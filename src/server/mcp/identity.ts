import "server-only";

import type { ServerContext } from "@modelcontextprotocol/server";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { logMcpIdentityDiagnostic } from "@/lib/mcp/diagnostics";
import { prisma } from "@/server/prisma";

export const MCP_APP_USER_REQUIRED =
  "Tu identidad está autenticada, pero no existe un usuario activo asociado en Broco App.";
export const MCP_EMAIL_VERIFICATION_REQUIRED =
  "Tu identidad está autenticada, pero necesitás verificar tu correo electrónico antes de vincularla con Broco App. Verificá tu email en el inicio de sesión y luego volvé a conectar Broco App.";

export class McpAuthorizationError extends Error {
  constructor(
    readonly code:
      | "APP_USER_REQUIRED"
      | "EMAIL_VERIFICATION_REQUIRED"
      | "APP_USER_INACTIVE"
      | "FORBIDDEN"
      | "INSUFFICIENT_SCOPE",
    message: string,
  ) {
    super(message);
  }
}

type IdentityClaims = {
  provider: string;
  subject: string;
  email?: string;
  emailVerified?: boolean;
};

type IdentityClient = Pick<PrismaClient, "mcpIdentity" | "appUser">;
type IdentityAppUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "COLLABORATOR";
  isActive: boolean;
  sessionVersion: number;
};

function asClaim(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function claimsFromContext(ctx: ServerContext): IdentityClaims {
  const extra = ctx.http?.authInfo?.extra as Record<string, unknown> | undefined;
  const provider = asClaim(extra?.provider);
  const subject = asClaim(extra?.sub);
  if (!provider || !subject) {
    throw new McpAuthorizationError("APP_USER_REQUIRED", MCP_APP_USER_REQUIRED);
  }
  return {
    provider,
    subject,
    email: asClaim(extra?.email)?.toLowerCase(),
    emailVerified: extra?.emailVerified === true,
  };
}

function toCurrentUser(user: {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "COLLABORATOR";
  sessionVersion: number;
}): CurrentUser {
  return user;
}

function normalizeEmail(email: string | undefined) {
  return asClaim(email)?.toLowerCase();
}

async function createVerifiedEmailLink(
  claims: IdentityClaims,
  client: IdentityClient,
): Promise<{
  user: IdentityAppUser | null;
  attempted: boolean;
  appUserMatchFound: boolean;
  appUserActive: boolean;
  result: "created" | "concurrent_existing" | "blocked" | "email_verification_required";
}> {
  const email = normalizeEmail(claims.email);
  if (email && !claims.emailVerified) {
    return {
      user: null,
      attempted: false,
      appUserMatchFound: false,
      appUserActive: false,
      result: "email_verification_required",
    };
  }
  if (!email) {
    return {
      user: null,
      attempted: false,
      appUserMatchFound: false,
      appUserActive: false,
      result: "blocked",
    };
  }
  const user = await client.appUser.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      sessionVersion: true,
    },
  });
  if (!user || !user.isActive) {
    return {
      user: null,
      attempted: true,
      appUserMatchFound: Boolean(user),
      appUserActive: Boolean(user?.isActive),
      result: "blocked",
    };
  }

  try {
    await client.mcpIdentity.create({
      data: {
        provider: claims.provider,
        subject: claims.subject,
        appUserId: user.id,
        emailSnapshot: email,
      },
    });
    return {
      user,
      attempted: true,
      appUserMatchFound: true,
      appUserActive: true,
      result: "created",
    };
  } catch (error) {
    // A concurrent first request or a distinct identity already linked to this
    // AppUser must never silently bind the caller to an arbitrary account.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
    const linked = await client.mcpIdentity.findUnique({
      where: {
        provider_subject: {
          provider: claims.provider,
          subject: claims.subject,
        },
      },
      select: {
        appUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            sessionVersion: true,
          },
        },
      },
    });
    return {
      user: linked?.appUser ?? null,
      attempted: true,
      appUserMatchFound: true,
      appUserActive: Boolean(linked?.appUser?.isActive),
      result: linked?.appUser ? "concurrent_existing" : "blocked",
    };
  }
}

/**
 * Resolves the current AppUser for every MCP call. OAuth proves the external
 * identity; this lookup is deliberately repeated so role and deactivation
 * changes take effect without relinking or token rotation.
 */
export async function resolveMcpActorFromClaims(
  claims: IdentityClaims,
  client: IdentityClient = prisma,
): Promise<CurrentUser> {
  const normalizedClaims = {
    ...claims,
    email: normalizeEmail(claims.email),
  };
  let identityFound = false;
  let appUserMatchFound = false;
  let appUserActive = false;
  let autoLinkAttempted = false;
  let autoLinkResult: "not_needed" | "created" | "concurrent_existing" | "blocked" | "email_verification_required" = "not_needed";

  const linked = await client.mcpIdentity.findUnique({
    where: {
      provider_subject: {
        provider: claims.provider,
        subject: claims.subject,
      },
    },
    select: {
      appUser: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          sessionVersion: true,
        },
      },
    },
  });

  identityFound = Boolean(linked);
  appUserMatchFound = Boolean(linked?.appUser);
  appUserActive = Boolean(linked?.appUser?.isActive);
  const autoLink = linked ? null : await createVerifiedEmailLink(normalizedClaims, client);
  if (autoLink) {
    autoLinkAttempted = autoLink.attempted;
    appUserMatchFound = autoLink.appUserMatchFound;
    appUserActive = autoLink.appUserActive;
    autoLinkResult = autoLink.result;
  }

  const user = linked?.appUser ?? autoLink?.user ?? null;
  logMcpIdentityDiagnostic({
    oauth_subject_present: Boolean(normalizedClaims.subject),
    oauth_email_present: Boolean(normalizedClaims.email),
    oauth_email_verified: normalizedClaims.emailVerified === true,
    identity_found: identityFound,
    app_user_match_found: appUserMatchFound,
    app_user_active: appUserActive,
    auto_link_attempted: autoLinkAttempted,
    auto_link_result: autoLinkResult,
  });

  if (!user && autoLinkResult === "email_verification_required") {
    throw new McpAuthorizationError("EMAIL_VERIFICATION_REQUIRED", MCP_EMAIL_VERIFICATION_REQUIRED);
  }
  if (!user) throw new McpAuthorizationError("APP_USER_REQUIRED", MCP_APP_USER_REQUIRED);
  if (!user.isActive) {
    throw new McpAuthorizationError("APP_USER_INACTIVE", MCP_APP_USER_REQUIRED);
  }
  return toCurrentUser(user);
}

export async function requireMcpActor(ctx: ServerContext) {
  return resolveMcpActorFromClaims(claimsFromContext(ctx));
}

export async function requireMcpAdmin(ctx: ServerContext) {
  const actor = await requireMcpActor(ctx);
  if (actor.role !== "ADMIN") {
    throw new McpAuthorizationError("FORBIDDEN", "No tenés acceso a esta operación en Broco App.");
  }
  return actor;
}

export async function requireMcpWriteActor(ctx: ServerContext) {
  if (!ctx.http?.authInfo?.scopes.includes("mcp:write")) {
    throw new McpAuthorizationError("INSUFFICIENT_SCOPE", "INSUFFICIENT_SCOPE");
  }
  return requireMcpActor(ctx);
}

export function mcpErrorResult(error: unknown) {
  if (error instanceof McpAuthorizationError) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: { code: error.code, message: error.message } }) }],
      structuredContent: { error: { code: error.code, message: error.message } },
      isError: true,
    };
  }
  const message = error instanceof Error ? error.message : "Operación inválida.";
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: { code: "VALIDATION_ERROR", message } }) }],
    structuredContent: { error: { code: "VALIDATION_ERROR", message } },
    isError: true,
  };
}
