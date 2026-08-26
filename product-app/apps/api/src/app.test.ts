import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUILTIN_RULE_ARTIFACT_ID,
  BUILTIN_RULE_RELEASE_ID,
  EMPLOYEE_PRIVACY_NOTICE_VERSION,
  EXECUTABLE_RULESET_SHA256,
  HISTORICAL_RULE_ARTIFACT_V06,
  type ProductJob,
} from "@ai-readiness/contracts";
import { questionnaireReleaseContentHash } from "@ai-readiness/application";
import type { FeishuClient } from "@ai-readiness/feishu";
import type { EmailProvider } from "./email.js";
import {
  createSqlClient,
  ProductRepository,
  type SqlClient,
} from "@ai-readiness/database";
import { itemIdsForTarget } from "@ai-readiness/domain";
import { buildApp } from "./app.js";
import {
  createSessionToken,
  hashSessionToken,
  sessionCookieName,
} from "./auth.js";
import { signInvite } from "./invites.js";

let db: SqlClient;
let app: Awaited<ReturnType<typeof buildApp>>;
const privacyConsent = {
  privacyNoticeVersion: EMPLOYEE_PRIVACY_NOTICE_VERSION,
  consentedAt: new Date(Date.now() - 1_000).toISOString(),
};
const testIsoSeconds = (timestamp: number) => {
  const date = new Date(timestamp);
  date.setMilliseconds(0);
  return date.toISOString();
};
const TEST_ACTIVE_STARTS_AT = testIsoSeconds(Date.now() - 86_400_000);
const TEST_ACTIVE_CLOSES_AT = testIsoSeconds(Date.now() + 30 * 86_400_000);
const TEST_UPDATED_STARTS_AT = testIsoSeconds(Date.now() - 43_200_000);
const TEST_UPDATED_CLOSES_AT = testIsoSeconds(Date.now() + 31 * 86_400_000);
const TEST_EXTENDED_CLOSES_AT = testIsoSeconds(Date.now() + 35 * 86_400_000);
const TEST_SHORTENED_CLOSES_AT = testIsoSeconds(Date.now() + 34 * 86_400_000);

beforeEach(async () => {
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = "test-secret-at-least-thirty-two-characters";
  process.env.DATA_LINK_SECRET =
    "stable-data-link-secret-at-least-thirty-two";
  process.env.INVITE_SECRET = "invite-secret-at-least-thirty-two-characters";
  process.env.INTERNAL_WORKER_SECRET = "worker-test-secret-at-least-32-chars";
  db = await createSqlClient("pglite://:memory:");
  app = await buildApp(db);
});
afterEach(async () => {
  await app.close();
  await db.close();
  delete process.env.AUTH_MODE;
  delete process.env.EMAIL_BOOTSTRAP_ADMIN_EMAILS;
  delete process.env.EMAIL_BOOTSTRAP_TENANT_ID;
  delete process.env.PLATFORM_ADMIN_EMAILS;
});

async function restartWithEmailAuth(environment: Record<string, string> = {}) {
  await app.close();
  process.env.AUTH_MODE = "email_otp";
  Object.assign(process.env, environment);
  app = await buildApp(db, { jobQueue: null });
}

async function loginByEmail(
  email: string,
  intent: "personal" | "enterprise" | "platform" = "personal",
  returnTo?: string,
) {
  await db.query("DELETE FROM email_otp_challenges WHERE consumed_at IS NOT NULL");
  const requested = await app.inject({
    method: "POST",
    url: "/api/auth/email/request",
    payload: { email },
  });
  expect(requested.statusCode, requested.body).toBe(202);
  const challenge = requested.json();
  expect(challenge.developmentCode).toMatch(/^[0-9]{6}$/);
  const verified = await app.inject({
    method: "POST",
    url: "/api/auth/email/verify",
    payload: {
      email,
      intent,
      returnTo,
      challengeId: challenge.challengeId,
      code: challenge.developmentCode,
    },
  });
  return {
    response: verified,
    cookie: String(verified.headers["set-cookie"] ?? "").split(";")[0],
  };
}

async function createOrganizationAsPlatformAdmin(
  email: string,
  organizationName: string,
) {
  const platform = await loginByEmail(email, "platform");
  expect(platform.response.statusCode, platform.response.body).toBe(200);
  const created = await app.inject({
    method: "POST",
    url: "/api/platform/organizations",
    headers: { cookie: platform.cookie },
    payload: { organizationName },
  });
  expect(created.statusCode, created.body).toBe(201);
  const switched = await app.inject({
    method: "POST",
    url: "/api/session/context",
    headers: { cookie: platform.cookie },
    payload: {
      kind: "organization",
      organizationId: created.json().organizationId,
    },
  });
  expect(switched.statusCode, switched.body).toBe(200);
  return {
    organization: created.json(),
    platformCookie: platform.cookie,
    organizationCookie: String(switched.headers["set-cookie"] ?? "").split(
      ";",
    )[0]!,
  };
}

async function configureOrganizationProfile(cookie: string) {
  const configured = await app.inject({
    method: "PUT",
    url: "/api/research/profile",
    headers: { cookie },
    payload: {
      country: "CN",
      headquartersProvince: "上海市",
      industryRaw: "软件和信息技术服务业",
      industryStandardCode: "I",
      industryMappingVersion: "GB/T 4754—2017",
      headcount: 120,
      aiStage: "local_exploration",
      aiStartDuration: "under_6m",
      questionnaireLanguage: "zh-CN",
      primaryWorkLanguage: "zh-CN",
    },
  });
  expect(configured.statusCode, configured.body).toBe(200);
}

describe("formal product API vertical slice", () => {
  it("routes platform administrators to client organizations and protects workspace switching", async () => {
    const ownerEmail = "multi-role.owner@example.com";
    await restartWithEmailAuth({
      PLATFORM_ADMIN_EMAILS: ownerEmail,
    });

    const personal = await loginByEmail(ownerEmail, "personal");
    expect(personal.response.statusCode, personal.response.body).toBe(200);
    expect(personal.response.json().nextPath).toBe("/app/personal");
    const personalSession = await app.inject({
      method: "GET",
      url: "/api/session",
      headers: { cookie: personal.cookie },
    });
    expect(personalSession.json()).toMatchObject({
      activeWorkspace: { kind: "personal", organizationId: null },
      organizations: [],
      platformRoles: ["platform_admin"],
    });

    const enterprise = await loginByEmail(ownerEmail, "enterprise");
    expect(enterprise.response.statusCode, enterprise.response.body).toBe(200);
    expect(enterprise.response.json().nextPath).toBe("/platform");
    const enterpriseSession = await app.inject({
      method: "GET",
      url: "/api/session",
      headers: { cookie: enterprise.cookie },
    });
    expect(enterpriseSession.json()).toMatchObject({
      activeWorkspace: { kind: "platform", organizationId: null },
      platformRoles: ["platform_admin"],
    });

    const denied = await app.inject({
      method: "POST",
      url: "/api/session/context",
      headers: { cookie: personal.cookie },
      payload: { kind: "organization", organizationId: "tenant-not-mine" },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().code).toBe("WORKSPACE_ACCESS_REQUIRED");

    const first = await app.inject({
      method: "POST",
      url: "/api/platform/organizations",
      headers: { cookie: enterprise.cookie },
      payload: { organizationName: "第一家客户企业" },
    });
    expect(first.statusCode, first.body).toBe(201);
    const second = await app.inject({
      method: "POST",
      url: "/api/platform/organizations",
      headers: { cookie: enterprise.cookie },
      payload: { organizationName: "第二家客户企业" },
    });
    expect(second.statusCode, second.body).toBe(201);
    const refreshed = await app.inject({
      method: "GET",
      url: "/api/session",
      headers: { cookie: enterprise.cookie },
    });
    expect(refreshed.json().organizations).toHaveLength(2);
    expect(refreshed.json().organizations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ organizationName: "第一家客户企业", role: "owner" }),
        expect.objectContaining({ organizationName: "第二家客户企业", role: "owner" }),
      ]),
    );
  });

  it("lets only a platform administrator create a real enterprise workspace", async () => {
    const platformEmail = "platform.owner@example.com";
    await restartWithEmailAuth({ PLATFORM_ADMIN_EMAILS: platformEmail });
    const applicant = await loginByEmail("enterprise.applicant@example.com", "enterprise");
    expect(applicant.response.statusCode, applicant.response.body).toBe(200);
    expect(applicant.response.json().nextPath).toBe("/enterprise/no-access");

    const legacyCreate = await app.inject({
      method: "POST",
      url: "/api/organization/workspace",
      headers: { cookie: applicant.cookie },
      payload: { name: "不得自助创建" },
    });
    expect(legacyCreate.statusCode).toBe(403);
    expect(legacyCreate.json().code).toBe("ENTERPRISE_APPROVAL_REQUIRED");

    const ordinaryCreate = await app.inject({
      method: "POST",
      url: "/api/platform/organizations",
      headers: { cookie: applicant.cookie },
      payload: { organizationName: "普通用户不得创建" },
    });
    expect(ordinaryCreate.statusCode).toBe(403);

    const platform = await loginByEmail(platformEmail, "platform");
    expect(platform.response.statusCode, platform.response.body).toBe(200);
    expect(platform.response.json().nextPath).toBe("/platform");
    const created = await app.inject({
      method: "POST",
      url: "/api/platform/organizations",
      headers: { cookie: platform.cookie },
      payload: { organizationName: "真实客户企业" },
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json()).toMatchObject({
      organizationName: "真实客户企业",
      role: "owner",
      status: "active",
    });
    const duplicate = await app.inject({
      method: "POST",
      url: "/api/platform/organizations",
      headers: { cookie: platform.cookie },
      payload: { organizationName: "真实客户企业" },
    });
    expect(duplicate.statusCode).toBe(409);

    const switched = await app.inject({
      method: "POST",
      url: "/api/session/context",
      headers: { cookie: platform.cookie },
      payload: { kind: "organization", organizationId: created.json().organizationId },
    });
    const organizationCookie = String(switched.headers["set-cookie"] ?? "").split(";")[0];
    const draft = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      headers: { cookie: organizationCookie },
      payload: {
        name: "资料未完成的活动",
        target: "personal",
        mode: "identified",
        startsAt: TEST_ACTIVE_STARTS_AT,
        closesAt: TEST_ACTIVE_CLOSES_AT,
      },
    });
    expect(draft.statusCode, draft.body).toBe(201);
    const publish = await app.inject({
      method: "POST",
      url: `/api/campaigns/${draft.json().id}/status`,
      headers: { cookie: organizationCookie },
      payload: { status: "active" },
    });
    expect(publish.statusCode).toBe(409);
    expect(publish.json().code).toBe(
      "ORGANIZATION_PROFILE_REQUIRED_BEFORE_PUBLISH",
    );
  });

  it("keeps personal background answers optional and appends research consent decisions", async () => {
    await restartWithEmailAuth();
    const login = await loginByEmail("research-choice@example.com", "personal");
    expect(login.response.statusCode, login.response.body).toBe(200);
    const baseProfile = {
      workCity: "prefer_not_to_say",
      province: "prefer_not_to_say",
      industryCode: "prefer_not_to_say",
      companySizeBand: "prefer_not_to_say",
      jobFamily: "prefer_not_to_say",
      careerStage: "prefer_not_to_say",
      peopleManager: null,
      tenureBand: "prefer_not_to_say",
      noticeVersion: "personal_research_notice_v0.1",
    };
    const declined = await app.inject({
      method: "PUT",
      url: "/api/personal/research-profile",
      headers: { cookie: login.cookie },
      payload: { ...baseProfile, researchConsent: false, consentedAt: null },
    });
    expect(declined.statusCode, declined.body).toBe(200);
    expect(declined.json()).toMatchObject({
      workCity: "prefer_not_to_say",
      province: "prefer_not_to_say",
      researchConsent: false,
    });
    const authorized = await app.inject({
      method: "PUT",
      url: "/api/personal/research-profile",
      headers: { cookie: login.cookie },
      payload: {
        ...baseProfile,
        researchConsent: true,
        consentedAt: new Date().toISOString(),
      },
    });
    expect(authorized.statusCode, authorized.body).toBe(200);
    const decisions = await db.query<{ status: string }>(
      "SELECT status FROM personal_research_consent_records",
    );
    expect(decisions.rows.map((row) => row.status).sort()).toEqual([
      "authorized",
      "declined",
    ]);
    const entry = await app.inject({
      method: "POST",
      url: "/api/personal/open-entry",
      headers: { cookie: login.cookie },
      payload: { assessmentProfileId: "personal_iv_v0.1" },
    });
    expect(entry.statusCode, entry.body).toBe(200);
  });

  it("aggregates only the signed-in account's personal reports across workspaces", async () => {
    const email = "cross-workspace.reports@example.com";
    await restartWithEmailAuth({
      PLATFORM_ADMIN_EMAILS: email,
    });
    const personalLogin = await loginByEmail(email, "personal");
    const personalEntry = await app.inject({
      method: "POST",
      url: "/api/personal/open-entry",
      headers: { cookie: personalLogin.cookie },
      payload: { assessmentProfileId: "personal_iv_v0.1" },
    });
    expect(personalEntry.statusCode, personalEntry.body).toBe(200);
    const personalUrl = new URL(personalEntry.json().url);
    const personalToken = new URLSearchParams(personalUrl.hash.slice(1)).get(
      "token",
    );
    const personalSubmission = await app.inject({
      method: "POST",
      url: `/public/campaigns/${personalEntry.json().campaign.id}/submissions`,
      headers: { cookie: personalLogin.cookie },
      payload: {
        token: personalToken,
        answers: Object.fromEntries(
          itemIdsForTarget("personal").map((id) => [id, 4]),
        ),
        backgroundAnswers: { BG01: "3", BG02: "3", BG03: "3" },
        ...privacyConsent,
      },
    });
    expect(personalSubmission.statusCode, personalSubmission.body).toBe(201);

    const managed = await createOrganizationAsPlatformAdmin(
      email,
      "跨工作区报告企业",
    );
    const enterpriseLogin = { cookie: managed.organizationCookie };
    await configureOrganizationProfile(enterpriseLogin.cookie);
    const campaign = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      headers: { cookie: enterpriseLogin.cookie },
      payload: {
        name: "企业中的本人报告",
        target: "personal",
        mode: "identified",
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        closesAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    expect(campaign.statusCode, campaign.body).toBe(201);
    const published = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.json().id}/status`,
      headers: { cookie: enterpriseLogin.cookie },
      payload: { status: "active" },
    });
    expect(published.statusCode, published.body).toBe(200);
    const enterpriseSession = await app.inject({
      method: "GET",
      url: "/api/session",
      headers: { cookie: enterpriseLogin.cookie },
    });
    const identity = await db.query<{ identity_hash: string }>(
      "SELECT identity_hash FROM account_identities WHERE account_id=$1 AND identity_type='email'",
      [enterpriseSession.json().account.id],
    );
    const participantId = `email:${identity.rows[0]!.identity_hash.slice(0, 32)}`;
    const enterpriseInvite = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.json().id}/invites`,
      headers: { cookie: enterpriseLogin.cookie },
      payload: { participantId },
    });
    expect(enterpriseInvite.statusCode, enterpriseInvite.body).toBe(200);
    await new ProductRepository(db).recordInvitationDelivery({
      tenantId: managed.organization.organizationId,
      campaignId: campaign.json().id,
      externalSubjectId: participantId,
      identityHash: identity.rows[0]!.identity_hash,
      provider: "email",
      tokenFingerprint: "cross-workspace-test-fingerprint",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      messageId: "cross-workspace-test-message",
    });
    const enterpriseSubmission = await app.inject({
      method: "POST",
      url: `/public/campaigns/${campaign.json().id}/submissions`,
      headers: { cookie: enterpriseLogin.cookie },
      payload: {
        token: enterpriseInvite.json().token,
        answers: Object.fromEntries(
          itemIdsForTarget("personal").map((id) => [id, 3]),
        ),
        ...privacyConsent,
      },
    });
    expect(enterpriseSubmission.statusCode, enterpriseSubmission.body).toBe(201);

    for (const cookie of [personalLogin.cookie, enterpriseLogin.cookie]) {
      const reports = await app.inject({
        method: "GET",
        url: "/api/my-reports",
        headers: { cookie },
      });
      expect(reports.statusCode).toBe(200);
      expect(
        reports.json().map((item: any) => item.report.id),
      ).toEqual(
        expect.arrayContaining([
          personalSubmission.json().report.id,
          enterpriseSubmission.json().report.id,
        ]),
      );
      expect(
        reports
          .json()
          .find(
            (item: any) =>
              item.report.id === enterpriseSubmission.json().report.id,
          ),
      ).toMatchObject({
        workspaceKind: "organization",
        organizationId: managed.organization.organizationId,
        organizationName: "跨工作区报告企业",
      });
      const detail = await app.inject({
        method: "GET",
        url: `/api/my-reports/${enterpriseSubmission.json().report.id}`,
        headers: { cookie },
      });
      expect(detail.statusCode, detail.body).toBe(200);
    }

    const outsider = await loginByEmail("report.outsider@example.com", "personal");
    const denied = await app.inject({
      method: "GET",
      url: `/api/my-reports/${enterpriseSubmission.json().report.id}`,
      headers: { cookie: outsider.cookie },
    });
    expect(denied.statusCode).toBe(404);
  });

  it("prioritizes an email invitation over the generic personal login destination", async () => {
    const ownerEmail = "invitation.owner@example.com";
    await app.close();
    process.env.AUTH_MODE = "email_otp";
    process.env.PLATFORM_ADMIN_EMAILS = ownerEmail;
    const emailProvider: EmailProvider = {
      async sendOtp(input) {
        return { providerMessageId: `otp-${input.challengeId}` };
      },
      async sendInvitation() {
        return { providerMessageId: "invitation-message" };
      },
      async sendReminder() {
        return { providerMessageId: "reminder-message" };
      },
      async sendReportReady() {
        return { providerMessageId: "report-message" };
      },
    };
    app = await buildApp(db, { email: emailProvider, jobQueue: null });
    const managed = await createOrganizationAsPlatformAdmin(
      ownerEmail,
      "邀请流程企业",
    );
    const owner = { cookie: managed.organizationCookie };
    await configureOrganizationProfile(owner.cookie);
    const campaign = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      headers: { cookie: owner.cookie },
      payload: {
        name: "邮箱邀请优先级",
        target: "personal",
        mode: "identified",
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        closesAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.json().id}/status`,
      headers: { cookie: owner.cookie },
      payload: { status: "active" },
    });
    const invitedEmail = "invited.employee@example.com";
    const sent = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.json().id}/email-invitations`,
      headers: { cookie: owner.cookie },
      payload: {
        emails: [invitedEmail],
        subject: "请完成测评",
        body: "这是本次企业测评邀请。",
        buttonLabel: "开始填写",
      },
    });
    expect(sent.statusCode, sent.body).toBe(201);
    const surveyPath = `/survey/${campaign.json().id}`;
    const invited = await loginByEmail(invitedEmail, "personal", surveyPath);
    expect(invited.response.statusCode, invited.response.body).toBe(200);
    expect(invited.response.json().nextPath).toBe(surveyPath);
    const session = await app.inject({
      method: "GET",
      url: "/api/session",
      headers: { cookie: invited.cookie },
    });
    expect(session.json()).toMatchObject({
      activeWorkspace: {
        kind: "organization",
        organizationId: managed.organization.organizationId,
      },
      user: { role: "employee" },
    });
  });
  it("rotates an outdated public personal campaign before serving the questionnaire", async () => {
    const repository = new ProductRepository(db);
    const outdated = await repository.latestOpenPersonalCampaign("tenant-personal");
    expect(outdated).toBeTruthy();
    const previousVersions = {
      ...outdated!.versions,
      expressionVersion: "fixed_v0.3",
      reportTemplateVersion: "v0.3",
    };
    await db.query(
      "UPDATE campaigns SET versions=$2::jsonb WHERE id=$1",
      [outdated!.id, JSON.stringify(previousVersions)],
    );

    await app.close();
    app = await buildApp(db);

    const replacement = await repository.latestOpenPersonalCampaign("tenant-personal");
    expect(replacement).toBeTruthy();
    expect(replacement!.id).not.toBe(outdated!.id);
    expect(replacement!.versions).toMatchObject({
      expressionVersion: "fixed_v0.9.3",
      profileNarrativeVersion: "profile_narrative_v0.4",
      reportTemplateVersion: "v0.9.3",
    });
    const retired = await repository.getCampaign("tenant-personal", outdated!.id);
    expect(retired?.status).toBe("closed");

    const token = signInvite({
      campaignId: replacement!.id,
      participantId: "dev-hr",
      expiresAt: Date.now() + 60_000,
    });
    const questionnaire = await app.inject({
      method: "GET",
      url: `/public/campaigns/${replacement!.id}?token=${encodeURIComponent(token)}`,
    });
    expect(questionnaire.statusCode, questionnaire.body).toBe(200);
    expect(questionnaire.json().items).toHaveLength(26);

    const audit = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
       WHERE object_id=$1 AND action='campaign.public_personal_ruleset_retired'`,
      [outdated!.id],
    );
    expect(Number(audit.rows[0]?.count ?? 0)).toBe(1);
  });

  it("rotates a public personal campaign when its frozen questionnaire belongs to an older ruleset", async () => {
    const repository = new ProductRepository(db);
    const current = await repository.latestOpenPersonalCampaign(
      "tenant-personal",
      "personal_iv_v0.1",
    );
    expect(current).toBeTruthy();
    const release = await repository.getQuestionnaireRelease(
      "tenant-personal",
      current!.id,
    );
    expect(release).toBeTruthy();
    const historicalRelease = {
      ...release!,
      versions: HISTORICAL_RULE_ARTIFACT_V06.versions,
      ruleManifestHash: HISTORICAL_RULE_ARTIFACT_V06.manifestHash,
    } as any;
    historicalRelease.contentHash = questionnaireReleaseContentHash(
      historicalRelease,
    );
    await db.query(
      `UPDATE questionnaire_releases SET snapshot=$2::jsonb,content_hash=$3,
       rule_release_id='rule-release-v0.6',rule_release_artifact_id='rule-artifact-v0.6'
       WHERE campaign_id=$1`,
      [
        current!.id,
        JSON.stringify(historicalRelease),
        historicalRelease.contentHash,
      ],
    );

    await app.close();
    app = await buildApp(db);

    const replacement = await repository.latestOpenPersonalCampaign(
      "tenant-personal",
      "personal_iv_v0.1",
    );
    expect(replacement).toBeTruthy();
    expect(replacement!.id).not.toBe(current!.id);
    expect((await repository.getCampaign("tenant-personal", current!.id))?.status).toBe(
      "closed",
    );
    const replacementRelease = await repository.getQuestionnaireRelease(
      "tenant-personal",
      replacement!.id,
    );
    expect(replacementRelease).toMatchObject({
      versions: { reportTemplateVersion: "v0.9.3" },
      ruleManifestHash: EXECUTABLE_RULESET_SHA256,
    });
  });

  it("completes the public email profile, consent and research snapshot flow", async () => {
    await app.close();
    process.env.AUTH_MODE = "email_otp";
    let latestCode = "";
    const sendReportReady = vi.fn(async () => ({
      providerMessageId: "test-report",
    }));
    const email: EmailProvider = {
      async sendOtp(input) {
        latestCode = input.code;
        return { providerMessageId: `test-${input.challengeId}` };
      },
      async sendInvitation() { return { providerMessageId: "test-invite" }; },
      async sendReminder() { return { providerMessageId: "test-reminder" }; },
      sendReportReady,
    };
    app = await buildApp(db, { email, jobQueue: null });
    try {
      const requested = await app.inject({
        method: "POST",
        url: "/api/auth/email/request",
        payload: { email: "public.research@example.com" },
      });
      expect(requested.statusCode).toBe(202);
      expect(latestCode).toMatch(/^[0-9]{6}$/);
      const verified = await app.inject({
        method: "POST",
        url: "/api/auth/email/verify",
        payload: {
          email: "public.research@example.com",
          challengeId: requested.json().challengeId,
          code: latestCode,
          returnTo: "/personal/start",
        },
      });
      expect(verified.statusCode).toBe(200);
      const cookie = String(verified.headers["set-cookie"]).split(";")[0];
      const profileInput = {
        workCity: "上海市",
        province: "上海市",
        industryCode: "internet",
        companySizeBand: "200—499",
        jobFamily: "engineering_data_research",
        careerStage: "experienced_ic",
        peopleManager: false,
        tenureBand: "3_to_5y",
        researchConsent: true,
        noticeVersion: "personal_research_notice_v0.1",
        consentedAt: new Date().toISOString(),
      };
      const profile = await app.inject({
        method: "PUT",
        url: "/api/personal/research-profile",
        headers: { cookie },
        payload: profileInput,
      });
      expect(profile.statusCode).toBe(200);
      expect(profile.json()).toMatchObject({
        ...profileInput,
        consentedAt: expect.any(String),
      });
      const entry = await app.inject({
        method: "POST",
        url: "/api/personal/open-entry",
        headers: { cookie },
        payload: { assessmentProfileId: "personal_iv_v0.1" },
      });
      expect(entry.statusCode).toBe(200);
      const entryCookie = String(entry.headers["set-cookie"] ?? cookie).split(";")[0];
      const entryUrl = new URL(entry.json().url);
      const token = new URLSearchParams(entryUrl.hash.slice(1)).get("token");
      expect(token).toBeTruthy();
      const answers = Object.fromEntries(
        itemIdsForTarget("personal").map((id) => [id, 4]),
      );
      const submitted = await app.inject({
        method: "POST",
        url: `/public/campaigns/${entry.json().campaign.id}/submissions`,
        headers: { cookie: entryCookie },
        payload: {
          token,
          answers,
          backgroundAnswers: { BG01: "3", BG02: "3", BG03: "3" },
          ...privacyConsent,
        },
      });
      expect(submitted.statusCode, submitted.body).toBe(201);
      expect(sendReportReady).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "public.research@example.com",
          reportUrl: expect.stringContaining(
            `/my-reports/${submitted.json().report.id}`,
          ),
        }),
      );
      expect(submitted.json().report.versions).toMatchObject({
        expressionVersion: expect.stringMatching(/^fixed_v0\.9\./),
        profileNarrativeVersion: expect.stringMatching(/^profile_narrative_v0\./),
        reportTemplateVersion: expect.stringMatching(/^v0\.9\./),
      });
      expect(submitted.json().report.profileNarrative).toMatchObject({
        version: expect.stringMatching(/^profile_narrative_v0\./),
        paragraphs: expect.arrayContaining([
          expect.objectContaining({ kind: "integrated_state", evidenceIds: expect.any(Array) }),
          expect.objectContaining({ kind: "working_chain", evidenceIds: expect.any(Array) }),
          expect.objectContaining({ kind: "breakpoint_impact", evidenceIds: expect.any(Array) }),
          expect.objectContaining({ kind: "next_priority", evidenceIds: expect.any(Array) }),
        ]),
        boundaryNotice: expect.objectContaining({ kind: "boundary", evidenceIds: expect.any(Array) }),
      });
      expect(submitted.json().report.recommendations.length).toBeGreaterThanOrEqual(3);
      expect(submitted.json().report.recommendations.length).toBeLessThanOrEqual(5);
      expect(submitted.json().report.recommendations.every((entry: any) =>
        ["validate", "scale"].includes(entry.actionMode) && typeof entry.selectionReason === "string",
      )).toBe(true);
      const snapshot = await db.query<any>(
        "SELECT profile_snapshot,research_eligible,eligibility_reason_codes FROM personal_research_snapshots WHERE response_id=$1",
        [submitted.json().submissionId],
      );
      expect(snapshot.rows).toHaveLength(1);
      expect(snapshot.rows[0]).toMatchObject({
        research_eligible: true,
        eligibility_reason_codes: [],
      });

      const observerEntry = await app.inject({
        method: "POST",
        url: "/api/personal/open-entry",
        headers: { cookie: entryCookie },
        payload: { assessmentProfileId: "personal_iov_observer_v0.1" },
      });
      expect(observerEntry.statusCode, observerEntry.body).toBe(200);
      expect(observerEntry.json().campaign).toMatchObject({
        assessmentProfileId: "personal_iov_observer_v0.1",
        questionnairePackageId: "combined_iov_v0.1",
        target: "combined",
      });
      const observerUrl = new URL(observerEntry.json().url);
      const observerToken = new URLSearchParams(observerUrl.hash.slice(1)).get(
        "token",
      );
      const observerQuestionnaire = await app.inject({
        method: "GET",
        url: `/public/campaigns/${observerEntry.json().campaign.id}?token=${encodeURIComponent(observerToken!)}`,
        headers: { cookie: entryCookie },
      });
      expect(observerQuestionnaire.statusCode, observerQuestionnaire.body).toBe(
        200,
      );
      expect(observerQuestionnaire.json().items).toHaveLength(42);
      const observerSubmitted = await app.inject({
        method: "POST",
        url: `/public/campaigns/${observerEntry.json().campaign.id}/submissions`,
        headers: { cookie: entryCookie },
        payload: {
          token: observerToken,
          answers: Object.fromEntries(
            itemIdsForTarget("combined").map((id) => [id, 4]),
          ),
          backgroundAnswers: { BG01: "3", BG02: "3", BG03: "3" },
          ...privacyConsent,
        },
      });
      expect(observerSubmitted.statusCode, observerSubmitted.body).toBe(201);
      expect(observerSubmitted.json().report).toMatchObject({
        reportType: "personal_observer",
        evidenceBasis: "individual_self_assessment",
      });
      expect(observerSubmitted.json().report.evidenceBoundary).toContain(
        "不是公司正式诊断",
      );
      const observerRecommendations = observerSubmitted.json().report.recommendations;
      expect(observerRecommendations.filter((entry: any) => entry.dimensionId.startsWith("A"))).toHaveLength(3);
      expect(observerRecommendations.filter((entry: any) => entry.dimensionId.startsWith("B"))).toHaveLength(0);
      for (const entry of observerRecommendations.filter((item: any) => item.dimensionId.startsWith("B"))) {
        expect(entry.title).toContain("与团队核实");
        expect(entry.selectionReason).toContain("个人观察");
        expect(entry.action).toContain("共同核实");
      }
      const organizationReports = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM report_snapshots
         WHERE campaign_id=$1 AND report_type IN ('organization','organization_scoped')`,
        [observerEntry.json().campaign.id],
      );
      expect(Number(organizationReports.rows[0]?.count ?? 0)).toBe(0);
      expect(snapshot.rows[0].profile_snapshot).toMatchObject({
        industryCode: "internet",
        jobFamily: "engineering_data_research",
      });
      const reports = await app.inject({
        method: "GET",
        url: "/api/my-reports",
        headers: { cookie: entryCookie },
      });
      expect(reports.statusCode).toBe(200);
      expect(reports.json().some((item: any) => item.report.id === submitted.json().report.id)).toBe(true);
    } finally {
      delete process.env.AUTH_MODE;
    }
  });

  it("exposes operational metrics only to the internal worker credential", async () => {
    const denied = await app.inject({ method: "GET", url: "/internal/metrics" });
    expect(denied.statusCode).toBe(401);
    const metrics = await app.inject({
      method: "GET",
      url: "/internal/metrics",
      headers: {
        "x-worker-secret": process.env.INTERNAL_WORKER_SECRET!,
      },
    });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.headers["content-type"]).toContain("text/plain");
    expect(metrics.body).toContain("ai_readiness_api_requests_total");
    expect(metrics.body).toContain("ai_readiness_api_errors_total");
    expect(metrics.body).not.toContain(process.env.INTERNAL_WORKER_SECRET!);
  });

  it("keeps report lookup and submission deduplication stable across session-secret rotation", async () => {
    const campaign = (
      await app.inject({
        method: "POST",
        url: "/api/campaigns",
        payload: {
          name: "Session密钥轮换验证",
          target: "personal",
          mode: "identified",
          startsAt: TEST_ACTIVE_STARTS_AT,
          closesAt: TEST_ACTIVE_CLOSES_AT,
        },
      })
    ).json();
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/status`,
      payload: { status: "active" },
    });
    const token = signInvite({
      campaignId: campaign.id,
      participantId: "dev-hr",
      expiresAt: Date.now() + 60_000,
    });
    const answers = Object.fromEntries(
      itemIdsForTarget("personal").map((id) => [id, 4]),
    );
    const first = await app.inject({
      method: "POST",
      url: `/public/campaigns/${campaign.id}/submissions`,
      payload: { token, answers, ...privacyConsent },
    });
    expect(first.statusCode).toBe(201);

    await app.close();
    process.env.SESSION_SECRET =
      "rotated-session-secret-at-least-thirty-two-characters";
    app = await buildApp(db);

    const reports = await app.inject({ method: "GET", url: "/api/my-reports" });
    expect(reports.statusCode).toBe(200);
    expect(reports.json().some((entry: any) => entry.report.id === first.json().report.id)).toBe(true);
    const repeated = await app.inject({
      method: "POST",
      url: `/public/campaigns/${campaign.id}/submissions`,
      payload: { token, answers, ...privacyConsent },
    });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json()).toMatchObject({
      deduplicated: true,
      submissionId: first.json().submissionId,
    });
  });

  it("rejects privacy-unsafe or malformed enterprise supplement questions", async () => {
    const anonymousText = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      payload: {
        name: "匿名文字题应被拒绝",
        target: "personal",
        mode: "anonymous",
        startsAt: TEST_ACTIVE_STARTS_AT,
        closesAt: TEST_ACTIVE_CLOSES_AT,
        customItems: [
          {
            id: "cq",
            type: "short_text",
            text: "请填写建议",
            required: false,
            options: [],
          },
        ],
      },
    });
    expect(anonymousText.statusCode).toBe(400);
    expect(anonymousText.json().code).toBe("INVALID_CUSTOM_ITEMS");

    const tooManyRequired = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      payload: {
        name: "必答题过多应被拒绝",
        target: "personal",
        mode: "identified",
        startsAt: TEST_ACTIVE_STARTS_AT,
        closesAt: TEST_ACTIVE_CLOSES_AT,
        customItems: [1, 2, 3].map((number) => ({
          id: `cq-${number}`,
          type: "single_choice",
          text: `问题${number}`,
          required: true,
          options: [
            { value: "yes", label: "是" },
            { value: "no", label: "否" },
          ],
        })),
      },
    });
    expect(tooManyRequired.statusCode).toBe(400);
    expect(tooManyRequired.json().code).toBe("INVALID_CUSTOM_ITEMS");
  });

  it("edits and deletes drafts but preserves published activities", async () => {
    const created = (
      await app.inject({
        method: "POST",
        url: "/api/campaigns",
        payload: {
          name: "待编辑草稿",
          target: "combined",
          mode: "anonymous",
          startsAt: TEST_ACTIVE_STARTS_AT,
          closesAt: TEST_ACTIVE_CLOSES_AT,
        },
      })
    ).json();
    const updated = await app.inject({
      method: "PUT",
      url: `/api/campaigns/${created.id}`,
      payload: {
        name: "已编辑草稿",
        target: "personal",
        organizationMethod: "workforce_survey",
        mode: "identified",
        startsAt: TEST_UPDATED_STARTS_AT,
        closesAt: TEST_UPDATED_CLOSES_AT,
        backgroundItemIds: ["BG03"],
        invitedCount: 12,
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      name: "已编辑草稿",
      target: "personal",
      mode: "identified",
      backgroundItemIds: ["BG03"],
      invitedCount: 12,
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/campaigns/${created.id}/status`,
          payload: { status: "active" },
        })
      ).statusCode,
    ).toBe(200);
    const extended = await app.inject({
      method: "PATCH",
      url: `/api/campaigns/${created.id}/deadline`,
      payload: {
        newClosesAt: TEST_EXTENDED_CLOSES_AT,
        reason: "两个团队的轮班安排导致原填写窗口不足",
      },
    });
    expect(extended.statusCode).toBe(200);
    expect(extended.json().campaign.closesAt).toBe(
      TEST_EXTENDED_CLOSES_AT,
    );
    expect(extended.json().amendment).toMatchObject({
      sequence: 1,
      previousClosesAt: TEST_UPDATED_CLOSES_AT,
      newClosesAt: TEST_EXTENDED_CLOSES_AT,
    });
    const cannotShorten = await app.inject({
      method: "PATCH",
      url: `/api/campaigns/${created.id}/deadline`,
      payload: {
        newClosesAt: TEST_SHORTENED_CLOSES_AT,
        reason: "尝试缩短",
      },
    });
    expect(cannotShorten.statusCode).toBe(409);
    expect(cannotShorten.json().code).toBe("CAMPAIGN_DEADLINE_MUST_EXTEND");
    const amendmentHistory = await app.inject({
      method: "GET",
      url: `/api/campaigns/${created.id}/schedule-amendments`,
    });
    expect(amendmentHistory.statusCode).toBe(200);
    expect(amendmentHistory.json()).toHaveLength(1);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/api/campaigns/${created.id}`,
          payload: updated.json(),
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/campaigns/${created.id}`,
        })
      ).statusCode,
    ).toBe(409);
    const disposable = (
      await app.inject({
        method: "POST",
        url: "/api/campaigns",
        payload: {
          name: "可删除草稿",
          target: "personal",
          mode: "anonymous",
          startsAt: TEST_ACTIVE_STARTS_AT,
          closesAt: TEST_ACTIVE_CLOSES_AT,
        },
      })
    ).json();
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/campaigns/${disposable.id}`,
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/campaigns/${disposable.id}`,
        })
      ).statusCode,
    ).toBe(404);
  });

  it("creates, publishes, answers and returns a full personal report", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      payload: {
        name: "端到端测试",
        target: "combined",
        organizationMethod: "workforce_survey",
        mode: "identified",
        startsAt: TEST_ACTIVE_STARTS_AT,
        closesAt: TEST_ACTIVE_CLOSES_AT,
        invitedCount: 10,
        customItems: [
          {
            id: "client-id-is-normalized",
            type: "single_choice",
            text: "你最希望公司优先改善哪一项支持？",
            required: true,
            options: [
              { value: "tool", label: "工具" },
              { value: "training", label: "培训" },
            ],
          },
          {
            id: "another-client-id",
            type: "multiple_choice",
            text: "你希望获得哪些帮助？",
            required: false,
            options: [
              { value: "case", label: "案例" },
              { value: "coach", label: "辅导" },
            ],
          },
          {
            id: "text-client-id",
            type: "short_text",
            text: "还有什么建议？",
            required: false,
            options: [],
          },
        ],
      },
    });
    expect(created.statusCode).toBe(201);
    const campaign = created.json();
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/campaigns/${campaign.id}/status`,
          payload: { status: "active" },
        })
      ).statusCode,
    ).toBe(200);
    const inviteResponse = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/invites`,
      payload: { participantId: "dev-hr" },
    });
    const invite = inviteResponse.json();
    const inviteClaims = JSON.parse(
      Buffer.from(String(invite.token).split(".")[0]!, "base64url").toString(
        "utf8",
      ),
    );
    expect(inviteClaims.expiresAt).toBe(
      new Date(campaign.closesAt).getTime() + 90 * 86_400_000,
    );
    const publicCampaign = await app.inject({
      method: "GET",
      url: `/public/campaigns/${campaign.id}?token=${encodeURIComponent(invite.token)}`,
    });
    expect(publicCampaign.statusCode).toBe(200);
    expect(publicCampaign.json().items).toHaveLength(42);
    expect(publicCampaign.json().customItems).toMatchObject([
      { id: "CQ01", type: "single_choice", required: true },
      { id: "CQ02", type: "multiple_choice", required: false },
      { id: "CQ03", type: "short_text", required: false },
    ]);
    expect(publicCampaign.json().privacyNotice).toMatchObject({
      version: EMPLOYEE_PRIVACY_NOTICE_VERSION,
      mode: "identified",
      title: "实名测评与可见范围",
    });
    expect(publicCampaign.json().questionnaireReleaseId).toBeTruthy();
    expect(publicCampaign.json().questionnaireContentHash).toMatch(/^[a-f0-9]{64}$/);
    const repository = new ProductRepository(db);
    const release = await repository.getQuestionnaireRelease(
      "tenant-demo",
      campaign.id,
    );
    expect(release?.contentHash).toBe(
      publicCampaign.json().questionnaireContentHash,
    );
    await expect(
      repository.saveQuestionnaireRelease({
        ...release!,
        contentHash: "0".repeat(64),
      }),
    ).rejects.toThrow("QUESTIONNAIRE_RELEASE_IMMUTABLE");
    const tamperedRelease = structuredClone(release!);
    tamperedRelease.items[0]!.text = "被篡改的题目";
    await db.query(
      "UPDATE questionnaire_releases SET snapshot=$3::jsonb WHERE tenant_id=$1 AND campaign_id=$2",
      ["tenant-demo", campaign.id, JSON.stringify(tamperedRelease)],
    );
    const blockedTamperedQuestionnaire = await app.inject({
      method: "GET",
      url: `/public/campaigns/${campaign.id}?token=${encodeURIComponent(invite.token)}`,
    });
    expect(blockedTamperedQuestionnaire.statusCode).toBe(409);
    expect(blockedTamperedQuestionnaire.json().code).toBe(
      "CAMPAIGN_RULESET_UNAVAILABLE",
    );
    await db.query(
      "UPDATE questionnaire_releases SET snapshot=$3::jsonb WHERE tenant_id=$1 AND campaign_id=$2",
      ["tenant-demo", campaign.id, JSON.stringify(release)],
    );
    const answers = Object.fromEntries(
      itemIdsForTarget("combined").map((id) => [id, 5]),
    );
    const withoutConsent = await app.inject({
      method: "POST",
      url: `/public/campaigns/${campaign.id}/submissions`,
      payload: { token: invite.token, answers },
    });
    expect(withoutConsent.statusCode).toBe(400);
    expect(withoutConsent.json().code).toBe(
      "PRIVACY_NOTICE_CONSENT_REQUIRED",
    );
    const submitted = await app.inject({
      method: "POST",
      url: `/public/campaigns/${campaign.id}/submissions`,
      payload: {
        ...privacyConsent,
        token: invite.token,
        answers,
        customAnswers: {
          CQ01: "tool",
          CQ02: ["case", "coach"],
          CQ03: "希望增加真实业务示例。",
        },
      },
    });
    expect(submitted.statusCode).toBe(201);
    const result = submitted.json();
    expect(result.score.classificationId).toBe("FRONTIER");
    expect(result.report.reportType).toBe("immediate_personal");
    expect(result.report.overallProfile).toHaveLength(4);
    expect(result.report.resultNarrative).toContain("两条轴需要分别理解");
    expect(result.report.classificationNarrative).toContain("前沿");
    const automaticPublication = await db.query<any>(
      "SELECT status,reviewed_by,reviewed_at,published_by,published_at FROM report_publications WHERE report_snapshot_id=$1 AND audience='employee'",
      [result.report.id],
    );
    expect(automaticPublication.rows[0]).toMatchObject({
      status: "published",
      reviewed_by: "system",
      published_by: "system",
    });
    expect(automaticPublication.rows[0].reviewed_at).toBeTruthy();
    expect(automaticPublication.rows[0].published_at).toBeTruthy();
    const immutableLineage = await db.query<any>(
      `SELECT r.assessment_input_snapshot_id,r.rule_release_id,r.rule_release_artifact_id,
       s.assessment_input_snapshot_id AS score_input_id,
       sr.status AS scoring_status,ai.content_hash AS input_content_hash,
       ra.retention_status
       FROM report_snapshots r
       JOIN score_snapshots s ON s.response_id=r.response_id
       JOIN scoring_runs sr ON sr.score_snapshot_id=s.id
       JOIN assessment_input_snapshots ai ON ai.id=r.assessment_input_snapshot_id
       JOIN rule_release_artifacts ra ON ra.id=r.rule_release_artifact_id
       WHERE r.id=$1`,
      [result.report.id],
    );
    expect(immutableLineage.rows[0]).toMatchObject({
      rule_release_id: BUILTIN_RULE_RELEASE_ID,
      rule_release_artifact_id: BUILTIN_RULE_ARTIFACT_ID,
      scoring_status: "succeeded",
      retention_status: "retained",
    });
    expect(immutableLineage.rows[0].assessment_input_snapshot_id).toBe(
      immutableLineage.rows[0].score_input_id,
    );
    expect(immutableLineage.rows[0].input_content_hash).toMatch(/^[a-f0-9]{64}$/);
    const automaticPublicationAudit = await db.query<any>(
      "SELECT action FROM audit_events WHERE object_id=$1 AND action IN ('report.reviewed','report.published') ORDER BY created_at,action",
      [result.report.id],
    );
    expect(automaticPublicationAudit.rows.map((row) => row.action).sort()).toEqual([
      "report.published",
      "report.reviewed",
    ]);
    const storedSubmission = await db.query<any>(
      "SELECT custom_answers FROM response_submissions WHERE id=$1",
      [result.submissionId],
    );
    expect(storedSubmission.rows[0].custom_answers).toEqual({
      CQ01: "tool",
      CQ02: ["case", "coach"],
      CQ03: "希望增加真实业务示例。",
    });
    const customResults = await app.inject({
      method: "GET",
      url: `/api/campaigns/${campaign.id}/custom-results`,
    });
    expect(customResults.statusCode).toBe(200);
    expect(customResults.json().items[0]).toMatchObject({
      id: "CQ01",
      responseCount: 1,
      optionCounts: [
        { value: "tool", label: "工具", count: 1 },
        { value: "training", label: "培训", count: 0 },
      ],
    });
    expect(customResults.json().items[2].textResponses[0]).toMatchObject({
      participantName: "本地测试管理员",
      text: "希望增加真实业务示例。",
    });
    expect(
      (
        await db.query<any>(
          "SELECT count(*)::int AS count FROM audit_events WHERE object_id=$1 AND action='custom_text_answers.viewed'",
          [campaign.id],
        )
      ).rows[0].count,
    ).toBe(1);
    const repeated = await app.inject({
      method: "POST",
      url: `/public/campaigns/${campaign.id}/submissions`,
      payload: {
        ...privacyConsent,
        token: invite.token,
        answers: Object.fromEntries(
          itemIdsForTarget("combined").map((id) => [id, 1]),
        ),
        customAnswers: { CQ01: "training" },
      },
    });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json()).toMatchObject({
      submissionId: result.submissionId,
      deduplicated: true,
      score: { classificationId: "FRONTIER" },
      report: { id: result.report.id },
    });
    expect(repeated.json().reportAccessToken).toBeTruthy();
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/public/reports/${result.report.id}?access_token=${encodeURIComponent(repeated.json().reportAccessToken)}`,
        })
      ).statusCode,
    ).toBe(200);
    const fetched = await app.inject({
      method: "GET",
      url: `/public/reports/${result.report.id}?access_token=${encodeURIComponent(result.reportAccessToken)}`,
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().contentHash).toBe(result.report.contentHash);
    const foundAcrossDevices = await app.inject({
      method: "GET",
      url: "/api/my-reports",
    });
    expect(foundAcrossDevices.statusCode).toBe(200);
    expect(foundAcrossDevices.json()[0].report.id).toBe(result.report.id);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/my-reports/${result.report.id}`,
        })
      ).statusCode,
    ).toBe(200);
    const wrongGrantChannel = await app.inject({
      method: "POST",
      url: `/api/reports/${result.report.id}/grants`,
      payload: { granteeUserId: "user-hr-demo", operations: ["view"] },
    });
    expect(wrongGrantChannel.statusCode).toBe(400);
    expect(wrongGrantChannel.json().code).toBe(
      "USE_INDIVIDUAL_REPORT_GRANT_FOR_PERSONAL_REPORTS",
    );
    const individualGrant = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/individual-report-grants`,
      payload: {
        granteeUserId: "user-hr-demo",
        operations: ["view", "download"],
        expiresAt: "2027-08-10T00:00:00.000Z",
      },
    });
    expect(individualGrant.statusCode).toBe(201);
    expect(individualGrant.json()).toMatchObject({
      campaignId: campaign.id,
      granteeDisplayName: "本地测试管理员",
      operations: ["view", "download"],
    });
    const individualReports = await app.inject({
      method: "GET",
      url: `/api/campaigns/${campaign.id}/individual-reports`,
    });
    expect(individualReports.statusCode).toBe(200);
    expect(individualReports.json()[0]).toMatchObject({
      reportId: result.report.id,
      externalSubjectId: "dev-hr",
      subjectDisplayName: "本地测试管理员",
    });
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/campaigns/${campaign.id}/individual-reports/dev-hr`,
        })
      ).json().id,
    ).toBe(result.report.id);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/individual-report-grants/${individualGrant.json().id}`,
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/campaigns/${campaign.id}/individual-reports/dev-hr`,
        })
      ).statusCode,
    ).toBe(404);
  });

  it("persists trackable authenticated and anonymous data deletion requests", async () => {
    await app.close();
    const queued: ProductJob[] = [];
    app = await buildApp(db, {
      jobQueue: {
        async add(job) {
          queued.push(job);
          return `job-${queued.length}`;
        },
        async close() {},
      },
    });
    const campaign = (
      await app.inject({
        method: "POST",
        url: "/api/campaigns",
        payload: {
          name: "数据权利验收",
          target: "personal",
          mode: "identified",
          startsAt: TEST_ACTIVE_STARTS_AT,
          closesAt: TEST_ACTIVE_CLOSES_AT,
        },
      })
    ).json();
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/status`,
      payload: { status: "active" },
    });
    const invite = (
      await app.inject({
        method: "POST",
        url: `/api/campaigns/${campaign.id}/invites`,
        payload: { participantId: "dev-hr" },
      })
    ).json();
    const submission = (
      await app.inject({
        method: "POST",
        url: `/public/campaigns/${campaign.id}/submissions`,
        payload: {
          ...privacyConsent,
          token: invite.token,
          answers: Object.fromEntries(
            itemIdsForTarget("personal").map((id) => [id, 4]),
          ),
        },
      })
    ).json();
    const authenticated = await app.inject({
      method: "POST",
      url: "/api/privacy/my-data-deletion",
      payload: {
        confirmation: "DELETE_MY_DATA",
        reason: "员工主动申请",
      },
    });
    expect(authenticated.statusCode).toBe(202);
    expect(authenticated.json()).toMatchObject({
      status: "queued",
      requesterKind: "authenticated_subject",
      subjectCount: 1,
    });
    expect(
      (await app.inject({ method: "GET", url: "/api/privacy/my-data-deletion" })).json(),
    ).toMatchObject({ id: authenticated.json().id, status: "queued" });
    const anonymous = await app.inject({
      method: "POST",
      url: `/public/reports/${submission.report.id}/data-deletion`,
      payload: {
        accessToken: submission.reportAccessToken,
        confirmation: "DELETE_MY_DATA",
      },
    });
    expect(anonymous.statusCode).toBe(202);
    expect(anonymous.json()).toMatchObject({
      status: "queued",
      requesterKind: "anonymous_report_holder",
    });
    const publicStatus = await app.inject({
      method: "GET",
      url: `/public/data-deletions/${anonymous.json().id}?status_token=${encodeURIComponent(anonymous.json().statusToken)}`,
    });
    expect(publicStatus.statusCode).toBe(200);
    expect(publicStatus.json()).toMatchObject({
      id: anonymous.json().id,
      status: "queued",
    });
    const deletionJobs = queued.filter(
      (job) => job.name === "delete-subject-data",
    );
    expect(deletionJobs).toHaveLength(2);
    expect(
      deletionJobs.every((job) => Boolean(job.data.requestId)),
    ).toBe(true);
  });

  it("blocks publication when an immutable report snapshot was tampered", async () => {
    const campaign = (
      await app.inject({
        method: "POST",
        url: "/api/campaigns",
        payload: {
          name: "快照完整性验收",
          target: "personal",
          mode: "identified",
          startsAt: TEST_ACTIVE_STARTS_AT,
          closesAt: TEST_ACTIVE_CLOSES_AT,
        },
      })
    ).json();
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/status`,
      payload: { status: "active" },
    });
    const invite = (
      await app.inject({
        method: "POST",
        url: `/api/campaigns/${campaign.id}/invites`,
        payload: { participantId: "tamper-test" },
      })
    ).json();
    const report = (
      await app.inject({
        method: "POST",
        url: `/public/campaigns/${campaign.id}/submissions`,
        payload: {
          ...privacyConsent,
          token: invite.token,
          answers: Object.fromEntries(
            itemIdsForTarget("personal").map((id) => [id, 4]),
          ),
        },
      })
    ).json().report;
    await db.query(
      `UPDATE report_snapshots
       SET snapshot=snapshot || '{"headline":"已被篡改"}'::jsonb
       WHERE id=$1`,
      [report.id],
    );
    const publication = await app.inject({
      method: "POST",
      url: `/api/reports/${report.id}/publications`,
      payload: { audience: "organization" },
    });
    expect(publication.statusCode).toBe(409);
    expect(publication.json().code).toBe(
      "REPORT_SNAPSHOT_INTEGRITY_MISMATCH",
    );
  });

  it("publishes a directional organization benchmark from two answers and creates two second-stage reports", async () => {
    const repository = new ProductRepository(db);
    await repository.saveDirectorySync(
      "tenant-demo",
      "0",
      Array.from({ length: 2 }, (_, index) => ({
        openId: index === 0 ? "dev-hr" : `participant-${index}`,
        name: `测试员工${index + 1}`,
        departmentIds: ["od-product"],
        active: true,
      })),
      [
        {
          openDepartmentId: "od-product",
          name: "产品研发部",
        },
      ],
    );
    const directory = await app.inject({
      method: "GET",
      url: "/api/directory",
    });
    expect(directory.statusCode).toBe(200);
    expect(directory.json()).toMatchObject({
      subjects: expect.arrayContaining([
        expect.objectContaining({
          externalSubjectId: "dev-hr",
          displayName: "测试员工1",
          departmentIds: ["od-product"],
        }),
      ]),
      departments: [
        expect.objectContaining({
          externalDepartmentId: "od-product",
          name: "产品研发部",
        }),
      ],
    });
    const campaign = (
      await app.inject({
        method: "POST",
        url: "/api/campaigns",
        payload: {
          name: "二阶段报告验收",
          target: "combined",
          organizationMethod: "workforce_survey",
          mode: "identified",
          startsAt: TEST_ACTIVE_STARTS_AT,
          closesAt: TEST_ACTIVE_CLOSES_AT,
          invitedCount: 2,
        },
      })
    ).json();
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/status`,
      payload: { status: "active" },
    });
    const frozenCampaign = (
      await app.inject({
        method: "GET",
        url: `/api/campaigns/${campaign.id}`,
      })
    ).json();
    expect(frozenCampaign.invitedCount).toBe(2);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/campaigns/${campaign.id}/invites`,
          payload: { participantId: "outside-frozen-scope" },
        })
      ).statusCode,
    ).toBe(403);
    const answers = Object.fromEntries(
      itemIdsForTarget("combined").map((id) => [id, 5]),
    );
    for (let index = 0; index < 2; index += 1) {
      const participantId = index === 0 ? "dev-hr" : `participant-${index}`;
      const invite = (
        await app.inject({
          method: "POST",
          url: `/api/campaigns/${campaign.id}/invites`,
          payload: { participantId },
        })
      ).json();
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/public/campaigns/${campaign.id}/submissions`,
            payload: { ...privacyConsent, token: invite.token, answers },
          })
        ).statusCode,
      ).toBe(201);
    }
    const closed = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/status`,
      payload: { status: "closed" },
    });
    const organizationReport = closed.json().organizationReport;
    expect(organizationReport.organizationBenchmark).toMatchObject({
      sampleSize: 2,
      sampleStatus: "directional",
      metrics: { employeeAiCapability: 100 },
      classificationDistribution: {
        FRONTIER: { count: 2, percentage: 100 },
      },
      departments: [
        {
          departmentId: "od-product",
          label: "产品研发部",
          sampleSize: 2,
          sampleStatus: "directional",
          classificationId: "FRONTIER",
        },
      ],
    });
    const publication = await app.inject({
      method: "POST",
      url: `/api/reports/${organizationReport.id}/publications`,
      payload: { audience: "organization" },
    });
    expect(publication.statusCode).toBe(201);
    expect(publication.json()).toMatchObject({
      status: "published",
      reviewedBy: "user-hr-demo",
      publishedBy: "user-hr-demo",
      supersededAt: null,
    });
    expect(publication.json().secondStageReports).toBe(2);
    const employeePublication = await app.inject({
      method: "POST",
      url: `/api/reports/${organizationReport.id}/publications`,
      payload: { audience: "employee" },
    });
    expect(employeePublication.statusCode).toBe(201);
    expect(employeePublication.json().secondStageReports).toBe(0);
    expect(employeePublication.json().employeeOrganizationSummaries).toBe(2);
    const repeatedEmployeePublication = await app.inject({
      method: "POST",
      url: `/api/reports/${organizationReport.id}/publications`,
      payload: { audience: "employee" },
    });
    expect(repeatedEmployeePublication.statusCode).toBe(200);
    expect(repeatedEmployeePublication.json()).toMatchObject({
      deduplicated: true,
      secondStageReports: 0,
      employeeOrganizationSummaries: 0,
    });
    const generatedPersonalReports = await db.query<{
      report_type: string;
      count: string;
    }>(
      `SELECT report_type,count(*)::text AS count FROM report_snapshots
       WHERE campaign_id=$1 AND report_type IN ('second_stage_personal','employee_organization_summary')
       GROUP BY report_type ORDER BY report_type`,
      [campaign.id],
    );
    expect(generatedPersonalReports.rows).toEqual([
      { report_type: "employee_organization_summary", count: "2" },
      { report_type: "second_stage_personal", count: "2" },
    ]);
    const automaticDownstreamPublications = await db.query<any>(
      `SELECT count(*)::int AS count,
       count(*) FILTER (WHERE p.status='published' AND p.reviewed_at IS NOT NULL)::int AS complete
       FROM report_publications p JOIN report_snapshots r ON r.id=p.report_snapshot_id
       WHERE r.campaign_id=$1 AND r.report_type IN ('second_stage_personal','employee_organization_summary')`,
      [campaign.id],
    );
    expect(automaticDownstreamPublications.rows[0]).toEqual({
      count: 4,
      complete: 4,
    });
    const organizationLifecycleAudit = await db.query<any>(
      "SELECT action,count(*)::int AS count FROM audit_events WHERE object_id=$1 AND action IN ('report.reviewed','report.published') GROUP BY action ORDER BY action",
      [organizationReport.id],
    );
    expect(organizationLifecycleAudit.rows).toEqual([
      { action: "report.published", count: 2 },
      { action: "report.reviewed", count: 2 },
    ]);
    const myReports = (
      await app.inject({ method: "GET", url: "/api/my-reports" })
    ).json();
    expect(
      myReports.some(
        (entry: any) =>
          entry.report.reportType === "second_stage_personal" &&
          entry.report.organizationBenchmark.sampleSize === 2,
      ),
    ).toBe(true);
    const employeeSummary = myReports.find(
      (entry: any) =>
        entry.report.reportType === "employee_organization_summary",
    );
    expect(employeeSummary.report.organizationBenchmark.departments).toEqual(
      [],
    );
    expect(employeeSummary.report.sampleSize).toBe(2);
  });

  it("keeps anonymous identity out of the response domain and deduplicates repeated submit", async () => {
    const campaign = (
      await app.inject({
        method: "POST",
        url: "/api/campaigns",
        payload: {
          name: "匿名测试",
          target: "personal",
          mode: "anonymous",
          startsAt: TEST_ACTIVE_STARTS_AT,
          closesAt: TEST_ACTIVE_CLOSES_AT,
        },
      })
    ).json();
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/status`,
      payload: { status: "active" },
    });
    const invite = (
      await app.inject({
        method: "POST",
        url: `/api/campaigns/${campaign.id}/invites`,
        payload: { participantId: "sensitive-person" },
      })
    ).json();
    const anonymousRepository = new ProductRepository(db);
    await anonymousRepository.recordInvitationDelivery({
      tenantId: "tenant-demo",
      campaignId: campaign.id,
      externalSubjectId: "sensitive-person",
      tokenFingerprint: "anonymous-token-fingerprint",
      expiresAt: "2026-11-20T00:00:00.000Z",
      messageId: "om_anonymous_invite",
    });
    const answers = Object.fromEntries(
      itemIdsForTarget("personal").map((id) => [id, 3]),
    );
    const first = await app.inject({
      method: "POST",
      url: `/public/campaigns/${campaign.id}/submissions`,
      payload: { ...privacyConsent, token: invite.token, answers },
    });
    expect(first.statusCode).toBe(201);
    const stored = await db.query<{ participant_ref: string | null }>(
      "SELECT participant_ref FROM response_submissions WHERE campaign_id=$1",
      [campaign.id],
    );
    expect(stored.rows[0]?.participant_ref).toBeNull();
    const completionIsolation = await db.query<any>(
      `SELECT i.completed,cr.status,cr.receipt_hash,cr.queued_batch,
       cr.eligible_after,cr.processed_batch
       FROM invitations i JOIN completion_receipts cr ON cr.invitation_id=i.id
       WHERE i.campaign_id=$1`,
      [campaign.id],
    );
    expect(completionIsolation.rows[0]).toMatchObject({
      completed: false,
      status: "queued",
      processed_batch: null,
    });
    expect(completionIsolation.rows[0].receipt_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/campaigns/${campaign.id}/reports`,
        })
      ).json(),
    ).toHaveLength(0);
    const repeated = await app.inject({
      method: "POST",
      url: `/public/campaigns/${campaign.id}/submissions`,
      payload: { ...privacyConsent, token: invite.token, answers },
    });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json()).toMatchObject({
      submissionId: first.json().submissionId,
      deduplicated: true,
    });
    expect(
      (
        await db.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM response_submissions WHERE campaign_id=$1",
          [campaign.id],
        )
      ).rows[0]?.count,
    ).toBe("1");
    expect(
      (
        await db.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM completion_receipts WHERE campaign_id=$1",
          [campaign.id],
        )
      ).rows[0]?.count,
    ).toBe("1");
  });

  it("returns one immutable result when the same participant submits concurrently", async () => {
    const campaign = (
      await app.inject({
        method: "POST",
        url: "/api/campaigns",
        payload: {
          name: "并发提交测试",
          target: "personal",
          mode: "identified",
          startsAt: TEST_ACTIVE_STARTS_AT,
          closesAt: TEST_ACTIVE_CLOSES_AT,
        },
      })
    ).json();
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/status`,
      payload: { status: "active" },
    });
    const invite = (
      await app.inject({
        method: "POST",
        url: `/api/campaigns/${campaign.id}/invites`,
        payload: { participantId: "concurrent-user" },
      })
    ).json();
    const answers = Object.fromEntries(
      itemIdsForTarget("personal").map((id) => [id, 4]),
    );
    const results = await Promise.all(
      [0, 1].map(() =>
        app.inject({
          method: "POST",
          url: `/public/campaigns/${campaign.id}/submissions`,
          payload: { ...privacyConsent, token: invite.token, answers },
        }),
      ),
    );
    expect(results.map((result) => result.statusCode).sort()).toEqual([
      200, 201,
    ]);
    expect(new Set(results.map((result) => result.json().submissionId)).size).toBe(
      1,
    );
    expect(results.some((result) => result.json().deduplicated === true)).toBe(
      true,
    );
  });

  it("publishes employee summaries for a workforce organization-only assessment", async () => {
    const campaignResponse = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      payload: {
        name: "组织专项摘要验收",
        target: "organization",
        organizationMethod: "workforce_survey",
        mode: "identified",
        startsAt: TEST_ACTIVE_STARTS_AT,
        closesAt: TEST_ACTIVE_CLOSES_AT,
        invitedCount: 7,
      },
    });
    expect(campaignResponse.statusCode).toBe(201);
    const campaign = campaignResponse.json();
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/status`,
      payload: { status: "active" },
    });
    const answers = Object.fromEntries(
      itemIdsForTarget("organization").map((id) => [id, 4]),
    );
    for (let index = 0; index < 7; index += 1) {
      const participantId = index === 0 ? "dev-hr" : `org-only-${index}`;
      const invite = (
        await app.inject({
          method: "POST",
          url: `/api/campaigns/${campaign.id}/invites`,
          payload: { participantId },
        })
      ).json();
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/public/campaigns/${campaign.id}/submissions`,
            payload: { ...privacyConsent, token: invite.token, answers },
          })
        ).statusCode,
      ).toBe(201);
    }
    const report = (
      await app.inject({
        method: "POST",
        url: `/api/campaigns/${campaign.id}/status`,
        payload: { status: "closed" },
      })
    ).json().organizationReport;
    expect(report.reportType).toBe("organization_scoped");
    const publication = await app.inject({
      method: "POST",
      url: `/api/reports/${report.id}/publications`,
      payload: { audience: "employee" },
    });
    expect(publication.statusCode).toBe(201);
    expect(publication.json()).toMatchObject({
      secondStageReports: 0,
      employeeOrganizationSummaries: 7,
    });
  });

  it("requires an identified designated assessor for manager self-assessment", async () => {
    for (const payload of [
      {
        name: "匿名管理者自评",
        target: "organization",
        organizationMethod: "single_manager_self_assessment",
        mode: "anonymous",
        designatedAssessorExternalId: "manager-001",
      },
      {
        name: "未指定管理者",
        target: "organization",
        organizationMethod: "single_manager_self_assessment",
        mode: "identified",
      },
      {
        name: "组合包管理者自评",
        target: "combined",
        organizationMethod: "single_manager_self_assessment",
        mode: "identified",
        designatedAssessorExternalId: "manager-001",
      },
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/campaigns",
        payload: {
          ...payload,
          startsAt: TEST_ACTIVE_STARTS_AT,
          closesAt: TEST_ACTIVE_CLOSES_AT,
          invitedCount: 1,
        },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("INVALID_ORGANIZATION_METHOD");
    }
  });

  it("links a compatible closed baseline and reports descriptive retest change", async () => {
    const runManagerAssessment = async (
      name: string,
      answer: number,
      baselineCampaignId?: string,
    ) => {
      const campaignResponse = await app.inject({
        method: "POST",
        url: "/api/campaigns",
        payload: {
          name,
          target: "organization",
          organizationMethod: "single_manager_self_assessment",
          mode: "identified",
          startsAt: TEST_ACTIVE_STARTS_AT,
          closesAt: TEST_ACTIVE_CLOSES_AT,
          invitedCount: 1,
          baselineCampaignId,
          designatedAssessorExternalId: "dev-hr",
        },
      });
      expect(campaignResponse.statusCode).toBe(201);
      const campaign = campaignResponse.json();
      await app.inject({
        method: "POST",
        url: `/api/campaigns/${campaign.id}/status`,
        payload: { status: "active" },
      });
      const invite = (
        await app.inject({
          method: "POST",
          url: `/api/campaigns/${campaign.id}/invites`,
          payload: { participantId: "dev-hr" },
        })
      ).json();
      await app.inject({
        method: "POST",
        url: `/public/campaigns/${campaign.id}/submissions`,
        payload: {
          ...privacyConsent,
          token: invite.token,
          answers: Object.fromEntries(
            itemIdsForTarget("organization").map((id) => [id, answer]),
          ),
        },
      });
      const closed = await app.inject({
        method: "POST",
        url: `/api/campaigns/${campaign.id}/status`,
        payload: { status: "closed" },
      });
      expect(closed.statusCode).toBe(200);
      return { campaign, report: closed.json().organizationReport };
    };
    const baseline = await runManagerAssessment("复测基线", 1);
    const differentManagerBaseline = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      payload: {
        name: "不同管理者复测",
        target: "organization",
        organizationMethod: "single_manager_self_assessment",
        mode: "identified",
        startsAt: TEST_ACTIVE_STARTS_AT,
        closesAt: TEST_ACTIVE_CLOSES_AT,
        invitedCount: 1,
        designatedAssessorExternalId: "manager-002",
        baselineCampaignId: baseline.campaign.id,
      },
    });
    expect(differentManagerBaseline.statusCode).toBe(400);
    expect(differentManagerBaseline.json().code).toBe(
      "INVALID_BASELINE_CAMPAIGN",
    );
    const retest = await runManagerAssessment(
      "第一次复测",
      5,
      baseline.campaign.id,
    );
    expect(retest.report.retestComparison).toMatchObject({
      baselineCampaignId: baseline.campaign.id,
      baselineReportId: baseline.report.id,
      baselineSampleSize: 1,
      currentSampleSize: 1,
      metrics: {
        employeeAiCapability: null,
        organizationalAiReadiness: 100,
      },
    });
    expect(retest.report.retestComparison.caveat).toContain("不能据此认定");
  });

  it("generates a one-person manager self-assessment report on close", async () => {
    const campaign = (
      await app.inject({
        method: "POST",
        url: "/api/campaigns",
        payload: {
          name: "管理者自评",
          target: "organization",
          organizationMethod: "single_manager_self_assessment",
          mode: "identified",
          startsAt: TEST_ACTIVE_STARTS_AT,
          closesAt: TEST_ACTIVE_CLOSES_AT,
          invitedCount: 1,
          designatedAssessorExternalId: "manager-001",
        },
      })
    ).json();
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/status`,
      payload: { status: "active" },
    });
    const wrongInvite = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/invites`,
      payload: { participantId: "manager-002" },
    });
    expect(wrongInvite.statusCode).toBe(403);
    expect(wrongInvite.json().code).toBe("NOT_DESIGNATED_ASSESSOR");
    const invite = (
      await app.inject({
        method: "POST",
        url: `/api/campaigns/${campaign.id}/invites`,
        payload: { participantId: "manager-001" },
      })
    ).json();
    const answers = Object.fromEntries(
      itemIdsForTarget("organization").map((id) => [id, 4]),
    );
    const submitted = await app.inject({
      method: "POST",
      url: `/public/campaigns/${campaign.id}/submissions`,
      payload: { ...privacyConsent, token: invite.token, answers },
    });
    expect(submitted.statusCode).toBe(201);
    expect(submitted.json().report).toBeNull();
    const closed = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/status`,
      payload: { status: "closed" },
    });
    expect(closed.statusCode).toBe(200);
    expect(closed.json().organizationReport.reportType).toBe(
      "manager_self_assessment",
    );
    expect(closed.json().organizationReport.sampleSize).toBe(1);
    const report = closed.json().organizationReport;
    expect(report.evidenceBasis).toBe("single_manager_self_assessment");
    expect(report.evidenceBoundary).toContain("不代表员工共识");
    expect(report.overallProfile.join(" ")).toContain("较成熟的组织支持条件");
    expect(report.overallProfile.join(" ")).not.toContain("从你的观察看");
    expect(report.overallProfile.join(" ")).not.toContain("员工群体普遍");
    expect(report.recommendations[0]).toMatchObject({
      suggestedLead: "指定管理者 / HR",
      suggestedWindow: "1—2周",
    });
    expect(report.recommendations[0].title).toContain("先核查");
    const draftRecommendation = report.recommendations[0];
    const actionBeforePublication = await app.inject({
      method: "POST",
      url: `/api/reports/${report.id}/actions`,
      payload: {
        recommendationId: draftRecommendation.id,
        title: draftRecommendation.title,
        owner: "业务负责人",
        startsAt: "2026-08-11",
        dueAt: "2026-09-10",
        successMetric: draftRecommendation.successSignal,
        resources: "每周2小时试点时间",
        milestones: [{ title: "首轮复盘", dueAt: "2026-09-01" }],
        retestAt: "2026-11-09",
      },
    });
    expect(actionBeforePublication.statusCode).toBe(400);
    expect(actionBeforePublication.json().code).toBe(
      "REPORT_NOT_PUBLISHED_FOR_ACTION",
    );
    const forbiddenEmployeePublication = await app.inject({
      method: "POST",
      url: `/api/reports/${report.id}/publications`,
      payload: { audience: "employee" },
    });
    expect(forbiddenEmployeePublication.statusCode).toBe(400);
    expect(forbiddenEmployeePublication.json().code).toBe(
      "MANAGER_SELF_ASSESSMENT_EMPLOYEE_PUBLICATION_FORBIDDEN",
    );
    const publication = await app.inject({
      method: "POST",
      url: `/api/reports/${report.id}/publications`,
      payload: { audience: "organization" },
    });
    expect(publication.statusCode).toBe(201);
    expect(
      (
        await app.inject({ method: "GET", url: `/api/reports/${report.id}` })
      ).json().status,
    ).toBe("published");
    const recommendation = report.recommendations[0];
    const actionPayload = {
        recommendationId: recommendation.id,
        title: recommendation.title,
        owner: "业务负责人",
        startsAt: "2026-08-11",
        dueAt: "2026-09-10",
        successMetric: recommendation.successSignal,
        resources: "每周2小时试点时间和已批准的AI工具",
        milestones: [
          { title: "完成首轮试运行与复盘", dueAt: "2026-09-01" },
        ],
        retestAt: "2026-11-09",
      };
    const actionAttempts = await Promise.all(
      [0, 1].map(() =>
        app.inject({
          method: "POST",
          url: `/api/reports/${report.id}/actions`,
          payload: actionPayload,
        }),
      ),
    );
    expect(actionAttempts.map((attempt) => attempt.statusCode)).toEqual([
      201, 201,
    ]);
    expect(new Set(actionAttempts.map((attempt) => attempt.json().id)).size).toBe(
      1,
    );
    const action = actionAttempts[0]!;
    expect(action.statusCode).toBe(201);
    expect(action.json()).toMatchObject({
      sourceReportId: report.id,
      dimensionId: recommendation.dimensionId,
      resources: "每周2小时试点时间和已批准的AI工具",
      retestAt: "2026-11-09",
      evidenceIds: recommendation.evidenceIds,
    });
    expect(action.json().milestones).toHaveLength(1);
    expect(action.json().riskConditions.join(" ")).toContain("试点验证阶段");
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/campaigns/${campaign.id}/actions`,
        })
      ).json(),
    ).toHaveLength(1);
    const actionId = action.json().id;
    const milestoneId = action.json().milestones[0].id;
    const milestoneCompleted = await app.inject({
      method: "PATCH",
      url: `/api/actions/${actionId}/milestones/${milestoneId}/status`,
      payload: { status: "completed" },
    });
    expect(milestoneCompleted.statusCode).toBe(200);
    expect(milestoneCompleted.json().milestones[0].status).toBe("completed");
    const milestoneReopened = await app.inject({
      method: "PATCH",
      url: `/api/actions/${actionId}/milestones/${milestoneId}/status`,
      payload: { status: "pending" },
    });
    expect(milestoneReopened.statusCode).toBe(200);
    expect(milestoneReopened.json().milestones[0].status).toBe("pending");
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/actions/${actionId}/status`,
          payload: { status: "active" },
        })
      ).json().status,
    ).toBe("active");
    const invalidProgress = await app.inject({
      method: "PATCH",
      url: `/api/actions/${actionId}/progress`,
      payload: { progressPercent: 101, latestUpdate: "超出有效范围" },
    });
    expect(invalidProgress.statusCode).toBe(400);
    const progress = await app.inject({
      method: "PATCH",
      url: `/api/actions/${actionId}/progress`,
      payload: {
        progressPercent: 35,
        latestUpdate: "已完成流程责任人确认，下周开始小范围试运行。",
      },
    });
    expect(progress.statusCode).toBe(200);
    expect(progress.json()).toMatchObject({
      status: "active",
      progressPercent: 35,
      latestUpdate: "已完成流程责任人确认，下周开始小范围试运行。",
    });
    const checkIns = await app.inject({
      method: "GET",
      url: `/api/actions/${actionId}/check-ins`,
    });
    expect(checkIns.statusCode).toBe(200);
    expect(checkIns.json()).toHaveLength(1);
    expect(checkIns.json()[0]).toMatchObject({
      actionPlanItemId: actionId,
      progressPercent: 35,
      note: "已完成流程责任人确认，下周开始小范围试运行。",
    });
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/actions/${actionId}/status`,
          payload: { status: "completed" },
        })
      ).json(),
    ).toMatchObject({ status: "completed", progressPercent: 100 });
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/campaigns/${campaign.id}/actions`,
        })
      ).json()[0].milestones[0].status,
    ).toBe("completed");
    const lockedProgress = await app.inject({
      method: "PATCH",
      url: `/api/actions/${actionId}/progress`,
      payload: { progressPercent: 80, latestUpdate: "尝试修改已完成的行动" },
    });
    expect(lockedProgress.statusCode).toBe(409);
    expect(lockedProgress.json().code).toBe(
      "ACTION_PROGRESS_NOT_EDITABLE:completed",
    );
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/actions/${actionId}/status`,
          payload: { status: "cancelled" },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/reports/${report.id}`,
          headers: { "x-development-role": "manager" },
        })
      ).statusCode,
    ).toBe(404);
    const grant = await app.inject({
      method: "POST",
      url: `/api/reports/${report.id}/grants`,
      payload: { granteeUserId: "user-hr-demo", operations: ["view"] },
    });
    expect(grant.statusCode).toBe(201);
    const grantList = await app.inject({
      method: "GET",
      url: `/api/reports/${report.id}/grants`,
    });
    expect(grantList.statusCode).toBe(200);
    expect(grantList.json()[0]).toMatchObject({
      id: grant.json().id,
      granteeDisplayName: "本地测试管理员",
      operations: ["view"],
      revokedAt: null,
    });
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/reports/${report.id}`,
          headers: { "x-development-role": "manager" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/reports/${report.id}/access`,
          headers: { "x-development-role": "manager" },
        })
      ).json(),
    ).toEqual({ canView: true, canManage: false, canDownload: false });
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/report-grants/${grant.json().id}`,
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/reports/${report.id}`,
          headers: { "x-development-role": "manager" },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/reports/${report.id}/grants`,
        })
      ).json()[0].revokedAt,
    ).toBeTruthy();
  });

  it("enforces role and production authentication boundaries", async () => {
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/campaigns",
          headers: { "x-development-role": "employee" },
        })
      ).statusCode,
    ).toBe(403);
    process.env.NODE_ENV = "production";
    expect(
      (await app.inject({ method: "GET", url: "/api/campaigns" })).statusCode,
    ).toBe(401);
    process.env.NODE_ENV = "test";
  });

  it("prevents an authenticated user from another tenant reading campaign data", async () => {
    const campaign = (
      await app.inject({
        method: "POST",
        url: "/api/campaigns",
        payload: {
          name: "租户一活动",
          target: "personal",
          mode: "identified",
          startsAt: TEST_ACTIVE_STARTS_AT,
          closesAt: TEST_ACTIVE_CLOSES_AT,
        },
      })
    ).json();
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/status`,
      payload: { status: "active" },
    });
    const employeeInvite = signInvite({
      campaignId: campaign.id,
      participantId: "dev-hr",
      expiresAt: Date.now() + 60_000,
    });
    const repository = new ProductRepository(db);
    const other = await repository.upsertExternalIdentity(
      {
        tenantKey: "tenant-other",
        tenantName: "另一家公司",
        openId: "ou_other_owner",
        name: "其他企业管理员",
      },
      { allowTenantBootstrap: true },
    );
    const raw = createSessionToken();
    await repository.createAuthSession(
      other,
      hashSessionToken(raw),
      new Date(Date.now() + 60_000),
    );
    process.env.NODE_ENV = "production";
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/public/campaigns/${campaign.id}?token=${encodeURIComponent(employeeInvite)}`,
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/public/campaigns/${campaign.id}?token=${encodeURIComponent(employeeInvite)}`,
          headers: { cookie: `${sessionCookieName(true)}=${raw}` },
        })
      ).statusCode,
    ).toBe(404);
    const response = await app.inject({
      method: "GET",
      url: `/api/campaigns/${campaign.id}`,
      headers: { cookie: `${sessionCookieName(true)}=${raw}` },
    });
    process.env.NODE_ENV = "test";
    expect(response.statusCode).toBe(404);

    await db.query(
      "INSERT INTO users (id,tenant_id,external_id,display_name,role) VALUES ($1,$2,$3,$4,$5)",
      ["user-wrong-employee", "tenant-demo", "ou_wrong", "错误收件人", "employee"],
    );
    const wrongEmployeeToken = createSessionToken();
    await repository.createAuthSession(
      {
        tenantId: "tenant-demo",
        tenantName: "示例公司",
        userId: "user-wrong-employee",
        userName: "错误收件人",
        role: "employee",
        authentication: "feishu_oauth",
      },
      hashSessionToken(wrongEmployeeToken),
      new Date(Date.now() + 60_000),
    );
    process.env.NODE_ENV = "production";
    const forwarded = await app.inject({
      method: "GET",
      url: `/public/campaigns/${campaign.id}?token=${encodeURIComponent(employeeInvite)}`,
      headers: {
        cookie: `${sessionCookieName(true)}=${wrongEmployeeToken}`,
      },
    });
    process.env.NODE_ENV = "test";
    expect(forwarded.statusCode).toBe(403);
    expect(forwarded.json().code).toBe("INVITE_IDENTITY_MISMATCH");
  });

  it("stores enabled background answers without changing the 42-item score", async () => {
    const campaign = (
      await app.inject({
        method: "POST",
        url: "/api/campaigns",
        payload: {
          name: "背景题测试",
          target: "combined",
          mode: "anonymous",
          startsAt: TEST_ACTIVE_STARTS_AT,
          closesAt: TEST_ACTIVE_CLOSES_AT,
          backgroundItemIds: ["BG01", "BG03"],
        },
      })
    ).json();
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/status`,
      payload: { status: "active" },
    });
    const invite = (
      await app.inject({
        method: "POST",
        url: `/api/campaigns/${campaign.id}/invites`,
        payload: { participantId: "background-001" },
      })
    ).json();
    const answers = Object.fromEntries(
      itemIdsForTarget("combined").map((id) => [id, 4]),
    );
    const missing = await app.inject({
      method: "POST",
      url: `/public/campaigns/${campaign.id}/submissions`,
      payload: {
        ...privacyConsent,
        token: invite.token,
        answers,
        backgroundAnswers: { BG01: "4" },
      },
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().code).toBe("BACKGROUND_ANSWER_PACKAGE_MISMATCH");
    const submitted = await app.inject({
      method: "POST",
      url: `/public/campaigns/${campaign.id}/submissions`,
      payload: {
        ...privacyConsent,
        token: invite.token,
        answers,
        backgroundAnswers: { BG01: "4", BG03: "3" },
      },
    });
    expect(submitted.statusCode).toBe(201);
    expect(submitted.json().score.answers).not.toHaveProperty("BG01");
    const stored = await db.query<{
      background_answers: Record<string, string>;
    }>(
      "SELECT background_answers FROM response_submissions WHERE campaign_id=$1",
      [campaign.id],
    );
    expect(stored.rows[0]?.background_answers).toEqual({
      BG01: "4",
      BG03: "3",
    });
  });

  it("keeps the newest server draft and deletes it after final submission", async () => {
    const campaign = (
      await app.inject({
        method: "POST",
        url: "/api/campaigns",
        payload: {
          name: "跨设备草稿",
          target: "personal",
          mode: "identified",
          startsAt: TEST_ACTIVE_STARTS_AT,
          closesAt: TEST_ACTIVE_CLOSES_AT,
        },
      })
    ).json();
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/status`,
      payload: { status: "active" },
    });
    const invite = (
      await app.inject({
        method: "POST",
        url: `/api/campaigns/${campaign.id}/invites`,
        payload: { participantId: "draft-user" },
      })
    ).json();
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/public/campaigns/${campaign.id}/draft`,
          payload: {
            ...privacyConsent,
            token: invite.token,
            answers: { I01: 4, I02: 5 },
            backgroundAnswers: {},
            clientRevision: 2,
          },
        })
      ).statusCode,
    ).toBe(200);
    await app.inject({
      method: "PUT",
      url: `/public/campaigns/${campaign.id}/draft`,
      payload: {
        ...privacyConsent,
        token: invite.token,
        answers: { I01: 1 },
        backgroundAnswers: {},
        clientRevision: 1,
      },
    });
    const draft = await app.inject({
      method: "GET",
      url: `/public/campaigns/${campaign.id}/draft?token=${encodeURIComponent(invite.token)}`,
    });
    expect(draft.json().clientRevision).toBe(2);
    expect(draft.json().answers).toEqual({ I01: 4, I02: 5 });
    const answers = Object.fromEntries(
      itemIdsForTarget("personal").map((id) => [id, 4]),
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/public/campaigns/${campaign.id}/submissions`,
          payload: { ...privacyConsent, token: invite.token, answers, backgroundAnswers: {} },
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/public/campaigns/${campaign.id}/draft?token=${encodeURIComponent(invite.token)}`,
        })
      ).json().clientRevision,
    ).toBe(0);
  });

  it("freezes research metadata and norm eligibility when an activity is published", async () => {
    const saved = await app.inject({
      method: "PUT",
      url: "/api/research/profile",
      payload: {
        country: "CN",
        headquartersProvince: "上海市",
        industryRaw: "软件和信息技术服务",
        industryStandardCode: "I65",
        industryMappingVersion: "GB/T 4754—2017",
        headcount: 320,
        aiStage: "multi_team",
        aiStartDuration: "6m_to_1y",
        questionnaireLanguage: "zh-CN",
        primaryWorkLanguage: "中文",
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().headcountBand).toBe("200—499");
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/api/research/norm-authorization",
          payload: { status: "authorized", noticeVersion: "norm_notice_v0.1" },
        })
      ).statusCode,
    ).toBe(200);
    const mappings = Array.from({ length: 10 }, (_, index) => ({
      externalSubjectId: `ou_norm_${index}`,
      source: "feishu",
      jobFamily: "engineering_data_research",
      careerStage: "experienced_ic",
      peopleManager: false,
      tenureBand: "3_to_5y",
      province: "上海市",
      employmentType: "正式员工",
      inTargetPopulation: true,
    }));
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/api/research/person-context-mappings",
          payload: { mappings },
        })
      ).statusCode,
    ).toBe(200);
    const campaign = (
      await app.inject({
        method: "POST",
        url: "/api/campaigns",
        payload: {
          name: "研究快照",
          target: "combined",
          mode: "anonymous",
          startsAt: TEST_ACTIVE_STARTS_AT,
          closesAt: TEST_ACTIVE_CLOSES_AT,
          invitedCount: 120,
        },
      })
    ).json();
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/campaigns/${campaign.id}/status`,
          payload: { status: "active" },
        })
      ).statusCode,
    ).toBe(200);
    const context = await db.query<{ snapshot: any }>(
      "SELECT snapshot FROM research_context_snapshots WHERE campaign_id=$1",
      [campaign.id],
    );
    expect(context.rows[0]?.snapshot.organizationProfile.headcount).toBe(320);
    const eligibility = await db.query<{
      norm_candidate: boolean;
      subgroup_eligible: boolean;
    }>(
      "SELECT norm_candidate,subgroup_eligible FROM norm_eligibility_assessments WHERE campaign_id=$1",
      [campaign.id],
    );
    expect(eligibility.rows[0]).toEqual({
      norm_candidate: true,
      subgroup_eligible: true,
    });
  });

  it("suppresses anonymous joint context below k=10 and includes it at k=10", async () => {
    const mapping = (index: number) => ({
      externalSubjectId: `ou_k_${index}`,
      source: "feishu",
      jobFamily: "product_project",
      careerStage: "experienced_ic",
      peopleManager: false,
      tenureBand: "1_to_2y",
      province: "上海市",
      employmentType: "正式员工",
      inTargetPopulation: true,
    });
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/api/research/person-context-mappings",
          payload: {
            mappings: Array.from({ length: 9 }, (_, index) => mapping(index)),
          },
        })
      ).statusCode,
    ).toBe(200);
    const nine = (
      await app.inject({
        method: "GET",
        url: "/api/research/person-context-preview",
      })
    ).json();
    expect(nine).toEqual([
      {
        cohortKey: "suppressed",
        context: { jobFamily: "unknown" },
        memberCount: 9,
        protectionStatus: "suppressed",
        coarseningLevel: 3,
      },
    ]);
    await app.inject({
      method: "PUT",
      url: "/api/research/person-context-mappings",
      payload: { mappings: [mapping(9)] },
    });
    const ten = (
      await app.inject({
        method: "GET",
        url: "/api/research/person-context-preview",
      })
    ).json();
    expect(ten[0]).toMatchObject({
      memberCount: 10,
      protectionStatus: "included",
      coarseningLevel: 0,
      context: {
        jobFamily: "product_project",
        careerStage: "experienced_ic",
        tenureBand: "1_to_2y",
        province: "上海市",
      },
    });
  });

  it("targets Feishu reminders only at delivered invitations that are still incomplete", async () => {
    const campaign = (
      await app.inject({
        method: "POST",
        url: "/api/campaigns",
        payload: {
          name: "提醒筛选",
          target: "personal",
          mode: "identified",
          startsAt: TEST_ACTIVE_STARTS_AT,
          closesAt: TEST_ACTIVE_CLOSES_AT,
        },
      })
    ).json();
    const repository = new ProductRepository(db);
    await repository.recordInvitationDelivery({
      tenantId: "tenant-demo",
      campaignId: campaign.id,
      externalSubjectId: "ou_pending",
      tokenFingerprint: "fingerprint",
      expiresAt: TEST_ACTIVE_CLOSES_AT,
      messageId: "om_message",
    });
    expect(
      await repository.listPendingFeishuRecipients("tenant-demo", campaign.id),
    ).toEqual(["ou_pending"]);
    await repository.markInvitationCompleted(
      "tenant-demo",
      campaign.id,
      "ou_pending",
    );
    expect(
      await repository.listPendingFeishuRecipients("tenant-demo", campaign.id),
    ).toEqual([]);
  });

  it("queues failed Feishu delivery, records retry success and deduplicates repeats", async () => {
    await app.close();
    const queued: ProductJob[] = [];
    const sendInteractiveCard = vi
      .fn()
      .mockRejectedValueOnce(new Error("FEISHU_TEMPORARY:unavailable"))
      .mockResolvedValueOnce({ messageId: "om_retry_success" });
    app = await buildApp(db, {
      jobQueue: {
        async add(job) {
          queued.push(job);
          return "retry-job-1";
        },
        async close() {},
      },
      feishu: { sendInteractiveCard } as unknown as FeishuClient,
    });
    const campaign = (
      await app.inject({
        method: "POST",
        url: "/api/campaigns",
        payload: {
          name: "飞书重试验收",
          target: "personal",
          mode: "identified",
          startsAt: TEST_ACTIVE_STARTS_AT,
          closesAt: TEST_ACTIVE_CLOSES_AT,
        },
      })
    ).json();
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/status`,
      payload: { status: "active" },
    });
    const initial = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/feishu-invitations`,
      payload: {
        openIds: ["ou_retry"],
        title: "邀请",
        body: "请完成问卷",
        buttonLabel: "开始填写",
      },
    });
    expect(initial.statusCode).toBe(502);
    expect(initial.json().results[0]).toMatchObject({
      status: "failed",
      retryQueued: true,
    });
    expect(queued).toHaveLength(1);
    const retry = queued[0];
    expect(retry?.name).toBe("send-notification");
    if (!retry || retry.name !== "send-notification")
      throw new Error("NOTIFICATION_RETRY_NOT_QUEUED");
    const repository = new ProductRepository(db);
    expect(
      await repository.notificationJob(
        retry.data.tenantId,
        retry.data.notificationId,
      ),
    ).toMatchObject({ status: "queued", attemptCount: 1 });
    const completed = await app.inject({
      method: "POST",
      url: "/internal/feishu/messages",
      headers: {
        "x-worker-secret": process.env.INTERNAL_WORKER_SECRET!,
      },
      payload: retry.data,
    });
    expect(completed.statusCode).toBe(201);
    expect(
      await repository.notificationJob(
        retry.data.tenantId,
        retry.data.notificationId,
      ),
    ).toEqual({
      status: "sent",
      attemptCount: 2,
      messageId: "om_retry_success",
      errorCode: null,
    });
    const duplicate = await app.inject({
      method: "POST",
      url: "/internal/feishu/messages",
      headers: {
        "x-worker-secret": process.env.INTERNAL_WORKER_SECRET!,
      },
      payload: retry.data,
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toMatchObject({ deduplicated: true });
    expect(sendInteractiveCard).toHaveBeenCalledTimes(2);
  });

  it("enforces the configured survey start and deadline on reads, drafts and submissions", async () => {
    const future = (
      await app.inject({
        method: "POST",
        url: "/api/campaigns",
        payload: {
          name: "尚未开始",
          target: "personal",
          mode: "identified",
          startsAt: new Date(Date.now() + 86_400_000).toISOString(),
          closesAt: new Date(Date.now() + 172_800_000).toISOString(),
        },
      })
    ).json();
    const scheduled = await app.inject({
      method: "POST",
      url: `/api/campaigns/${future.id}/status`,
      payload: { status: "active" },
    });
    expect(scheduled.statusCode).toBe(200);
    expect(scheduled.json().campaign.status).toBe("scheduled");
    const futureInvite = (
      await app.inject({
        method: "POST",
        url: `/api/campaigns/${future.id}/invites`,
        payload: { participantId: "future-user" },
      })
    ).json();
    const futureRead = await app.inject({
      method: "GET",
      url: `/public/campaigns/${future.id}?token=${encodeURIComponent(futureInvite.token)}`,
    });
    expect(futureRead.statusCode).toBe(409);
    expect(futureRead.json().code).toBe("CAMPAIGN_NOT_STARTED");

    const expired = (
      await app.inject({
        method: "POST",
        url: "/api/campaigns",
        payload: {
          name: "已经截止",
          target: "personal",
          mode: "identified",
          startsAt: new Date(Date.now() - 172_800_000).toISOString(),
          closesAt: new Date(Date.now() - 86_400_000).toISOString(),
        },
      })
    ).json();
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${expired.id}/status`,
      payload: { status: "active" },
    });
    const expiredInvite = (
      await app.inject({
        method: "POST",
        url: `/api/campaigns/${expired.id}/invites`,
        payload: { participantId: "expired-user" },
      })
    ).json();
    const answers = Object.fromEntries(
      itemIdsForTarget("personal").map((id) => [id, 3]),
    );
    const expiredSubmit = await app.inject({
      method: "POST",
      url: `/public/campaigns/${expired.id}/submissions`,
      payload: { ...privacyConsent, token: expiredInvite.token, answers },
    });
    expect(expiredSubmit.statusCode).toBe(410);
    expect(expiredSubmit.json().code).toBe("CAMPAIGN_DEADLINE_PASSED");
  });
});
