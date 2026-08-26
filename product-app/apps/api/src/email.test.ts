import { afterEach, describe, expect, it, vi } from "vitest";
import type { Transporter } from "nodemailer";
import { BrevoEmailProvider, ConsoleEmailProvider, ResendEmailProvider, SmtpEmailProvider } from "./email.js";

afterEach(() => vi.unstubAllGlobals());

describe("development email provider", () => {
  it("does not report real invitation delivery when no provider is configured", async () => {
    const provider = new ConsoleEmailProvider();
    await expect(
      provider.sendInvitation({
        to: "employee@example.com",
        campaignName: "测试活动",
        inviteUrl: "http://localhost:5173/survey/example",
        subject: "邀请你参加测评",
        body: "请完成问卷。",
      }),
    ).rejects.toThrow("EMAIL_PROVIDER_NOT_CONFIGURED");
  });
});

describe("Resend email provider", () => {
  it("uses the Resend API shape and returns the provider message id", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedInit = init;
      return new Response(JSON.stringify({ id: "re_message_123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new ResendEmailProvider(
      "re_test_key",
      "AI 组织转型诊断 <survey@example.com>",
      "support@example.com",
    );
    await expect(
      provider.sendOtp({
        to: "manager@example.com",
        code: "123456",
        challengeId: "challenge-1",
      }),
    ).resolves.toEqual({ providerMessageId: "re_message_123" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer re_test_key",
        }),
      }),
    );
    const body = JSON.parse(String(capturedInit?.body));
    expect(body).toMatchObject({
      from: "AI 组织转型诊断 <survey@example.com>",
      to: ["manager@example.com"],
      reply_to: "support@example.com",
      subject: "你的 AI 组织转型诊断验证码",
    });
    expect(body.text).toContain("123456");
  });

  it("surfaces rejected provider requests without exposing the response body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("secret details", { status: 403 })));
    const provider = new ResendEmailProvider(
      "re_invalid",
      "survey@example.com",
    );
    await expect(
      provider.sendReportReady({
        to: "employee@example.com",
        reportUrl: "https://app.example/my-reports",
        subject: "报告已生成",
      }),
    ).rejects.toThrow("EMAIL_PROVIDER_HTTP_403");
  });
});

describe("Brevo email provider", () => {
  it("uses a verified sender email and returns the Brevo message id", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedInit = init;
      return new Response(JSON.stringify({ messageId: "<brevo-message-123>" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new BrevoEmailProvider(
      "xkeysib-test-key",
      "AI 组织转型诊断 <sender@example.com>",
      "支持团队 <support@example.com>",
    );
    await expect(
      provider.sendOtp({
        to: "employee@another-company.com",
        code: "654321",
        challengeId: "challenge-2",
      }),
    ).resolves.toEqual({ providerMessageId: "<brevo-message-123>" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.brevo.com/v3/smtp/email",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "api-key": "xkeysib-test-key" }),
      }),
    );
    const body = JSON.parse(String(capturedInit?.body));
    expect(body).toMatchObject({
      sender: { name: "AI 组织转型诊断", email: "sender@example.com" },
      to: [{ email: "employee@another-company.com" }],
      replyTo: { name: "支持团队", email: "support@example.com" },
      subject: "你的 AI 组织转型诊断验证码",
    });
    expect(body.textContent).toContain("654321");
  });

  it("does not expose the Brevo response body when delivery is rejected", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("secret details", { status: 401 })));
    const provider = new BrevoEmailProvider("invalid", "sender@example.com");
    await expect(
      provider.sendReportReady({
        to: "employee@example.com",
        reportUrl: "https://app.example/my-reports",
        subject: "报告已生成",
      }),
    ).rejects.toThrow("EMAIL_PROVIDER_HTTP_401");
  });
});

describe("SMTP email provider", () => {
  it("sends through the configured mailbox and returns the SMTP message id", async () => {
    const sendMail = vi.fn(async () => ({ messageId: "<gmail-message-123>" }));
    const provider = new SmtpEmailProvider(
      "AI 组织转型诊断 <ai.readiness.survey@gmail.com>",
      "ai.readiness.survey@gmail.com",
      {
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        user: "ai.readiness.survey@gmail.com",
        password: "application-password",
      },
      { sendMail } as unknown as Transporter,
    );
    await expect(
      provider.sendInvitation({
        to: "employee@example.com",
        campaignName: "AI 转型准备度调研",
        inviteUrl: "https://app.example/survey/invite",
        subject: "邀请你参加调研",
        body: "请完成问卷。",
      }),
    ).resolves.toEqual({ providerMessageId: "<gmail-message-123>" });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: "AI 组织转型诊断 <ai.readiness.survey@gmail.com>",
      to: "employee@example.com",
      replyTo: "ai.readiness.survey@gmail.com",
      subject: "邀请你参加调研",
    }));
  });

  it("normalizes SMTP failures without exposing credentials or provider details", async () => {
    const sendMail = vi.fn(async () => { throw new Error("535 password rejected"); });
    const provider = new SmtpEmailProvider(
      "ai.readiness.survey@gmail.com",
      undefined,
      {
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        user: "ai.readiness.survey@gmail.com",
        password: "secret",
      },
      { sendMail } as unknown as Transporter,
    );
    await expect(provider.sendOtp({
      to: "employee@example.com",
      code: "123456",
      challengeId: "challenge-3",
    })).rejects.toThrow("EMAIL_PROVIDER_SMTP_FAILED");
  });
});
