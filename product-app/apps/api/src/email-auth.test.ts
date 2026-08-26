import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqlClient, type SqlClient } from "@ai-readiness/database";
import { buildApp } from "./app.js";

let db: SqlClient;
let app: Awaited<ReturnType<typeof buildApp>>;

beforeEach(async () => {
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = "test-secret-at-least-thirty-two-characters";
  process.env.DATA_LINK_SECRET = "stable-data-link-secret-at-least-thirty-two";
  process.env.INVITE_SECRET = "invite-secret-at-least-thirty-two-characters";
  db = await createSqlClient("pglite://:memory:");
  app = await buildApp(db, {
    email: {
      sendOtp: vi.fn(async () => ({ providerMessageId: "mail-1" })),
      sendInvitation: vi.fn(async () => ({ providerMessageId: "mail-2" })),
      sendReminder: vi.fn(async () => ({ providerMessageId: "mail-3" })),
      sendReportReady: vi.fn(async () => ({ providerMessageId: "mail-4" })),
    },
  });
});

afterEach(async () => {
  await app.close();
  await db.close();
});

describe("email OTP authentication", () => {
  it("sends deduplicated email invitations and stores only hashed identity data", async () => {
    const campaign = (
      await app.inject({
        method: "POST",
        url: "/api/campaigns",
        payload: {
          name: "邮箱邀请闭环",
          target: "organization",
          mode: "anonymous",
          startsAt: "2026-08-10T00:00:00.000Z",
          closesAt: "2026-08-20T00:00:00.000Z",
        },
      })
    ).json();
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/status`,
      payload: { status: "active" },
    });
    const sent = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/email-invitations`,
      payload: {
        emails: ["one@example.com", "ONE@example.com", "two@example.com"],
        subject: "请完成测评",
        body: "请根据真实工作体验作答。",
        buttonLabel: "开始填写",
      },
    });
    expect(sent.statusCode).toBe(201);
    expect(sent.json()).toMatchObject({ sent: 2, failed: 0 });
    const rows = await db.query<any>(
      "SELECT provider,identity_hash,external_subject_id FROM invitations WHERE campaign_id=$1 ORDER BY external_subject_id",
      [campaign.id],
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.every((row: any) => row.provider === "email")).toBe(true);
    expect(rows.rows.every((row: any) => row.identity_hash && row.identity_hash.length === 64)).toBe(true);
    expect(JSON.stringify(rows.rows)).not.toContain("example.com");
  });

  it("requests and consumes a one-time code without returning raw email data", async () => {
    const request = await app.inject({
      method: "POST",
      url: "/api/auth/email/request",
      payload: { email: "Person@example.com" },
    });
    expect(request.statusCode).toBe(202);
    const body = request.json();
    expect(body.challengeId).toBeTruthy();
    expect(body.developmentCode).toMatch(/^\d{6}$/);
    expect(JSON.stringify(body)).not.toContain("Person@example.com");

    const verify = await app.inject({
      method: "POST",
      url: "/api/auth/email/verify",
      payload: {
        email: "person@example.com",
        challengeId: body.challengeId,
        code: body.developmentCode,
      },
    });
    expect(verify.statusCode).toBe(200);
    expect(verify.headers["set-cookie"]).toContain("ai_readiness_session=");

    const repeated = await app.inject({
      method: "POST",
      url: "/api/auth/email/verify",
      payload: {
        email: "person@example.com",
        challengeId: body.challengeId,
        code: body.developmentCode,
      },
    });
    expect(repeated.statusCode).toBe(401);
  });

  it("enforces the resend cooldown", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/api/auth/email/request",
      payload: { email: "cooldown@example.com" },
    });
    expect(first.statusCode).toBe(202);
    const second = await app.inject({
      method: "POST",
      url: "/api/auth/email/request",
      payload: { email: "cooldown@example.com" },
    });
    expect(second.statusCode).toBe(429);
    expect(second.json().code).toBe("EMAIL_OTP_RATE_LIMITED");
  });
});
