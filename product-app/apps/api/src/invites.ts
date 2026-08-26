import { createHmac, timingSafeEqual } from "node:crypto";

export interface InviteClaims {
  campaignId: string;
  participantId: string;
  expiresAt: number;
}

const secret = () =>
  process.env.INVITE_SECRET ??
  process.env.SESSION_SECRET ??
  "development-only-invite-secret-change-before-deploy";

export function signInvite(claims: InviteClaims): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyInvite(token: string, campaignId: string): InviteClaims {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) throw new Error("INVALID_INVITE");
  const expected = createHmac("sha256", secret()).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    throw new Error("INVALID_INVITE");
  const claims = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8"),
  ) as InviteClaims;
  if (claims.campaignId !== campaignId || claims.expiresAt < Date.now())
    throw new Error("EXPIRED_OR_MISMATCHED_INVITE");
  return claims;
}
