import nodemailer, { type Transporter } from "nodemailer";

export interface EmailProvider {
  sendOtp(input: { to: string; code: string; challengeId: string }): Promise<{ providerMessageId: string }>;
  sendInvitation(input: { to: string; campaignName: string; inviteUrl: string; subject: string; body: string }): Promise<{ providerMessageId: string }>;
  sendReminder(input: { to: string; campaignName: string; inviteUrl: string; subject: string; body: string }): Promise<{ providerMessageId: string }>;
  sendReportReady(input: { to: string; reportUrl: string; subject: string }): Promise<{ providerMessageId: string }>;
}

/** Development-safe provider. Production must inject a transactional email implementation. */
export class ConsoleEmailProvider implements EmailProvider {
  async sendOtp(input: { to: string; code: string; challengeId: string }) {
    if (process.env.NODE_ENV !== "test") console.info(`[email:otp] ${input.to.replace(/(.{2}).*(@.*)/, "$1***$2")} challenge=${input.challengeId}`);
    return { providerMessageId: `dev-${input.challengeId}` };
  }
  async sendInvitation(_input: {
    to: string;
    campaignName: string;
    inviteUrl: string;
    subject: string;
    body: string;
  }): Promise<{ providerMessageId: string }> {
    throw new Error("EMAIL_PROVIDER_NOT_CONFIGURED");
  }
  async sendReminder(_input: {
    to: string;
    campaignName: string;
    inviteUrl: string;
    subject: string;
    body: string;
  }): Promise<{ providerMessageId: string }> {
    throw new Error("EMAIL_PROVIDER_NOT_CONFIGURED");
  }
  async sendReportReady(_input: {
    to: string;
    reportUrl: string;
    subject: string;
  }): Promise<{ providerMessageId: string }> {
    throw new Error("EMAIL_PROVIDER_NOT_CONFIGURED");
  }
}

export class HttpEmailProvider implements EmailProvider {
  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
    private readonly from: string,
    private readonly replyTo?: string,
  ) {}

  private async send(input: {
    to: string;
    subject: string;
    text: string;
    metadata?: Record<string, string>;
  }): Promise<{ providerMessageId: string }> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        from: this.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        replyTo: this.replyTo || undefined,
        metadata: input.metadata,
      }),
    });
    if (!response.ok) throw new Error(`EMAIL_PROVIDER_HTTP_${response.status}`);
    const body = (await response.json().catch(() => ({}))) as {
      id?: string;
      messageId?: string;
    };
    return { providerMessageId: body.id ?? body.messageId ?? `email-${Date.now()}` };
  }

  sendOtp(input: { to: string; code: string; challengeId: string }) {
    return this.send({
      to: input.to,
      subject: "你的 AI 组织转型诊断验证码",
      text: `你的验证码是 ${input.code}，10 分钟内有效。如非本人操作，请忽略此邮件。`,
      metadata: { type: "otp", challengeId: input.challengeId },
    });
  }

  sendInvitation(input: { to: string; campaignName: string; inviteUrl: string; subject: string; body: string }) {
    return this.send({
      to: input.to,
      subject: input.subject,
      text: `${input.body}\n\n进入问卷：${input.inviteUrl}`,
      metadata: { type: "invite", campaignName: input.campaignName },
    });
  }

  sendReminder(input: { to: string; campaignName: string; inviteUrl: string; subject: string; body: string }) {
    return this.send({
      to: input.to,
      subject: input.subject,
      text: `${input.body}\n\n继续填写：${input.inviteUrl}`,
      metadata: { type: "reminder", campaignName: input.campaignName },
    });
  }

  sendReportReady(input: { to: string; reportUrl: string; subject: string }) {
    return this.send({
      to: input.to,
      subject: input.subject,
      text: `你的诊断报告已经生成。\n\n查看报告：${input.reportUrl}`,
      metadata: { type: "report" },
    });
  }
}

export class ResendEmailProvider implements EmailProvider {
  private readonly endpoint = "https://api.resend.com/emails";

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly replyTo?: string,
  ) {}

  private async send(input: {
    to: string;
    subject: string;
    text: string;
    tags: Array<{ name: string; value: string }>;
  }): Promise<{ providerMessageId: string }> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        from: this.from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        reply_to: this.replyTo || undefined,
        tags: input.tags,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`EMAIL_PROVIDER_HTTP_${response.status}`);
    const body = (await response.json().catch(() => ({}))) as { id?: string };
    if (!body.id) throw new Error("EMAIL_PROVIDER_INVALID_RESPONSE");
    return { providerMessageId: body.id };
  }

  sendOtp(input: { to: string; code: string; challengeId: string }) {
    return this.send({
      to: input.to,
      subject: "你的 AI 组织转型诊断验证码",
      text: `你的验证码是 ${input.code}，10 分钟内有效。\n\n如非本人操作，请忽略此邮件。`,
      tags: [
        { name: "message_type", value: "otp" },
        { name: "challenge_id", value: input.challengeId },
      ],
    });
  }

  sendInvitation(input: {
    to: string;
    campaignName: string;
    inviteUrl: string;
    subject: string;
    body: string;
  }) {
    return this.send({
      to: input.to,
      subject: input.subject,
      text: `${input.body}\n\n进入问卷：${input.inviteUrl}\n\n此链接与你的邮箱身份关联，请勿转发。`,
      tags: [
        { name: "message_type", value: "invite" },
        { name: "campaign", value: "assessment" },
      ],
    });
  }

  sendReminder(input: {
    to: string;
    campaignName: string;
    inviteUrl: string;
    subject: string;
    body: string;
  }) {
    return this.send({
      to: input.to,
      subject: input.subject,
      text: `${input.body}\n\n继续填写：${input.inviteUrl}`,
      tags: [
        { name: "message_type", value: "reminder" },
        { name: "campaign", value: "assessment" },
      ],
    });
  }

  sendReportReady(input: { to: string; reportUrl: string; subject: string }) {
    return this.send({
      to: input.to,
      subject: input.subject,
      text: `你的诊断报告已经生成。\n\n查看报告：${input.reportUrl}\n\n报告仅用于发展与组织诊断，不用于人员评价。`,
      tags: [{ name: "message_type", value: "report_ready" }],
    });
  }
}

function parseEmailAddress(value: string): { email: string; name?: string } {
  const namedAddress = value.match(/^\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/);
  if (!namedAddress) return { email: value.trim() };
  const name = (namedAddress[1] ?? "").replace(/^"|"$/g, "").trim();
  return { email: namedAddress[2]!, name: name || undefined };
}

/** Brevo transactional-email adapter. Supports a verified individual sender without DNS access. */
export class BrevoEmailProvider implements EmailProvider {
  private readonly endpoint = "https://api.brevo.com/v3/smtp/email";

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly replyTo?: string,
  ) {}

  private async send(input: {
    to: string;
    subject: string;
    text: string;
  }): Promise<{ providerMessageId: string }> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "api-key": this.apiKey,
      },
      body: JSON.stringify({
        sender: parseEmailAddress(this.from),
        to: [{ email: input.to }],
        subject: input.subject,
        textContent: input.text,
        replyTo: this.replyTo ? parseEmailAddress(this.replyTo) : undefined,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`EMAIL_PROVIDER_HTTP_${response.status}`);
    const body = (await response.json().catch(() => ({}))) as { messageId?: string };
    if (!body.messageId) throw new Error("EMAIL_PROVIDER_INVALID_RESPONSE");
    return { providerMessageId: body.messageId };
  }

  sendOtp(input: { to: string; code: string; challengeId: string }) {
    return this.send({
      to: input.to,
      subject: "你的 AI 组织转型诊断验证码",
      text: `你的验证码是 ${input.code}，10 分钟内有效。\n\n如非本人操作，请忽略此邮件。`,
    });
  }

  sendInvitation(input: {
    to: string;
    campaignName: string;
    inviteUrl: string;
    subject: string;
    body: string;
  }) {
    return this.send({
      to: input.to,
      subject: input.subject,
      text: `${input.body}\n\n进入问卷：${input.inviteUrl}\n\n此链接与你的邮箱身份关联，请勿转发。`,
    });
  }

  sendReminder(input: {
    to: string;
    campaignName: string;
    inviteUrl: string;
    subject: string;
    body: string;
  }) {
    return this.send({
      to: input.to,
      subject: input.subject,
      text: `${input.body}\n\n继续填写：${input.inviteUrl}`,
    });
  }

  sendReportReady(input: { to: string; reportUrl: string; subject: string }) {
    return this.send({
      to: input.to,
      subject: input.subject,
      text: `你的诊断报告已经生成。\n\n查看报告：${input.reportUrl}\n\n报告仅用于发展与组织诊断，不用于人员评价。`,
    });
  }
}

export class SmtpEmailProvider implements EmailProvider {
  private readonly transport: Transporter;

  constructor(
    private readonly from: string,
    private readonly replyTo: string | undefined,
    config: {
      host: string;
      port: number;
      secure: boolean;
      user: string;
      password: string;
    },
    transport?: Transporter,
  ) {
    this.transport = transport ?? nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }

  private async send(input: {
    to: string;
    subject: string;
    text: string;
  }): Promise<{ providerMessageId: string }> {
    let result: { messageId?: string };
    try {
      result = await this.transport.sendMail({
        from: this.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        replyTo: this.replyTo,
      });
    } catch {
      throw new Error("EMAIL_PROVIDER_SMTP_FAILED");
    }
    if (!result.messageId) throw new Error("EMAIL_PROVIDER_INVALID_RESPONSE");
    return { providerMessageId: result.messageId };
  }

  sendOtp(input: { to: string; code: string; challengeId: string }) {
    return this.send({
      to: input.to,
      subject: "你的 AI 组织转型诊断验证码",
      text: `你的验证码是 ${input.code}，10 分钟内有效。\n\n如非本人操作，请忽略此邮件。`,
    });
  }

  sendInvitation(input: {
    to: string;
    campaignName: string;
    inviteUrl: string;
    subject: string;
    body: string;
  }) {
    return this.send({
      to: input.to,
      subject: input.subject,
      text: `${input.body}\n\n进入问卷：${input.inviteUrl}\n\n此链接与你的邮箱身份关联，请勿转发。`,
    });
  }

  sendReminder(input: {
    to: string;
    campaignName: string;
    inviteUrl: string;
    subject: string;
    body: string;
  }) {
    return this.send({
      to: input.to,
      subject: input.subject,
      text: `${input.body}\n\n继续填写：${input.inviteUrl}`,
    });
  }

  sendReportReady(input: { to: string; reportUrl: string; subject: string }) {
    return this.send({
      to: input.to,
      subject: input.subject,
      text: `你的诊断报告已经生成。\n\n查看报告：${input.reportUrl}\n\n报告仅用于发展与组织诊断，不用于人员评价。`,
    });
  }
}

export function createEmailProviderFromEnvironment(): EmailProvider {
  const provider = process.env.EMAIL_PROVIDER ?? "console";
  if (provider === "console") return new ConsoleEmailProvider();
  if (provider === "resend") {
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
      throw new Error("EMAIL_RESEND_CONFIGURATION_INCOMPLETE");
    return new ResendEmailProvider(
      process.env.RESEND_API_KEY,
      process.env.EMAIL_FROM,
      process.env.EMAIL_REPLY_TO,
    );
  }
  if (provider === "brevo") {
    if (!process.env.BREVO_API_KEY || !process.env.EMAIL_FROM)
      throw new Error("EMAIL_BREVO_CONFIGURATION_INCOMPLETE");
    return new BrevoEmailProvider(
      process.env.BREVO_API_KEY,
      process.env.EMAIL_FROM,
      process.env.EMAIL_REPLY_TO,
    );
  }
  if (provider === "smtp") {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.EMAIL_FROM)
      throw new Error("EMAIL_SMTP_CONFIGURATION_INCOMPLETE");
    const port = Number(process.env.SMTP_PORT ?? "465");
    if (!Number.isInteger(port) || port <= 0 || port > 65_535)
      throw new Error("EMAIL_SMTP_CONFIGURATION_INVALID");
    return new SmtpEmailProvider(
      process.env.EMAIL_FROM,
      process.env.EMAIL_REPLY_TO,
      {
        host: process.env.SMTP_HOST ?? "smtp.gmail.com",
        port,
        secure: (process.env.SMTP_SECURE ?? "true") === "true",
        user: process.env.SMTP_USER,
        password: process.env.SMTP_PASS,
      },
    );
  }
  if (provider !== "api" && provider !== "transactional")
    throw new Error("EMAIL_PROVIDER_UNSUPPORTED");
  if (!process.env.EMAIL_API_URL || !process.env.EMAIL_API_KEY || !process.env.EMAIL_FROM)
    throw new Error("EMAIL_API_CONFIGURATION_INCOMPLETE");
  return new HttpEmailProvider(
    process.env.EMAIL_API_URL,
    process.env.EMAIL_API_KEY,
    process.env.EMAIL_FROM,
    process.env.EMAIL_REPLY_TO,
  );
}
