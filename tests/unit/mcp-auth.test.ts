import { beforeAll, describe, expect, it } from "vitest";
import {
  exportJWK,
  generateKeyPair,
  importJWK,
  SignJWT,
  type JWTVerifyGetKey,
} from "jose";
import { getAuthDiagnostic, makeTokenVerifier } from "@/lib/mcp/auth";
import type { AuthConfig } from "@/lib/mcp/config";

const ISSUER = "https://example.auth0.com/";
const LEGACY_ISSUER = "https://legacy.auth0.com/";
const AUDIENCE = "https://broco.example/api/mcp";
let privateKey: CryptoKey;
let publicKey: CryptoKey;

const config: AuthConfig = {
  issuer: ISSUER,
  acceptedIssuers: [ISSUER, LEGACY_ISSUER],
  audience: AUDIENCE,
  emailClaim: "https://broco.example/email",
  emailVerifiedClaim: "https://broco.example/email_verified",
};

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  publicKey = (await importJWK({ ...jwk, alg: "RS256" }, "RS256")) as CryptoKey;
});

async function sign(
  claims: Record<string, unknown> = {},
  options: { issuer?: string; audience?: string; expiresIn?: string } = {},
) {
  const builder = new SignJWT({ scope: "mcp:read", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setSubject(String(claims.sub ?? "auth0|allowed"))
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setIssuedAt();
  if (options.expiresIn !== "missing") {
    builder.setExpirationTime(options.expiresIn ?? "5m");
  }
  return builder.sign(privateKey);
}

function verifier(key: CryptoKey = publicKey) {
  const getKey: JWTVerifyGetKey = async () => key;
  return makeTokenVerifier(config, getKey);
}

describe("JWT Auth0 para MCP", () => {
  it("acepta firma, issuer, audience, expiración, scope y subject", async () => {
    const token = await sign({ permissions: ["extra:read"] });
    const auth = await verifier()(new Request(AUDIENCE), token);
    expect(auth).toMatchObject({
      token,
      scopes: expect.arrayContaining(["mcp:read", "extra:read"]),
      extra: { sub: "auth0|allowed" },
    });
  });

  it("acepta el issuer canónico durante la transición", async () => {
    const token = await sign({}, { issuer: LEGACY_ISSUER });
    expect(await verifier()(new Request(AUDIENCE), token)).toMatchObject({
      extra: { provider: LEGACY_ISSUER },
    });
  });

  it("rechaza un issuer desconocido", async () => {
    const token = await sign({}, { issuer: "https://unknown.example/" });
    expect(await verifier()(new Request(AUDIENCE), token)).toBeUndefined();
  });

  it("rechaza firma inválida", async () => {
    const other = await generateKeyPair("RS256");
    expect(await verifier(other.publicKey)(new Request(AUDIENCE), await sign())).toBeUndefined();
  });

  it("clasifica fallos JWT sin conservar datos sensibles", async () => {
    const request = new Request(AUDIENCE);
    const token = await sign({}, { audience: "https://wrong.example/api/mcp" });
    expect(await verifier()(request, token)).toBeUndefined();
    expect(getAuthDiagnostic(request)).toMatchObject({
      authorizationPresent: true,
      tokenVerified: false,
      errorCode: "AUDIENCE_MISMATCH",
    });
    expect(JSON.stringify(getAuthDiagnostic(request))).not.toContain(token);
  });

  it("clasifica token ausente y conserva un subject externo válido", async () => {
    const missingRequest = new Request(AUDIENCE);
    expect(await verifier()(missingRequest)).toBeUndefined();
    expect(getAuthDiagnostic(missingRequest)?.errorCode).toBe("MISSING_TOKEN");

    const outsiderRequest = new Request(AUDIENCE);
    const outsider = await sign({ sub: "auth0|outsider" });
    expect(await verifier()(outsiderRequest, outsider)).toMatchObject({
      token: outsider,
      extra: { sub: "auth0|outsider", provider: ISSUER },
    });
    expect(getAuthDiagnostic(outsiderRequest)).toMatchObject({
      tokenVerified: true,
      hasSub: true,
      subjectAllowed: true,
    });
  });

  it.each([
    ["issuer", { issuer: "https://wrong.example/" }],
    ["audience", { audience: "https://wrong.example/api/mcp" }],
    ["expirado", { expiresIn: "-1m" }],
    ["sin exp", { expiresIn: "missing" }],
  ])("rechaza token con %s incorrecto", async (_label, options) => {
    const token = await sign({}, options);
    expect(await verifier()(new Request(AUDIENCE), token)).toBeUndefined();
  });

  it("transporta email sólo como señal de enlace y conserva su verificación", async () => {
    const emailClaim = config.emailClaim;
    const verifiedClaim = config.emailVerifiedClaim;
    const unverified = await sign({
      sub: "auth0|email-user",
      [emailClaim]: "ALLOWED@EXAMPLE.COM",
      [verifiedClaim]: false,
    });
    expect(await verifier()(new Request(AUDIENCE), unverified)).toMatchObject({
      extra: { email: "allowed@example.com", emailVerified: false },
    });

    const stringVerified = await sign({
      sub: "auth0|email-user",
      [emailClaim]: "allowed@example.com",
      [verifiedClaim]: "true",
    });
    expect(await verifier()(new Request(AUDIENCE), stringVerified)).toMatchObject({
      extra: { emailVerified: false },
    });

    const verified = await sign({
      sub: "auth0|email-user",
      [emailClaim]: "ALLOWED@EXAMPLE.COM",
      [verifiedClaim]: true,
    });
    expect(await verifier()(new Request(AUDIENCE), verified)).toMatchObject({
      extra: { sub: "auth0|email-user", email: "allowed@example.com", emailVerified: true },
    });
    const request = new Request(AUDIENCE);
    await verifier()(request, verified);
    expect(getAuthDiagnostic(request)).toMatchObject({
      hasSub: true,
      hasEmail: true,
      emailVerified: true,
    });
  });
});
