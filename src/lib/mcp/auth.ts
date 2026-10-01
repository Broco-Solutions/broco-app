import type { AuthInfo } from "@modelcontextprotocol/server";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import type { AuthConfig } from "@/lib/mcp/config";

function getJwksUrl(issuer: string): URL {
  return new URL(".well-known/jwks.json", issuer);
}

function parseScopes(payload: Record<string, unknown>): string[] {
  const scopes = new Set<string>();
  if (typeof payload.scope === "string") {
    for (const scope of payload.scope.split(/\s+/)) {
      if (scope) scopes.add(scope);
    }
  }
  if (Array.isArray(payload.permissions)) {
    for (const permission of payload.permissions) {
      if (typeof permission === "string" && permission) scopes.add(permission);
    }
  }
  return [...scopes];
}

export type TokenVerifier = (
  request: Request,
  bearerToken?: string,
) => Promise<AuthInfo | undefined>;

export type AuthDiagnostic = {
  authorizationPresent: boolean;
  tokenVerified: boolean;
  scopes: string[];
  hasSub: boolean;
  subjectAllowed: boolean;
  errorCode?:
    | "MISSING_TOKEN"
    | "JWT_INVALID"
    | "ISSUER_MISMATCH"
    | "AUDIENCE_MISMATCH"
    | "TOKEN_EXPIRED"
    | "SUBJECT_MISSING"
    | "SUBJECT_NOT_ALLOWED"
    | "INTERNAL_AUTH_ERROR";
};

const authDiagnostics = new WeakMap<Request, AuthDiagnostic>();

export function getAuthDiagnostic(request: Request) {
  return authDiagnostics.get(request);
}

function joseErrorProperty(error: unknown, property: "code" | "claim") {
  if (typeof error !== "object" || error === null) return undefined;
  const value = (error as Record<string, unknown>)[property];
  return typeof value === "string" ? value : undefined;
}

function classifyJwtError(error: unknown): AuthDiagnostic["errorCode"] {
  const code = joseErrorProperty(error, "code");
  const claim = joseErrorProperty(error, "claim");
  if (code === "ERR_JWT_EXPIRED") return "TOKEN_EXPIRED";
  if (claim === "iss") return "ISSUER_MISMATCH";
  if (claim === "aud") return "AUDIENCE_MISMATCH";
  if (claim === "sub") return "SUBJECT_MISSING";
  if (code?.startsWith("ERR_JWT") || code?.startsWith("ERR_JWS")) {
    return "JWT_INVALID";
  }
  return "INTERNAL_AUTH_ERROR";
}

/** Verifies the external OAuth token. Broco authorization happens per tool. */
export function makeTokenVerifier(
  config: AuthConfig,
  getKey: JWTVerifyGetKey = createRemoteJWKSet(getJwksUrl(config.issuer)),
): TokenVerifier {
  return async (request, bearerToken) => {
    if (!bearerToken) {
      authDiagnostics.set(request, {
        authorizationPresent: false,
        tokenVerified: false,
        scopes: [],
        hasSub: false,
        subjectAllowed: false,
        errorCode: "MISSING_TOKEN",
      });
      return undefined;
    }

    try {
      const { payload } = await jwtVerify(bearerToken, getKey, {
        algorithms: ["RS256"],
        issuer: config.issuer,
        audience: config.audience,
        requiredClaims: ["sub", "exp"],
        clockTolerance: 5,
      });

      const subject = typeof payload.sub === "string" ? payload.sub : "";
      const emailValue = payload[config.emailClaim];
      const email =
        typeof emailValue === "string" ? emailValue.trim().toLowerCase() : "";
      const emailVerified = payload[config.emailVerifiedClaim] === true;

      const scopes = parseScopes(payload as Record<string, unknown>);
      const baseDiagnostic = {
        authorizationPresent: true,
        tokenVerified: true,
        scopes,
        hasSub: subject.length > 0,
        subjectAllowed: Boolean(subject),
      } satisfies AuthDiagnostic;
      if (!subject.length) {
        authDiagnostics.set(request, {
          ...baseDiagnostic,
          tokenVerified: false,
          errorCode: "SUBJECT_MISSING",
        });
        return undefined;
      }
      authDiagnostics.set(request, baseDiagnostic);

      const clientId =
        typeof payload.azp === "string"
          ? payload.azp
          : typeof payload.client_id === "string"
            ? payload.client_id
            : subject;

      return {
        token: bearerToken,
        clientId,
        scopes,
        expiresAt: payload.exp,
        extra: {
          sub: subject,
          provider: config.issuer,
          email: email || undefined,
          emailVerified,
        },
      };
    } catch (error) {
      authDiagnostics.set(request, {
        authorizationPresent: true,
        tokenVerified: false,
        scopes: [],
        hasSub: false,
        subjectAllowed: false,
        errorCode: classifyJwtError(error),
      });
      return undefined;
    }
  };
}
