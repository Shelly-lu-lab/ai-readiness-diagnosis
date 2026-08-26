import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

interface OAuthState {
  nonce: string;
  returnTo: string;
  expiresAt: number;
}
interface ReportRenderClaims {
  reportId: string;
  contentHash: string;
  expiresAt: number;
}

const encode = (value: string) => Buffer.from(value).toString("base64url");
const decode = (value: string) =>
  Buffer.from(value, "base64url").toString("utf8");

/** Normalizes an email for identity lookup without retaining the raw value in logs. */
export function normalizeEmail(value: string): string {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("INVALID_EMAIL");
  return email;
}
export function emailIdentityHash(email: string, secret: string): string {
  return createHmac("sha256", secret).update(`email-identity:${email}`).digest("hex");
}
export function emailOtpHash(email: string, code: string, secret: string): string {
  return createHmac("sha256", secret).update(`email-otp:${email}:${code}`).digest("hex");
}
export function createEmailOtpCode(): string {
  return String(randomInt(100000, 1000000));
}
export function encryptEmail(value: string, secret: string): string {
  const key = createHash("sha256").update(`email-encryption:${secret}`).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}
export function decryptEmail(value: string, secret: string): string {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue)
    throw new Error("INVALID_ENCRYPTED_EMAIL");
  const key = createHash("sha256").update(`email-encryption:${secret}`).digest();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function signOAuthState(
  returnTo: string,
  secret: string,
  now = Date.now(),
): string {
  const safeReturnTo =
    returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  const payload = encode(
    JSON.stringify({
      nonce: randomBytes(18).toString("base64url"),
      returnTo: safeReturnTo,
      expiresAt: now + 10 * 60_000,
    } satisfies OAuthState),
  );
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function verifyOAuthState(
  state: string,
  secret: string,
  now = Date.now(),
): OAuthState {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) throw new Error("INVALID_OAUTH_STATE");
  const expected = createHmac("sha256", secret).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    throw new Error("INVALID_OAUTH_STATE");
  const value = JSON.parse(decode(payload)) as OAuthState;
  if (
    !value.nonce ||
    value.expiresAt < now ||
    !value.returnTo.startsWith("/") ||
    value.returnTo.startsWith("//")
  )
    throw new Error("EXPIRED_OAUTH_STATE");
  return value;
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}
export function sessionCookieName(secure: boolean): string {
  return secure ? "__Host-ai_readiness_session" : "ai_readiness_session";
}
export function oauthStateCookieName(secure: boolean): string {
  return secure
    ? "__Host-ai_readiness_oauth_state"
    : "ai_readiness_oauth_state";
}
export function oauthStateHash(state: string): string {
  return createHash("sha256").update(`oauth-state:${state}`).digest("hex");
}
export function oauthNonceHash(nonce: string): string {
  return createHash("sha256").update(`oauth-nonce:${nonce}`).digest("hex");
}
export function verifyOAuthBrowserBinding(
  state: string,
  cookieValue: string | null,
): void {
  if (!cookieValue) throw new Error("OAUTH_STATE_BROWSER_MISMATCH");
  const expected = Buffer.from(oauthStateHash(state));
  const actual = Buffer.from(cookieValue);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    throw new Error("OAUTH_STATE_BROWSER_MISMATCH");
}
export function oauthStateCookie(
  stateHash: string,
  maxAgeSeconds: number,
  secure: boolean,
): string {
  return `${oauthStateCookieName(secure)}=${encodeURIComponent(stateHash)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`;
}
export function clearOAuthStateCookie(secure: boolean): string {
  return oauthStateCookie("", 0, secure);
}
export function safeLogUrl(url: string): string {
  const queryIndex = url.indexOf("?");
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
export function readCookie(
  header: string | undefined,
  name: string,
): string | null {
  for (const part of header?.split(";") ?? []) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}
export function sessionCookie(
  token: string,
  maxAgeSeconds: number,
  secure: boolean,
): string {
  return `${sessionCookieName(secure)}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`;
}

export function signReportRenderToken(
  claims: Omit<ReportRenderClaims, "expiresAt"> & { expiresAt?: number },
  secret: string,
): string {
  const payload = encode(
    JSON.stringify({
      ...claims,
      expiresAt: claims.expiresAt ?? Date.now() + 5 * 60_000,
    } satisfies ReportRenderClaims),
  );
  return `${payload}.${createHmac("sha256", secret).update(`report-render:${payload}`).digest("base64url")}`;
}

export function verifyReportRenderToken(
  token: string,
  reportId: string,
  secret: string,
  now = Date.now(),
): ReportRenderClaims {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) throw new Error("INVALID_REPORT_RENDER_TOKEN");
  const expected = createHmac("sha256", secret)
    .update(`report-render:${payload}`)
    .digest();
  const actual = Buffer.from(signature, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    throw new Error("INVALID_REPORT_RENDER_TOKEN");
  const value = JSON.parse(decode(payload)) as ReportRenderClaims;
  if (value.reportId !== reportId || !value.contentHash)
    throw new Error("INVALID_REPORT_RENDER_TOKEN");
  if (value.expiresAt < now) throw new Error("EXPIRED_REPORT_RENDER_TOKEN");
  return value;
}
