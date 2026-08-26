import { describe, expect, it } from "vitest";
import {
  hashSessionToken,
  oauthStateCookie,
  oauthStateHash,
  readCookie,
  safeLogUrl,
  sessionCookie,
  sessionCookieName,
  signOAuthState,
  signReportRenderToken,
  normalizeEmail,
  emailIdentityHash,
  emailOtpHash,
  createEmailOtpCode,
  encryptEmail,
  verifyOAuthState,
  verifyOAuthBrowserBinding,
  verifyReportRenderToken,
} from "./auth.js";

describe("authentication primitives", () => {
  const secret = "test-secret-at-least-thirty-two-characters";
  it("round trips a signed OAuth state and blocks open redirects", () => {
    expect(
      verifyOAuthState(signOAuthState("/campaigns/1", secret, 100), secret, 200)
        .returnTo,
    ).toBe("/campaigns/1");
    expect(
      verifyOAuthState(
        signOAuthState("https://attacker.example", secret, 100),
        secret,
        200,
      ).returnTo,
    ).toBe("/");
  });
  it("rejects tampered and expired OAuth state", () => {
    const state = signOAuthState("/", secret, 100);
    expect(() => verifyOAuthState(`${state}x`, secret, 200)).toThrow(
      "INVALID_OAUTH_STATE",
    );
    expect(() => verifyOAuthState(state, secret, 700_101)).toThrow(
      "EXPIRED_OAUTH_STATE",
    );
  });
  it("creates an HttpOnly session cookie without exposing the raw token hash", () => {
    const cookie = sessionCookie("raw-token", 3600, true);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(readCookie(cookie, sessionCookieName(true))).toBe("raw-token");
    expect(hashSessionToken("raw-token")).not.toContain("raw-token");
    expect(sessionCookie("raw-token", 3600, true)).toContain(
      "__Host-ai_readiness_session=",
    );
  });
  it("binds OAuth state to the browser that initiated login", () => {
    const state = signOAuthState("/", secret, 100);
    const binding = oauthStateHash(state);
    const cookie = oauthStateCookie(binding, 600, true);
    expect(cookie).toContain("__Host-ai_readiness_oauth_state=");
    expect(() => verifyOAuthBrowserBinding(state, binding)).not.toThrow();
    expect(() => verifyOAuthBrowserBinding(state, null)).toThrow(
      "OAUTH_STATE_BROWSER_MISMATCH",
    );
    expect(() => verifyOAuthBrowserBinding(`${state}x`, binding)).toThrow(
      "OAUTH_STATE_BROWSER_MISMATCH",
    );
    expect(sessionCookieName(true)).toBe("__Host-ai_readiness_session");
  });
  it("removes query credentials from request log URLs", () => {
    expect(safeLogUrl("/public/reports/1?access_token=secret")).toBe(
      "/public/reports/1",
    );
    expect(safeLogUrl("/health")).toBe("/health");
  });
  it("binds a short-lived render token to one immutable report hash", () => {
    const token = signReportRenderToken(
      { reportId: "report-1", contentHash: "hash-1", expiresAt: 1_000 },
      secret,
    );
    expect(
      verifyReportRenderToken(token, "report-1", secret, 900).contentHash,
    ).toBe("hash-1");
    expect(() =>
      verifyReportRenderToken(token, "report-2", secret, 900),
    ).toThrow("INVALID_REPORT_RENDER_TOKEN");
    expect(() =>
      verifyReportRenderToken(token, "report-1", secret, 1_001),
    ).toThrow("EXPIRED_REPORT_RENDER_TOKEN");
  });
  it("normalizes email identity and produces non-reversible keyed hashes", () => {
    expect(normalizeEmail("  Person@Example.COM ")).toBe("person@example.com");
    expect(() => normalizeEmail("not-an-email")).toThrow("INVALID_EMAIL");
    expect(emailIdentityHash("person@example.com", secret)).not.toContain("person@example.com");
    expect(emailOtpHash("person@example.com", "123456", secret)).not.toContain("123456");
    expect(emailOtpHash("person@example.com", "123456", secret)).not.toBe(
      emailOtpHash("person@example.com", "123457", secret),
    );
    expect(createEmailOtpCode()).toMatch(/^\d{6}$/);
    expect(encryptEmail("person@example.com", secret)).not.toContain("person@example.com");
  });
});
