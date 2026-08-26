import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyRequest } from "fastify";
import {
  EXECUTABLE_RULESET_SHA256,
  EMPLOYEE_PRIVACY_NOTICE_VERSION,
  PUBLIC_PERSONAL_ASSESSMENT_PROFILES,
  PERSONAL_RESEARCH_NOTICE_VERSION,
  VERSION_TUPLE,
  type AssessmentProfileId,
  type AuthContext,
  type CampaignRecord,
  type CampaignStatus,
  type CreateActionPlanInput,
  type CreateCampaignInput,
  type CustomAnswer,
  type CustomQuestionSnapshot,
  type EnterpriseRole,
  type EnterpriseApplicationStatus,
  type LoginIntent,
  type PlatformRole,
  type OrganizationResearchProfile,
  type PersonContextMappingInput,
  type PersonalResearchProfileInput,
  type RawAnswer,
  type ReportPublication,
  type ReportSnapshot,
  type ResponseSubmission,
} from "@ai-readiness/contracts";
import {
  questionnaireReleaseContentHash,
  transitionCampaignWithReport,
} from "@ai-readiness/application";
import {
  ProductRepository,
  SCHEMA_RELEASE,
  type SqlClient,
} from "@ai-readiness/database";
import {
  scoreAnswers,
} from "@ai-readiness/domain";
import { FeishuClient } from "@ai-readiness/feishu";
import {
  buildReportSnapshot,
  verifyReportSnapshot,
} from "@ai-readiness/reporting";
import {
  createSessionToken,
  clearOAuthStateCookie,
  hashSessionToken,
  oauthNonceHash,
  oauthStateCookie,
  oauthStateCookieName,
  oauthStateHash,
  readCookie,
  safeLogUrl,
  sessionCookie,
  sessionCookieName,
  signOAuthState,
  signReportRenderToken,
  verifyOAuthState,
  verifyOAuthBrowserBinding,
  verifyReportRenderToken,
  emailIdentityHash,
  emailOtpHash,
  normalizeEmail,
  createEmailOtpCode,
  decryptEmail,
  encryptEmail,
} from "./auth.js";
import { createEmailProviderFromEnvironment, type EmailProvider } from "./email.js";
import { signInvite, verifyInvite } from "./invites.js";
import { createArtifactStore, type ArtifactStore } from "./artifact-store.js";
import { renderReportPdf } from "./report-pdf.js";
import {
  createProductJobQueue,
  type ProductJobQueue,
} from "./job-queue.js";

const developmentContext: AuthContext = {
  accountId: "account-development",
  tenantId: "tenant-demo",
  tenantName: "示例公司",
  userId: "user-hr-demo",
  userName: "本地测试管理员",
  role: "owner",
  authentication: "development_mock",
  workspaceKind: "organization",
  platformRoles: ["platform_admin"],
};
const contextOf = (request: FastifyRequest) =>
  (request as FastifyRequest & { productAuth: AuthContext }).productAuth;
const adminRoles: EnterpriseRole[] = ["owner", "hr_admin"];

const normalizeCustomItems = (
  input: CustomQuestionSnapshot[] | undefined,
  mode: CreateCampaignInput["mode"],
): CustomQuestionSnapshot[] | null => {
  if (!Array.isArray(input)) return input === undefined ? [] : null;
  if (input.length > 5) return null;
  const normalized = input.map((item, index) => ({
    id: `CQ${String(index + 1).padStart(2, "0")}`,
    type: item?.type,
    text: item?.text?.trim(),
    required: Boolean(item?.required),
    options: Array.isArray(item?.options)
      ? item.options.map((option, optionIndex) => ({
          value: String(option?.value || optionIndex + 1).trim(),
          label: option?.label?.trim(),
        }))
      : [],
  })) as CustomQuestionSnapshot[];
  const requiredChoiceCount = normalized.filter(
    (item) => item.required && item.type !== "short_text",
  ).length;
  if (
    requiredChoiceCount > 2 ||
    normalized.some((item) => {
      const choice = ["single_choice", "multiple_choice"].includes(item.type);
      const labels = item.options.map((option) => option.label);
      const values = item.options.map((option) => option.value);
      return (
        !["single_choice", "multiple_choice", "short_text"].includes(item.type) ||
        !item.text ||
        item.text.length > 300 ||
        (item.type === "short_text" &&
          (mode === "anonymous" || item.required || item.options.length > 0)) ||
        (choice &&
          (item.options.length < 2 ||
            item.options.length > 10 ||
            labels.some((label) => !label || label.length > 100) ||
            values.some((value) => !value || value.length > 40) ||
            new Set(labels).size !== labels.length ||
            new Set(values).size !== values.length))
      );
    })
  )
    return null;
  return normalized;
};

export interface AppDependencies {
  artifactStore?: ArtifactStore;
  jobQueue?: ProductJobQueue | null;
  feishu?: FeishuClient | null;
  email?: EmailProvider;
}

export async function buildApp(
  db: SqlClient,
  dependencies: AppDependencies = {},
) {
  const app = Fastify({
    logger:
      process.env.NODE_ENV === "test"
        ? false
        : {
            serializers: {
              req(request: {
                method?: string;
                url?: string;
                hostname?: string;
                remoteAddress?: string;
              }) {
                return {
                  method: request.method,
                  url: safeLogUrl(request.url ?? ""),
                  hostname: request.hostname,
                  remoteAddress: request.remoteAddress,
                };
              },
            },
            redact: {
              paths: [
                "req.headers.cookie",
                "req.headers.authorization",
                "headers.cookie",
                "headers.authorization",
              ],
              censor: "[REDACTED]",
            },
          },
    trustProxy: true,
    bodyLimit: 256_000,
  });
  const repository = new ProductRepository(db);
  const email = dependencies.email ?? createEmailProviderFromEnvironment();
  const artifactStore = dependencies.artifactStore ?? createArtifactStore();
  const jobQueue =
    dependencies.jobQueue === undefined
      ? createProductJobQueue()
      : dependencies.jobQueue;
  app.addHook("onClose", async () => jobQueue?.close());
  if (
    process.env.NODE_ENV !== "production" &&
    (process.env.AUTH_MODE ?? "development_mock") === "development_mock"
  )
    await repository.seedDevelopmentTenant();
  for (const assessmentProfileId of PUBLIC_PERSONAL_ASSESSMENT_PROFILES) {
    const publicPersonalCampaign =
      await repository.ensurePublicPersonalCampaign(assessmentProfileId);
    if (publicPersonalCampaign.status === "draft")
      await transitionCampaignWithReport({
        repository,
        tenantId: publicPersonalCampaign.tenantId,
        campaignId: publicPersonalCampaign.id,
        status: "active",
        actorId: "system",
        organizationLabel: "个人测评",
      });
  }
  await app.register(cors, {
    origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, {
    global: true,
    max: Number(process.env.API_RATE_LIMIT_PER_MINUTE ?? 600),
    timeWindow: "1 minute",
    allowList: (request) =>
      request.url === "/health" || request.url === "/ready",
  });
  const operationalMetrics = {
    startedAt: Date.now(),
    requests: 0,
    errors: 0,
    inFlight: 0,
    durationMilliseconds: 0,
    byStatusClass: new Map<number, number>(),
  };
  app.addHook("onRequest", async (request) => {
    (request as FastifyRequest & { operationalStartedAt?: number })
      .operationalStartedAt = Date.now();
    operationalMetrics.inFlight += 1;
  });
  app.addHook("onResponse", async (request, reply) => {
    operationalMetrics.requests += 1;
    operationalMetrics.inFlight = Math.max(0, operationalMetrics.inFlight - 1);
    operationalMetrics.durationMilliseconds += Math.max(
      0,
      Date.now() -
        ((request as FastifyRequest & { operationalStartedAt?: number })
          .operationalStartedAt ?? Date.now()),
    );
    const statusClass = Math.floor(reply.statusCode / 100);
    operationalMetrics.byStatusClass.set(
      statusClass,
      (operationalMetrics.byStatusClass.get(statusClass) ?? 0) + 1,
    );
    if (reply.statusCode >= 500) operationalMetrics.errors += 1;
  });
  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    if (request.url.startsWith("/api/") || request.url.startsWith("/public/"))
      reply.header("cache-control", "private, no-store");
    return payload;
  });

  const secret =
    process.env.SESSION_SECRET ??
    "development-secret-must-not-be-used-in-production";
  const dataLinkSecret = process.env.DATA_LINK_SECRET ?? secret;
  const subjectHash = (campaignId: string, subjectId: string) =>
    createHash("sha256")
      .update(`subject-link:${campaignId}:${subjectId}:${dataLinkSecret}`)
      .digest("hex");
  const responseHash = (campaignId: string, subjectId: string) =>
    createHash("sha256")
      .update(`response-dedupe:${campaignId}:${subjectId}:${dataLinkSecret}`)
      .digest("hex");
  const draftHash = (campaignId: string, subjectId: string) =>
    createHash("sha256")
      .update(`response-draft:${campaignId}:${subjectId}:${dataLinkSecret}`)
      .digest("hex");
  const deliverReportReadyEmail = async (input: {
    identityHash: string;
    encryptedEmail: string;
    reportUrl: string;
    subject: string;
  }) => {
    try {
      const to = decryptEmail(input.encryptedEmail, secret);
      const sent = await email.sendReportReady({
        to,
        reportUrl: input.reportUrl,
        subject: input.subject,
      });
      await repository.recordEmailDelivery({
        identityHash: input.identityHash,
        type: "report",
        status: "sent",
        providerMessageId: sent.providerMessageId,
      });
    } catch (error) {
      await repository.recordEmailDelivery({
        identityHash: input.identityHash,
        type: "report",
        status: "failed",
        errorCode:
          error instanceof Error
            ? (error.message.split(":")[0] ?? "EMAIL_SEND_FAILED").slice(0, 80)
            : "EMAIL_SEND_FAILED",
      });
    }
  };
  const notifySignedInAccountReportReady = async (
    request: FastifyRequest,
    report: ReportSnapshot,
  ) => {
    const raw = readCookie(
      request.headers.cookie,
      sessionCookieName(process.env.NODE_ENV === "production"),
    );
    const current = raw
      ? await repository.resolveAuthSession(hashSessionToken(raw))
      : null;
    if (!current || current.authentication !== "email_otp") return;
    const [identityHash, encryptedEmail] = await Promise.all([
      repository.emailIdentityHashForUser(current.tenantId, current.userId),
      repository.encryptedEmailForUser(current.tenantId, current.userId),
    ]);
    if (!identityHash || !encryptedEmail) return;
    await deliverReportReadyEmail({
      identityHash,
      encryptedEmail,
      reportUrl: `${process.env.WEB_ORIGIN ?? "http://localhost:5173"}/my-reports/${report.id}`,
      subject: "你的 AI 准备度诊断报告已生成",
    });
  };
  const campaignWindowError = (
    campaign: Pick<CampaignRecord, "startsAt" | "closesAt">,
  ) => {
    const now = Date.now();
    if (now < new Date(campaign.startsAt).getTime())
      return { statusCode: 409, code: "CAMPAIGN_NOT_STARTED" } as const;
    if (now > new Date(campaign.closesAt).getTime())
      return { statusCode: 410, code: "CAMPAIGN_DEADLINE_PASSED" } as const;
    return null;
  };
  const campaignInviteExpiry = (
    campaign: Pick<CampaignRecord, "closesAt">,
    requestedHours?: number,
  ) => {
    const afterLifecycleRetention =
      new Date(campaign.closesAt).getTime() + 90 * 86_400_000;
    const requested = requestedHours
      ? Date.now() + Math.min(8_760, Math.max(1, requestedHours)) * 3_600_000
      : 0;
    return Math.max(afterLifecycleRetention, requested);
  };
  const isDesignatedAssessor = (
    campaign: CampaignRecord,
    participantId: string,
  ) =>
    campaign.organizationMethod !== "single_manager_self_assessment" ||
    campaign.designatedAssessorExternalId === participantId;
  const versionsMatch = (
    left: CampaignRecord["versions"],
    right: CampaignRecord["versions"],
  ) =>
    (Object.keys(VERSION_TUPLE) as Array<keyof typeof VERSION_TUPLE>).every(
      (key) => left[key] === right[key],
    );
  const activeQuestionnaireRelease = async (campaign: CampaignRecord) => {
    const release = await repository.getQuestionnaireRelease(
      campaign.tenantId,
      campaign.id,
    );
    const computedContentHash = release
      ? questionnaireReleaseContentHash(release)
      : null;
    if (
      !release ||
      computedContentHash !== release.contentHash ||
      !versionsMatch(release.versions, campaign.versions) ||
      !versionsMatch(campaign.versions, VERSION_TUPLE) ||
      release.ruleManifestHash !== EXECUTABLE_RULESET_SHA256
    )
      return null;
    return release;
  };
  const feishuConfigured = Boolean(
    process.env.FEISHU_APP_ID &&
    process.env.FEISHU_APP_SECRET &&
    process.env.FEISHU_REDIRECT_URI,
  );
  const feishu =
    dependencies.feishu !== undefined
      ? dependencies.feishu
      : feishuConfigured
        ? new FeishuClient({
            appId: process.env.FEISHU_APP_ID!,
            appSecret: process.env.FEISHU_APP_SECRET!,
            redirectUri: process.env.FEISHU_REDIRECT_URI!,
          })
        : null;
  const pdfFor = async (report: ReportSnapshot) => {
    const existing = await repository.getReportArtifact(
      report.tenantId,
      report.id,
      report.contentHash,
    );
    if (existing) return artifactStore.get(existing.storageKey);
    const renderToken = signReportRenderToken(
      { reportId: report.id, contentHash: report.contentHash },
      secret,
    );
    const pdf = await renderReportPdf({
      webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
      reportId: report.id,
      renderToken,
    });
    const storageKey = `${report.tenantId}/reports/${report.id}/${report.contentHash}.pdf`;
    await artifactStore.put(storageKey, pdf, "application/pdf");
    await repository.saveReportArtifact({
      tenantId: report.tenantId,
      reportSnapshotId: report.id,
      storageKey,
      contentHash: report.contentHash,
      byteSize: pdf.byteLength,
    });
    return pdf;
  };
  const sendPdf = async (
    reply: any,
    report: ReportSnapshot,
    access: {
      actorId: string | null;
      channel:
        | "employee_workspace"
        | "anonymous_retrieval_token"
        | "report_center"
        | "individual_report_grant";
      role?: string;
    },
  ) => {
    try {
      const pdf = await pdfFor(report);
      await repository.recordAuditEvent({
        tenantId: report.tenantId,
        actorId: access.actorId,
        action:
          access.channel === "individual_report_grant"
            ? "individual_report.downloaded"
            : "report.downloaded",
        objectType: "report",
        objectId: report.id,
        outcome: "success",
        metadata: {
          accessChannel: access.channel,
          role: access.role ?? null,
          reportType: report.reportType,
          contentHash: report.contentHash,
        },
      });
      return reply
        .header("content-type", "application/pdf")
        .header(
          "content-disposition",
          `attachment; filename="ai-readiness-report-${report.id.slice(0, 8)}.pdf"`,
        )
        .header("cache-control", "private, no-store")
        .send(pdf);
    } catch (error) {
      await repository.recordAuditEvent({
        tenantId: report.tenantId,
        actorId: access.actorId,
        action: "report.download_failed",
        objectType: "report",
        objectId: report.id,
        outcome: "failure",
        metadata: {
          accessChannel: access.channel,
          role: access.role ?? null,
          reportType: report.reportType,
          errorCode:
            error instanceof Error
              ? error.message.split(":")[0]
              : "REPORT_PDF_GENERATION_FAILED",
        },
      });
      app.log.error(
        { err: error, reportId: report.id },
        "report PDF generation failed",
      );
      return reply.code(503).send({
        code:
          error instanceof Error
            ? error.message.split(":")[0]
            : "REPORT_PDF_GENERATION_FAILED",
      });
    }
  };
  const enqueueReportPdf = async (report: ReportSnapshot) => {
    if (!jobQueue) return;
    try {
      await jobQueue.add(
        {
          name: "render-pdf",
          data: { tenantId: report.tenantId, reportId: report.id },
        },
        `render-pdf-${report.id}-${report.contentHash.slice(0, 12)}`,
      );
    } catch (error) {
      app.log.error(
        { err: error, reportId: report.id },
        "failed to enqueue report PDF",
      );
    }
  };
  const enqueueNotificationRetry = async (input: {
    tenantId: string;
    notificationId: string;
    openId: string;
    card: object;
  }) => {
    if (!jobQueue) return false;
    await repository.markNotificationQueued(
      input.tenantId,
      input.notificationId,
    );
    try {
      await jobQueue.add(
        { name: "send-notification", data: input },
        `notification-${input.notificationId}`,
      );
      return true;
    } catch (error) {
      await repository.completeNotificationAttempt(
        input.tenantId,
        input.notificationId,
        { errorCode: "NOTIFICATION_QUEUE_FAILED" },
      );
      app.log.error(
        { err: error, notificationId: input.notificationId },
        "failed to enqueue notification retry",
      );
      return false;
    }
  };
  app.addHook("onRequest", async (request, reply) => {
    const production = process.env.NODE_ENV === "production";
    const mutation = ["POST", "PUT", "PATCH", "DELETE"].includes(
      request.method,
    );
    if (
      production &&
      mutation &&
      request.url.startsWith("/api/") &&
      !request.url.startsWith("/api/auth/feishu/") &&
      !request.url.startsWith("/api/auth/email/")
    ) {
      const expectedOrigin = process.env.WEB_ORIGIN;
      const suppliedOrigin = request.headers.origin;
      if (!expectedOrigin || suppliedOrigin !== expectedOrigin)
        return reply.code(403).send({ code: "CROSS_SITE_REQUEST_BLOCKED" });
    }
    if (
      !request.url.startsWith("/api/") ||
      request.url.startsWith("/api/auth/feishu/") ||
      request.url.startsWith("/api/auth/email/")
    )
      return;
    const authMode = process.env.AUTH_MODE ??
      (process.env.NODE_ENV === "production" ? "feishu_oauth" : "development_mock");
    const sessionCookieSecure = process.env.NODE_ENV === "production";
    const sessionRaw = readCookie(
      request.headers.cookie,
      sessionCookieName(sessionCookieSecure),
    );
    if (authMode === "email_otp" || sessionRaw) {
      const emailContext = sessionRaw
        ? await repository.resolveAuthSession(hashSessionToken(sessionRaw))
        : null;
      if (emailContext) {
        (request as any).productAuth = emailContext;
        return;
      }
      if (authMode === "email_otp")
        return reply.code(401).send({ code: "AUTHENTICATION_REQUIRED" });
    }
    if (process.env.NODE_ENV !== "production") {
      const requestedRole = String(
        request.headers["x-development-role"] ?? developmentContext.role,
      ) as EnterpriseRole;
      (request as any).productAuth = {
        ...developmentContext,
        role: ["owner", "hr_admin", "manager", "employee"].includes(
          requestedRole,
        )
          ? requestedRole
          : developmentContext.role,
      };
      return;
    }
    const raw = readCookie(
      request.headers.cookie,
      sessionCookieName(production),
    );
    const context = raw
      ? await repository.resolveAuthSession(hashSessionToken(raw))
      : null;
    if (!context)
      return reply.code(401).send({ code: "AUTHENTICATION_REQUIRED" });
    (request as any).productAuth = context;
  });

  const requireAdmin = (
    request: FastifyRequest,
    reply: any,
  ): AuthContext | null => {
    const context = contextOf(request);
    if (!adminRoles.includes(context.role)) {
      reply.code(403).send({ code: "ADMIN_ROLE_REQUIRED" });
      return null;
    }
    return context;
  };
  const requireWorker = (request: FastifyRequest, reply: any) => {
    const configured = process.env.INTERNAL_WORKER_SECRET;
    const supplied = String(request.headers["x-worker-secret"] ?? "");
    if (!configured || configured.length < 32)
      return reply.code(503).send({ code: "INTERNAL_WORKER_NOT_CONFIGURED" });
    const expected = Buffer.from(configured);
    const actual = Buffer.from(supplied);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      return reply.code(401).send({ code: "INVALID_WORKER_CREDENTIAL" });
    return true;
  };
  const requirePublicParticipant = async (
    request: FastifyRequest,
    reply: any,
    campaign: CampaignRecord,
    participantId: string,
  ): Promise<boolean> => {
    const authMode = process.env.AUTH_MODE ??
      (process.env.NODE_ENV === "production"
        ? "feishu_oauth"
        : "development_mock");
    if (authMode === "development_mock") return true;
    const raw = readCookie(
      request.headers.cookie,
      sessionCookieName(process.env.NODE_ENV === "production"),
    );
    const context = raw
      ? await repository.resolveAuthSession(hashSessionToken(raw))
      : null;
    if (!context) {
      reply.code(401).send({ code: "AUTHENTICATION_REQUIRED" });
      return false;
    }
    if (context.tenantId !== campaign.tenantId) {
      reply.code(404).send({ code: "CAMPAIGN_NOT_AVAILABLE" });
      return false;
    }
    if (context.authentication === "email_otp") {
      const identityHash = await repository.emailIdentityHashForUser(
        context.tenantId,
        context.userId,
      );
      if (
        identityHash &&
        campaign.tenantId === "tenant-personal" &&
        PUBLIC_PERSONAL_ASSESSMENT_PROFILES.includes(
          campaign.assessmentProfileId as (typeof PUBLIC_PERSONAL_ASSESSMENT_PROFILES)[number],
        ) &&
        participantId === `personal:${identityHash}`
      )
        return true;
      const invitation = identityHash
        ? await repository.emailInvitationIdentity(
            campaign.tenantId,
            campaign.id,
            identityHash,
          )
        : null;
      if (!invitation || invitation.participantId !== participantId) {
        reply.code(403).send({ code: "INVITE_IDENTITY_MISMATCH" });
        return false;
      }
      return true;
    }
    const externalId = await repository.externalSubjectId(
      context.tenantId,
      context.userId,
    );
    if (!externalId || externalId !== participantId) {
      reply.code(403).send({ code: "INVITE_IDENTITY_MISMATCH" });
      return false;
    }
    return true;
  };

  app.get("/health", async () => ({
    ok: true,
    service: "ai-readiness-api",
    time: new Date().toISOString(),
  }));
  app.get("/internal/metrics", async (request, reply) => {
    if (!requireWorker(request, reply)) return;
    const memory = process.memoryUsage();
    const lines = [
      "# HELP ai_readiness_api_requests_total Total completed HTTP requests.",
      "# TYPE ai_readiness_api_requests_total counter",
      `ai_readiness_api_requests_total ${operationalMetrics.requests}`,
      "# HELP ai_readiness_api_errors_total Total HTTP 5xx responses.",
      "# TYPE ai_readiness_api_errors_total counter",
      `ai_readiness_api_errors_total ${operationalMetrics.errors}`,
      "# HELP ai_readiness_api_in_flight_requests Current in-flight HTTP requests.",
      "# TYPE ai_readiness_api_in_flight_requests gauge",
      `ai_readiness_api_in_flight_requests ${operationalMetrics.inFlight}`,
      "# HELP ai_readiness_api_request_duration_milliseconds_sum Accumulated request duration.",
      "# TYPE ai_readiness_api_request_duration_milliseconds_sum counter",
      `ai_readiness_api_request_duration_milliseconds_sum ${operationalMetrics.durationMilliseconds}`,
      "# HELP ai_readiness_api_process_uptime_seconds Process uptime.",
      "# TYPE ai_readiness_api_process_uptime_seconds gauge",
      `ai_readiness_api_process_uptime_seconds ${Math.max(0, (Date.now() - operationalMetrics.startedAt) / 1_000)}`,
      "# HELP ai_readiness_api_process_resident_memory_bytes Resident memory size.",
      "# TYPE ai_readiness_api_process_resident_memory_bytes gauge",
      `ai_readiness_api_process_resident_memory_bytes ${memory.rss}`,
      ...[2, 3, 4, 5].map(
        (statusClass) =>
          `ai_readiness_api_responses_total{status_class="${statusClass}xx"} ${operationalMetrics.byStatusClass.get(statusClass) ?? 0}`,
      ),
      "",
    ];
    return reply
      .header("content-type", "text/plain; version=0.0.4; charset=utf-8")
      .send(lines.join("\n"));
  });
  app.get("/ready", async (_request, reply) => {
    try {
      const result = await db.query<{ release_id: string }>(
        "SELECT release_id FROM schema_releases WHERE release_id=$1",
        [SCHEMA_RELEASE],
      );
      const schemaRelease = result.rows[0]?.release_id;
      if (schemaRelease !== SCHEMA_RELEASE)
        throw new Error(
          `SCHEMA_RELEASE_MISMATCH:${schemaRelease ?? "missing"}`,
        );
      return {
        ok: true,
        service: "ai-readiness-api",
        database: "ready",
        schemaRelease,
        time: new Date().toISOString(),
      };
    } catch (error) {
      app.log.error({ err: error }, "readiness check failed");
      return reply.code(503).send({
        ok: false,
        service: "ai-readiness-api",
        database: "unavailable",
      });
    }
  });
  app.post<{ Params: { id: string }; Body: { tenantId: string } }>(
    "/internal/reports/:id/render-pdf",
    async (request, reply) => {
      if (!requireWorker(request, reply)) return;
      const report = await repository.getReport(
        request.body?.tenantId,
        request.params.id,
      );
      if (!report) return reply.code(404).send({ code: "REPORT_NOT_FOUND" });
      const pdf = await pdfFor(report);
      return reply.code(201).send({
        reportId: report.id,
        contentHash: report.contentHash,
        byteSize: pdf.byteLength,
      });
    },
  );
  app.post<{ Body: { keys: string[] } }>(
    "/internal/artifacts/delete",
    async (request, reply) => {
      if (!requireWorker(request, reply)) return;
      const keys = [...new Set(request.body?.keys ?? [])];
      if (keys.some((key) => !key || key.includes("..")))
        return reply.code(400).send({ code: "INVALID_ARTIFACT_KEYS" });
      for (const key of keys) await artifactStore.delete(key);
      return { deleted: keys.length };
    },
  );
  app.post<{
    Body: {
      tenantId: string;
      notificationId: string;
      openId: string;
      card: object;
    };
  }>(
    "/internal/feishu/messages",
    async (request, reply) => {
      if (!requireWorker(request, reply)) return;
      if (!feishu)
        return reply.code(503).send({ code: "FEISHU_NOT_CONFIGURED" });
      if (
        !request.body?.tenantId ||
        !request.body?.notificationId ||
        !request.body?.openId?.startsWith("ou_") ||
        !request.body.card ||
        JSON.stringify(request.body.card).length > 30_000
      )
        return reply.code(400).send({ code: "INVALID_FEISHU_MESSAGE" });
      const notificationJob = await repository.notificationJob(
        request.body.tenantId,
        request.body.notificationId,
      );
      if (!notificationJob)
        return reply.code(404).send({ code: "NOTIFICATION_JOB_NOT_FOUND" });
      if (notificationJob.status === "sent")
        return reply.send({
          messageId: notificationJob.messageId,
          deduplicated: true,
        });
      try {
        const sent = await feishu.sendInteractiveCard(
          request.body.openId,
          request.body.card,
        );
        if (
          !(await repository.completeNotificationAttempt(
            request.body.tenantId,
            request.body.notificationId,
            { messageId: sent.messageId },
          ))
        )
          return reply.code(404).send({ code: "NOTIFICATION_JOB_NOT_FOUND" });
        return reply.code(201).send(sent);
      } catch (error) {
        const errorCode =
          error instanceof Error
            ? error.message.split(":")[0]
            : "FEISHU_MESSAGE_FAILED";
        await repository.completeNotificationAttempt(
          request.body.tenantId,
          request.body.notificationId,
          { errorCode },
        );
        return reply.code(502).send({ code: errorCode });
      }
    },
  );
  app.get("/api/auth/feishu/start", async (request, reply) => {
    if (!feishu) return reply.code(503).send({ code: "FEISHU_NOT_CONFIGURED" });
    const returnTo = String((request.query as any)?.returnTo ?? "/");
    const state = signOAuthState(returnTo, secret);
    const claims = verifyOAuthState(state, secret);
    const secure = process.env.NODE_ENV === "production";
    const stateHash = oauthStateHash(state);
    await repository.createOAuthLoginState(
      oauthNonceHash(claims.nonce),
      stateHash,
      new Date(claims.expiresAt),
    );
    reply.header("set-cookie", oauthStateCookie(stateHash, 600, secure));
    return reply.redirect(feishu.authorizationUrl(state));
  });
  app.post<{ Body: { email?: string } }>(
    "/api/auth/email/request",
    async (request, reply) => {
      let normalized: string;
      try {
        normalized = normalizeEmail(request.body?.email ?? "");
      } catch {
        return reply.code(400).send({ code: "INVALID_EMAIL" });
      }
      const identityHash = emailIdentityHash(normalized, secret);
      const sendGate = await repository.emailOtpSendAllowed(identityHash);
      if (!sendGate.allowed)
        return reply.code(429).send({
          code: "EMAIL_OTP_RATE_LIMITED",
          retryAfterSeconds: sendGate.retryAfterSeconds,
        });
      const code = createEmailOtpCode();
      const challengeId = await repository.createEmailOtpChallenge({
        identityHash,
        purpose: "login",
        codeHash: emailOtpHash(normalized, code, secret),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      });
      try {
        const sent = await email.sendOtp({ to: normalized, code, challengeId });
        await repository.recordEmailDelivery({ identityHash, type: "otp", status: "sent", providerMessageId: sent.providerMessageId });
      } catch (error) {
        await repository.recordEmailDelivery({ identityHash, type: "otp", status: "failed", errorCode: error instanceof Error ? error.message.slice(0, 80) : "EMAIL_SEND_FAILED" });
        return reply.code(502).send({ code: "EMAIL_SEND_FAILED" });
      }
      return reply.code(202).send({
        challengeId,
        expiresInSeconds: 600,
        retryAfterSeconds: 60,
        ...(process.env.NODE_ENV !== "production" &&
        (process.env.EMAIL_PROVIDER ?? "console") === "console"
          ? { developmentCode: code }
          : {}),
      });
    },
  );
  app.post<{ Body: { email?: string; challengeId?: string; code?: string; returnTo?: string; intent?: LoginIntent } }>(
    "/api/auth/email/verify",
    async (request, reply) => {
      let normalized: string;
      try {
        normalized = normalizeEmail(request.body?.email ?? "");
      } catch {
        return reply.code(400).send({ code: "INVALID_EMAIL" });
      }
      const challengeId = String(request.body?.challengeId ?? "");
      const code = String(request.body?.code ?? "");
      if (!/^[0-9]{6}$/.test(code) || !challengeId)
        return reply.code(400).send({ code: "INVALID_EMAIL_OTP" });
      const valid = await repository.consumeEmailOtpChallenge(
        challengeId,
        emailOtpHash(normalized, code, secret),
      );
      if (!valid) return reply.code(401).send({ code: "INVALID_EMAIL_OTP" });
      const identityHash = emailIdentityHash(normalized, secret);
      const invitedTenantId = await repository.emailInvitationTenant(identityHash);
      const safeReturnTo = String(request.body?.returnTo ?? "/");
      const returnTo = safeReturnTo.startsWith("/") && !safeReturnTo.startsWith("//") ? safeReturnTo : "/";
      const requestedIntent: LoginIntent = ["personal", "enterprise", "platform"].includes(
        String(request.body?.intent),
      )
        ? (request.body!.intent as LoginIntent)
        : returnTo.startsWith("/platform")
          ? "platform"
          : returnTo.startsWith("/enterprise") || returnTo.startsWith("/workspace") || returnTo.startsWith("/app/org/")
            ? "enterprise"
            : "personal";
      const bootstrapEmails = new Set(
        String(process.env.EMAIL_BOOTSTRAP_ADMIN_EMAILS ?? "")
          .split(/[,，;；\s]+/)
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean),
      );
      const bootstrapAdmin = bootstrapEmails.has(normalized);
      const encryptedEmail = encryptEmail(normalized, secret);
      const personalContext = await repository.upsertEmailIdentity({
        emailHash: identityHash,
        encryptedEmail,
        tenantId: "tenant-personal",
      });
      const accountId = personalContext.accountId!;
      const platformAdminEmails = new Set(
        String(process.env.PLATFORM_ADMIN_EMAILS ?? "")
          .split(/[,，;；\s]+/)
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean),
      );
      if (platformAdminEmails.has(normalized) || (process.env.NODE_ENV !== "production" && bootstrapAdmin))
        await repository.grantPlatformRole(accountId, "platform_admin");
      const invitationLogin = returnTo.startsWith("/survey/") && invitedTenantId;
      if (invitedTenantId)
        await repository.upsertEmailIdentity({
          emailHash: identityHash,
          encryptedEmail,
          tenantId: invitedTenantId,
        });
      const memberships = await repository.accountMemberships(accountId);
      const requestedOrganizationId = returnTo.match(/^\/app\/org\/([^/?#]+)/)?.[1];
      let context: AuthContext | null = personalContext;
      let nextPath = returnTo;
      if (invitationLogin) {
        context = await repository.contextForAccount(accountId, "organization", invitedTenantId!);
      } else if (requestedIntent === "platform") {
        context = await repository.contextForAccount(accountId, "platform");
        if (!context) return reply.code(403).send({ code: "PLATFORM_ROLE_REQUIRED" });
        nextPath = "/platform";
      } else if (requestedIntent === "enterprise") {
        const platformRoles = await repository.platformRolesForAccount(accountId);
        if (platformRoles.includes("platform_admin")) {
          context = await repository.contextForAccount(accountId, "platform");
          nextPath = "/platform";
        } else {
          const chosen =
            requestedOrganizationId &&
            memberships.some(
              (item) => item.organizationId === requestedOrganizationId,
            )
              ? requestedOrganizationId
              : memberships.length === 1
                ? memberships[0]!.organizationId
                : null;
          if (chosen) {
            context = await repository.contextForAccount(
              accountId,
              "organization",
              chosen,
            );
            nextPath = `/app/org/${chosen}`;
          } else {
            context = personalContext;
            nextPath = memberships.length > 1
              ? "/enterprise/organizations"
              : "/enterprise/no-access";
          }
        }
      } else {
        context = personalContext;
        nextPath = returnTo.startsWith("/personal/") || returnTo.startsWith("/app/personal")
          ? returnTo
          : "/app/personal";
      }
      if (!context) return reply.code(403).send({ code: "WORKSPACE_ACCESS_REQUIRED" });
      const rawToken = createSessionToken();
      const maxAge = 7 * 24 * 60 * 60;
      await repository.createAuthSession(context, hashSessionToken(rawToken), new Date(Date.now() + maxAge * 1000));
      const secure = process.env.NODE_ENV === "production";
      reply.header("set-cookie", sessionCookie(rawToken, maxAge, secure));
      return {
        authenticated: true,
        returnTo,
        nextPath,
        user: { id: context.userId, name: context.userName, role: context.role },
      };
    },
  );
  app.get("/api/auth/feishu/callback", async (request, reply) => {
    if (!feishu) return reply.code(503).send({ code: "FEISHU_NOT_CONFIGURED" });
    const secure = process.env.NODE_ENV === "production";
    try {
      const query = request.query as { code?: string; state?: string };
      if (!query.code || !query.state)
        throw new Error("OAUTH_CALLBACK_INCOMPLETE");
      const state = verifyOAuthState(query.state, secret);
      verifyOAuthBrowserBinding(
        query.state,
        readCookie(request.headers.cookie, oauthStateCookieName(secure)),
      );
      await repository.consumeOAuthLoginState(
        oauthNonceHash(state.nonce),
        oauthStateHash(query.state),
      );
      const { identity } = await feishu.exchangeCode(query.code);
      const bootstrapOwnerOpenIds = new Set(
        String(process.env.FEISHU_BOOTSTRAP_OWNER_OPEN_IDS ?? "")
          .split(/[,，;；\s]+/)
          .map((value) => value.trim())
          .filter(Boolean),
      );
      const context = await repository.upsertExternalIdentity(
        {
          tenantKey: identity.tenantKey,
          openId: identity.openId,
          name: identity.name,
        },
        {
          allowTenantBootstrap:
            process.env.NODE_ENV !== "production" ||
            bootstrapOwnerOpenIds.has(identity.openId),
        },
      );
      const rawToken = createSessionToken();
      const maxAge = 8 * 60 * 60;
      await repository.createAuthSession(
        context,
        hashSessionToken(rawToken),
        new Date(Date.now() + maxAge * 1_000),
      );
      reply.header(
        "set-cookie",
        [
          clearOAuthStateCookie(secure),
          sessionCookie(rawToken, maxAge, secure),
        ],
      );
      return reply.redirect(
        `${process.env.WEB_ORIGIN ?? "http://localhost:5173"}${state.returnTo}`,
      );
    } catch (error) {
      reply.header("set-cookie", clearOAuthStateCookie(secure));
      return reply.code(401).send({
        code:
          error instanceof Error
            ? error.message.split(":")[0]
            : "FEISHU_AUTH_FAILED",
      });
    }
  });
  app.post("/api/auth/logout", async (request, reply) => {
    const secure = process.env.NODE_ENV === "production";
    const raw = readCookie(
      request.headers.cookie,
      sessionCookieName(secure),
    );
    if (raw) await repository.revokeAuthSession(hashSessionToken(raw));
    reply.header(
      "set-cookie",
      sessionCookie("", 0, secure),
    );
    return reply.code(204).send();
  });
  app.get("/api/session", async (request) => {
    const context = contextOf(request);
    const emailIdentity =
      context.authentication === "email_otp"
        ? await repository.findEmailIdentity(
            (await repository.emailIdentityHashForUser(
              context.tenantId,
              context.userId,
            )) ?? "",
            context.tenantId,
          )
        : null;
    let email: string | null = null;
    if (emailIdentity?.encrypted_value) {
      try {
        email = decryptEmail(emailIdentity.encrypted_value, secret);
      } catch {
        email = null;
      }
    }
    const organizations = context.accountId
      ? await repository.accountMemberships(context.accountId)
      : [];
    const platformRoles = context.accountId
      ? await repository.platformRolesForAccount(context.accountId)
      : context.platformRoles ?? [];
    return {
      authenticated: true,
      account: {
        id: context.accountId ?? context.userId,
        displayName:
          context.userName === "邮箱账户" ? null : context.userName,
        email,
      },
      activeWorkspace: {
        kind:
          context.workspaceKind ??
          (context.tenantId === "tenant-personal" ? "personal" : "organization"),
        organizationId:
          context.tenantId === "tenant-personal" ? null : context.tenantId,
      },
      personal: { available: true },
      organizations,
      platformRoles,
      tenant: { id: context.tenantId, name: context.tenantName },
      user: {
        id: context.userId,
        name: context.userName,
        email,
        role: context.role,
      },
      authentication: context.authentication,
    };
  });
  app.post<{
    Body: { kind?: "personal" | "organization" | "platform"; organizationId?: string };
  }>("/api/session/context", async (request, reply) => {
    const current = contextOf(request);
    if (!current.accountId || current.authentication !== "email_otp")
      return reply.code(400).send({ code: "ACCOUNT_CONTEXT_SWITCH_UNAVAILABLE" });
    const kind = request.body?.kind;
    if (!kind || !["personal", "organization", "platform"].includes(kind))
      return reply.code(400).send({ code: "INVALID_WORKSPACE_KIND" });
    const next = await repository.contextForAccount(
      current.accountId,
      kind,
      request.body?.organizationId,
    );
    if (!next) return reply.code(403).send({ code: "WORKSPACE_ACCESS_REQUIRED" });
    const rawToken = createSessionToken();
    const maxAge = 7 * 24 * 60 * 60;
    await repository.createAuthSession(
      next,
      hashSessionToken(rawToken),
      new Date(Date.now() + maxAge * 1_000),
    );
    const currentRaw = readCookie(
      request.headers.cookie,
      sessionCookieName(process.env.NODE_ENV === "production"),
    );
    if (currentRaw) await repository.revokeAuthSession(hashSessionToken(currentRaw));
    reply.header(
      "set-cookie",
      sessionCookie(rawToken, maxAge, process.env.NODE_ENV === "production"),
    );
    return {
      activeWorkspace: {
        kind,
        organizationId: kind === "organization" ? next.tenantId : null,
      },
    };
  });
  const requirePlatformAdmin = (
    request: FastifyRequest,
    reply: any,
  ): AuthContext | null => {
    const context = contextOf(request);
    if (!context.platformRoles?.includes("platform_admin")) {
      reply.code(403).send({ code: "PLATFORM_ROLE_REQUIRED" });
      return null;
    }
    return context;
  };
  app.post<{
    Body: { organizationName?: string };
  }>("/api/platform/organizations", async (request, reply) => {
    const context = requirePlatformAdmin(request, reply);
    if (!context) return;
    if (!context.accountId || context.authentication !== "email_otp")
      return reply.code(400).send({ code: "EMAIL_AUTH_REQUIRED" });
    const organizationName = String(request.body?.organizationName ?? "").trim();
    if (!organizationName || organizationName.length > 120)
      return reply.code(400).send({ code: "INVALID_ORGANIZATION_NAME" });
    try {
      const workspace = await repository.createPlatformManagedOrganization({
        accountId: context.accountId,
        displayName:
          context.userName && context.userName !== "邮箱账户"
            ? context.userName
            : "企业管理员",
        organizationName,
      });
      return reply.code(201).send({
        organizationId: workspace.tenantId,
        organizationName,
        userId: workspace.userId,
        role: workspace.role,
        status: "active",
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "ORGANIZATION_NAME_ALREADY_EXISTS"
      )
        return reply.code(409).send({ code: error.message });
      throw error;
    }
  });
  app.get("/api/enterprise-applications/mine", async (request, reply) => {
    const context = contextOf(request);
    return context.accountId
      ? repository.enterpriseApplicationsForAccount(context.accountId)
      : reply.code(400).send({ code: "EMAIL_AUTH_REQUIRED" });
  });
  app.post<{
    Body: {
      applicantName?: string;
      applicantRole?: string;
      organizationName?: string;
      website?: string;
      expectedHeadcountBand?: string;
      useCase?: string;
    };
  }>("/api/enterprise-applications", async (request, reply) => {
    const context = contextOf(request);
    if (!context.accountId || context.authentication !== "email_otp")
      return reply.code(400).send({ code: "EMAIL_AUTH_REQUIRED" });
    const applicantName = String(request.body?.applicantName ?? "").trim();
    const applicantRole = String(request.body?.applicantRole ?? "").trim();
    const organizationName = String(request.body?.organizationName ?? "").trim();
    const website = String(request.body?.website ?? "").trim();
    const expectedHeadcountBand = String(request.body?.expectedHeadcountBand ?? "").trim();
    const useCase = String(request.body?.useCase ?? "").trim();
    if (
      !applicantName || applicantName.length > 80 ||
      !applicantRole || applicantRole.length > 80 ||
      !organizationName || organizationName.length > 120 ||
      website.length > 200 ||
      !["under_50", "50_199", "200_499", "500_999", "1000_4999", "5000_plus", "unknown"].includes(expectedHeadcountBand) ||
      !useCase || useCase.length > 500
    ) return reply.code(400).send({ code: "INVALID_ENTERPRISE_APPLICATION" });
    const application = await repository.createEnterpriseApplication({
      accountId: context.accountId,
      applicantName,
      applicantRole,
      organizationName,
      website,
      expectedHeadcountBand,
      useCase,
    });
    return reply.code(201).send(application);
  });
  app.get<{ Querystring: { status?: EnterpriseApplicationStatus } }>(
    "/api/platform/enterprise-applications",
    async (request, reply) => {
      if (!requirePlatformAdmin(request, reply)) return;
      const status = request.query?.status;
      if (status && !["pending", "approved", "rejected", "suspended"].includes(status))
        return reply.code(400).send({ code: "INVALID_APPLICATION_STATUS" });
      return repository.listEnterpriseApplications(status);
    },
  );
  app.patch<{
    Params: { id: string };
    Body: { status?: "approved" | "rejected" };
  }>("/api/platform/enterprise-applications/:id", async (request, reply) => {
    const context = requirePlatformAdmin(request, reply);
    if (!context?.accountId) return;
    if (!request.body?.status || !["approved", "rejected"].includes(request.body.status))
      return reply.code(400).send({ code: "INVALID_APPLICATION_REVIEW" });
    const reviewed = await repository.reviewEnterpriseApplication({
      id: request.params.id,
      status: request.body.status,
      reviewerAccountId: context.accountId,
    });
    return reviewed ?? reply.code(404).send({ code: "ENTERPRISE_APPLICATION_NOT_FOUND" });
  });
  app.patch<{
    Body: { displayName?: string };
  }>("/api/account/profile", async (request, reply) => {
    const context = contextOf(request);
    const displayName = String(request.body?.displayName ?? "").trim();
    if (!displayName || displayName.length > 80)
      return reply.code(400).send({ code: "INVALID_DISPLAY_NAME" });
    if (context.accountId)
      await repository.updateAccountDisplayName(context.accountId, displayName);
    else
      await repository.updateUserDisplayName(
        context.tenantId,
        context.userId,
        displayName,
      );
    return { displayName };
  });
  app.post<{ Body: { name?: string } }>(
    "/api/organization/workspace",
    async (_request, reply) => {
      return reply.code(403).send({ code: "ENTERPRISE_APPROVAL_REQUIRED" });
    },
  );
  app.patch<{
    Body: { name?: string };
  }>("/api/tenant/profile", async (request, reply) => {
    const context = requireAdmin(request, reply);
    if (!context) return;
    const name = String(request.body?.name ?? "").trim();
    if (!name || name.length > 120)
      return reply.code(400).send({ code: "INVALID_TENANT_NAME" });
    await repository.renameTenant(context.tenantId, name, context.userId);
    return { name };
  });
  app.get("/api/personal/research-profile", async (request) => {
    const context = contextOf(request);
    return repository.getPersonalResearchProfile(
      context.tenantId,
      context.userId,
    );
  });
  app.put<{ Body: PersonalResearchProfileInput }>(
    "/api/personal/research-profile",
    async (request, reply) => {
      const context = contextOf(request);
      const input = request.body;
      const city = String(input?.workCity ?? "").trim();
      const province = String(input?.province ?? "").trim();
      const industryCode = String(input?.industryCode ?? "").trim();
      const allowedSize = new Set([
        "<50", "50—199", "200—499", "500—999", "1000—4999", "≥5000",
        "unknown", "prefer_not_to_say",
      ]);
      const allowedJob = new Set([
        "management_strategy", "product_project", "engineering_data_research",
        "design_content_creative", "marketing_brand_growth",
        "sales_business_customer_success",
        "operations_supply_production_delivery", "finance_legal_risk_audit",
        "people_admin_procurement_support", "frontline_other", "unknown",
        "prefer_not_to_say",
      ]);
      const allowedCareer = new Set([
        "junior_ic", "experienced_ic", "senior_expert", "frontline_manager",
        "middle_manager", "senior_manager", "other_unknown",
        "prefer_not_to_say",
      ]);
      const allowedTenure = new Set([
        "under_1y", "1_to_2y", "3_to_5y", "6_to_10y", "over_10y",
        "unknown", "prefer_not_to_say",
      ]);
      if (
        !city || city.length > 80 || !province || province.length > 40 ||
        !industryCode || industryCode.length > 40 ||
        !allowedSize.has(input.companySizeBand) ||
        !allowedJob.has(input.jobFamily) ||
        !allowedCareer.has(input.careerStage) ||
        !allowedTenure.has(input.tenureBand) ||
        ![true, false, null].includes(input.peopleManager) ||
        input.noticeVersion !== PERSONAL_RESEARCH_NOTICE_VERSION ||
        (input.researchConsent && !input.consentedAt)
      ) return reply.code(400).send({ code: "INVALID_PERSONAL_RESEARCH_PROFILE" });
      return repository.savePersonalResearchProfile(
        context.tenantId,
        context.userId,
        input,
      );
    },
  );
  app.get("/api/personal/open-campaign", async (_request, reply) => {
    const campaigns = await Promise.all(
      PUBLIC_PERSONAL_ASSESSMENT_PROFILES.map((assessmentProfileId) =>
        repository.latestOpenPersonalCampaign(
          "tenant-personal",
          assessmentProfileId,
        ),
      ),
    );
    return campaigns.every(Boolean)
      ? campaigns
      : reply.code(404).send({ code: "PERSONAL_CAMPAIGN_NOT_AVAILABLE" });
  });
  app.post<{ Body: { assessmentProfileId?: AssessmentProfileId } }>(
    "/api/personal/open-entry",
    async (request, reply) => {
    const context = contextOf(request);
    if (context.authentication !== "email_otp")
      return reply.code(400).send({ code: "EMAIL_AUTH_REQUIRED" });
    const assessmentProfileId = request.body?.assessmentProfileId;
    if (
      !assessmentProfileId ||
      !PUBLIC_PERSONAL_ASSESSMENT_PROFILES.includes(
        assessmentProfileId as (typeof PUBLIC_PERSONAL_ASSESSMENT_PROFILES)[number],
      )
    )
      return reply.code(400).send({ code: "INVALID_PERSONAL_ASSESSMENT_PROFILE" });
    const campaign = await repository.latestOpenPersonalCampaign(
      "tenant-personal",
      assessmentProfileId,
    );
    if (!campaign) return reply.code(404).send({ code: "PERSONAL_CAMPAIGN_NOT_AVAILABLE" });
    const identityHash = await repository.emailIdentityHashForUser(context.tenantId, context.userId);
    if (!identityHash) return reply.code(409).send({ code: "EMAIL_IDENTITY_NOT_FOUND" });
    if (context.tenantId !== campaign.tenantId) {
      const existing = await repository.findEmailIdentity(identityHash, context.tenantId);
      if (!existing) return reply.code(409).send({ code: "EMAIL_IDENTITY_NOT_FOUND" });
      const linked = await repository.upsertEmailIdentity({
        emailHash: identityHash,
        encryptedEmail: existing.encrypted_value,
        displayName: context.userName,
        tenantId: campaign.tenantId,
      });
      const rawToken = createSessionToken();
      const maxAge = 7 * 24 * 60 * 60;
      await repository.createAuthSession(
        linked,
        hashSessionToken(rawToken),
        new Date(Date.now() + maxAge * 1_000),
      );
      reply.header(
        "set-cookie",
        sessionCookie(rawToken, maxAge, process.env.NODE_ENV === "production"),
      );
    }
    const participantId = `personal:${identityHash}`;
    const token = signInvite({ campaignId: campaign.id, participantId, expiresAt: campaignInviteExpiry(campaign) });
    return { campaign, participantId, url: `${process.env.WEB_ORIGIN ?? "http://localhost:5173"}/survey/${campaign.id}#token=${encodeURIComponent(token)}` };
    },
  );
  const subjectHashesForTenant = async (
    context: AuthContext,
    tenantId: string,
    identityHash?: string | null,
  ) => {
    const campaigns = await repository.listCampaigns(tenantId);
    if (context.authentication === "email_otp") {
      const resolvedIdentityHash =
        identityHash ??
        (await repository.emailIdentityHashForUser(
          context.tenantId,
          context.userId,
        ));
      if (!resolvedIdentityHash) return [];
      return campaigns.flatMap((campaign) => [
        subjectHash(campaign.id, `email:${resolvedIdentityHash.slice(0, 32)}`),
        subjectHash(campaign.id, `personal:${resolvedIdentityHash}`),
      ]);
    }
    if (tenantId !== context.tenantId) return [];
    const externalId = await repository.externalSubjectId(
      context.tenantId,
      context.userId,
    );
    if (!externalId) return [];
    return campaigns.map((campaign) => subjectHash(campaign.id, externalId));
  };
  const personalReportScopes = async (context: AuthContext) => {
    if (context.authentication !== "email_otp" || !context.accountId) {
      return [{
        tenantId: context.tenantId,
        tenantName: context.tenantName,
        hashes: await subjectHashesForTenant(context, context.tenantId),
      }];
    }
    const identityHash = await repository.emailIdentityHashForAccount(
      context.accountId,
    );
    if (!identityHash) return [];
    const memberships = await repository.accountMemberships(context.accountId);
    const tenants = [
      { tenantId: "tenant-personal", tenantName: "个人公开测评" },
      ...memberships.map((membership) => ({
        tenantId: membership.organizationId,
        tenantName: membership.organizationName,
      })),
    ];
    return Promise.all(
      tenants.map(async (tenant) => ({
        ...tenant,
        hashes: await subjectHashesForTenant(
          context,
          tenant.tenantId,
          identityHash,
        ),
      })),
    );
  };
  app.get("/api/my-reports", async (request) => {
    const context = contextOf(request);
    const scopes = await personalReportScopes(context);
    const groups = await Promise.all(
      scopes.map(async (scope) =>
        (await repository.listPersonalReportsBySubjectHashes(
          scope.tenantId,
          scope.hashes,
        )).map((item) => ({
          ...item,
          workspaceKind:
            scope.tenantId === "tenant-personal" ? "personal" : "organization",
          organizationId:
            scope.tenantId === "tenant-personal" ? null : scope.tenantId,
          organizationName: scope.tenantName,
        })),
      ),
    );
    return groups
      .flat()
      .sort(
        (left, right) =>
          new Date(right.report.createdAt).getTime() -
          new Date(left.report.createdAt).getTime(),
      );
  });
  app.get<{ Params: { id: string } }>(
    "/api/my-reports/:id",
    async (request, reply) => {
      const context = contextOf(request);
      let report: ReportSnapshot | null = null;
      for (const scope of await personalReportScopes(context)) {
        report = await repository.getPersonalReportBySubjectHashes(
          scope.tenantId,
          request.params.id,
          scope.hashes,
        );
        if (report) break;
      }
      return (
        report ?? reply.code(404).send({ code: "PERSONAL_REPORT_NOT_FOUND" })
      );
    },
  );
  app.put<{ Params: { id: string }; Body: CreateCampaignInput }>(
    "/api/campaigns/:id",
    async (request, reply) => {
      const context = requireAdmin(request, reply);
      if (!context) return;
      const current = await repository.getCampaign(
        context.tenantId,
        request.params.id,
      );
      if (!current)
        return reply.code(404).send({ code: "CAMPAIGN_NOT_FOUND" });
      if (current.status !== "draft")
        return reply.code(409).send({ code: "CAMPAIGN_NOT_EDITABLE" });
      const input = request.body;
      const startsAt = new Date(input?.startsAt);
      const closesAt = new Date(input?.closesAt);
      const organizationMethod = input?.organizationMethod ?? "workforce_survey";
      const designatedAssessorExternalId =
        input?.designatedAssessorExternalId?.trim() || null;
      const backgroundItemIds = [...new Set(input?.backgroundItemIds ?? [])];
      const customItems = normalizeCustomItems(input?.customItems, input?.mode);
      if (
        !input?.name?.trim() ||
        !["personal", "organization", "combined"].includes(input.target) ||
        !["anonymous", "identified"].includes(input.mode) ||
        !Number.isFinite(startsAt.getTime()) ||
        !Number.isFinite(closesAt.getTime()) ||
        closesAt <= startsAt
      )
        return reply.code(400).send({ code: "INVALID_CAMPAIGN_INPUT" });
      if (!customItems)
        return reply.code(400).send({ code: "INVALID_CUSTOM_ITEMS" });
      if (
        !["workforce_survey", "single_manager_self_assessment"].includes(
          organizationMethod,
        ) ||
        (input.target === "personal" && organizationMethod !== "workforce_survey") ||
        (organizationMethod === "single_manager_self_assessment" &&
          (input.target !== "organization" ||
            input.mode !== "identified" ||
            !designatedAssessorExternalId))
      )
        return reply.code(400).send({ code: "INVALID_ORGANIZATION_METHOD" });
      if (
        backgroundItemIds.some((id) => !["BG01", "BG02", "BG03"].includes(id)) ||
        (input.invitedCount != null &&
          (!Number.isInteger(input.invitedCount) || input.invitedCount < 0))
      )
        return reply.code(400).send({ code: "INVALID_CAMPAIGN_CONFIGURATION" });
      if (input.baselineCampaignId) {
        const baseline = await repository.getCampaign(
          context.tenantId,
          input.baselineCampaignId,
        );
        if (
          !baseline ||
          !["closed", "archived"].includes(baseline.status) ||
          input.target === "personal" ||
          baseline.target !== input.target ||
          baseline.organizationMethod !== organizationMethod ||
          !versionsMatch(baseline.versions, VERSION_TUPLE) ||
          (organizationMethod === "single_manager_self_assessment" &&
            baseline.designatedAssessorExternalId !== designatedAssessorExternalId)
        )
          return reply.code(400).send({ code: "INVALID_BASELINE_CAMPAIGN" });
        if (
          !(await repository.latestOrganizationReportForCampaign(
            context.tenantId,
            baseline.id,
          ))
        )
          return reply.code(400).send({ code: "BASELINE_REPORT_NOT_FOUND" });
      }
      try {
        return await repository.updateDraftCampaign(
          context.tenantId,
          current.id,
          {
            ...input,
            name: input.name.trim(),
            customItems,
            organizationMethod,
            backgroundItemIds,
            invitedCount:
              organizationMethod === "single_manager_self_assessment"
                ? 1
                : input.invitedCount,
            designatedAssessorExternalId:
              organizationMethod === "single_manager_self_assessment"
                ? designatedAssessorExternalId
                : null,
          },
          context.userId,
        );
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("CAMPAIGN_NOT_EDITABLE"))
          return reply.code(409).send({ code: "CAMPAIGN_NOT_EDITABLE" });
        throw error;
      }
    },
  );
  app.delete<{ Params: { id: string } }>(
    "/api/campaigns/:id",
    async (request, reply) => {
      const context = requireAdmin(request, reply);
      if (!context) return;
      try {
        const deleted = await repository.deleteDraftCampaign(
          context.tenantId,
          request.params.id,
          context.userId,
        );
        if (!deleted)
          return reply.code(404).send({ code: "CAMPAIGN_NOT_FOUND" });
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("CAMPAIGN_NOT_DELETABLE"))
          return reply.code(409).send({ code: "CAMPAIGN_NOT_DELETABLE" });
        throw error;
      }
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/my-reports/:id/pdf",
    async (request, reply) => {
      const context = contextOf(request);
      let report: ReportSnapshot | null = null;
      for (const scope of await personalReportScopes(context)) {
        report = await repository.getPersonalReportBySubjectHashes(
          scope.tenantId,
          request.params.id,
          scope.hashes,
        );
        if (report) break;
      }
      return report
        ? sendPdf(reply, report, {
            actorId: context.userId,
            channel: "employee_workspace",
            role: context.role,
          })
        : reply.code(404).send({ code: "PERSONAL_REPORT_NOT_FOUND" });
    },
  );
  app.get("/api/users", async (request, reply) => {
    const context = requireAdmin(request, reply);
    if (!context) return;
    const users = await repository.listTenantUsers(context.tenantId);
    return Promise.all(
      users.map(async (user) => {
        const encrypted = await repository.encryptedEmailForUser(
          context.tenantId,
          user.id,
        );
        let emailMasked: string | null = null;
        if (encrypted) {
          try {
            const email = decryptEmail(encrypted, secret);
            const [local, domain] = email.split("@");
            emailMasked = `${(local ?? "").slice(0, 2)}***@${domain ?? ""}`;
          } catch {
            emailMasked = null;
          }
        }
        return { ...user, emailMasked };
      }),
    );
  });
  app.patch<{ Params: { id: string }; Body: { role: EnterpriseRole } }>(
    "/api/users/:id/role",
    async (request, reply) => {
      const context = contextOf(request);
      if (context.role !== "owner")
        return reply.code(403).send({ code: "OWNER_ROLE_REQUIRED" });
      if (
        !["owner", "hr_admin", "manager", "employee"].includes(
          request.body?.role,
        )
      )
        return reply.code(400).send({ code: "INVALID_ENTERPRISE_ROLE" });
      try {
        const user = await repository.updateTenantUserRole(
          context.tenantId,
          request.params.id,
          request.body.role,
          context.userId,
        );
        return user ?? reply.code(404).send({ code: "USER_NOT_FOUND" });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "LAST_OWNER_CANNOT_BE_DEMOTED"
        )
          return reply.code(409).send({ code: error.message });
        throw error;
      }
    },
  );
  app.get("/api/research/profile", async (request, reply) => {
    const context = requireAdmin(request, reply);
    return context
      ? ((await repository.getOrganizationResearchProfile(context.tenantId)) ??
          reply.code(404).send({ code: "RESEARCH_PROFILE_NOT_CONFIGURED" }))
      : undefined;
  });
  app.put<{
    Body: Omit<
      OrganizationResearchProfile,
      "tenantId" | "headcountBand" | "updatedAt"
    >;
  }>("/api/research/profile", async (request, reply) => {
    const context = requireAdmin(request, reply);
    if (!context) return;
    const body = request.body;
    if (
      body?.country !== "CN" ||
      !body.headquartersProvince?.trim() ||
      !body.industryRaw?.trim() ||
      !body.industryStandardCode?.trim() ||
      body.industryMappingVersion !== "GB/T 4754—2017" ||
      !Number.isInteger(body.headcount) ||
      body.headcount < 1 ||
      ![
        "not_started",
        "local_exploration",
        "multi_team",
        "company_wide",
        "core_workflows",
      ].includes(body.aiStage) ||
      !["not_started", "under_6m", "6m_to_1y", "1_to_2y", "over_2y"].includes(
        body.aiStartDuration,
      ) ||
      !body.questionnaireLanguage?.trim() ||
      !body.primaryWorkLanguage?.trim()
    )
      return reply.code(400).send({ code: "INVALID_RESEARCH_PROFILE" });
    return repository.saveOrganizationResearchProfile(
      context.tenantId,
      {
        ...body,
        headquartersProvince: body.headquartersProvince.trim(),
        industryRaw: body.industryRaw.trim(),
        industryStandardCode: body.industryStandardCode.trim(),
        questionnaireLanguage: body.questionnaireLanguage.trim(),
        primaryWorkLanguage: body.primaryWorkLanguage.trim(),
      },
      context.userId,
    );
  });
  app.get("/api/research/norm-authorization", async (request, reply) => {
    const context = requireAdmin(request, reply);
    return context
      ? ((await repository.getNormAuthorization(context.tenantId)) ??
          reply.code(404).send({ code: "NORM_AUTHORIZATION_NOT_CONFIGURED" }))
      : undefined;
  });
  app.put<{ Body: { mappings: PersonContextMappingInput[] } }>(
    "/api/research/person-context-mappings",
    async (request, reply) => {
      const context = requireAdmin(request, reply);
      if (!context) return;
      const mappings = request.body?.mappings;
      const jobFamilies = new Set([
        "management_strategy",
        "product_project",
        "engineering_data_research",
        "design_content_creative",
        "marketing_brand_growth",
        "sales_business_customer_success",
        "operations_supply_production_delivery",
        "finance_legal_risk_audit",
        "people_admin_procurement_support",
        "frontline_other",
        "unknown",
      ]);
      const careerStages = new Set([
        "junior_ic",
        "experienced_ic",
        "senior_expert",
        "frontline_manager",
        "middle_manager",
        "senior_manager",
        "other_unknown",
      ]);
      const tenureBands = new Set([
        "under_1y",
        "1_to_2y",
        "3_to_5y",
        "6_to_10y",
        "over_10y",
        "unknown",
      ]);
      if (
        !Array.isArray(mappings) ||
        !mappings.length ||
        mappings.length > 5_000 ||
        mappings.some(
          (mapping) =>
            !mapping.externalSubjectId?.trim() ||
            mapping.externalSubjectId.length > 256 ||
            !["feishu", "hris", "admin_upload"].includes(mapping.source) ||
            !jobFamilies.has(mapping.jobFamily) ||
            !careerStages.has(mapping.careerStage) ||
            !tenureBands.has(mapping.tenureBand) ||
            !mapping.province?.trim() ||
            !mapping.employmentType?.trim() ||
            ![true, false, null].includes(mapping.peopleManager),
        )
      )
        return reply
          .code(400)
          .send({ code: "INVALID_PERSON_CONTEXT_MAPPINGS" });
      return repository.savePersonContextMappings(
        context.tenantId,
        mappings,
        context.userId,
      );
    },
  );
  app.get("/api/research/person-context-preview", async (request, reply) => {
    const context = requireAdmin(request, reply);
    return context
      ? repository.protectedPersonContextCohorts(context.tenantId)
      : undefined;
  });
  app.put<{
    Body: { status: "authorized" | "revoked"; noticeVersion?: string };
  }>("/api/research/norm-authorization", async (request, reply) => {
    const context = contextOf(request);
    if (context.role !== "owner")
      return reply.code(403).send({ code: "OWNER_ROLE_REQUIRED" });
    if (!["authorized", "revoked"].includes(request.body?.status))
      return reply.code(400).send({ code: "INVALID_NORM_AUTHORIZATION" });
    return repository.setNormAuthorization(
      context.tenantId,
      request.body.status,
      request.body.noticeVersion?.trim() || "norm_notice_v0.1",
      context.userId,
    );
  });
  app.get("/api/integrations/feishu/status", async () => {
    const required = [
      "FEISHU_APP_ID",
      "FEISHU_APP_SECRET",
      "FEISHU_REDIRECT_URI",
      "FEISHU_BOOTSTRAP_OWNER_OPEN_IDS",
    ] as const;
    const missing = required.filter((key) => !process.env[key]);
    return {
      configured: missing.length === 0,
      verified: false,
      mode: missing.length
        ? "not_configured"
        : "credentials_present_not_verified",
      missing,
      capabilities: {
        oauth: "implemented",
        directorySync: "recursive_implemented",
        messageCard: "implemented",
        reminders: "implemented",
        reportNotification: "implemented_on_grant",
      },
    };
  });
  app.get("/api/directory", async (request, reply) => {
    const context = requireAdmin(request, reply);
    return context
      ? repository.enterpriseDirectory(context.tenantId)
      : undefined;
  });
  app.post<{ Body: { departmentId?: string } }>(
    "/api/integrations/feishu/sync",
    async (request, reply) => {
      const context = requireAdmin(request, reply);
      if (!context) return;
      if (!feishu)
        return reply.code(503).send({ code: "FEISHU_NOT_CONFIGURED" });
      const departmentId = request.body?.departmentId?.trim() || "0";
      try {
        const directory = await feishu.listDirectoryTree(departmentId);
        return repository.saveDirectorySync(
          context.tenantId,
          departmentId,
          directory.users,
          directory.departments,
        );
      } catch (error) {
        return reply.code(502).send({
          code:
            error instanceof Error
              ? error.message.split(":")[0]
              : "FEISHU_DIRECTORY_SYNC_FAILED",
        });
      }
    },
  );
  app.post<{ Body: { openId: string; card: object } }>(
    "/api/integrations/feishu/messages",
    async (request, reply) => {
      const context = requireAdmin(request, reply);
      if (!context) return;
      if (!feishu)
        return reply.code(503).send({ code: "FEISHU_NOT_CONFIGURED" });
      if (
        !request.body?.openId?.startsWith("ou_") ||
        !request.body.card ||
        JSON.stringify(request.body.card).length > 30_000
      )
        return reply.code(400).send({ code: "INVALID_FEISHU_MESSAGE" });
      try {
        return reply
          .code(201)
          .send(
            await feishu.sendInteractiveCard(
              request.body.openId,
              request.body.card,
            ),
          );
      } catch (error) {
        return reply.code(502).send({
          code:
            error instanceof Error
              ? error.message.split(":")[0]
              : "FEISHU_MESSAGE_FAILED",
        });
      }
    },
  );

  app.get("/api/campaigns", async (request, reply) => {
    const context = requireAdmin(request, reply);
    return context ? repository.listCampaigns(context.tenantId) : undefined;
  });
  app.post<{ Body: CreateCampaignInput }>(
    "/api/campaigns",
    async (request, reply) => {
      const context = requireAdmin(request, reply);
      if (!context) return;
      const input = request.body;
      if (
        !input?.name?.trim() ||
        !["personal", "organization", "combined"].includes(input.target) ||
        !["anonymous", "identified"].includes(input.mode)
      )
        return reply.code(400).send({ code: "INVALID_CAMPAIGN_INPUT" });
      const startsAt = new Date(input.startsAt);
      const closesAt = new Date(input.closesAt);
      const organizationMethod = input.organizationMethod ?? "workforce_survey";
      const designatedAssessorExternalId =
        input.designatedAssessorExternalId?.trim() || null;
      const backgroundItemIds = [...new Set(input.backgroundItemIds ?? [])];
      const customItems = normalizeCustomItems(input.customItems, input.mode);
      if (
        !Number.isFinite(startsAt.getTime()) ||
        !Number.isFinite(closesAt.getTime()) ||
        closesAt <= startsAt
      )
        return reply.code(400).send({ code: "INVALID_CAMPAIGN_WINDOW" });
      if (!customItems)
        return reply.code(400).send({ code: "INVALID_CUSTOM_ITEMS" });
      if (
        !["workforce_survey", "single_manager_self_assessment"].includes(
          organizationMethod,
        ) ||
        (input.target === "personal" &&
          organizationMethod !== "workforce_survey") ||
        (organizationMethod === "single_manager_self_assessment" &&
          (input.target !== "organization" ||
            input.mode !== "identified" ||
            !designatedAssessorExternalId))
      )
        return reply.code(400).send({ code: "INVALID_ORGANIZATION_METHOD" });
      if (
        backgroundItemIds.some(
          (id) => !["BG01", "BG02", "BG03"].includes(id),
        ) ||
        (input.invitedCount != null &&
          (!Number.isInteger(input.invitedCount) || input.invitedCount < 0))
      )
        return reply.code(400).send({ code: "INVALID_CAMPAIGN_CONFIGURATION" });
      if (input.baselineCampaignId) {
        const baseline = await repository.getCampaign(
          context.tenantId,
          input.baselineCampaignId,
        );
        if (
          !baseline ||
          !["closed", "archived"].includes(baseline.status) ||
          input.target === "personal" ||
          baseline.target !== input.target ||
          baseline.organizationMethod !== organizationMethod ||
          !versionsMatch(baseline.versions, VERSION_TUPLE) ||
          (organizationMethod === "single_manager_self_assessment" &&
            baseline.designatedAssessorExternalId !==
              designatedAssessorExternalId)
        )
          return reply.code(400).send({ code: "INVALID_BASELINE_CAMPAIGN" });
        const baselineReport =
          await repository.latestOrganizationReportForCampaign(
            context.tenantId,
            baseline.id,
          );
        if (!baselineReport)
          return reply.code(400).send({ code: "BASELINE_REPORT_NOT_FOUND" });
      }
      return reply.code(201).send(
        await repository.createCampaign(
          context.tenantId,
          {
            ...input,
            organizationMethod,
            backgroundItemIds,
            customItems,
            name: input.name.trim(),
            invitedCount:
              organizationMethod === "single_manager_self_assessment"
                ? 1
                : input.invitedCount,
            designatedAssessorExternalId:
              organizationMethod === "single_manager_self_assessment"
                ? designatedAssessorExternalId
                : null,
          },
          context.userId,
        ),
      );
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/campaigns/:id",
    async (request, reply) => {
      const context = requireAdmin(request, reply);
      if (!context) return;
      const campaign = await repository.getCampaign(
        context.tenantId,
        request.params.id,
      );
      return campaign ?? reply.code(404).send({ code: "CAMPAIGN_NOT_FOUND" });
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/campaigns/:id/custom-results",
    async (request, reply) => {
      const context = requireAdmin(request, reply);
      if (!context) return;
      const campaign = await repository.getCampaign(
        context.tenantId,
        request.params.id,
      );
      if (!campaign)
        return reply.code(404).send({ code: "CAMPAIGN_NOT_FOUND" });
      if (campaign.mode === "anonymous" && campaign.status !== "closed" && campaign.status !== "archived")
        return reply.code(409).send({
          code: "ANONYMOUS_CUSTOM_RESULTS_AVAILABLE_AFTER_CLOSE",
        });
      const rows = await repository.customAnswerRows(
        context.tenantId,
        campaign.id,
      );
      const anonymousSuppressed = campaign.mode === "anonymous" && rows.length < 5;
      const items = campaign.customItems.map((item) => {
        const answered = rows.filter((row) => {
          const value = row.customAnswers[item.id];
          return Array.isArray(value)
            ? value.length > 0
            : typeof value === "string" && value.trim().length > 0;
        });
        if (anonymousSuppressed)
          return {
            ...item,
            responseCount: null,
            optionCounts: null,
            textResponses: null,
            status: "suppressed" as const,
          };
        if (item.type === "short_text")
          return {
            ...item,
            responseCount: answered.length,
            optionCounts: null,
            textResponses: answered.map((row) => ({
              responseId: row.responseId,
              participantRef: row.participantRef,
              participantName:
                row.participantName ?? row.participantRef ?? "未知参与者",
              text: String(row.customAnswers[item.id]),
              submittedAt: row.submittedAt,
            })),
            status: "available" as const,
          };
        return {
          ...item,
          responseCount: answered.length,
          optionCounts: item.options.map((option) => ({
            ...option,
            count: answered.filter((row) => {
              const value = row.customAnswers[item.id];
              return Array.isArray(value)
                ? value.includes(option.value)
                : value === option.value;
            }).length,
          })),
          textResponses: null,
          status: "available" as const,
        };
      });
      if (campaign.customItems.some((item) => item.type === "short_text"))
        await repository.recordAuditEvent({
          tenantId: context.tenantId,
          actorId: context.userId,
          action: "custom_text_answers.viewed",
          objectType: "campaign",
          objectId: campaign.id,
          outcome: "success",
          metadata: { responseCount: rows.length, role: context.role },
        });
      return {
        campaignId: campaign.id,
        mode: campaign.mode,
        sampleSize: rows.length,
        status: anonymousSuppressed ? "suppressed" : "available",
        boundary: anonymousSuppressed
          ? "匿名活动少于5份答卷，企业补充题结果暂不展示。"
          : "企业补充题不参与诊断计分、类型判断、常模或跨期标准比较。",
        items,
      };
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/campaigns/:id/schedule-amendments",
    async (request, reply) => {
      const context = requireAdmin(request, reply);
      if (!context) return;
      const campaign = await repository.getCampaign(
        context.tenantId,
        request.params.id,
      );
      if (!campaign)
        return reply.code(404).send({ code: "CAMPAIGN_NOT_FOUND" });
      return repository.listCampaignScheduleAmendments(
        context.tenantId,
        campaign.id,
      );
    },
  );
  app.patch<{
    Params: { id: string };
    Body: { newClosesAt: string; reason: string };
  }>("/api/campaigns/:id/deadline", async (request, reply) => {
    const context = requireAdmin(request, reply);
    if (!context) return;
    const newClosesAt = new Date(request.body?.newClosesAt);
    const reason = request.body?.reason?.trim();
    if (
      !Number.isFinite(newClosesAt.getTime()) ||
      newClosesAt.getTime() <= Date.now() ||
      !reason ||
      reason.length > 1_000
    )
      return reply.code(400).send({ code: "INVALID_CAMPAIGN_EXTENSION" });
    try {
      const amendment = await repository.extendCampaignDeadline(
        context.tenantId,
        request.params.id,
        newClosesAt.toISOString(),
        reason,
        context.userId,
      );
      if (!amendment)
        return reply.code(404).send({ code: "CAMPAIGN_NOT_FOUND" });
      return {
        amendment,
        campaign: await repository.getCampaign(
          context.tenantId,
          request.params.id,
        ),
      };
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.startsWith("CAMPAIGN_DEADLINE_NOT_EDITABLE") ||
          error.message === "CAMPAIGN_DEADLINE_MUST_EXTEND")
      )
        return reply.code(409).send({ code: error.message });
      throw error;
    }
  });
  app.post<{ Params: { id: string }; Body: { status: CampaignStatus } }>(
    "/api/campaigns/:id/status",
    async (request, reply) => {
      const context = requireAdmin(request, reply);
      if (!context) return;
      try {
        const current = await repository.getCampaign(
          context.tenantId,
          request.params.id,
        );
        if (
          current?.status === "draft" &&
          ["scheduled", "active"].includes(request.body.status) &&
          !(await repository.getOrganizationResearchProfile(context.tenantId))
        )
          return reply.code(409).send({
            code: "ORGANIZATION_PROFILE_REQUIRED_BEFORE_PUBLISH",
          });
        const result = await transitionCampaignWithReport({
          repository,
          tenantId: context.tenantId,
          campaignId: request.params.id,
          status: request.body.status,
          actorId: context.userId,
          organizationLabel: context.tenantName,
        });
        if (!result)
          return reply.code(404).send({ code: "CAMPAIGN_NOT_FOUND" });
        if (result.organizationReport)
          await enqueueReportPdf(result.organizationReport);
        return result;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith("INVALID_CAMPAIGN_TRANSITION")
        )
          return reply.code(409).send({ code: error.message });
        throw error;
      }
    },
  );
  app.post<{
    Params: { id: string };
    Body: { participantId?: string; expiresInHours?: number };
  }>("/api/campaigns/:id/invites", async (request, reply) => {
    const context = requireAdmin(request, reply);
    if (!context) return;
    const campaign = await repository.getCampaign(
      context.tenantId,
      request.params.id,
    );
    if (!campaign) return reply.code(404).send({ code: "CAMPAIGN_NOT_FOUND" });
    if (!["scheduled", "active"].includes(campaign.status))
      return reply.code(409).send({ code: "CAMPAIGN_NOT_ACTIVE" });
    const requestedParticipantId = request.body?.participantId?.trim();
    const localTestInvite =
      !requestedParticipantId && process.env.NODE_ENV !== "production";
    if (
      !requestedParticipantId &&
      !localTestInvite &&
      campaign.organizationMethod !== "single_manager_self_assessment"
    )
      return reply.code(400).send({ code: "PARTICIPANT_ID_REQUIRED" });
    const localEmailIdentityHash =
      localTestInvite && context.authentication === "email_otp"
        ? await repository.emailIdentityHashForUser(
            context.tenantId,
            context.userId,
          )
        : null;
    const localExternalSubjectId =
      localTestInvite && context.authentication === "feishu_oauth"
        ? await repository.externalSubjectId(
            context.tenantId,
            context.userId,
          )
        : null;
    const participantId =
      campaign.organizationMethod === "single_manager_self_assessment"
        ? campaign.designatedAssessorExternalId!
        : requestedParticipantId ||
          (localEmailIdentityHash
            ? `email:${localEmailIdentityHash.slice(0, 32)}`
            : localExternalSubjectId || randomUUID());
    if (
      requestedParticipantId &&
      !isDesignatedAssessor(campaign, requestedParticipantId)
    )
      return reply.code(403).send({ code: "NOT_DESIGNATED_ASSESSOR" });
    const scopeMember = await repository.isCampaignScopeMember(
      context.tenantId,
      campaign.id,
      participantId,
    );
    if (!scopeMember && !localTestInvite)
      return reply.code(403).send({ code: "PARTICIPANT_OUTSIDE_FROZEN_SCOPE" });
    const expiresAt = campaignInviteExpiry(
      campaign,
      request.body?.expiresInHours,
    );
    const token = signInvite({
      campaignId: campaign.id,
      participantId,
      expiresAt,
    });
    if (localTestInvite && localEmailIdentityHash) {
      await repository.recordInvitationDelivery({
        tenantId: context.tenantId,
        campaignId: campaign.id,
        externalSubjectId: participantId,
        identityHash: localEmailIdentityHash,
        provider: "email",
        tokenFingerprint: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(expiresAt).toISOString(),
        messageId: `local-test:${context.userId}`,
      });
      await repository.saveEmailScopeMembers(context.tenantId, campaign.id, [
        participantId,
      ]);
    }
    return {
      token,
      participantId,
      url: `${process.env.WEB_ORIGIN ?? "http://localhost:5173"}/survey/${campaign.id}#token=${encodeURIComponent(token)}`,
    };
  });
  app.post<{
    Params: { id: string };
    Body: { emails: string[]; subject: string; body: string; buttonLabel: string; expiresInHours?: number };
  }>("/api/campaigns/:id/email-invitations", async (request, reply) => {
    const context = requireAdmin(request, reply);
    if (!context) return;
    const campaign = await repository.getCampaign(context.tenantId, request.params.id);
    if (!campaign || !["scheduled", "active"].includes(campaign.status))
      return reply.code(409).send({ code: "CAMPAIGN_NOT_ACTIVE" });
    if (!Array.isArray(request.body?.emails) || request.body.emails.length < 1 || request.body.emails.length > 5000)
      return reply.code(400).send({ code: "INVALID_EMAIL_INVITATIONS" });
    if (!request.body.subject?.trim() || !request.body.body?.trim() || !request.body.buttonLabel?.trim())
      return reply.code(400).send({ code: "INVALID_EMAIL_INVITATION_CONTENT" });
    const normalizedEmails: string[] = [];
    for (const raw of request.body.emails) {
      try { normalizedEmails.push(normalizeEmail(raw)); } catch { return reply.code(400).send({ code: "INVALID_EMAIL" }); }
    }
    const uniqueEmails = [...new Set(normalizedEmails)];
    const expiresAt = campaignInviteExpiry(campaign, request.body.expiresInHours);
    const results: Array<{ emailMasked: string; status: "sent" | "failed"; errorCode?: string }> = [];
    const sentParticipantIds: string[] = [];
    for (const emailAddress of uniqueEmails) {
      const identityHash = emailIdentityHash(emailAddress, secret);
      const participantId = `email:${identityHash.slice(0, 32)}`;
      const token = signInvite({ campaignId: campaign.id, participantId, expiresAt });
      const inviteUrl = `${process.env.WEB_ORIGIN ?? "http://localhost:5173"}/survey/${campaign.id}#token=${encodeURIComponent(token)}`;
      const masked = emailAddress.replace(/^(.{2}).*(@.*)$/, "$1***$2");
      try {
        const sent = await email.sendInvitation({ to: emailAddress, campaignName: campaign.name, inviteUrl, subject: request.body.subject.trim(), body: request.body.body.trim() });
        await repository.recordEmailDelivery({ identityHash, type: "invite", status: "sent", providerMessageId: sent.providerMessageId });
        await repository.recordInvitationDelivery({ tenantId: context.tenantId, campaignId: campaign.id, externalSubjectId: participantId, identityHash, provider: "email", tokenFingerprint: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(expiresAt).toISOString(), messageId: sent.providerMessageId });
        sentParticipantIds.push(participantId);
        results.push({ emailMasked: masked, status: "sent" });
      } catch (error) {
        const errorCode = error instanceof Error ? error.message.split(":")[0] : "EMAIL_SEND_FAILED";
        await repository.recordEmailDelivery({ identityHash, type: "invite", status: "failed", errorCode });
        await repository.recordInvitationDelivery({ tenantId: context.tenantId, campaignId: campaign.id, externalSubjectId: participantId, identityHash, provider: "email", tokenFingerprint: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(expiresAt).toISOString(), errorCode });
        results.push({ emailMasked: masked, status: "failed", errorCode });
      }
    }
    await repository.saveEmailScopeMembers(
      context.tenantId,
      campaign.id,
      sentParticipantIds,
    );
    const sentCount = results.filter((item) => item.status === "sent").length;
    const failedCount = results.filter((item) => item.status === "failed").length;
    if (
      sentCount === 0 &&
      results.every(
        (item) => item.errorCode === "EMAIL_PROVIDER_NOT_CONFIGURED",
      )
    )
      return reply.code(503).send({
        code: "EMAIL_PROVIDER_NOT_CONFIGURED",
        sent: sentCount,
        failed: failedCount,
        results,
      });
    return reply.code(sentCount > 0 ? 201 : 502).send({
      sent: sentCount,
      failed: failedCount,
      results,
    });
  });
  app.post<{
    Params: { id: string };
    Body: {
      openIds: string[];
      title: string;
      body: string;
      buttonLabel: string;
      expiresInHours?: number;
    };
  }>("/api/campaigns/:id/feishu-invitations", async (request, reply) => {
    const context = requireAdmin(request, reply);
    if (!context) return;
    if (!feishu) return reply.code(503).send({ code: "FEISHU_NOT_CONFIGURED" });
    const campaign = await repository.getCampaign(
      context.tenantId,
      request.params.id,
    );
    if (!campaign || !["scheduled", "active"].includes(campaign.status))
      return reply.code(409).send({ code: "CAMPAIGN_NOT_ACTIVE" });
    const openIds = [
      ...new Set(
        request.body?.openIds
          ?.map((value) => value.trim())
          .filter((value) => value.startsWith("ou_")) ?? [],
      ),
    ];
    if (
      campaign.organizationMethod === "single_manager_self_assessment" &&
      (openIds.length !== 1 ||
        openIds[0] !== campaign.designatedAssessorExternalId)
    )
      return reply.code(403).send({ code: "NOT_DESIGNATED_ASSESSOR" });
    const frozenScope = await repository.campaignScopeExternalIds(
      context.tenantId,
      campaign.id,
    );
    if (
      frozenScope.length &&
      openIds.some((openId) => !frozenScope.includes(openId))
    )
      return reply.code(403).send({ code: "RECIPIENT_OUTSIDE_FROZEN_SCOPE" });
    if (
      !openIds.length ||
      openIds.length > 5_000 ||
      !request.body.title?.trim() ||
      !request.body.body?.trim() ||
      !request.body.buttonLabel?.trim()
    )
      return reply.code(400).send({ code: "INVALID_FEISHU_INVITATION" });
    if (
      [request.body.title, request.body.body, request.body.buttonLabel].some(
        (value) => value.length > 2_000,
      )
    )
      return reply.code(400).send({ code: "FEISHU_CARD_CONTENT_TOO_LONG" });
    const expiresAt = campaignInviteExpiry(
      campaign,
      request.body.expiresInHours,
    );
    const results: Array<{
      openId: string;
      status: "sent" | "failed";
      messageId?: string;
      errorCode?: string;
      retryQueued?: boolean;
    }> = [];
    for (const openId of openIds) {
      const token = signInvite({
        campaignId: campaign.id,
        participantId: openId,
        expiresAt,
      });
      const url = `${process.env.WEB_ORIGIN ?? "http://localhost:5173"}/survey/${campaign.id}#token=${encodeURIComponent(token)}`;
      const card = {
        schema: "2.0",
        config: { enable_forward: false },
        header: {
          title: { tag: "plain_text", content: request.body.title.trim() },
          template: "green",
        },
        body: {
          elements: [
            { tag: "markdown", content: request.body.body.trim() },
            {
              tag: "button",
              text: {
                tag: "plain_text",
                content: request.body.buttonLabel.trim(),
              },
              type: "primary",
              url,
            },
          ],
        },
      };
      try {
        const sent = await feishu.sendInteractiveCard(openId, card);
        await repository.recordInvitationDelivery({
          tenantId: context.tenantId,
          campaignId: campaign.id,
          externalSubjectId: openId,
          tokenFingerprint: createHash("sha256").update(token).digest("hex"),
          expiresAt: new Date(expiresAt).toISOString(),
          messageId: sent.messageId,
        });
        results.push({ openId, status: "sent", messageId: sent.messageId });
      } catch (error) {
        const errorCode =
          error instanceof Error
            ? error.message.split(":")[0]
            : "FEISHU_MESSAGE_FAILED";
        const recorded = await repository.recordInvitationDelivery({
          tenantId: context.tenantId,
          campaignId: campaign.id,
          externalSubjectId: openId,
          tokenFingerprint: createHash("sha256").update(token).digest("hex"),
          expiresAt: new Date(expiresAt).toISOString(),
          errorCode,
        });
        const retryQueued = await enqueueNotificationRetry({
          tenantId: context.tenantId,
          notificationId: recorded.notificationId,
          openId,
          card,
        });
        results.push({
          openId,
          status: "failed",
          errorCode,
          retryQueued,
        });
      }
    }
    return reply
      .code(results.some((item) => item.status === "sent") ? 201 : 502)
      .send({
        sent: results.filter((item) => item.status === "sent").length,
        failed: results.filter((item) => item.status === "failed").length,
        results,
      });
  });
  app.post<{
    Params: { id: string };
    Body: {
      title: string;
      body: string;
      buttonLabel: string;
      expiresInHours?: number;
    };
  }>("/api/campaigns/:id/feishu-reminders", async (request, reply) => {
    const context = requireAdmin(request, reply);
    if (!context) return;
    if (!feishu) return reply.code(503).send({ code: "FEISHU_NOT_CONFIGURED" });
    const campaign = await repository.getCampaign(
      context.tenantId,
      request.params.id,
    );
    if (!campaign || !["scheduled", "active"].includes(campaign.status))
      return reply.code(409).send({ code: "CAMPAIGN_NOT_ACTIVE" });
    if (
      !request.body.title?.trim() ||
      !request.body.body?.trim() ||
      !request.body.buttonLabel?.trim()
    )
      return reply.code(400).send({ code: "INVALID_FEISHU_REMINDER" });
    const openIds = await repository.listPendingFeishuRecipients(
      context.tenantId,
      campaign.id,
    );
    if (!openIds.length)
      return { sent: 0, failed: 0, skipped: "NO_PENDING_RECIPIENTS" };
    const expiresAt = campaignInviteExpiry(
      campaign,
      request.body.expiresInHours,
    );
    const results: Array<{
      openId: string;
      status: "sent" | "failed";
      messageId?: string;
      errorCode?: string;
      retryQueued?: boolean;
    }> = [];
    for (const openId of openIds) {
      const token = signInvite({
        campaignId: campaign.id,
        participantId: openId,
        expiresAt,
      });
      const url = `${process.env.WEB_ORIGIN ?? "http://localhost:5173"}/survey/${campaign.id}#token=${encodeURIComponent(token)}`;
      const card = {
        schema: "2.0",
        config: { enable_forward: false },
        header: {
          title: { tag: "plain_text", content: request.body.title.trim() },
          template: "orange",
        },
        body: {
          elements: [
            { tag: "markdown", content: request.body.body.trim() },
            {
              tag: "button",
              text: {
                tag: "plain_text",
                content: request.body.buttonLabel.trim(),
              },
              type: "primary",
              url,
            },
          ],
        },
      };
      try {
        const sent = await feishu.sendInteractiveCard(openId, card);
        await repository.recordInvitationDelivery({
          tenantId: context.tenantId,
          campaignId: campaign.id,
          externalSubjectId: openId,
          tokenFingerprint: createHash("sha256").update(token).digest("hex"),
          expiresAt: new Date(expiresAt).toISOString(),
          messageId: sent.messageId,
          notificationType: "reminder",
        });
        results.push({ openId, status: "sent", messageId: sent.messageId });
      } catch (error) {
        const errorCode =
          error instanceof Error
            ? error.message.split(":")[0]
            : "FEISHU_MESSAGE_FAILED";
        const recorded = await repository.recordInvitationDelivery({
          tenantId: context.tenantId,
          campaignId: campaign.id,
          externalSubjectId: openId,
          tokenFingerprint: createHash("sha256").update(token).digest("hex"),
          expiresAt: new Date(expiresAt).toISOString(),
          errorCode,
          notificationType: "reminder",
        });
        const retryQueued = await enqueueNotificationRetry({
          tenantId: context.tenantId,
          notificationId: recorded.notificationId,
          openId,
          card,
        });
        results.push({
          openId,
          status: "failed",
          errorCode,
          retryQueued,
        });
      }
    }
    return reply
      .code(results.some((item) => item.status === "sent") ? 201 : 502)
      .send({
        sent: results.filter((item) => item.status === "sent").length,
        failed: results.filter((item) => item.status === "failed").length,
        results,
      });
  });
  app.get<{ Params: { id: string }; Querystring: { token: string } }>(
    "/public/campaigns/:id",
    async (request, reply) => {
      let claims;
      try {
        claims = verifyInvite(request.query.token, request.params.id);
      } catch {
        return reply.code(401).send({ code: "INVALID_INVITE" });
      }
      const campaign = await repository.getPublicCampaign(request.params.id);
      if (!campaign || !["scheduled", "active"].includes(campaign.status))
        return reply.code(404).send({ code: "CAMPAIGN_NOT_AVAILABLE" });
      if (
        !(await requirePublicParticipant(
          request,
          reply,
          campaign,
          claims.participantId,
        ))
      )
        return;
      if (!isDesignatedAssessor(campaign, claims.participantId))
        return reply.code(403).send({ code: "NOT_DESIGNATED_ASSESSOR" });
      const windowError = campaignWindowError(campaign);
      if (windowError)
        return reply
          .code(windowError.statusCode)
          .send({ code: windowError.code });
      const release = await activeQuestionnaireRelease(campaign);
      if (!release)
        return reply
          .code(409)
          .send({ code: "CAMPAIGN_RULESET_UNAVAILABLE" });
      const publicPersonal = campaign.tenantId === "tenant-personal";
      const personalObserver =
        campaign.assessmentProfileId === "personal_iov_observer_v0.1";
      return {
        campaign,
        privacyNotice: {
          version: EMPLOYEE_PRIVACY_NOTICE_VERSION,
          mode: campaign.mode,
          title: publicPersonal
            ? "个人自助测评与数据说明"
            : campaign.mode === "anonymous"
              ? "对企业管理员匿名的测评"
              : "实名测评与可见范围",
          hrVisibility:
            publicPersonal
              ? "本次测评由你个人发起，答案、分数和个人报告不会向企业HR、你所在的公司或其他组织角色开放。"
              : campaign.mode === "anonymous"
              ? "HR可查看邀请和完成状态，不能查看你的答案、分数或个人报告。"
              : "HR可查看邀请和完成状态；只有获得本次活动专用授权的HR才能查看个人报告，逐题答案仍需独立高风险授权。",
          purpose:
            personalObserver
              ? "结果用于了解你的AI工作方式，以及你个人感受到的组织支持环境；组织部分不是公司正式诊断，也不代表其他员工的共同看法。"
              : "结果用于个人发展和组织AI转型诊断，不得单独用于绩效、晋升、薪酬、淘汰或招聘决策。",
          retention:
            publicPersonal
              ? "数据与你的邮箱账户安全关联；你可以在“我的报告”找回报告，并申请删除相关答卷、分数和报告。"
              : "测评数据按企业已批准的保留政策保存；你可在“我的报告”申请删除与本人关联的答卷、分数和个人报告。",
          researchBoundary:
            "当前问卷与解释阈值仍处于验证阶段，结果不是能力认证或行业排名。",
        },
        questionnaireReleaseId: release.id,
        questionnaireContentHash: release.contentHash,
        items: release.items,
        backgroundItems: release.backgroundItems,
        customItems: release.customItems,
        scale: release.scale,
      };
    },
  );
  app.get<{ Params: { id: string }; Querystring: { token: string } }>(
    "/public/campaigns/:id/draft",
    async (request, reply) => {
      let claims;
      try {
        claims = verifyInvite(request.query.token, request.params.id);
      } catch {
        return reply.code(401).send({ code: "INVALID_INVITE" });
      }
      const campaign = await repository.getPublicCampaign(request.params.id);
      if (!campaign || !["scheduled", "active"].includes(campaign.status))
        return reply.code(404).send({ code: "CAMPAIGN_NOT_AVAILABLE" });
      if (
        !(await requirePublicParticipant(
          request,
          reply,
          campaign,
          claims.participantId,
        ))
      )
        return;
      if (!isDesignatedAssessor(campaign, claims.participantId))
        return reply.code(403).send({ code: "NOT_DESIGNATED_ASSESSOR" });
      const windowError = campaignWindowError(campaign);
      if (windowError)
        return reply
          .code(windowError.statusCode)
          .send({ code: windowError.code });
      if (!(await activeQuestionnaireRelease(campaign)))
        return reply
          .code(409)
          .send({ code: "CAMPAIGN_RULESET_UNAVAILABLE" });
      return (
        (await repository.getResponseDraft(
          campaign.tenantId,
          campaign.id,
          draftHash(campaign.id, claims.participantId),
        )) ?? {
          campaignId: campaign.id,
          answers: {},
          backgroundAnswers: {},
          customAnswers: {},
          clientRevision: 0,
          updatedAt: null,
        }
      );
    },
  );
  app.put<{
    Params: { id: string };
    Body: {
      token: string;
      answers?: Record<string, RawAnswer>;
      backgroundAnswers?: Record<string, string>;
      customAnswers?: Record<string, CustomAnswer>;
      clientRevision: number;
    };
  }>("/public/campaigns/:id/draft", async (request, reply) => {
    let claims;
    try {
      claims = verifyInvite(request.body.token, request.params.id);
    } catch {
      return reply.code(401).send({ code: "INVALID_INVITE" });
    }
    const campaign = await repository.getPublicCampaign(request.params.id);
    if (!campaign || !["scheduled", "active"].includes(campaign.status))
      return reply.code(409).send({ code: "CAMPAIGN_NOT_ACTIVE" });
    if (
      !(await requirePublicParticipant(
        request,
        reply,
        campaign,
        claims.participantId,
      ))
    )
      return;
    if (!isDesignatedAssessor(campaign, claims.participantId))
      return reply.code(403).send({ code: "NOT_DESIGNATED_ASSESSOR" });
    const windowError = campaignWindowError(campaign);
    if (windowError)
      return reply
        .code(windowError.statusCode)
        .send({ code: windowError.code });
    const release = await activeQuestionnaireRelease(campaign);
    if (!release)
      return reply.code(409).send({ code: "CAMPAIGN_RULESET_UNAVAILABLE" });
    const expectedIds = new Set(release.items.map((item) => item.id));
    const answers = request.body.answers ?? {};
    const backgroundAnswers = request.body.backgroundAnswers ?? {};
    const customAnswers = request.body.customAnswers ?? {};
    if (
      !Number.isInteger(request.body.clientRevision) ||
      request.body.clientRevision < 1
    )
      return reply.code(400).send({ code: "INVALID_DRAFT_REVISION" });
    if (
      Object.keys(answers).some((id) => !expectedIds.has(id)) ||
      Object.values(answers).some(
        (value) => value !== null && ![1, 2, 3, 4, 5].includes(value),
      )
    )
      return reply.code(400).send({ code: "INVALID_DRAFT_ANSWERS" });
    const backgroundItems = release.backgroundItems;
    const backgroundItemIds = new Set<string>(
      backgroundItems.map((item) => item.id),
    );
    if (
      Object.keys(backgroundAnswers).some(
        (id) => !backgroundItemIds.has(id),
      ) ||
      Object.entries(backgroundAnswers).some(
        ([id, value]) =>
          !backgroundItems
            .find((item) => item.id === id)
            ?.options.some((option) => option.value === value),
      )
    )
      return reply.code(400).send({ code: "INVALID_DRAFT_BACKGROUND_ANSWERS" });
    const customItems = release.customItems;
    if (
      Object.keys(customAnswers).some(
        (id) => !customItems.some((item) => item.id === id),
      ) ||
      Object.entries(customAnswers).some(([id, value]) => {
        const item = customItems.find((entry) => entry.id === id);
        if (!item) return true;
        if (item.type === "short_text")
          return typeof value !== "string" || value.length > 500;
        const allowed = new Set(item.options.map((option) => option.value));
        if (item.type === "single_choice")
          return typeof value !== "string" || !allowed.has(value);
        return (
          !Array.isArray(value) ||
          value.length > item.options.length ||
          new Set(value).size !== value.length ||
          value.some((entry) => !allowed.has(entry))
        );
      })
    )
      return reply.code(400).send({ code: "INVALID_DRAFT_CUSTOM_ANSWERS" });
    return repository.saveResponseDraft(
      campaign.tenantId,
      campaign.id,
      draftHash(campaign.id, claims.participantId),
      {
        answers,
        backgroundAnswers,
        customAnswers,
        clientRevision: request.body.clientRevision,
      },
    );
  });
  app.post<{
    Params: { id: string };
    Body: {
      token: string;
      answers: Record<string, RawAnswer>;
      backgroundAnswers?: Record<string, string>;
      customAnswers?: Record<string, CustomAnswer>;
      privacyNoticeVersion?: string;
      consentedAt?: string;
    };
  }>("/public/campaigns/:id/submissions", async (request, reply) => {
    let claims;
    try {
      claims = verifyInvite(request.body.token, request.params.id);
    } catch {
      return reply.code(401).send({ code: "INVALID_INVITE" });
    }
    const campaign = await repository.getPublicCampaign(request.params.id);
    if (!campaign || !["scheduled", "active"].includes(campaign.status))
      return reply.code(409).send({ code: "CAMPAIGN_NOT_ACTIVE" });
    if (
      !(await requirePublicParticipant(
        request,
        reply,
        campaign,
        claims.participantId,
      ))
    )
      return;
    if (!isDesignatedAssessor(campaign, claims.participantId))
      return reply.code(403).send({ code: "NOT_DESIGNATED_ASSESSOR" });
    const windowError = campaignWindowError(campaign);
    if (windowError)
      return reply
        .code(windowError.statusCode)
        .send({ code: windowError.code });
    const release = await activeQuestionnaireRelease(campaign);
    if (!release)
      return reply.code(409).send({ code: "CAMPAIGN_RULESET_UNAVAILABLE" });
    const consentedAt = new Date(request.body.consentedAt ?? "");
    if (
      request.body.privacyNoticeVersion !== EMPLOYEE_PRIVACY_NOTICE_VERSION ||
      !Number.isFinite(consentedAt.getTime()) ||
      consentedAt.getTime() > Date.now() + 5 * 60_000
    )
      return reply.code(400).send({ code: "PRIVACY_NOTICE_CONSENT_REQUIRED" });
    const expectedIds = release.items.map((item) => item.id);
    const submittedIds = Object.keys(request.body.answers ?? {});
    if (
      expectedIds.some((id) => !submittedIds.includes(id)) ||
      submittedIds.some((id) => !expectedIds.includes(id))
    )
      return reply.code(400).send({
        code: "ANSWER_PACKAGE_MISMATCH",
        expectedCount: expectedIds.length,
      });
    if (
      Object.values(request.body.answers).some(
        (value) => value !== null && ![1, 2, 3, 4, 5].includes(value),
      )
    )
      return reply.code(400).send({ code: "INVALID_ANSWER_VALUE" });
    const backgroundItems = release.backgroundItems;
    const expectedBackgroundIds = new Set<string>(
      backgroundItems.map((item) => item.id),
    );
    const backgroundAnswers = request.body.backgroundAnswers ?? {};
    const submittedBackgroundIds = Object.keys(backgroundAnswers);
    if (
      backgroundItems.some(
        (item) => !submittedBackgroundIds.includes(item.id),
      ) ||
      submittedBackgroundIds.some(
        (id) => !expectedBackgroundIds.has(id),
      )
    )
      return reply.code(400).send({
        code: "BACKGROUND_ANSWER_PACKAGE_MISMATCH",
        expectedCount: backgroundItems.length,
      });
    if (
      backgroundItems.some(
        (item) =>
          !item.options.some(
            (option) => option.value === backgroundAnswers[item.id],
          ),
      )
    )
      return reply.code(400).send({ code: "INVALID_BACKGROUND_ANSWER" });
    const customItems = release.customItems;
    const customAnswers = request.body.customAnswers ?? {};
    if (
      Object.keys(customAnswers).some(
        (id) => !customItems.some((item) => item.id === id),
      ) ||
      customItems.some((item) => {
        const value = customAnswers[item.id];
        if (value === undefined)
          return item.required;
        if (item.type === "short_text")
          return (
            typeof value !== "string" ||
            value.trim().length === 0 ||
            value.length > 500
          );
        const allowed = new Set(item.options.map((option) => option.value));
        if (item.type === "single_choice")
          return typeof value !== "string" || !allowed.has(value);
        return (
          !Array.isArray(value) ||
          value.length === 0 ||
          new Set(value).size !== value.length ||
          value.some((entry) => !allowed.has(entry))
        );
      })
    )
      return reply.code(400).send({ code: "INVALID_CUSTOM_ANSWERS" });
    const now = new Date();
    const participantResponseHash = responseHash(
      campaign.id,
      claims.participantId,
    );
    const participantSubjectHash = subjectHash(
      campaign.id,
      claims.participantId,
    );
    const response: ResponseSubmission = {
      id: randomUUID(),
      tenantId: campaign.tenantId,
      campaignId: campaign.id,
      participantRef:
        campaign.mode === "identified" ? claims.participantId : null,
      answers: request.body.answers,
      backgroundAnswers,
      customAnswers,
      submittedAt: now.toISOString(),
      responseHash: participantResponseHash,
      privacyNoticeVersion: EMPLOYEE_PRIVACY_NOTICE_VERSION,
      consentedAt: consentedAt.toISOString(),
    };
    const score = scoreAnswers(request.body.answers, now);
    const personalReportType =
      campaign.assessmentProfileId === "personal_iov_observer_v0.1"
        ? "personal_observer"
        : campaign.target === "personal"
        ? "personal_scoped"
        : campaign.target === "combined"
          ? "immediate_personal"
          : null;
    const report = personalReportType
      ? buildReportSnapshot({
          tenantId: campaign.tenantId,
          campaignId: campaign.id,
          responseId: response.id,
          reportType: personalReportType,
          subjectLabel: "你的个人报告",
          score,
          backgroundAnswers,
          createdAt: now,
        })
      : null;
    const reportAccessToken = report ? createSessionToken() : null;
    try {
      const departmentIds = await repository.departmentIdsForExternalSubject(
        campaign.tenantId,
        claims.participantId,
      );
      await repository.saveSubmission(response, score, report, {
        subjectRefHash: participantSubjectHash,
        draftSubjectRefHash: draftHash(campaign.id, claims.participantId),
        linkType:
          campaign.mode === "identified"
            ? "identified"
            : "anonymous_self_service",
        retrievalTokenHash: reportAccessToken
          ? hashSessionToken(reportAccessToken)
          : undefined,
        departmentIds,
        publisherActorId: "system",
      });
      if (
        PUBLIC_PERSONAL_ASSESSMENT_PROFILES.includes(
          campaign.assessmentProfileId as (typeof PUBLIC_PERSONAL_ASSESSMENT_PROFILES)[number],
        ) &&
        claims.participantId.startsWith("personal:")
      ) {
        const raw = readCookie(
          request.headers.cookie,
          sessionCookieName(process.env.NODE_ENV === "production"),
        );
        const personalContext = raw
          ? await repository.resolveAuthSession(hashSessionToken(raw))
          : null;
        if (personalContext) {
          const profile = await repository.getPersonalResearchProfile(
            personalContext.tenantId,
            personalContext.userId,
          );
          if (profile)
            await repository.savePersonalResearchSnapshot(
              campaign.tenantId,
              campaign.id,
              response.id,
              profile,
            );
        }
      }
      const invitationProvider = claims.participantId.startsWith("email:") || claims.participantId.startsWith("personal:") ? "email" : "feishu";
      if (campaign.mode === "anonymous")
        await repository.queueAnonymousCompletionReceipt(
          campaign.tenantId,
          campaign.id,
          claims.participantId,
          invitationProvider,
        );
      else
        await repository.markInvitationCompleted(
          campaign.tenantId,
          campaign.id,
          claims.participantId,
          invitationProvider,
        );
      if (report) {
        await enqueueReportPdf(report);
        await notifySignedInAccountReportReady(request, report);
      }
    } catch (error: any) {
      if (
        String(error?.message).includes("unique") ||
        String(error?.message).includes("duplicate")
      ) {
        const existing = await repository.submissionResultByResponseHash(
          campaign.tenantId,
          campaign.id,
          participantResponseHash,
        );
        if (existing) {
          const replacementAccessToken = existing.report
            ? createSessionToken()
            : null;
          if (existing.report && replacementAccessToken)
            await repository.createReportRetrievalToken(
              campaign.tenantId,
              existing.report.id,
              hashSessionToken(replacementAccessToken),
            );
          const invitationProvider = claims.participantId.startsWith("email:") || claims.participantId.startsWith("personal:") ? "email" : "feishu";
          if (campaign.mode === "anonymous")
            await repository.queueAnonymousCompletionReceipt(
              campaign.tenantId,
              campaign.id,
              claims.participantId,
              invitationProvider,
            );
          else
            await repository.markInvitationCompleted(
              campaign.tenantId,
              campaign.id,
              claims.participantId,
              invitationProvider,
            );
          return reply.send({
            submissionId: existing.submission.id,
            score: existing.score,
            report: existing.report,
            reportAccessToken: replacementAccessToken,
            deduplicated: true,
          });
        }
      }
      throw error;
    }
    return reply
      .code(201)
      .send({ submissionId: response.id, score, report, reportAccessToken });
  });
  app.post<{
    Body: { confirmation?: string; reason?: string };
  }>("/api/privacy/my-data-deletion", async (request, reply) => {
    const context = contextOf(request);
    if (request.body?.confirmation !== "DELETE_MY_DATA")
      return reply.code(400).send({ code: "DELETION_CONFIRMATION_REQUIRED" });
    if (!jobQueue)
      return reply.code(503).send({ code: "BACKGROUND_JOBS_NOT_CONFIGURED" });
    const externalId = await repository.externalSubjectId(
      context.tenantId,
      context.userId,
    );
    if (!externalId)
      return reply.code(409).send({ code: "EXTERNAL_IDENTITY_NOT_LINKED" });
    const campaigns = await repository.listCampaigns(context.tenantId);
    if (!campaigns.length)
      return reply.code(409).send({ code: "NO_LINKED_ASSESSMENT_DATA" });
    const subjectRefHashes = campaigns.map((campaign) =>
      subjectHash(campaign.id, externalId),
    );
    const requestId = randomUUID();
    const reason = request.body.reason?.trim() || "data_subject_request";
    await repository.createDataDeletionRequest({
      id: requestId,
      tenantId: context.tenantId,
      requestedBy: context.userId,
      requesterKind: "authenticated_subject",
      reason,
      subjectRefHashes,
    });
    let jobId: string;
    try {
      jobId = await jobQueue.add(
        {
          name: "delete-subject-data",
          data: {
            requestId,
            tenantId: context.tenantId,
            subjectRefHashes,
            requestedBy: context.userId,
            reason,
          },
        },
        `data-deletion:${requestId}`,
      );
    } catch (error) {
      await repository.setDataDeletionRequestStatus(
        context.tenantId,
        requestId,
        "failed",
        null,
        error instanceof Error
          ? error.message.split(":")[0]
          : "QUEUE_UNAVAILABLE",
      );
      return reply.code(503).send({ code: "DATA_DELETION_QUEUE_FAILED", requestId });
    }
    await repository.recordAuditEvent({
      tenantId: context.tenantId,
      actorId: context.userId,
      action: "subject_data.deletion_requested",
      objectType: "data_subject_request",
      objectId: requestId,
      outcome: "queued",
      metadata: { jobId, campaignCount: campaigns.length },
    });
    return reply.code(202).send(
      await repository.dataDeletionRequest(context.tenantId, requestId),
    );
  });
  app.get("/api/privacy/my-data-deletion", async (request) => {
    const context = contextOf(request);
    return repository.latestDataDeletionRequestForUser(
      context.tenantId,
      context.userId,
    );
  });
  app.post<{
    Params: { id: string };
    Body: { accessToken?: string; confirmation?: string; reason?: string };
  }>("/public/reports/:id/data-deletion", async (request, reply) => {
    if (request.body?.confirmation !== "DELETE_MY_DATA")
      return reply.code(400).send({ code: "DELETION_CONFIRMATION_REQUIRED" });
    if (!request.body?.accessToken)
      return reply.code(401).send({ code: "REPORT_ACCESS_TOKEN_REQUIRED" });
    if (!jobQueue)
      return reply.code(503).send({ code: "BACKGROUND_JOBS_NOT_CONFIGURED" });
    const subject = await repository.subjectHashesForReportToken(
      request.params.id,
      hashSessionToken(request.body.accessToken),
    );
    if (!subject)
      return reply.code(404).send({ code: "REPORT_NOT_FOUND" });
    const requestId = randomUUID();
    const statusToken = `${randomUUID()}${randomUUID()}`;
    const reason = request.body.reason?.trim() || "anonymous_data_subject_request";
    await repository.createDataDeletionRequest({
      id: requestId,
      tenantId: subject.tenantId,
      requestedBy: null,
      requesterKind: "anonymous_report_holder",
      reason,
      subjectRefHashes: subject.subjectRefHashes,
      statusTokenHash: hashSessionToken(statusToken),
    });
    try {
      await jobQueue.add(
        {
          name: "delete-subject-data",
          data: {
            requestId,
            tenantId: subject.tenantId,
            subjectRefHashes: subject.subjectRefHashes,
            requestedBy: "anonymous-report-holder",
            reason,
          },
        },
        `data-deletion:${requestId}`,
      );
    } catch (error) {
      await repository.setDataDeletionRequestStatus(
        subject.tenantId,
        requestId,
        "failed",
        null,
        error instanceof Error
          ? error.message.split(":")[0]
          : "QUEUE_UNAVAILABLE",
      );
      return reply.code(503).send({ code: "DATA_DELETION_QUEUE_FAILED", requestId });
    }
    return reply.code(202).send({
      ...(await repository.dataDeletionRequest(subject.tenantId, requestId)),
      statusToken,
    });
  });
  app.get<{
    Params: { id: string };
    Querystring: { status_token?: string };
  }>("/public/data-deletions/:id", async (request, reply) => {
    if (!request.query.status_token)
      return reply.code(401).send({ code: "DELETION_STATUS_TOKEN_REQUIRED" });
    const deletion = await repository.dataDeletionRequestByStatusToken(
      request.params.id,
      hashSessionToken(request.query.status_token),
    );
    return deletion ?? reply.code(404).send({ code: "DATA_DELETION_NOT_FOUND" });
  });
  app.get<{ Params: { id: string }; Querystring: { access_token?: string } }>(
    "/public/reports/:id",
    async (request, reply) => {
      if (!request.query.access_token)
        return reply.code(401).send({ code: "REPORT_ACCESS_TOKEN_REQUIRED" });
      const report = await repository.getReportByRetrievalToken(
        request.params.id,
        hashSessionToken(request.query.access_token),
      );
      return report ?? reply.code(404).send({ code: "REPORT_NOT_FOUND" });
    },
  );
  app.get<{
    Params: { id: string };
    Querystring: { access_token?: string };
  }>("/public/reports/:id/pdf", async (request, reply) => {
    if (!request.query.access_token)
      return reply.code(401).send({ code: "REPORT_ACCESS_TOKEN_REQUIRED" });
    const report = await repository.getReportByRetrievalToken(
      request.params.id,
      hashSessionToken(request.query.access_token),
    );
    return report
      ? sendPdf(reply, report, {
          actorId: null,
          channel: "anonymous_retrieval_token",
        })
      : reply.code(404).send({ code: "REPORT_NOT_FOUND" });
  });
  app.get<{ Params: { id: string }; Querystring: { token?: string } }>(
    "/public/render/reports/:id",
    async (request, reply) => {
      if (!request.query.token)
        return reply.code(401).send({ code: "REPORT_RENDER_TOKEN_REQUIRED" });
      let claims;
      try {
        claims = verifyReportRenderToken(
          request.query.token,
          request.params.id,
          secret,
        );
      } catch {
        return reply.code(401).send({ code: "INVALID_REPORT_RENDER_TOKEN" });
      }
      const report = await repository.getReportByContentHash(
        request.params.id,
        claims.contentHash,
      );
      return report ?? reply.code(404).send({ code: "REPORT_NOT_FOUND" });
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/reports/:id",
    async (request, reply) => {
      const context = contextOf(request);
      const report = await repository.getReportForActor(
        context,
        request.params.id,
      );
      return report ?? reply.code(404).send({ code: "REPORT_NOT_FOUND" });
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/reports/:id/pdf",
    async (request, reply) => {
      const context = contextOf(request);
      const report = await repository.getReportForActor(
        context,
        request.params.id,
      );
      if (!report) return reply.code(404).send({ code: "REPORT_NOT_FOUND" });
      const personal = [
        "immediate_personal",
        "second_stage_personal",
        "personal_scoped",
        "personal_observer",
      ].includes(report.reportType);
      const allowed =
        (adminRoles.includes(context.role) && !personal) ||
        (await repository.hasReportDownloadGrant(
          context.tenantId,
          report.id,
          context.userId,
        ));
      return allowed
        ? sendPdf(reply, report, {
            actorId: context.userId,
            channel: "report_center",
            role: context.role,
          })
        : reply.code(403).send({ code: "REPORT_DOWNLOAD_NOT_GRANTED" });
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/reports/:id/access",
    async (request, reply) => {
      const context = contextOf(request);
      const report = await repository.getReportForActor(
        context,
        request.params.id,
      );
      if (!report) return reply.code(404).send({ code: "REPORT_NOT_FOUND" });
      const personal = [
        "immediate_personal",
        "second_stage_personal",
        "personal_scoped",
        "personal_observer",
      ].includes(report.reportType);
      return {
        canView: true,
        canManage: adminRoles.includes(context.role),
        canDownload:
          (adminRoles.includes(context.role) && !personal) ||
          (await repository.hasReportDownloadGrant(
            context.tenantId,
            report.id,
            context.userId,
          )),
      };
    },
  );
  app.post<{
    Params: { id: string };
    Body: { audience: ReportPublication["audience"] };
  }>("/api/reports/:id/publications", async (request, reply) => {
    const context = requireAdmin(request, reply);
    if (!context) return;
    if (
      !["employee", "manager", "organization"].includes(request.body?.audience)
    )
      return reply.code(400).send({ code: "INVALID_PUBLICATION_AUDIENCE" });
    const publicationCandidate = await repository.getReport(
      context.tenantId,
      request.params.id,
    );
    if (!publicationCandidate)
      return reply.code(404).send({ code: "REPORT_NOT_FOUND" });
    if (
      publicationCandidate.reportType === "manager_self_assessment" &&
      request.body.audience === "employee"
    )
      return reply
        .code(400)
        .send({ code: "MANAGER_SELF_ASSESSMENT_EMPLOYEE_PUBLICATION_FORBIDDEN" });
    if (!verifyReportSnapshot(publicationCandidate))
      return reply
        .code(409)
        .send({ code: "REPORT_SNAPSHOT_INTEGRITY_MISMATCH" });
    const publication = await repository.publishReport(
      context.tenantId,
      request.params.id,
      request.body.audience,
      context.userId,
    );
    if (!publication) return reply.code(404).send({ code: "REPORT_NOT_FOUND" });
    if (!publication.created)
      return reply.send({
        ...publication,
        secondStageReports: 0,
        employeeOrganizationSummaries: 0,
        deduplicated: true,
      });
    const publishedReport = await repository.getReport(
      context.tenantId,
      request.params.id,
    );
    let secondStageReports = 0;
    let employeeOrganizationSummaries = 0;
    if (
      publishedReport &&
      ["organization", "organization_scoped"].includes(
        publishedReport.reportType,
      ) &&
      publishedReport.organizationBenchmark
    ) {
      const records = await repository.responseScoreRecords(
        context.tenantId,
        publishedReport.campaignId,
      );
      for (const record of records) {
        if (publishedReport.reportType === "organization") {
          const secondStage = buildReportSnapshot({
            tenantId: context.tenantId,
            campaignId: publishedReport.campaignId,
            responseId: record.responseId,
            reportType: "second_stage_personal",
            subjectLabel: "你的二阶段个人报告",
            score: record.score,
            backgroundAnswers: record.backgroundAnswers,
            organizationBenchmark: publishedReport.organizationBenchmark,
            status: "published",
          });
          if (
            await repository.saveReport(secondStage, true, {
              actorId: "system",
              audience: "employee",
            })
          ) {
            await enqueueReportPdf(secondStage);
            secondStageReports += 1;
          }
        }
        if (request.body.audience === "employee") {
          const employeeSummary = buildReportSnapshot({
            tenantId: context.tenantId,
            campaignId: publishedReport.campaignId,
            responseId: record.responseId,
            reportType: "employee_organization_summary",
            subjectLabel: "本次调研的组织摘要",
            sampleSize: publishedReport.sampleSize,
            score: publishedReport.score,
            organizationBenchmark: {
              ...publishedReport.organizationBenchmark,
              departments: [],
            },
            retestComparison: publishedReport.retestComparison,
            itemPatternRecords: publishedReport.itemPatternRecords,
            diagnoses: publishedReport.diagnoses,
            systemPlan: publishedReport.systemPlan,
            recommendations: publishedReport.recommendations,
            actionRuleAudit: publishedReport.actionRuleAudit,
            status: "published",
          });
          if (
            await repository.saveReport(employeeSummary, true, {
              actorId: "system",
              audience: "employee",
            })
          ) {
            await enqueueReportPdf(employeeSummary);
            employeeOrganizationSummaries += 1;
          }
        }
      }
    }
    if (request.body.audience === "employee" && publishedReport) {
      const recipients = await repository.completedEmailInvitationRecipients(
        context.tenantId,
        publishedReport.campaignId,
      );
      for (const recipient of recipients)
        await deliverReportReadyEmail({
          ...recipient,
          reportUrl: `${process.env.WEB_ORIGIN ?? "http://localhost:5173"}/my-reports`,
          subject: `${publishedReport.subjectLabel}已发布`,
        });
    }
    return reply.code(201).send({
      ...publication,
      secondStageReports,
      employeeOrganizationSummaries,
    });
  });
  app.post<{ Params: { id: string }; Body: CreateActionPlanInput }>(
    "/api/reports/:id/actions",
    async (request, reply) => {
      const context = requireAdmin(request, reply);
      if (!context) return;
      const input = request.body;
      if (
        !input?.recommendationId ||
        !input.title?.trim() ||
        !input.owner?.trim() ||
        !input.successMetric?.trim() ||
        !input.resources?.trim() ||
        !input.startsAt ||
        !input.dueAt ||
        input.dueAt < input.startsAt ||
        !input.retestAt ||
        input.retestAt < input.dueAt ||
        !Array.isArray(input.milestones) ||
        !input.milestones.length ||
        input.milestones.length > 10 ||
        input.milestones.some(
          (milestone) =>
            !milestone.title?.trim() ||
            !milestone.dueAt ||
            milestone.dueAt < input.startsAt ||
            milestone.dueAt > input.dueAt,
        )
      )
        return reply.code(400).send({ code: "INVALID_ACTION_PLAN_INPUT" });
      try {
        const action = await repository.createActionPlanItem(
          context.tenantId,
          request.params.id,
          {
            ...input,
            title: input.title.trim(),
            owner: input.owner.trim(),
            successMetric: input.successMetric.trim(),
            resources: input.resources.trim(),
            milestones: input.milestones.map((milestone) => ({
              title: milestone.title.trim(),
              dueAt: milestone.dueAt,
            })),
          },
          context.userId,
        );
        return action
          ? reply.code(201).send(action)
          : reply.code(404).send({ code: "REPORT_NOT_FOUND" });
      } catch (error) {
        if (
          error instanceof Error &&
          [
            "RECOMMENDATION_NOT_IN_REPORT",
            "REPORT_NOT_PUBLISHED_FOR_ACTION",
          ].includes(error.message)
        )
          return reply.code(400).send({ code: error.message });
        throw error;
      }
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/reports/:id/grants",
    async (request, reply) => {
      const context = requireAdmin(request, reply);
      if (!context) return;
      const target = await repository.getReport(
        context.tenantId,
        request.params.id,
      );
      if (!target) return reply.code(404).send({ code: "REPORT_NOT_FOUND" });
      if (
        [
          "immediate_personal",
          "second_stage_personal",
          "personal_scoped",
          "personal_observer",
        ].includes(target.reportType)
      )
        return reply.code(400).send({
          code: "USE_INDIVIDUAL_REPORT_GRANT_FOR_PERSONAL_REPORTS",
        });
      return repository.listReportGrants(context.tenantId, target.id);
    },
  );
  app.post<{
    Params: { id: string };
    Body: {
      granteeUserId: string;
      operations?: Array<"view" | "download">;
      expiresAt?: string | null;
      notify?: boolean;
      notificationTitle?: string;
      notificationBody?: string;
      notificationButtonLabel?: string;
    };
  }>("/api/reports/:id/grants", async (request, reply) => {
    const context = requireAdmin(request, reply);
    if (!context) return;
    const operations = request.body?.operations?.filter((value) =>
      ["view", "download"].includes(value),
    ) ?? ["view"];
    if (!request.body?.granteeUserId || !operations.length)
      return reply.code(400).send({ code: "INVALID_REPORT_GRANT" });
    const target = await repository.getReport(
      context.tenantId,
      request.params.id,
    );
    if (!target) return reply.code(404).send({ code: "REPORT_NOT_FOUND" });
    if (
      [
        "immediate_personal",
        "second_stage_personal",
        "personal_scoped",
        "personal_observer",
      ].includes(target.reportType)
    )
      return reply.code(400).send({
        code: "USE_INDIVIDUAL_REPORT_GRANT_FOR_PERSONAL_REPORTS",
      });
    try {
      const grant = await repository.createReportGrant(
        context.tenantId,
        target.id,
        request.body.granteeUserId,
        operations,
        request.body.expiresAt ?? null,
        context.userId,
      );
      let notification: {
        status: "sent" | "skipped" | "failed";
        messageId?: string;
        reason?: string;
      } = { status: "skipped", reason: "NOT_REQUESTED" };
      if (request.body.notify) {
        const openId = await repository.externalSubjectId(
          context.tenantId,
          request.body.granteeUserId,
        );
        if (!feishu)
          notification = { status: "skipped", reason: "FEISHU_NOT_CONFIGURED" };
        else if (!openId?.startsWith("ou_"))
          notification = {
            status: "skipped",
            reason: "GRANTEE_HAS_NO_FEISHU_ID",
          };
        else {
          const reportUrl = `${process.env.WEB_ORIGIN ?? "http://localhost:5173"}/reports/${target.id}`;
          const card = {
            schema: "2.0",
            config: { enable_forward: false },
            header: {
              title: {
                tag: "plain_text",
                content:
                  request.body.notificationTitle?.trim() ||
                  "组织诊断报告已向你开放",
              },
              template: "green",
            },
            body: {
              elements: [
                {
                  tag: "markdown",
                  content:
                    request.body.notificationBody?.trim() ||
                    "你已获得一份组织诊断报告的查看权限。权限会在每次访问时重新校验。",
                },
                {
                  tag: "button",
                  text: {
                    tag: "plain_text",
                    content:
                      request.body.notificationButtonLabel?.trim() ||
                      "查看报告",
                  },
                  type: "primary",
                  url: reportUrl,
                },
              ],
            },
          };
          try {
            const sent = await feishu.sendInteractiveCard(openId, card);
            await repository.recordReportNotification({
              tenantId: context.tenantId,
              campaignId: target.campaignId,
              messageId: sent.messageId,
            });
            notification = { status: "sent", messageId: sent.messageId };
          } catch (error) {
            const reason =
              error instanceof Error
                ? error.message.split(":")[0]
                : "FEISHU_MESSAGE_FAILED";
            const notificationId = await repository.recordReportNotification({
              tenantId: context.tenantId,
              campaignId: target.campaignId,
              errorCode: reason,
            });
            const retryQueued = await enqueueNotificationRetry({
              tenantId: context.tenantId,
              notificationId,
              openId,
              card,
            });
            notification = {
              status: "failed",
              reason: retryQueued ? `${reason};RETRY_QUEUED` : reason,
            };
          }
        }
      }
      return reply.code(201).send({ ...grant, notification });
    } catch (error) {
      if (error instanceof Error && error.message === "GRANTEE_NOT_IN_TENANT")
        return reply.code(400).send({ code: error.message });
      throw error;
    }
  });
  app.delete<{ Params: { id: string } }>(
    "/api/report-grants/:id",
    async (request, reply) => {
      const context = requireAdmin(request, reply);
      if (!context) return;
      return (await repository.revokeReportGrant(
        context.tenantId,
        request.params.id,
        context.userId,
      ))
        ? reply.code(204).send()
        : reply.code(404).send({ code: "REPORT_GRANT_NOT_FOUND" });
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/campaigns/:id/individual-report-grants",
    async (request, reply) => {
      const context = requireAdmin(request, reply);
      if (!context) return;
      const campaign = await repository.getCampaign(
        context.tenantId,
        request.params.id,
      );
      return campaign
        ? repository.listIndividualReportGrants(context.tenantId, campaign.id)
        : reply.code(404).send({ code: "CAMPAIGN_NOT_FOUND" });
    },
  );
  app.post<{
    Params: { id: string };
    Body: {
      granteeUserId?: string;
      operations?: Array<"view" | "download">;
      expiresAt?: string | null;
    };
  }>("/api/campaigns/:id/individual-report-grants", async (request, reply) => {
    const context = requireAdmin(request, reply);
    if (!context) return;
    if (context.role !== "owner")
      return reply.code(403).send({ code: "OWNER_REQUIRED" });
    const operations = request.body?.operations?.filter((value) =>
      ["view", "download"].includes(value),
    ) ?? ["view"];
    if (
      !request.body?.granteeUserId ||
      !operations.includes("view") ||
      (request.body.expiresAt &&
        new Date(request.body.expiresAt).getTime() <= Date.now())
    )
      return reply.code(400).send({ code: "INVALID_INDIVIDUAL_REPORT_GRANT" });
    try {
      return reply.code(201).send(
        await repository.createIndividualReportGrant({
          tenantId: context.tenantId,
          campaignId: request.params.id,
          granteeUserId: request.body.granteeUserId,
          operations,
          expiresAt: request.body.expiresAt ?? null,
          grantedBy: context.userId,
        }),
      );
    } catch (error) {
      if (
        error instanceof Error &&
        [
          "CAMPAIGN_NOT_FOUND",
          "INDIVIDUAL_REPORT_GRANT_REQUIRES_IDENTIFIED_CAMPAIGN",
          "CAMPAIGN_HAS_NO_PERSONAL_REPORTS",
          "INDIVIDUAL_REPORT_GRANTEE_MUST_BE_HR",
        ].includes(error.message)
      )
        return reply.code(400).send({ code: error.message });
      throw error;
    }
  });
  app.delete<{ Params: { id: string } }>(
    "/api/individual-report-grants/:id",
    async (request, reply) => {
      const context = requireAdmin(request, reply);
      if (!context) return;
      if (context.role !== "owner")
        return reply.code(403).send({ code: "OWNER_REQUIRED" });
      return (await repository.revokeIndividualReportGrant(
        context.tenantId,
        request.params.id,
        context.userId,
      ))
        ? reply.code(204).send()
        : reply.code(404).send({ code: "INDIVIDUAL_REPORT_GRANT_NOT_FOUND" });
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/campaigns/:id/individual-reports",
    async (request, reply) => {
      const reports = await repository.listIndividualReportsForActor(
        contextOf(request),
        request.params.id,
      );
      return reports ?? reply.code(404).send({ code: "REPORT_NOT_FOUND" });
    },
  );
  app.get<{ Params: { id: string; subjectId: string } }>(
    "/api/campaigns/:id/individual-reports/:subjectId",
    async (request, reply) => {
      const report = await repository.getIndividualReportForActor(
        contextOf(request),
        request.params.id,
        request.params.subjectId,
      );
      return report ?? reply.code(404).send({ code: "REPORT_NOT_FOUND" });
    },
  );
  app.get<{ Params: { id: string; subjectId: string } }>(
    "/api/campaigns/:id/individual-reports/:subjectId/pdf",
    async (request, reply) => {
      const report = await repository.getIndividualReportForActor(
        contextOf(request),
        request.params.id,
        request.params.subjectId,
        "download",
      );
      const context = contextOf(request);
      return report
        ? sendPdf(reply, report, {
            actorId: context.userId,
            channel: "individual_report_grant",
            role: context.role,
          })
        : reply.code(404).send({ code: "REPORT_NOT_FOUND" });
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/campaigns/:id/reports",
    async (request) =>
      repository.listReportsForActor(contextOf(request), request.params.id),
  );
  app.get("/api/reports", async (request) =>
    repository.listReportsForActor(contextOf(request)),
  );
  app.get<{ Params: { id: string } }>(
    "/api/campaigns/:id/actions",
    async (request, reply) => {
      const context = requireAdmin(request, reply);
      return context
        ? repository.listActionPlanItems(context.tenantId, request.params.id)
        : undefined;
    },
  );
  app.get("/api/actions", async (request, reply) => {
    const context = requireAdmin(request, reply);
    return context
      ? repository.listTenantActionPlanItems(context.tenantId)
      : undefined;
  });
  app.get<{ Params: { id: string } }>(
    "/api/actions/:id/check-ins",
    async (request, reply) => {
      const context = requireAdmin(request, reply);
      if (!context) return;
      const checkIns = await repository.listActionCheckIns(
        context.tenantId,
        request.params.id,
      );
      return checkIns ?? reply.code(404).send({ code: "ACTION_NOT_FOUND" });
    },
  );
  app.patch<{
    Params: { id: string };
    Body: { status: "planned" | "active" | "completed" | "cancelled" };
  }>("/api/actions/:id/status", async (request, reply) => {
    const context = requireAdmin(request, reply);
    if (!context) return;
    if (
      !["planned", "active", "completed", "cancelled"].includes(
        request.body?.status,
      )
    )
      return reply.code(400).send({ code: "INVALID_ACTION_STATUS" });
    try {
      const action = await repository.transitionActionPlanItem(
        context.tenantId,
        request.params.id,
        request.body.status,
        context.userId,
      );
      return action ?? reply.code(404).send({ code: "ACTION_NOT_FOUND" });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("INVALID_ACTION_TRANSITION")
      )
        return reply.code(409).send({ code: error.message });
      throw error;
    }
  });
  app.patch<{
    Params: { id: string; milestoneId: string };
    Body: { status: "pending" | "completed" };
  }>(
    "/api/actions/:id/milestones/:milestoneId/status",
    async (request, reply) => {
      const context = requireAdmin(request, reply);
      if (!context) return;
      if (!["pending", "completed"].includes(request.body?.status))
        return reply.code(400).send({ code: "INVALID_MILESTONE_STATUS" });
      try {
        const action = await repository.transitionActionMilestone(
          context.tenantId,
          request.params.id,
          request.params.milestoneId,
          request.body.status,
          context.userId,
        );
        return action ?? reply.code(404).send({ code: "ACTION_NOT_FOUND" });
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.startsWith("ACTION_MILESTONE_NOT_EDITABLE") ||
            error.message === "ACTION_MILESTONE_NOT_FOUND")
        )
          return reply.code(409).send({ code: error.message });
        throw error;
      }
    },
  );
  app.patch<{
    Params: { id: string };
    Body: { progressPercent: number; latestUpdate: string };
  }>("/api/actions/:id/progress", async (request, reply) => {
    const context = requireAdmin(request, reply);
    if (!context) return;
    if (
      !Number.isInteger(request.body?.progressPercent) ||
      request.body.progressPercent < 0 ||
      request.body.progressPercent > 100 ||
      !request.body.latestUpdate?.trim() ||
      request.body.latestUpdate.trim().length > 2_000
    )
      return reply.code(400).send({ code: "INVALID_ACTION_PROGRESS" });
    try {
      const action = await repository.updateActionPlanProgress(
        context.tenantId,
        request.params.id,
        request.body.progressPercent,
        request.body.latestUpdate.trim(),
        context.userId,
      );
      return action ?? reply.code(404).send({ code: "ACTION_NOT_FOUND" });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("ACTION_PROGRESS_NOT_EDITABLE")
      )
        return reply.code(409).send({ code: error.message });
      throw error;
    }
  });

  app.setErrorHandler((error, request, reply) => {
    app.log.error({ err: error, errorId: request.id }, "unhandled API error");
    reply.code(500).send({
      code: "INTERNAL_ERROR",
      errorId: request.id,
      message:
        process.env.NODE_ENV === "development" && error instanceof Error
          ? error.message
          : undefined,
    });
  });
  return app;
}
