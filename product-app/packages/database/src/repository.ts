import { createHash, randomUUID, verify as verifySignature } from "node:crypto";
import {
  assessmentConfigurationFor,
  BUILTIN_RULE_ARTIFACT_ID,
  BUILTIN_RULE_RELEASE_ID,
  EXECUTABLE_RULESET_SHA256,
  publicPersonalAssessmentConfiguration,
  PERSONAL_RESEARCH_NOTICE_VERSION,
  VERSION_TUPLE,
  type ActionCheckIn,
  type ActionMilestone,
  type ActionPlanItem,
  type ActionPlanListItem,
  type AssessmentProfileId,
  type AuthContext,
  type CampaignScheduleAmendment,
  type CampaignRecord,
  type CampaignSnapshot,
  type CreateActionPlanInput,
  type CreateCampaignInput,
  type EnterpriseRole,
  type EnterpriseApplication,
  type EnterpriseApplicationStatus,
  type PlatformRole,
  type WorkspaceMembership,
  type EnterpriseUser,
  type DataDeletionRequest,
  type IndividualReportGrant,
  type IndividualReportListItem,
  type NormAuthorization,
  type OrganizationResearchProfile,
  type PersonalReportListItem,
  type PersonalResearchProfile,
  type PersonalResearchProfileInput,
  type PersonContextCohortSnapshot,
  type PersonContextMappingInput,
  type QuestionnaireRelease,
  type QuestionnairePackageId,
  type ReportAccessGrant,
  type ReportAccessGrantListItem,
  type ReportArtifact,
  type ReportPublication,
  type ReportSnapshot,
  type ResponseDraft,
  type ResponseSubmission,
  type ScoreSnapshot,
} from "@ai-readiness/contracts";

interface ExternalIdentity {
  tenantKey: string;
  tenantName?: string;
  openId: string;
  name: string;
}
interface DirectorySubjectInput {
  openId: string;
  name: string;
  departmentIds: string[];
  leaderOpenId?: string;
  active: boolean;
}
interface DirectoryDepartmentInput {
  openDepartmentId: string;
  name: string;
  parentDepartmentId?: string;
}
interface EmailIdentityRow {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  encrypted_value: string;
}
interface AccountIdentityRow {
  account_id: string;
  identity_hash: string;
  encrypted_value: string;
}
type RepositoryCampaignInput = CreateCampaignInput & {
  assessmentProfileId?: AssessmentProfileId;
  questionnairePackageId?: QuestionnairePackageId;
};
import type { SqlClient } from "./client.js";

const toIso = (value: unknown) => new Date(String(value)).toISOString();
const json = <T>(value: unknown): T =>
  typeof value === "string" ? (JSON.parse(value) as T) : (value as T);
const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
};
const contentHash = (value: unknown) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");
const dateOnly = (value: unknown) => {
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime()))
    throw new Error(`INVALID_DATABASE_DATE:${text}`);
  return parsed.toISOString().slice(0, 10);
};
const plusDays = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const usesCurrentRuleVersions = (
  versions: CampaignRecord["versions"],
): boolean =>
  (Object.keys(VERSION_TUPLE) as Array<keyof typeof VERSION_TUPLE>).every(
    (key) => versions[key] === VERSION_TUPLE[key],
  );
const questionnaireReleaseContentHash = (release: QuestionnaireRelease) =>
  contentHash({
    items: release.items,
    backgroundItems: release.backgroundItems,
    customItems: release.customItems,
    scale: release.scale,
    versions: release.versions,
    ruleManifestHash: release.ruleManifestHash,
  });
const usesCurrentQuestionnaireRelease = (
  release: QuestionnaireRelease | null,
): boolean =>
  Boolean(
    release &&
      usesCurrentRuleVersions(release.versions) &&
      release.ruleManifestHash === EXECUTABLE_RULESET_SHA256 &&
      release.contentHash === questionnaireReleaseContentHash(release),
  );
const completionBatch = (value: Date) =>
  new Date(
    Math.floor(value.getTime() / (30 * 60_000)) * 30 * 60_000,
  ).toISOString();
const actionFromRow = (row: any): ActionPlanItem => ({
  id: row.id,
  tenantId: row.tenant_id,
  campaignId: row.campaign_id,
  sourceReportId: row.source_report_id ?? "",
  recommendationId: row.recommendation_id,
  dimensionId: row.dimension_id ?? "A1",
  title: row.title,
  owner: row.owner,
  startsAt: dateOnly(row.starts_at),
  dueAt: dateOnly(row.due_at),
  successMetric: row.success_metric,
  resources: row.resources ?? "待确认",
  milestones: json<ActionMilestone[]>(row.milestones ?? []),
  evidenceIds: json<string[]>(row.evidence_ids ?? []),
  evidenceReferences: json(row.evidence_references ?? []),
  riskConditions: json<string[]>(row.risk_conditions ?? []),
  retestAt: row.retest_at
    ? dateOnly(row.retest_at)
    : plusDays(dateOnly(row.due_at), 90),
  status: row.status,
  progressPercent: Number(row.progress_percent),
  latestUpdate: row.latest_update ?? null,
  updatedAt: toIso(row.updated_at ?? row.created_at),
});
const deletionRequestFromRow = (row: any): DataDeletionRequest => ({
  id: row.id,
  tenantId: row.tenant_id,
  requestedBy: row.requested_by ?? null,
  requesterKind: row.requester_kind,
  status: row.status,
  reason: row.reason,
  subjectCount: Number(row.subject_count),
  result: row.result ? json(row.result) : null,
  errorCode: row.error_code ?? null,
  requestedAt: toIso(row.requested_at),
  updatedAt: toIso(row.updated_at),
  completedAt: row.completed_at ? toIso(row.completed_at) : null,
});
const enterpriseApplicationFromRow = (row: any): EnterpriseApplication => ({
  id: row.id,
  accountId: row.account_id,
  applicantName: row.applicant_name,
  applicantRole: row.applicant_role,
  organizationName: row.organization_name,
  website: row.website ?? null,
  expectedHeadcountBand: row.expected_headcount_band,
  useCase: row.use_case,
  status: row.status,
  organizationId: row.organization_id ?? null,
  reviewedBy: row.reviewed_by ?? null,
  reviewedAt: row.reviewed_at ? toIso(row.reviewed_at) : null,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

export class ProductRepository {
  constructor(private readonly db: SqlClient) {}

  async seedDevelopmentTenant() {
    await this.db.query(
      "INSERT INTO tenants (id,name) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING",
      ["tenant-demo", "示例公司"],
    );
    await this.db.query(
      "INSERT INTO users (id,tenant_id,external_id,display_name,role) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING",
      ["user-hr-demo", "tenant-demo", "dev-hr", "本地测试管理员", "owner"],
    );
    await this.db.query(
      "INSERT INTO accounts (id,display_name) VALUES ('account-development','本地测试管理员') ON CONFLICT (id) DO NOTHING",
    );
    await this.db.query(
      `INSERT INTO organization_memberships (id,account_id,tenant_id,user_id,role,status)
       VALUES ('membership-development','account-development','tenant-demo','user-hr-demo','owner','active')
       ON CONFLICT (account_id,tenant_id) DO NOTHING`,
    );
    await this.db.query(
      `INSERT INTO platform_role_assignments (id,account_id,role,status)
       VALUES ('platform-role-development','account-development','platform_admin','active')
       ON CONFLICT (account_id,role) DO NOTHING`,
    );
    await this.db.query(
      `INSERT INTO organization_research_profiles
       (tenant_id,country,headquarters_province,industry_raw,industry_standard_code,industry_mapping_version,headcount,headcount_band,ai_stage,ai_start_duration,questionnaire_language,primary_work_language)
       VALUES ('tenant-demo','中国','上海市','信息传输、软件和信息技术服务业','I','GB/T 4754—2017',120,'50—199','local_exploration','under_6m','zh-CN','zh-CN')
       ON CONFLICT (tenant_id) DO NOTHING`,
    );
  }

  async upsertExternalIdentity(
    identity: ExternalIdentity,
    options: { allowTenantBootstrap: boolean },
  ): Promise<AuthContext> {
    const tenantId = `tenant-${createHash("sha256").update(identity.tenantKey).digest("hex").slice(0, 20)}`;
    const userId = `user-${createHash("sha256").update(`${identity.tenantKey}:${identity.openId}`).digest("hex").slice(0, 20)}`;
    await this.db.transaction(async (transaction) => {
      const existingTenant = await transaction.query<{ id: string }>(
        "SELECT id FROM tenants WHERE id=$1",
        [tenantId],
      );
      if (!existingTenant.rows[0] && !options.allowTenantBootstrap)
        throw new Error("TENANT_BOOTSTRAP_NOT_AUTHORIZED");
      await transaction.query(
        "INSERT INTO tenants (id,name,external_tenant_key) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,external_tenant_key=EXCLUDED.external_tenant_key",
        [tenantId, identity.tenantName ?? "飞书企业", identity.tenantKey],
      );
      const count = await transaction.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM users WHERE tenant_id=$1",
        [tenantId],
      );
      const role: EnterpriseRole =
        Number(count.rows[0]?.count ?? 0) === 0 ? "owner" : "employee";
      if (role === "owner" && !options.allowTenantBootstrap)
        throw new Error("TENANT_BOOTSTRAP_NOT_AUTHORIZED");
      await transaction.query(
        "INSERT INTO users (id,tenant_id,external_id,display_name,role) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id,external_id) DO UPDATE SET display_name=EXCLUDED.display_name",
        [userId, tenantId, identity.openId, identity.name, role],
      );
    });
    const result = await this.db.query<any>(
      "SELECT u.*,t.name AS tenant_name FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.tenant_id=$1 AND u.external_id=$2",
      [tenantId, identity.openId],
    );
    const row = result.rows[0];
    return {
      tenantId,
      tenantName: row.tenant_name,
      userId: row.id,
      userName: row.display_name,
      role: row.role,
      authentication: "feishu_oauth",
    };
  }

  async createAuthSession(
    context: AuthContext,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.db.query(
      "INSERT INTO auth_sessions (id,token_hash,tenant_id,user_id,auth_method,expires_at,account_id,workspace_kind) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        randomUUID(),
        tokenHash,
        context.tenantId,
        context.userId,
        context.authentication,
        expiresAt.toISOString(),
        context.accountId ?? null,
        context.workspaceKind ??
          (context.tenantId === "tenant-personal" ? "personal" : "organization"),
      ],
    );
    await this.audit(
      context.tenantId,
      context.userId,
      "auth.session.created",
      "user",
      context.userId,
      "success",
      { method: context.authentication },
    );
  }

  async ensureEmailAccount(input: {
    emailHash: string;
    encryptedEmail: string;
    displayName?: string | null;
  }): Promise<string> {
    const accountId = `account-${input.emailHash.slice(0, 24)}`;
    await this.db.query(
      `INSERT INTO accounts (id,display_name) VALUES ($1,$2)
       ON CONFLICT (id) DO UPDATE SET
         display_name=COALESCE(accounts.display_name,EXCLUDED.display_name),updated_at=now()`,
      [accountId, input.displayName?.trim() || null],
    );
    await this.db.query(
      `INSERT INTO account_identities
       (id,account_id,identity_type,identity_hash,encrypted_value,verified_at)
       VALUES ($1,$2,'email',$3,$4,now())
       ON CONFLICT (identity_hash) DO UPDATE SET
         encrypted_value=EXCLUDED.encrypted_value,verified_at=now(),updated_at=now()`,
      [
        `account-identity-${input.emailHash.slice(0, 20)}`,
        accountId,
        input.emailHash,
        input.encryptedEmail,
      ],
    );
    return accountId;
  }

  async accountForEmailHash(emailHash: string): Promise<AccountIdentityRow | null> {
    const result = await this.db.query<AccountIdentityRow>(
      "SELECT account_id,identity_hash,encrypted_value FROM account_identities WHERE identity_hash=$1 AND identity_type='email'",
      [emailHash],
    );
    return result.rows[0] ?? null;
  }

  async emailIdentityHashForAccount(accountId: string): Promise<string | null> {
    const result = await this.db.query<{ identity_hash: string }>(
      "SELECT identity_hash FROM account_identities WHERE account_id=$1 AND identity_type='email' LIMIT 1",
      [accountId],
    );
    return result.rows[0]?.identity_hash ?? null;
  }

  async platformRolesForAccount(accountId: string): Promise<PlatformRole[]> {
    const result = await this.db.query<{ role: PlatformRole }>(
      "SELECT role FROM platform_role_assignments WHERE account_id=$1 AND status='active' ORDER BY role",
      [accountId],
    );
    return result.rows.map((row) => row.role);
  }

  async grantPlatformRole(accountId: string, role: PlatformRole): Promise<void> {
    await this.db.query(
      `INSERT INTO platform_role_assignments (id,account_id,role,status)
       VALUES ($1,$2,$3,'active')
       ON CONFLICT (account_id,role) DO UPDATE SET status='active',updated_at=now()`,
      [randomUUID(), accountId, role],
    );
  }

  async accountMemberships(accountId: string): Promise<WorkspaceMembership[]> {
    const result = await this.db.query<any>(
      `SELECT m.tenant_id,m.user_id,m.role,m.status,t.name
       FROM organization_memberships m
       JOIN tenants t ON t.id=m.tenant_id
       WHERE m.account_id=$1 AND m.tenant_id<>'tenant-personal' AND m.status='active'
       ORDER BY t.name,m.tenant_id`,
      [accountId],
    );
    return result.rows.map((row) => ({
      organizationId: row.tenant_id,
      organizationName: row.name,
      userId: row.user_id,
      role: row.role,
      status: row.status,
    }));
  }

  async contextForAccount(
    accountId: string,
    kind: "personal" | "organization" | "platform",
    organizationId?: string,
  ): Promise<AuthContext | null> {
    const platformRoles = await this.platformRolesForAccount(accountId);
    if (kind === "platform" && !platformRoles.length) return null;
    const tenantId = kind === "organization" ? organizationId : "tenant-personal";
    if (!tenantId) return null;
    const result = await this.db.query<any>(
      `SELECT m.tenant_id,m.user_id,m.role,t.name AS tenant_name,u.display_name
       FROM organization_memberships m
       JOIN tenants t ON t.id=m.tenant_id
       JOIN users u ON u.id=m.user_id
       WHERE m.account_id=$1 AND m.tenant_id=$2 AND m.status='active'`,
      [accountId, tenantId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      accountId,
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      userId: row.user_id,
      userName: row.display_name,
      role: row.role,
      authentication: "email_otp",
      workspaceKind: kind,
      platformRoles,
    };
  }

  async updateAccountDisplayName(
    accountId: string,
    displayName: string,
  ): Promise<void> {
    await this.db.transaction(async (transaction) => {
      await transaction.query(
        "UPDATE accounts SET display_name=$2,updated_at=now() WHERE id=$1",
        [accountId, displayName],
      );
      await transaction.query(
        `UPDATE users SET display_name=$2 WHERE id IN
         (SELECT user_id FROM organization_memberships WHERE account_id=$1)`,
        [accountId, displayName],
      );
    });
  }

  async upsertEmailIdentity(input: {
    emailHash: string;
    encryptedEmail: string;
    displayName?: string;
    tenantId?: string;
    role?: EnterpriseRole;
  }): Promise<AuthContext> {
    const tenantId = input.tenantId ?? "tenant-personal";
    const accountId = await this.ensureEmailAccount({
      emailHash: input.emailHash,
      encryptedEmail: input.encryptedEmail,
      displayName: input.displayName ?? null,
    });
    const userId = `user-email-${createHash("sha256")
      .update(`${tenantId}:${input.emailHash}`)
      .digest("hex")
      .slice(0, 24)}`;
    await this.db.query(
      "INSERT INTO tenants (id,name) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING",
      [tenantId, tenantId === "tenant-personal" ? "个人测评" : "企业工作区"],
    );
    await this.db.query(
      `INSERT INTO users (id,tenant_id,external_id,display_name,role)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET
         display_name=CASE WHEN $6::boolean THEN EXCLUDED.display_name ELSE users.display_name END,
         role=CASE WHEN $7::boolean THEN EXCLUDED.role ELSE users.role END`,
      [
        userId,
        tenantId,
        `email:${input.emailHash}`,
        input.displayName?.trim() || "邮箱账户",
        input.role ?? "employee",
        Boolean(input.displayName?.trim()),
        input.role !== undefined,
      ],
    );
    await this.db.query(
      `INSERT INTO auth_identities (id,tenant_id,user_id,identity_type,identity_hash,encrypted_value,verified_at)
       VALUES ($1,$2,$3,'email',$4,$5,now())
       ON CONFLICT (tenant_id,identity_hash) DO UPDATE SET user_id=EXCLUDED.user_id,encrypted_value=EXCLUDED.encrypted_value,verified_at=now(),updated_at=now()`,
      [randomUUID(), tenantId, userId, input.emailHash, input.encryptedEmail],
    );
    await this.db.query(
      `INSERT INTO organization_memberships
       (id,account_id,tenant_id,user_id,role,status)
       VALUES ($1,$2,$3,$4,$5,'active')
       ON CONFLICT (account_id,tenant_id) DO UPDATE SET
         user_id=EXCLUDED.user_id,role=EXCLUDED.role,status='active',updated_at=now()`,
      [
        `membership-${createHash("sha256")
          .update(`${accountId}:${tenantId}`)
          .digest("hex")
          .slice(0, 24)}`,
        accountId,
        tenantId,
        userId,
        input.role ??
          (
            await this.db.query<{ role: EnterpriseRole }>(
              "SELECT role FROM users WHERE id=$1",
              [userId],
            )
          ).rows[0]?.role ??
          "employee",
      ],
    );
    return {
      accountId,
      tenantId,
      tenantName: tenantId === "tenant-personal" ? "个人测评" : "企业工作区",
      userId,
      userName:
        (
          await this.db.query<{ display_name: string }>(
            "SELECT display_name FROM users WHERE id=$1",
            [userId],
          )
        ).rows[0]?.display_name ?? "邮箱账户",
      role:
        (
          await this.db.query<{ role: EnterpriseRole }>(
            "SELECT role FROM users WHERE id=$1",
            [userId],
          )
        ).rows[0]?.role ?? "employee",
      authentication: "email_otp",
      workspaceKind: tenantId === "tenant-personal" ? "personal" : "organization",
    };
  }

  async findEmailIdentity(emailHash: string, tenantId?: string): Promise<EmailIdentityRow | null> {
    const result = await this.db.query<EmailIdentityRow>(
      "SELECT id,tenant_id,user_id,encrypted_value FROM auth_identities WHERE identity_hash=$1 AND ($2::text IS NULL OR tenant_id=$2) ORDER BY CASE WHEN tenant_id='tenant-personal' THEN 1 ELSE 0 END,created_at LIMIT 1",
      [emailHash, tenantId ?? null],
    );
    return result.rows[0] ?? null;
  }

  async createEmailOrganizationWorkspace(input: {
    emailHash: string;
    encryptedEmail: string;
    displayName: string;
    organizationName: string;
  }): Promise<AuthContext> {
    const tenantId = `tenant-email-${createHash("sha256")
      .update(`${input.emailHash}:${Date.now()}:${randomUUID()}`)
      .digest("hex")
      .slice(0, 20)}`;
    await this.db.query("INSERT INTO tenants (id,name) VALUES ($1,$2)", [
      tenantId,
      input.organizationName,
    ]);
    return this.upsertEmailIdentity({
      emailHash: input.emailHash,
      encryptedEmail: input.encryptedEmail,
      displayName: input.displayName,
      tenantId,
      role: "owner",
    });
  }

  async createPlatformManagedOrganization(input: {
    accountId: string;
    displayName: string;
    organizationName: string;
  }): Promise<AuthContext> {
    const identity = await this.db.query<AccountIdentityRow>(
      `SELECT account_id,identity_hash,encrypted_value FROM account_identities
       WHERE account_id=$1 AND identity_type='email' LIMIT 1`,
      [input.accountId],
    );
    const row = identity.rows[0];
    if (!row) throw new Error("ACCOUNT_EMAIL_IDENTITY_NOT_FOUND");
    const memberships = await this.accountMemberships(input.accountId);
    if (
      memberships.some(
        (item) =>
          item.organizationName.trim().toLocaleLowerCase() ===
          input.organizationName.trim().toLocaleLowerCase(),
      )
    )
      throw new Error("ORGANIZATION_NAME_ALREADY_EXISTS");
    return this.createEmailOrganizationWorkspace({
      emailHash: row.identity_hash,
      encryptedEmail: row.encrypted_value,
      displayName: input.displayName,
      organizationName: input.organizationName.trim(),
    });
  }

  async createEnterpriseApplication(input: {
    accountId: string;
    applicantName: string;
    applicantRole: string;
    organizationName: string;
    website?: string | null;
    expectedHeadcountBand: string;
    useCase: string;
  }): Promise<EnterpriseApplication> {
    const existing = await this.db.query<any>(
      `SELECT * FROM enterprise_applications
       WHERE account_id=$1 AND status='pending' ORDER BY created_at DESC LIMIT 1`,
      [input.accountId],
    );
    if (existing.rows[0]) return enterpriseApplicationFromRow(existing.rows[0]);
    const id = randomUUID();
    await this.db.query(
      `INSERT INTO enterprise_applications
       (id,account_id,applicant_name,applicant_role,organization_name,website,expected_headcount_band,use_case,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')`,
      [
        id,
        input.accountId,
        input.applicantName,
        input.applicantRole,
        input.organizationName,
        input.website?.trim() || null,
        input.expectedHeadcountBand,
        input.useCase,
      ],
    );
    return (await this.enterpriseApplication(id))!;
  }

  async enterpriseApplication(id: string): Promise<EnterpriseApplication | null> {
    const result = await this.db.query<any>(
      "SELECT * FROM enterprise_applications WHERE id=$1",
      [id],
    );
    return result.rows[0] ? enterpriseApplicationFromRow(result.rows[0]) : null;
  }

  async enterpriseApplicationsForAccount(
    accountId: string,
  ): Promise<EnterpriseApplication[]> {
    const result = await this.db.query<any>(
      "SELECT * FROM enterprise_applications WHERE account_id=$1 ORDER BY created_at DESC",
      [accountId],
    );
    return result.rows.map(enterpriseApplicationFromRow);
  }

  async listEnterpriseApplications(
    status?: EnterpriseApplicationStatus,
  ): Promise<EnterpriseApplication[]> {
    const result = await this.db.query<any>(
      `SELECT * FROM enterprise_applications
       WHERE ($1::text IS NULL OR status=$1)
       ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END,created_at DESC`,
      [status ?? null],
    );
    return result.rows.map(enterpriseApplicationFromRow);
  }

  async reviewEnterpriseApplication(input: {
    id: string;
    status: "approved" | "rejected";
    reviewerAccountId: string;
  }): Promise<EnterpriseApplication | null> {
    const current = await this.enterpriseApplication(input.id);
    if (!current) return null;
    if (current.status !== "pending") return current;
    let organizationId: string | null = null;
    if (input.status === "approved") {
      const identity = await this.db.query<AccountIdentityRow>(
        `SELECT account_id,identity_hash,encrypted_value FROM account_identities
         WHERE account_id=$1 AND identity_type='email' LIMIT 1`,
        [current.accountId],
      );
      const row = identity.rows[0];
      if (!row) throw new Error("ACCOUNT_EMAIL_IDENTITY_NOT_FOUND");
      const workspace = await this.createEmailOrganizationWorkspace({
        emailHash: row.identity_hash,
        encryptedEmail: row.encrypted_value,
        displayName: current.applicantName,
        organizationName: current.organizationName,
      });
      organizationId = workspace.tenantId;
    }
    await this.db.query(
      `UPDATE enterprise_applications SET
       status=$2,organization_id=$3,reviewed_by=$4,reviewed_at=now(),updated_at=now()
       WHERE id=$1`,
      [input.id, input.status, organizationId, input.reviewerAccountId],
    );
    return this.enterpriseApplication(input.id);
  }

  async emailIdentityHashForUser(
    tenantId: string,
    userId: string,
  ): Promise<string | null> {
    const result = await this.db.query<{ identity_hash: string }>(
      "SELECT identity_hash FROM auth_identities WHERE tenant_id=$1 AND user_id=$2 AND identity_type='email' LIMIT 1",
      [tenantId, userId],
    );
    return result.rows[0]?.identity_hash ?? null;
  }

  async encryptedEmailForUser(
    tenantId: string,
    userId: string,
  ): Promise<string | null> {
    const result = await this.db.query<{ encrypted_value: string }>(
      "SELECT encrypted_value FROM auth_identities WHERE tenant_id=$1 AND user_id=$2 AND identity_type='email' LIMIT 1",
      [tenantId, userId],
    );
    return result.rows[0]?.encrypted_value ?? null;
  }

  async emailInvitationTenant(identityHash: string): Promise<string | null> {
    const result = await this.db.query<{ tenant_id: string }>(
      `SELECT tenant_id FROM invitations
       WHERE provider='email' AND identity_hash=$1 AND delivered_at IS NOT NULL AND expires_at>now()
       ORDER BY created_at DESC LIMIT 1`,
      [identityHash],
    );
    return result.rows[0]?.tenant_id ?? null;
  }

  async createEmailOtpChallenge(input: {
    identityHash: string;
    purpose: "login" | "invite";
    codeHash: string;
    expiresAt: Date;
  }): Promise<string> {
    const id = randomUUID();
    await this.db.transaction(async (transaction) => {
      await transaction.query(
        "UPDATE email_otp_challenges SET consumed_at=now() WHERE identity_hash=$1 AND purpose=$2 AND consumed_at IS NULL",
        [input.identityHash, input.purpose],
      );
      await transaction.query(
        `INSERT INTO email_otp_challenges (id,identity_hash,purpose,code_hash,expires_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, input.identityHash, input.purpose, input.codeHash, input.expiresAt.toISOString()],
      );
    });
    return id;
  }

  async emailOtpSendAllowed(identityHash: string): Promise<{
    allowed: boolean;
    retryAfterSeconds: number;
  }> {
    const result = await this.db.query<{ last_sent_at: string | null; hourly_count: string }>(
      `SELECT max(created_at)::text AS last_sent_at,
              count(*) FILTER (WHERE created_at > now()-interval '1 hour')::text AS hourly_count
       FROM email_otp_challenges WHERE identity_hash=$1 AND purpose='login'`,
      [identityHash],
    );
    const row = result.rows[0];
    const last = row?.last_sent_at ? new Date(row.last_sent_at).getTime() : 0;
    const elapsed = Date.now() - last;
    const retryAfterSeconds = elapsed < 60_000 ? Math.ceil((60_000 - elapsed) / 1000) : 0;
    if (retryAfterSeconds > 0 || Number(row?.hourly_count ?? 0) >= 5)
      return { allowed: false, retryAfterSeconds: retryAfterSeconds || 3600 };
    return { allowed: true, retryAfterSeconds: 0 };
  }

  async consumeEmailOtpChallenge(
    id: string,
    codeHash: string,
  ): Promise<boolean> {
    const result = await this.db.query<{ id: string }>(
      `UPDATE email_otp_challenges SET consumed_at=now()
       WHERE id=$1 AND code_hash=$2 AND consumed_at IS NULL AND expires_at>now() AND attempts<5
       RETURNING id`,
      [id, codeHash],
    );
    if (result.rows[0]) return true;
    await this.db.query(
      "UPDATE email_otp_challenges SET attempts=attempts+1 WHERE id=$1 AND consumed_at IS NULL",
      [id],
    );
    return false;
  }

  async recordEmailDelivery(input: {
    identityHash: string;
    type: "otp" | "invite" | "reminder" | "report";
    status: "queued" | "sent" | "failed";
    providerMessageId?: string;
    errorCode?: string;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO email_delivery_logs (id,identity_hash,email_type,status,provider_message_id,error_code,sent_at)
       VALUES ($1,$2,$3,$4,$5,$6,CASE WHEN $4='sent' THEN now() ELSE NULL END)`,
      [randomUUID(), input.identityHash, input.type, input.status, input.providerMessageId ?? null, input.errorCode ?? null],
    );
  }

  async createOAuthLoginState(
    nonceHash: string,
    stateHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.db.transaction(async (transaction) => {
      await transaction.query(
        "DELETE FROM oauth_login_states WHERE expires_at<now() OR consumed_at<now()-interval '1 day'",
      );
      await transaction.query(
        "INSERT INTO oauth_login_states (nonce_hash,state_hash,expires_at) VALUES ($1,$2,$3)",
        [nonceHash, stateHash, expiresAt.toISOString()],
      );
    });
  }

  async consumeOAuthLoginState(
    nonceHash: string,
    stateHash: string,
  ): Promise<void> {
    const result = await this.db.query<{ nonce_hash: string }>(
      `UPDATE oauth_login_states
       SET consumed_at=now()
       WHERE nonce_hash=$1 AND state_hash=$2 AND consumed_at IS NULL AND expires_at>now()
       RETURNING nonce_hash`,
      [nonceHash, stateHash],
    );
    if (!result.rows[0]) throw new Error("OAUTH_STATE_ALREADY_USED");
  }

  async resolveAuthSession(tokenHash: string): Promise<AuthContext | null> {
    const result = await this.db.query<any>(
      `SELECT s.auth_method,s.account_id,s.workspace_kind,u.id AS user_id,u.display_name,u.role,t.id AS tenant_id,t.name AS tenant_name
      FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN tenants t ON t.id=s.tenant_id
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) return null;
    const platformRoles = row.account_id
      ? await this.platformRolesForAccount(row.account_id)
      : [];
    return {
          accountId: row.account_id ?? undefined,
          tenantId: row.tenant_id,
          tenantName: row.tenant_name,
          userId: row.user_id,
          userName: row.display_name,
          role: row.role,
          authentication: row.auth_method,
          workspaceKind:
            row.workspace_kind ??
            (row.tenant_id === "tenant-personal" ? "personal" : "organization"),
          platformRoles,
        };
  }

  async revokeAuthSession(tokenHash: string): Promise<void> {
    await this.db.query(
      "UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL",
      [tokenHash],
    );
  }

  async listTenantUsers(tenantId: string): Promise<EnterpriseUser[]> {
    const result = await this.db.query<any>(
      "SELECT id,tenant_id,display_name,role FROM users WHERE tenant_id=$1 ORDER BY display_name,id",
      [tenantId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      displayName: row.display_name,
      role: row.role,
    }));
  }

  async updateUserDisplayName(
    tenantId: string,
    userId: string,
    displayName: string,
  ): Promise<void> {
    await this.db.query(
      "UPDATE users SET display_name=$3 WHERE tenant_id=$1 AND id=$2",
      [tenantId, userId, displayName],
    );
  }

  async renameTenant(
    tenantId: string,
    name: string,
    actorId: string,
  ): Promise<void> {
    await this.db.query("UPDATE tenants SET name=$2 WHERE id=$1", [tenantId, name]);
    await this.audit(
      tenantId,
      actorId,
      "tenant.profile_updated",
      "tenant",
      tenantId,
      "success",
      { name },
    );
  }

  async getPersonalResearchProfile(
    tenantId: string,
    userId: string,
  ): Promise<PersonalResearchProfile | null> {
    const result = await this.db.query<any>(
      "SELECT * FROM personal_research_profiles WHERE tenant_id=$1 AND user_id=$2",
      [tenantId, userId],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          tenantId: row.tenant_id,
          userId: row.user_id,
          workCity: row.work_city,
          province: row.province,
          industryCode: row.industry_code,
          companySizeBand: row.company_size_band,
          jobFamily: row.job_family,
          careerStage: row.career_stage,
          peopleManager: row.people_manager,
          tenureBand: row.tenure_band,
          researchConsent: Boolean(row.research_consent),
          noticeVersion: row.notice_version,
          consentedAt: row.consented_at ? toIso(row.consented_at) : null,
          updatedAt: toIso(row.updated_at),
        }
      : null;
  }

  async savePersonalResearchProfile(
    tenantId: string,
    userId: string,
    input: PersonalResearchProfileInput,
  ): Promise<PersonalResearchProfile> {
    const consentedAt = input.researchConsent
      ? input.consentedAt ?? new Date().toISOString()
      : null;
    await this.db.query(
      `INSERT INTO personal_research_profiles
       (id,tenant_id,user_id,work_city,province,industry_code,company_size_band,job_family,career_stage,people_manager,tenure_band,research_consent,notice_version,consented_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (tenant_id,user_id) DO UPDATE SET
         work_city=EXCLUDED.work_city,province=EXCLUDED.province,industry_code=EXCLUDED.industry_code,
         company_size_band=EXCLUDED.company_size_band,job_family=EXCLUDED.job_family,
         career_stage=EXCLUDED.career_stage,people_manager=EXCLUDED.people_manager,
         tenure_band=EXCLUDED.tenure_band,research_consent=EXCLUDED.research_consent,
         notice_version=EXCLUDED.notice_version,consented_at=EXCLUDED.consented_at,updated_at=now()`,
      [
        randomUUID(),
        tenantId,
        userId,
        input.workCity,
        input.province,
        input.industryCode,
        input.companySizeBand,
        input.jobFamily,
        input.careerStage,
        input.peopleManager,
        input.tenureBand,
        input.researchConsent,
        PERSONAL_RESEARCH_NOTICE_VERSION,
        consentedAt,
      ],
    );
    const membership = await this.db.query<{ account_id: string }>(
      "SELECT account_id FROM organization_memberships WHERE tenant_id=$1 AND user_id=$2",
      [tenantId, userId],
    );
    if (membership.rows[0]?.account_id)
      await this.db.query(
        `INSERT INTO personal_research_consent_records
         (id,account_id,status,notice_version,recorded_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [
          randomUUID(),
          membership.rows[0].account_id,
          input.researchConsent ? "authorized" : "declined",
          PERSONAL_RESEARCH_NOTICE_VERSION,
          consentedAt ?? new Date().toISOString(),
        ],
      );
    return (await this.getPersonalResearchProfile(tenantId, userId))!;
  }

  async savePersonalResearchSnapshot(
    tenantId: string,
    campaignId: string,
    responseId: string,
    profile: PersonalResearchProfile,
  ): Promise<void> {
    const missing = [
      profile.workCity,
      profile.province,
      profile.industryCode,
      profile.companySizeBand,
      profile.jobFamily,
      profile.careerStage,
      profile.tenureBand,
    ].some((value) =>
      !value || ["unknown", "prefer_not_to_say"].includes(String(value)),
    );
    const eligible = profile.researchConsent && !missing;
    const reasonCodes = [
      ...(!profile.researchConsent ? ["research_authorization_missing"] : []),
      ...(missing ? ["research_context_incomplete"] : []),
    ];
    const snapshot = {
      workCity: profile.workCity,
      province: profile.province,
      industryCode: profile.industryCode,
      companySizeBand: profile.companySizeBand,
      jobFamily: profile.jobFamily,
      careerStage: profile.careerStage,
      peopleManager: profile.peopleManager,
      tenureBand: profile.tenureBand,
      noticeVersion: profile.noticeVersion,
      consentedAt: profile.consentedAt,
    };
    await this.db.query(
      `INSERT INTO personal_research_snapshots
       (id,tenant_id,campaign_id,response_id,profile_snapshot,research_eligible,eligibility_reason_codes,schema_version)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,'personal_research_snapshot_v0.1')
       ON CONFLICT (response_id) DO NOTHING`,
      [
        randomUUID(),
        tenantId,
        campaignId,
        responseId,
        JSON.stringify(snapshot),
        eligible,
        JSON.stringify(reasonCodes),
      ],
    );
  }

  async externalSubjectId(
    tenantId: string,
    userId: string,
  ): Promise<string | null> {
    const result = await this.db.query<{ external_id: string | null }>(
      "SELECT external_id FROM users WHERE tenant_id=$1 AND id=$2",
      [tenantId, userId],
    );
    return result.rows[0]?.external_id ?? null;
  }

  async updateTenantUserRole(
    tenantId: string,
    userId: string,
    role: EnterpriseRole,
    actorId: string,
  ): Promise<EnterpriseUser | null> {
    const current = await this.db.query<any>(
      "SELECT role FROM users WHERE tenant_id=$1 AND id=$2",
      [tenantId, userId],
    );
    if (!current.rows[0]) return null;
    if (current.rows[0].role === "owner" && role !== "owner") {
      const owners = await this.db.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM users WHERE tenant_id=$1 AND role='owner'",
        [tenantId],
      );
      if (Number(owners.rows[0]?.count ?? 0) <= 1)
        throw new Error("LAST_OWNER_CANNOT_BE_DEMOTED");
    }
    const result = await this.db.query<any>(
      "UPDATE users SET role=$3 WHERE tenant_id=$1 AND id=$2 RETURNING id,tenant_id,display_name,role",
      [tenantId, userId, role],
    );
    const row = result.rows[0];
    if (!row) return null;
    await this.audit(
      tenantId,
      actorId,
      "user.role_updated",
      "user",
      userId,
      "success",
      { role },
    );
    return {
      id: row.id,
      tenantId: row.tenant_id,
      displayName: row.display_name,
      role: row.role,
    };
  }

  async getOrganizationResearchProfile(
    tenantId: string,
  ): Promise<OrganizationResearchProfile | null> {
    const result = await this.db.query<any>(
      "SELECT * FROM organization_research_profiles WHERE tenant_id=$1",
      [tenantId],
    );
    const row = result.rows[0];
    return row
      ? {
          tenantId: row.tenant_id,
          country: row.country,
          headquartersProvince: row.headquarters_province,
          industryRaw: row.industry_raw,
          industryStandardCode: row.industry_standard_code,
          industryMappingVersion: row.industry_mapping_version,
          headcount: Number(row.headcount),
          headcountBand: row.headcount_band,
          aiStage: row.ai_stage,
          aiStartDuration: row.ai_start_duration,
          questionnaireLanguage: row.questionnaire_language,
          primaryWorkLanguage: row.primary_work_language,
          updatedAt: toIso(row.updated_at),
        }
      : null;
  }

  async saveOrganizationResearchProfile(
    tenantId: string,
    profile: Omit<
      OrganizationResearchProfile,
      "tenantId" | "headcountBand" | "updatedAt"
    >,
    actorId: string,
  ): Promise<OrganizationResearchProfile> {
    const h = profile.headcount;
    const band: OrganizationResearchProfile["headcountBand"] =
      h < 50
        ? "<50"
        : h < 200
          ? "50—199"
          : h < 500
            ? "200—499"
            : h < 1000
              ? "500—999"
              : h < 5000
                ? "1000—4999"
                : "≥5000";
    await this.db.query(
      `INSERT INTO organization_research_profiles (tenant_id,country,headquarters_province,industry_raw,industry_standard_code,industry_mapping_version,headcount,headcount_band,ai_stage,ai_start_duration,questionnaire_language,primary_work_language)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (tenant_id) DO UPDATE SET country=EXCLUDED.country,headquarters_province=EXCLUDED.headquarters_province,industry_raw=EXCLUDED.industry_raw,industry_standard_code=EXCLUDED.industry_standard_code,industry_mapping_version=EXCLUDED.industry_mapping_version,headcount=EXCLUDED.headcount,headcount_band=EXCLUDED.headcount_band,ai_stage=EXCLUDED.ai_stage,ai_start_duration=EXCLUDED.ai_start_duration,questionnaire_language=EXCLUDED.questionnaire_language,primary_work_language=EXCLUDED.primary_work_language,updated_at=now()`,
      [
        tenantId,
        profile.country,
        profile.headquartersProvince,
        profile.industryRaw,
        profile.industryStandardCode,
        profile.industryMappingVersion,
        profile.headcount,
        band,
        profile.aiStage,
        profile.aiStartDuration,
        profile.questionnaireLanguage,
        profile.primaryWorkLanguage,
      ],
    );
    await this.audit(
      tenantId,
      actorId,
      "research.profile_updated",
      "tenant",
      tenantId,
      "success",
      { mappingVersion: profile.industryMappingVersion },
    );
    return (await this.getOrganizationResearchProfile(tenantId))!;
  }

  async getNormAuthorization(
    tenantId: string,
  ): Promise<NormAuthorization | null> {
    const result = await this.db.query<any>(
      "SELECT * FROM norm_contribution_authorizations WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 1",
      [tenantId],
    );
    const row = result.rows[0];
    return row
      ? {
          tenantId: row.tenant_id,
          status: row.status,
          noticeVersion: row.notice_version,
          updatedAt: toIso(row.created_at),
        }
      : null;
  }

  async setNormAuthorization(
    tenantId: string,
    status: NormAuthorization["status"],
    noticeVersion: string,
    actorId: string,
  ): Promise<NormAuthorization> {
    await this.db.query(
      "INSERT INTO norm_contribution_authorizations (id,tenant_id,status,notice_version,authorized_by) VALUES ($1,$2,$3,$4,$5)",
      [randomUUID(), tenantId, status, noticeVersion, actorId],
    );
    await this.audit(
      tenantId,
      actorId,
      `norm.${status}`,
      "tenant",
      tenantId,
      "success",
      { noticeVersion },
    );
    return (await this.getNormAuthorization(tenantId))!;
  }

  async saveDirectorySync(
    tenantId: string,
    scopeRef: string,
    subjects: DirectorySubjectInput[],
    departments: DirectoryDepartmentInput[] = [],
  ): Promise<{ runId: string; subjectCount: number }> {
    const runId = randomUUID();
    await this.db.transaction(async (transaction) => {
      await transaction.query(
        "INSERT INTO directory_sync_runs (id,tenant_id,provider,scope_ref,status) VALUES ($1,$2,'feishu',$3,'running')",
        [runId, tenantId, scopeRef],
      );
      for (const subject of subjects) {
        const id = `subject-${createHash("sha256").update(`${tenantId}:${subject.openId}`).digest("hex").slice(0, 20)}`;
        await transaction.query(
          `INSERT INTO enterprise_subjects (id,tenant_id,provider,external_subject_id,display_name,department_ids,leader_external_id,active,last_synced_at)
          VALUES ($1,$2,'feishu',$3,$4,$5::jsonb,$6,$7,now()) ON CONFLICT (tenant_id,provider,external_subject_id) DO UPDATE SET display_name=EXCLUDED.display_name,department_ids=EXCLUDED.department_ids,leader_external_id=EXCLUDED.leader_external_id,active=EXCLUDED.active,last_synced_at=now()`,
          [
            id,
            tenantId,
            subject.openId,
            subject.name,
            JSON.stringify(subject.departmentIds),
            subject.leaderOpenId ?? null,
            subject.active,
          ],
        );
      }
      for (const department of departments) {
        const id = `org-unit-${createHash("sha256").update(`${tenantId}:${department.openDepartmentId}`).digest("hex").slice(0, 20)}`;
        await transaction.query(
          `INSERT INTO organization_units (id,tenant_id,external_department_id,name,parent_external_department_id,active,last_synced_at)
          VALUES ($1,$2,$3,$4,$5,true,now()) ON CONFLICT (tenant_id,external_department_id) DO UPDATE SET name=EXCLUDED.name,parent_external_department_id=EXCLUDED.parent_external_department_id,active=true,last_synced_at=now()`,
          [
            id,
            tenantId,
            department.openDepartmentId,
            department.name,
            department.parentDepartmentId ?? null,
          ],
        );
      }
      await transaction.query(
        "UPDATE directory_sync_runs SET status='succeeded',subject_count=$2,completed_at=now() WHERE id=$1",
        [runId, subjects.length],
      );
    });
    await this.audit(
      tenantId,
      "system",
      "directory.sync.completed",
      "directory_sync",
      runId,
      "success",
      { scopeRef, subjectCount: subjects.length },
    );
    return { runId, subjectCount: subjects.length };
  }

  async departmentIdsForExternalSubject(
    tenantId: string,
    externalSubjectId: string,
  ): Promise<string[]> {
    const result = await this.db.query<{ department_ids: unknown }>(
      "SELECT department_ids FROM enterprise_subjects WHERE tenant_id=$1 AND external_subject_id=$2 AND active=true",
      [tenantId, externalSubjectId],
    );
    return result.rows[0]
      ? json<string[]>(result.rows[0].department_ids)
      : [];
  }

  async enterpriseDirectory(tenantId: string): Promise<{
    subjects: Array<{
      externalSubjectId: string;
      displayName: string;
      departmentIds: string[];
      active: boolean;
    }>;
    departments: Array<{
      externalDepartmentId: string;
      name: string;
      parentExternalDepartmentId: string | null;
    }>;
    lastSyncedAt: string | null;
  }> {
    const [subjects, departments, sync] = await Promise.all([
      this.db.query<any>(
        `SELECT external_subject_id,display_name,department_ids,active
         FROM enterprise_subjects WHERE tenant_id=$1 AND provider='feishu'
         ORDER BY active DESC,display_name,external_subject_id`,
        [tenantId],
      ),
      this.db.query<any>(
        `SELECT external_department_id,name,parent_external_department_id
         FROM organization_units WHERE tenant_id=$1 AND active=true
         ORDER BY name,external_department_id`,
        [tenantId],
      ),
      this.db.query<any>(
        `SELECT completed_at FROM directory_sync_runs
         WHERE tenant_id=$1 AND provider='feishu' AND status='succeeded'
         ORDER BY completed_at DESC LIMIT 1`,
        [tenantId],
      ),
    ]);
    return {
      subjects: subjects.rows.map((row) => ({
        externalSubjectId: row.external_subject_id,
        displayName: row.display_name,
        departmentIds: json<string[]>(row.department_ids),
        active: Boolean(row.active),
      })),
      departments: departments.rows.map((row) => ({
        externalDepartmentId: row.external_department_id,
        name: row.name,
        parentExternalDepartmentId: row.parent_external_department_id ?? null,
      })),
      lastSyncedAt: sync.rows[0]?.completed_at
        ? new Date(sync.rows[0].completed_at).toISOString()
        : null,
    };
  }

  async departmentLabels(tenantId: string): Promise<Record<string, string>> {
    const result = await this.db.query<{
      external_department_id: string;
      name: string;
    }>(
      "SELECT external_department_id,name FROM organization_units WHERE tenant_id=$1 AND active=true",
      [tenantId],
    );
    return Object.fromEntries(
      result.rows.map((row) => [row.external_department_id, row.name]),
    );
  }

  async recordInvitationDelivery(input: {
    tenantId: string;
    campaignId: string;
    externalSubjectId: string;
    tokenFingerprint: string;
    expiresAt: string;
    messageId?: string;
    errorCode?: string;
    notificationType?: "invite" | "reminder" | "deadline" | "report";
    provider?: "feishu" | "email";
    identityHash?: string;
  }): Promise<{ invitationId: string; notificationId: string }> {
    const invitationId = randomUUID();
    const notificationId = randomUUID();
    const actualInvitationId = await this.db.transaction(
      async (transaction): Promise<string> => {
        await transaction.query(
          `INSERT INTO invitations (id,tenant_id,campaign_id,provider,external_subject_id,identity_hash,token_fingerprint,expires_at,delivered_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (campaign_id,provider,external_subject_id) DO UPDATE SET identity_hash=COALESCE(EXCLUDED.identity_hash,invitations.identity_hash),token_fingerprint=EXCLUDED.token_fingerprint,expires_at=EXCLUDED.expires_at,delivered_at=COALESCE(EXCLUDED.delivered_at,invitations.delivered_at)`,
          [
            invitationId,
            input.tenantId,
            input.campaignId,
            input.provider ?? "feishu",
            input.externalSubjectId,
            input.identityHash ?? null,
            input.tokenFingerprint,
            input.expiresAt,
            input.messageId ? new Date().toISOString() : null,
          ],
        );
        const selected = await transaction.query<{ id: string }>(
          "SELECT id FROM invitations WHERE campaign_id=$1 AND provider=$2 AND external_subject_id=$3",
          [input.campaignId, input.provider ?? "feishu", input.externalSubjectId],
        );
        await transaction.query(
          `INSERT INTO notification_jobs (id,tenant_id,campaign_id,invitation_id,notification_type,provider,status,provider_message_id,attempt_count,error_code,sent_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,$9,$10)`,
          [
            notificationId,
            input.tenantId,
            input.campaignId,
            selected.rows[0]!.id,
            input.notificationType ?? "invite",
            input.provider ?? "feishu",
            input.messageId ? "sent" : "failed",
            input.messageId ?? null,
            input.errorCode ?? null,
            input.messageId ? new Date().toISOString() : null,
          ],
        );
        return selected.rows[0]!.id;
      },
    );
    return { invitationId: actualInvitationId, notificationId };
  }

  async listPendingFeishuRecipients(
    tenantId: string,
    campaignId: string,
  ): Promise<string[]> {
    const result = await this.db.query<{ external_subject_id: string }>(
      "SELECT external_subject_id FROM invitations WHERE tenant_id=$1 AND campaign_id=$2 AND provider='feishu' AND completed=false AND delivered_at IS NOT NULL ORDER BY external_subject_id",
      [tenantId, campaignId],
    );
    return result.rows.map((row) => row.external_subject_id);
  }

  async markInvitationCompleted(
    tenantId: string,
    campaignId: string,
    externalSubjectId: string,
    provider: "feishu" | "email" = "feishu",
  ): Promise<void> {
    await this.db.query(
      "UPDATE invitations SET completed=true WHERE tenant_id=$1 AND campaign_id=$2 AND provider=$3 AND external_subject_id=$4",
      [tenantId, campaignId, provider, externalSubjectId],
    );
  }

  async queueAnonymousCompletionReceipt(
    tenantId: string,
    campaignId: string,
    externalSubjectId: string,
    providerOrNow: "feishu" | "email" | Date = "feishu",
    now = new Date(),
  ): Promise<boolean> {
    const provider = providerOrNow instanceof Date ? "feishu" : providerOrNow;
    if (providerOrNow instanceof Date) now = providerOrNow;
    const invitation = await this.db.query<{ id: string }>(
      `SELECT i.id FROM invitations i JOIN campaigns c ON c.id=i.campaign_id
       WHERE i.tenant_id=$1 AND i.campaign_id=$2 AND i.provider=$3
       AND i.external_subject_id=$4 AND c.mode='anonymous'`,
      [tenantId, campaignId, provider, externalSubjectId],
    );
    if (!invitation.rows[0]) return false;
    const entropy = randomUUID();
    const randomizedDelayMinutes =
      15 + (Number.parseInt(entropy.replaceAll("-", "").slice(0, 8), 16) % 31);
    const eligibleAfter = new Date(
      now.getTime() + randomizedDelayMinutes * 60_000,
    );
    const saved = await this.db.query(
      `INSERT INTO completion_receipts
       (id,tenant_id,campaign_id,invitation_id,receipt_hash,queued_batch,eligible_after,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'queued')
       ON CONFLICT (invitation_id) DO NOTHING`,
      [
        randomUUID(),
        tenantId,
        campaignId,
        invitation.rows[0].id,
        createHash("sha256").update(entropy).digest("hex"),
        completionBatch(now),
        eligibleAfter.toISOString(),
      ],
    );
    return saved.rowCount > 0;
  }

  async processDueCompletionReceipts(
    now = new Date(),
    limit = 500,
  ): Promise<{ processed: number; batch: string }> {
    const batch = completionBatch(now);
    return this.db.transaction(async (transaction) => {
      const due = await transaction.query<{
        id: string;
        invitation_id: string;
        tenant_id: string;
      }>(
        `SELECT id,invitation_id,tenant_id FROM completion_receipts
         WHERE status='queued' AND eligible_after<=$1
         ORDER BY receipt_hash LIMIT $2`,
        [now.toISOString(), limit],
      );
      let processed = 0;
      const processedByTenant = new Map<string, number>();
      for (const receipt of due.rows) {
        const claimed = await transaction.query<{ invitation_id: string }>(
          `UPDATE completion_receipts SET status='processed',processed_batch=$2
           WHERE id=$1 AND status='queued' RETURNING invitation_id`,
          [receipt.id, batch],
        );
        if (!claimed.rows[0]) continue;
        await transaction.query(
          "UPDATE invitations SET completed=true WHERE id=$1",
          [claimed.rows[0].invitation_id],
        );
        processed += 1;
        processedByTenant.set(
          receipt.tenant_id,
          (processedByTenant.get(receipt.tenant_id) ?? 0) + 1,
        );
      }
      for (const [tenantId, tenantProcessed] of processedByTenant)
        await transaction.query(
          `INSERT INTO audit_events
           (tenant_id,actor_id,action,object_type,object_id,outcome,metadata)
           VALUES ($1,'system-worker','completion_receipts.processed',
           'completion_batch',$2,'success',$3::jsonb)`,
          [
            tenantId,
            createHash("sha256")
              .update(`completion-batch:${tenantId}:${batch}`)
              .digest("hex"),
            JSON.stringify({ batch, processed: tenantProcessed }),
          ],
        );
      return { processed, batch };
    });
  }

  async recordReportNotification(input: {
    tenantId: string;
    campaignId: string;
    messageId?: string;
    errorCode?: string;
  }): Promise<string> {
    const id = randomUUID();
    await this.db.query(
      `INSERT INTO notification_jobs (id,tenant_id,campaign_id,notification_type,provider,status,provider_message_id,attempt_count,error_code,sent_at)
      VALUES ($1,$2,$3,'report','feishu',$4,$5,1,$6,$7)`,
      [
        id,
        input.tenantId,
        input.campaignId,
        input.messageId ? "sent" : "failed",
        input.messageId ?? null,
        input.errorCode ?? null,
        input.messageId ? new Date().toISOString() : null,
      ],
    );
    return id;
  }

  async markNotificationQueued(
    tenantId: string,
    notificationId: string,
  ): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE notification_jobs SET status='queued',error_code=NULL
      WHERE tenant_id=$1 AND id=$2 AND status='failed'`,
      [tenantId, notificationId],
    );
    return result.rowCount > 0;
  }

  async completeNotificationAttempt(
    tenantId: string,
    notificationId: string,
    result: { messageId?: string; errorCode?: string },
  ): Promise<boolean> {
    const updated = await this.db.query(
      `UPDATE notification_jobs SET status=$3,provider_message_id=$4,
      attempt_count=attempt_count+1,error_code=$5,sent_at=$6
      WHERE tenant_id=$1 AND id=$2`,
      [
        tenantId,
        notificationId,
        result.messageId ? "sent" : "failed",
        result.messageId ?? null,
        result.errorCode ?? null,
        result.messageId ? new Date().toISOString() : null,
      ],
    );
    return updated.rowCount > 0;
  }

  async notificationJob(
    tenantId: string,
    notificationId: string,
  ): Promise<{
    status: "queued" | "sent" | "failed";
    attemptCount: number;
    messageId: string | null;
    errorCode: string | null;
  } | null> {
    const result = await this.db.query<any>(
      `SELECT status,attempt_count,provider_message_id,error_code
      FROM notification_jobs WHERE tenant_id=$1 AND id=$2`,
      [tenantId, notificationId],
    );
    const row = result.rows[0];
    return row
      ? {
          status: row.status,
          attemptCount: Number(row.attempt_count),
          messageId: row.provider_message_id ?? null,
          errorCode: row.error_code ?? null,
        }
      : null;
  }

  async createCampaign(
    tenantId: string,
    input: RepositoryCampaignInput,
    actorId = "user-hr-demo",
  ): Promise<CampaignRecord> {
    const id = randomUUID();
    const configuration = input.assessmentProfileId && input.questionnairePackageId
      ? {
          assessmentProfileId: input.assessmentProfileId,
          questionnairePackageId: input.questionnairePackageId,
        }
      : assessmentConfigurationFor(
          input.target,
          input.organizationMethod ?? "workforce_survey",
        );
    await this.db.query(
      `INSERT INTO campaigns (id,tenant_id,name,target,organization_method,assessment_profile_id,questionnaire_package_id,mode,status,starts_at,closes_at,background_item_ids,custom_items,invited_count,versions,baseline_campaign_id,designated_assessor_external_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9,$10,$11::jsonb,$12::jsonb,$13,$14::jsonb,$15,$16)`,
      [
        id,
        tenantId,
        input.name,
        input.target,
        input.organizationMethod ?? "workforce_survey",
        configuration.assessmentProfileId,
        configuration.questionnairePackageId,
        input.mode,
        input.startsAt,
        input.closesAt,
        JSON.stringify(input.backgroundItemIds ?? []),
        JSON.stringify(input.customItems ?? []),
        input.invitedCount ?? 0,
        JSON.stringify(VERSION_TUPLE),
        input.baselineCampaignId ?? null,
        input.designatedAssessorExternalId ?? null,
      ],
    );
    await this.audit(
      tenantId,
      actorId,
      "campaign.created",
      "campaign",
      id,
      "success",
      { target: input.target, mode: input.mode },
    );
    return (await this.getCampaign(tenantId, id))!;
  }

  async ensurePublicPersonalCampaign(
    assessmentProfileId: "personal_iv_v0.1" | "personal_iov_observer_v0.1" =
      "personal_iv_v0.1",
  ): Promise<CampaignRecord> {
    await this.db.query(
      "INSERT INTO tenants (id,name) VALUES ('tenant-personal','个人测评') ON CONFLICT (id) DO NOTHING",
    );
    const configuration = publicPersonalAssessmentConfiguration(
      assessmentProfileId,
    );
    const existing = await this.latestOpenPersonalCampaign(
      "tenant-personal",
      assessmentProfileId,
    );
    if (
      existing &&
      usesCurrentRuleVersions(existing.versions) &&
      usesCurrentQuestionnaireRelease(
        await this.getQuestionnaireRelease(existing.tenantId, existing.id),
      )
    )
      return existing;
    if (existing) {
      const openCampaigns = await this.db.query<{
        id: string;
        versions: CampaignRecord["versions"] | string;
      }>(
        `SELECT id,versions FROM campaigns
         WHERE tenant_id='tenant-personal' AND assessment_profile_id=$1
         AND status IN ('scheduled','active')`,
        [assessmentProfileId],
      );
      for (const row of openCampaigns.rows) {
        const versions = json<CampaignRecord["versions"]>(row.versions);
        const release = await this.getQuestionnaireRelease(
          "tenant-personal",
          row.id,
        );
        if (
          usesCurrentRuleVersions(versions) &&
          usesCurrentQuestionnaireRelease(release)
        )
          continue;
        const retired = await this.db.query<{ id: string }>(
          `UPDATE campaigns SET status='closed'
           WHERE tenant_id='tenant-personal' AND id=$1
           AND status IN ('scheduled','active') RETURNING id`,
          [row.id],
        );
        if (!retired.rows[0]) continue;
        await this.audit(
          "tenant-personal",
          "system",
          "campaign.public_personal_ruleset_retired",
          "campaign",
          row.id,
          "success",
          { previousVersions: versions, replacementVersions: VERSION_TUPLE },
        );
      }
      const current = await this.latestOpenPersonalCampaign(
        "tenant-personal",
        assessmentProfileId,
      );
      if (
        current &&
        usesCurrentRuleVersions(current.versions) &&
        usesCurrentQuestionnaireRelease(
          await this.getQuestionnaireRelease(current.tenantId, current.id),
        )
      )
        return current;
    }
    return this.createCampaign(
      "tenant-personal",
      {
        name:
          assessmentProfileId === "personal_iov_observer_v0.1"
            ? "个人 AI 准备度与组织环境观察"
            : "个人 AI 准备度测评",
        target: configuration.target,
        organizationMethod: configuration.organizationMethod,
        assessmentProfileId: configuration.assessmentProfileId,
        questionnairePackageId: configuration.questionnairePackageId,
        mode: "anonymous",
        startsAt: new Date(Date.now() - 86_400_000).toISOString(),
        closesAt: new Date("2030-12-31T15:59:59.000Z").toISOString(),
        backgroundItemIds: ["BG01", "BG02", "BG03"],
        customItems: [],
        invitedCount: 0,
        baselineCampaignId: null,
        designatedAssessorExternalId: null,
      },
      "system",
    );
  }

  async updateDraftCampaign(
    tenantId: string,
    id: string,
    input: CreateCampaignInput,
    actorId = "user-hr-demo",
  ): Promise<CampaignRecord | null> {
    const current = await this.getCampaign(tenantId, id);
    if (!current) return null;
    if (current.status !== "draft")
      throw new Error(`CAMPAIGN_NOT_EDITABLE:${current.status}`);
    const configuration = assessmentConfigurationFor(
      input.target,
      input.organizationMethod ?? "workforce_survey",
    );
    await this.db.query(
      `UPDATE campaigns SET name=$3,target=$4,organization_method=$5,mode=$6,
       starts_at=$7,closes_at=$8,background_item_ids=$9::jsonb,custom_items=$10::jsonb,invited_count=$11,
       baseline_campaign_id=$12,designated_assessor_external_id=$13,
       assessment_profile_id=$14,questionnaire_package_id=$15
       WHERE tenant_id=$1 AND id=$2`,
      [
        tenantId,
        id,
        input.name,
        input.target,
        input.organizationMethod ?? "workforce_survey",
        input.mode,
        input.startsAt,
        input.closesAt,
        JSON.stringify(input.backgroundItemIds ?? []),
        JSON.stringify(input.customItems ?? []),
        input.invitedCount ?? 0,
        input.baselineCampaignId ?? null,
        input.designatedAssessorExternalId ?? null,
        configuration.assessmentProfileId,
        configuration.questionnairePackageId,
      ],
    );
    await this.audit(tenantId, actorId, "campaign.updated", "campaign", id, "success", {
      target: input.target,
      mode: input.mode,
    });
    return this.getCampaign(tenantId, id);
  }

  async deleteDraftCampaign(
    tenantId: string,
    id: string,
    actorId = "user-hr-demo",
  ): Promise<boolean> {
    const current = await this.getCampaign(tenantId, id);
    if (!current) return false;
    if (current.status !== "draft" || current.submittedCount > 0)
      throw new Error(`CAMPAIGN_NOT_DELETABLE:${current.status}`);
    await this.audit(tenantId, actorId, "campaign.deleted", "campaign", id, "success", {
      name: current.name,
    });
    const result = await this.db.query(
      "DELETE FROM campaigns WHERE tenant_id=$1 AND id=$2 AND status='draft'",
      [tenantId, id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listCampaigns(tenantId: string): Promise<CampaignRecord[]> {
    const result = await this.db.query<any>(
      `SELECT c.*, count(r.id)::int AS submitted_count,
      count(s.id) FILTER (WHERE (s.snapshot->'employeeAiCapability'->>'status' = 'scored' OR s.snapshot->'organizationalAiReadiness'->>'status' = 'scored'))::int AS valid_count
      FROM campaigns c LEFT JOIN response_submissions r ON r.campaign_id=c.id LEFT JOIN score_snapshots s ON s.response_id=r.id
      WHERE c.tenant_id=$1 GROUP BY c.id ORDER BY c.created_at DESC`,
      [tenantId],
    );
    return result.rows.map((row) => this.mapCampaign(row));
  }

  async listDueActiveCampaigns(now = new Date()): Promise<CampaignRecord[]> {
    const result = await this.db.query<any>(
      `SELECT c.*, count(r.id)::int AS submitted_count,
      count(s.id) FILTER (WHERE (s.snapshot->'employeeAiCapability'->>'status' = 'scored' OR s.snapshot->'organizationalAiReadiness'->>'status' = 'scored'))::int AS valid_count
      FROM campaigns c LEFT JOIN response_submissions r ON r.campaign_id=c.id LEFT JOIN score_snapshots s ON s.response_id=r.id
      WHERE c.status='active' AND c.closes_at<=$1 GROUP BY c.id ORDER BY c.closes_at,c.id`,
      [now.toISOString()],
    );
    return result.rows.map((row) => this.mapCampaign(row));
  }

  async listDueScheduledCampaigns(now = new Date()): Promise<CampaignRecord[]> {
    const result = await this.db.query<any>(
      `SELECT c.*, count(r.id)::int AS submitted_count,
      count(s.id) FILTER (WHERE (s.snapshot->'employeeAiCapability'->>'status' = 'scored' OR s.snapshot->'organizationalAiReadiness'->>'status' = 'scored'))::int AS valid_count
      FROM campaigns c LEFT JOIN response_submissions r ON r.campaign_id=c.id LEFT JOIN score_snapshots s ON s.response_id=r.id
      WHERE c.status='scheduled' AND c.starts_at<=$1 GROUP BY c.id ORDER BY c.starts_at,c.id`,
      [now.toISOString()],
    );
    return result.rows.map((row) => this.mapCampaign(row));
  }

  async tenantName(tenantId: string): Promise<string | null> {
    const result = await this.db.query<{ name: string }>(
      "SELECT name FROM tenants WHERE id=$1",
      [tenantId],
    );
    return result.rows[0]?.name ?? null;
  }

  async getCampaign(
    tenantId: string,
    id: string,
  ): Promise<CampaignRecord | null> {
    const result = await this.db.query<any>(
      `SELECT c.*, count(r.id)::int AS submitted_count,
      count(s.id) FILTER (WHERE (s.snapshot->'employeeAiCapability'->>'status' = 'scored' OR s.snapshot->'organizationalAiReadiness'->>'status' = 'scored'))::int AS valid_count
      FROM campaigns c LEFT JOIN response_submissions r ON r.campaign_id=c.id LEFT JOIN score_snapshots s ON s.response_id=r.id
      WHERE c.tenant_id=$1 AND c.id=$2 GROUP BY c.id`,
      [tenantId, id],
    );
    return result.rows[0] ? this.mapCampaign(result.rows[0]) : null;
  }

  async latestOrganizationReportForCampaign(
    tenantId: string,
    campaignId: string,
  ): Promise<ReportSnapshot | null> {
    const result = await this.db.query<any>(
      `SELECT snapshot FROM report_snapshots WHERE tenant_id=$1 AND campaign_id=$2
      AND report_type IN ('organization','organization_scoped','manager_self_assessment')
      ORDER BY created_at DESC LIMIT 1`,
      [tenantId, campaignId],
    );
    return result.rows[0]
      ? json<ReportSnapshot>(result.rows[0].snapshot)
      : null;
  }

  async getPublicCampaign(id: string): Promise<CampaignRecord | null> {
    const result = await this.db.query<any>(
      `SELECT c.*, count(r.id)::int AS submitted_count,
      count(s.id) FILTER (WHERE (s.snapshot->'employeeAiCapability'->>'status' = 'scored' OR s.snapshot->'organizationalAiReadiness'->>'status' = 'scored'))::int AS valid_count
      FROM campaigns c LEFT JOIN response_submissions r ON r.campaign_id=c.id LEFT JOIN score_snapshots s ON s.response_id=r.id
      WHERE c.id=$1 GROUP BY c.id`,
      [id],
    );
    return result.rows[0] ? this.mapCampaign(result.rows[0]) : null;
  }

  async latestOpenPersonalCampaign(
    tenantId?: string,
    assessmentProfileId: AssessmentProfileId = "personal_iv_v0.1",
  ): Promise<CampaignRecord | null> {
    const result = await this.db.query<any>(
      `SELECT c.*, count(r.id)::int AS submitted_count,
      count(s.id) FILTER (WHERE (s.snapshot->'employeeAiCapability'->>'status' = 'scored' OR s.snapshot->'organizationalAiReadiness'->>'status' = 'scored'))::int AS valid_count
      FROM campaigns c LEFT JOIN response_submissions r ON r.campaign_id=c.id LEFT JOIN score_snapshots s ON s.response_id=r.id
      WHERE ($1::text IS NULL OR c.tenant_id=$1) AND c.assessment_profile_id=$2
      AND c.status IN ('scheduled','active')
      GROUP BY c.id ORDER BY c.created_at DESC LIMIT 1`,
      [tenantId ?? null, assessmentProfileId],
    );
    return result.rows[0] ? this.mapCampaign(result.rows[0]) : null;
  }

  async saveQuestionnaireRelease(
    release: QuestionnaireRelease,
  ): Promise<QuestionnaireRelease> {
    const existing = await this.getQuestionnaireRelease(
      release.tenantId,
      release.campaignId,
    );
    if (existing) {
      if (existing.contentHash !== release.contentHash)
        throw new Error("QUESTIONNAIRE_RELEASE_IMMUTABLE");
      return existing;
    }
    await this.db.query(
      `INSERT INTO questionnaire_releases
       (id,tenant_id,campaign_id,snapshot,content_hash,rule_release_id,rule_release_artifact_id,created_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8)`,
      [
        release.id,
        release.tenantId,
        release.campaignId,
        JSON.stringify(release),
        release.contentHash,
        BUILTIN_RULE_RELEASE_ID,
        BUILTIN_RULE_ARTIFACT_ID,
        release.createdAt,
      ],
    );
    return release;
  }

  async getQuestionnaireRelease(
    tenantId: string,
    campaignId: string,
  ): Promise<QuestionnaireRelease | null> {
    const result = await this.db.query<any>(
      `SELECT snapshot FROM questionnaire_releases
       WHERE tenant_id=$1 AND campaign_id=$2`,
      [tenantId, campaignId],
    );
    return result.rows[0]
      ? json<QuestionnaireRelease>(result.rows[0].snapshot)
      : null;
  }

  async extendCampaignDeadline(
    tenantId: string,
    campaignId: string,
    newClosesAt: string,
    reason: string,
    actorId: string,
  ): Promise<CampaignScheduleAmendment | null> {
    const id = randomUUID();
    const amendment = await this.db.transaction(
      async (transaction): Promise<CampaignScheduleAmendment | null> => {
        const current = await transaction.query<any>(
          `SELECT closes_at,status FROM campaigns
           WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
          [tenantId, campaignId],
        );
        const row = current.rows[0];
        if (!row) return null;
        if (!["scheduled", "active"].includes(row.status))
          throw new Error(`CAMPAIGN_DEADLINE_NOT_EDITABLE:${row.status}`);
        const previousClosesAt = toIso(row.closes_at);
        if (new Date(newClosesAt).getTime() <= new Date(previousClosesAt).getTime())
          throw new Error("CAMPAIGN_DEADLINE_MUST_EXTEND");
        const sequenceResult = await transaction.query<{ sequence: number }>(
          `SELECT COALESCE(MAX(sequence),0)::int + 1 AS sequence
           FROM campaign_schedule_amendments WHERE campaign_id=$1`,
          [campaignId],
        );
        const sequence = Number(sequenceResult.rows[0]?.sequence ?? 1);
        await transaction.query(
          `INSERT INTO campaign_schedule_amendments
           (id,tenant_id,campaign_id,sequence,previous_closes_at,new_closes_at,reason,created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            id,
            tenantId,
            campaignId,
            sequence,
            previousClosesAt,
            newClosesAt,
            reason,
            actorId,
          ],
        );
        await transaction.query(
          `UPDATE campaigns SET closes_at=$3 WHERE tenant_id=$1 AND id=$2`,
          [tenantId, campaignId, newClosesAt],
        );
        return {
          id,
          tenantId,
          campaignId,
          sequence,
          previousClosesAt,
          newClosesAt: new Date(newClosesAt).toISOString(),
          reason,
          createdBy: actorId,
          createdAt: new Date().toISOString(),
        };
      },
    );
    if (amendment)
      await this.audit(
        tenantId,
        actorId,
        "campaign.deadline_extended",
        "campaign",
        campaignId,
        "success",
        {
          sequence: amendment.sequence,
          previousClosesAt: amendment.previousClosesAt,
          newClosesAt: amendment.newClosesAt,
          reason,
        },
      );
    return amendment;
  }

  async listCampaignScheduleAmendments(
    tenantId: string,
    campaignId: string,
  ): Promise<CampaignScheduleAmendment[]> {
    const result = await this.db.query<any>(
      `SELECT * FROM campaign_schedule_amendments
       WHERE tenant_id=$1 AND campaign_id=$2 ORDER BY sequence`,
      [tenantId, campaignId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      campaignId: row.campaign_id,
      sequence: Number(row.sequence),
      previousClosesAt: toIso(row.previous_closes_at),
      newClosesAt: toIso(row.new_closes_at),
      reason: row.reason,
      createdBy: row.created_by,
      createdAt: toIso(row.created_at),
    }));
  }

  async transitionCampaign(
    tenantId: string,
    id: string,
    status: CampaignSnapshot["status"],
    actorId = "user-hr-demo",
  ): Promise<CampaignRecord | null> {
    const current = await this.getCampaign(tenantId, id);
    if (!current) return null;
    const allowed: Record<string, string[]> = {
      draft: ["scheduled", "active", "cancelled"],
      scheduled: ["active", "cancelled"],
      active: ["closed", "cancelled"],
      closed: ["archived"],
      cancelled: ["archived"],
      archived: [],
    };
    if (!allowed[current.status]?.includes(status))
      throw new Error(
        `INVALID_CAMPAIGN_TRANSITION:${current.status}->${status}`,
      );
    const freezesPublishedDraft =
      current.status === "draft" && ["scheduled", "active"].includes(status);
    const frozenCurrent = freezesPublishedDraft
      ? await this.freezeCampaignScope(current)
      : current;
    const snapshotHash =
      freezesPublishedDraft
        ? createHash("sha256")
            .update(
              JSON.stringify({
                ...frozenCurrent,
                status,
                submittedCount: undefined,
                validCount: undefined,
              }),
            )
            .digest("hex")
        : null;
    if (freezesPublishedDraft)
      await this.freezeResearchContext(frozenCurrent);
    const updated = await this.db.query(
      "UPDATE campaigns SET status=$3, snapshot_hash=COALESCE($4,snapshot_hash) WHERE tenant_id=$1 AND id=$2 AND status=$5",
      [tenantId, id, status, snapshotHash, current.status],
    );
    if (!updated.rowCount) throw new Error("CAMPAIGN_TRANSITION_RACE");
    await this.audit(
      tenantId,
      actorId,
      `campaign.${status}`,
      "campaign",
      id,
      "success",
      { from: current.status },
    );
    return this.getCampaign(tenantId, id);
  }

  private async freezeCampaignScope(
    campaign: CampaignRecord,
  ): Promise<CampaignRecord> {
    const emailScope = (
      await this.db.query<{ external_subject_id: string }>(
        "SELECT external_subject_id FROM invitations WHERE tenant_id=$1 AND campaign_id=$2 AND provider='email' AND delivered_at IS NOT NULL ORDER BY external_subject_id",
        [campaign.tenantId, campaign.id],
      )
    ).rows.map((row) => row.external_subject_id);
    const subjectIds =
      campaign.organizationMethod === "single_manager_self_assessment"
        ? [campaign.designatedAssessorExternalId!]
        : emailScope.length
          ? emailScope
        : (
            await this.db.query<{ external_subject_id: string }>(
              `SELECT external_subject_id FROM enterprise_subjects
               WHERE tenant_id=$1 AND provider='feishu' AND active=true
               ORDER BY external_subject_id`,
              [campaign.tenantId],
            )
          ).rows.map((row) => row.external_subject_id);
    if (!subjectIds.length) return campaign;
    await this.db.transaction(async (transaction) => {
      for (const externalSubjectId of subjectIds)
        await transaction.query(
          `INSERT INTO campaign_scope_members
           (campaign_id,tenant_id,external_subject_id,source)
           VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [
            campaign.id,
            campaign.tenantId,
            externalSubjectId,
            campaign.organizationMethod === "single_manager_self_assessment"
              ? "designated_assessor"
              : emailScope.length
                ? "email_invite"
                : "feishu_directory",
          ],
        );
      await transaction.query(
        "UPDATE campaigns SET invited_count=$3 WHERE tenant_id=$1 AND id=$2",
        [campaign.tenantId, campaign.id, subjectIds.length],
      );
    });
    return { ...campaign, invitedCount: subjectIds.length };
  }

  async campaignScopeExternalIds(
    tenantId: string,
    campaignId: string,
  ): Promise<string[]> {
    const result = await this.db.query<{ external_subject_id: string }>(
      `SELECT external_subject_id FROM campaign_scope_members
       WHERE tenant_id=$1 AND campaign_id=$2 ORDER BY external_subject_id`,
      [tenantId, campaignId],
    );
    return result.rows.map((row) => row.external_subject_id);
  }

  async isCampaignScopeMember(
    tenantId: string,
    campaignId: string,
    externalSubjectId: string,
  ): Promise<boolean> {
    const scope = await this.campaignScopeExternalIds(tenantId, campaignId);
    return !scope.length || scope.includes(externalSubjectId);
  }

  async emailInvitationIdentity(
    tenantId: string,
    campaignId: string,
    identityHash: string,
  ): Promise<{ participantId: string; completed: boolean } | null> {
    const result = await this.db.query<{ external_subject_id: string; completed: boolean }>(
      `SELECT external_subject_id,completed FROM invitations
       WHERE tenant_id=$1 AND campaign_id=$2 AND provider='email' AND identity_hash=$3
       AND delivered_at IS NOT NULL AND expires_at>now() LIMIT 1`,
      [tenantId, campaignId, identityHash],
    );
    const row = result.rows[0];
    return row
      ? { participantId: row.external_subject_id, completed: Boolean(row.completed) }
      : null;
  }

  async completedEmailInvitationRecipients(
    tenantId: string,
    campaignId: string,
  ): Promise<Array<{ identityHash: string; encryptedEmail: string }>> {
    const result = await this.db.query<{
      identity_hash: string;
      encrypted_value: string;
    }>(
      `SELECT DISTINCT i.identity_hash,ai.encrypted_value
       FROM invitations i
       JOIN account_identities ai
         ON ai.identity_type='email' AND ai.identity_hash=i.identity_hash
       WHERE i.tenant_id=$1 AND i.campaign_id=$2 AND i.provider='email'
         AND i.completed=true AND i.identity_hash IS NOT NULL`,
      [tenantId, campaignId],
    );
    return result.rows.map((row) => ({
      identityHash: row.identity_hash,
      encryptedEmail: row.encrypted_value,
    }));
  }

  async saveEmailScopeMembers(
    tenantId: string,
    campaignId: string,
    participantIds: string[],
  ): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const existing = await transaction.query<{ external_subject_id: string }>(
        "SELECT external_subject_id FROM invitations WHERE tenant_id=$1 AND campaign_id=$2 AND provider='email' AND delivered_at IS NOT NULL",
        [tenantId, campaignId],
      );
      const allParticipantIds = [
        ...new Set([
          ...existing.rows.map((row) => row.external_subject_id),
          ...participantIds,
        ]),
      ];
      for (const participantId of allParticipantIds)
        await transaction.query(
          `INSERT INTO campaign_scope_members (campaign_id,tenant_id,external_subject_id,source)
           VALUES ($1,$2,$3,'email_invite') ON CONFLICT DO NOTHING`,
          [campaignId, tenantId, participantId],
        );
      await transaction.query(
        "UPDATE campaigns SET invited_count=$3 WHERE tenant_id=$1 AND id=$2",
        [tenantId, campaignId, allParticipantIds.length],
      );
    });
  }

  private async freezeResearchContext(campaign: CampaignRecord): Promise<void> {
    const profile = await this.getOrganizationResearchProfile(
      campaign.tenantId,
    );
    const authorization = await this.getNormAuthorization(campaign.tenantId);
    const personContext = await this.protectedPersonContextCohorts(
      campaign.tenantId,
    );
    const reasons: string[] = [];
    if (!profile) reasons.push("ORGANIZATION_RESEARCH_PROFILE_MISSING");
    if (authorization?.status !== "authorized")
      reasons.push("NORM_AUTHORIZATION_MISSING");
    if (!personContext.length) reasons.push("PERSON_CONTEXT_MAPPING_MISSING");
    const subgroupEligible = personContext.some(
      (cohort) => cohort.protectionStatus === "included",
    );
    const scopeMemberHashes = (
      await this.campaignScopeExternalIds(campaign.tenantId, campaign.id)
    ).map((externalId) =>
      createHash("sha256")
        .update(`campaign-scope:${campaign.id}:${externalId}`)
        .digest("hex"),
    );
    await this.db.transaction(async (transaction) => {
      await transaction.query(
        "INSERT INTO campaign_sampling_frame_snapshots (id,tenant_id,campaign_id,snapshot,schema_version) VALUES ($1,$2,$3,$4::jsonb,'v0.1') ON CONFLICT (campaign_id) DO NOTHING",
        [
          randomUUID(),
          campaign.tenantId,
          campaign.id,
          JSON.stringify({
            invitationMethod: "full_population",
            eligibleCount: campaign.invitedCount,
            scopeMemberHashes,
            target: campaign.target,
            mode: campaign.mode,
            startsAt: campaign.startsAt,
            closesAt: campaign.closesAt,
          }),
        ],
      );
      await transaction.query(
        "INSERT INTO research_context_snapshots (id,tenant_id,campaign_id,snapshot,schema_version) VALUES ($1,$2,$3,$4::jsonb,'v0.1') ON CONFLICT (campaign_id) DO NOTHING",
        [
          randomUUID(),
          campaign.tenantId,
          campaign.id,
          JSON.stringify({
            organizationProfile: profile,
            questionnaireVersions: campaign.versions,
            backgroundItemIds: campaign.backgroundItemIds,
            normAuthorization: authorization,
          }),
        ],
      );
      await transaction.query(
        "INSERT INTO norm_eligibility_assessments (id,tenant_id,campaign_id,psychometric_eligible,norm_candidate,subgroup_eligible,reason_codes) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT (campaign_id) DO NOTHING",
        [
          randomUUID(),
          campaign.tenantId,
          campaign.id,
          Boolean(profile),
          Boolean(
            profile &&
            authorization?.status === "authorized" &&
            personContext.length,
          ),
          subgroupEligible,
          JSON.stringify(reasons),
        ],
      );
      for (const cohort of personContext)
        await transaction.query(
          `INSERT INTO campaign_person_context_snapshots (id,tenant_id,campaign_id,cohort_key,context,member_count,protection_status,coarsening_level,classification_version)
          VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,'person_context_v0.1') ON CONFLICT (campaign_id,cohort_key) DO NOTHING`,
          [
            randomUUID(),
            campaign.tenantId,
            campaign.id,
            cohort.cohortKey,
            JSON.stringify(cohort.context),
            cohort.memberCount,
            cohort.protectionStatus,
            cohort.coarseningLevel,
          ],
        );
    });
  }

  async savePersonContextMappings(
    tenantId: string,
    mappings: PersonContextMappingInput[],
    actorId: string,
  ): Promise<{ saved: number; classificationVersion: string }> {
    const unique = new Map(
      mappings.map((mapping) => [mapping.externalSubjectId, mapping]),
    );
    await this.db.transaction(async (transaction) => {
      for (const mapping of unique.values())
        await transaction.query(
          `INSERT INTO person_context_mappings (id,tenant_id,external_subject_id,source,raw_context,job_family,career_stage,people_manager,tenure_band,province,employment_type,in_target_population,classification_version)
          VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,'person_context_v0.1')
          ON CONFLICT (tenant_id,external_subject_id) DO UPDATE SET source=EXCLUDED.source,raw_context=EXCLUDED.raw_context,job_family=EXCLUDED.job_family,career_stage=EXCLUDED.career_stage,people_manager=EXCLUDED.people_manager,tenure_band=EXCLUDED.tenure_band,province=EXCLUDED.province,employment_type=EXCLUDED.employment_type,in_target_population=EXCLUDED.in_target_population,classification_version=EXCLUDED.classification_version,updated_at=now()`,
          [
            randomUUID(),
            tenantId,
            mapping.externalSubjectId,
            mapping.source,
            JSON.stringify(mapping.rawContext ?? {}),
            mapping.jobFamily,
            mapping.careerStage,
            mapping.peopleManager,
            mapping.tenureBand,
            mapping.province,
            mapping.employmentType,
            mapping.inTargetPopulation,
          ],
        );
    });
    await this.audit(
      tenantId,
      actorId,
      "person_context.mappings_saved",
      "person_context_mapping",
      "bulk",
      "success",
      { saved: unique.size, classificationVersion: "person_context_v0.1" },
    );
    return { saved: unique.size, classificationVersion: "person_context_v0.1" };
  }

  async protectedPersonContextCohorts(
    tenantId: string,
    minimum = 10,
  ): Promise<PersonContextCohortSnapshot[]> {
    const result = await this.db.query<any>(
      `SELECT job_family,career_stage,tenure_band,province FROM person_context_mappings
      WHERE tenant_id=$1 AND in_target_population=true`,
      [tenantId],
    );
    if (!result.rows.length) return [];
    const levels = [
      ["jobFamily", "careerStage", "tenureBand", "province"],
      ["jobFamily", "careerStage", "tenureBand"],
      ["jobFamily", "careerStage"],
      ["jobFamily"],
    ] as const;
    const normalized = result.rows.map((row) => ({
      jobFamily: row.job_family,
      careerStage: row.career_stage,
      tenureBand: row.tenure_band,
      province: row.province,
    }));
    for (let level = 0; level < levels.length; level += 1) {
      const fields = levels[level]!;
      const grouped = new Map<string, { context: any; count: number }>();
      for (const row of normalized) {
        const context = Object.fromEntries(
          fields.map((field) => [field, row[field]]),
        );
        const key = JSON.stringify(context);
        const current = grouped.get(key);
        grouped.set(key, { context, count: (current?.count ?? 0) + 1 });
      }
      const groups = [...grouped.entries()];
      if (groups.every(([, group]) => group.count >= minimum))
        return groups.map(([key, group]) => ({
          cohortKey: createHash("sha256")
            .update(key)
            .digest("hex")
            .slice(0, 24),
          context: group.context,
          memberCount: group.count,
          protectionStatus: "included",
          coarseningLevel: level,
        }));
      if (level === levels.length - 1) {
        const included = groups
          .filter(([, group]) => group.count >= minimum)
          .map(([key, group]) => ({
            cohortKey: createHash("sha256")
              .update(key)
              .digest("hex")
              .slice(0, 24),
            context: group.context,
            memberCount: group.count,
            protectionStatus: "included" as const,
            coarseningLevel: level,
          }));
        const suppressedCount = groups
          .filter(([, group]) => group.count < minimum)
          .reduce((sum, [, group]) => sum + group.count, 0);
        return suppressedCount
          ? [
              ...included,
              {
                cohortKey: "suppressed",
                context: { jobFamily: "unknown" },
                memberCount: suppressedCount,
                protectionStatus: "suppressed",
                coarseningLevel: level,
              },
            ]
          : included;
      }
    }
    return [];
  }

  async getResponseDraft(
    tenantId: string,
    campaignId: string,
    subjectRefHash: string,
  ): Promise<ResponseDraft | null> {
    const result = await this.db.query<any>(
      "SELECT * FROM response_drafts WHERE tenant_id=$1 AND campaign_id=$2 AND subject_ref_hash=$3",
      [tenantId, campaignId, subjectRefHash],
    );
    const row = result.rows[0];
    return row
      ? {
          campaignId: row.campaign_id,
          answers: json(row.answers),
          backgroundAnswers: json(row.background_answers),
          customAnswers: json(row.custom_answers),
          clientRevision: Number(row.client_revision),
          updatedAt: toIso(row.updated_at),
        }
      : null;
  }

  async saveResponseDraft(
    tenantId: string,
    campaignId: string,
    subjectRefHash: string,
    draft: Omit<ResponseDraft, "campaignId" | "updatedAt">,
  ): Promise<ResponseDraft> {
    await this.db.query(
      `INSERT INTO response_drafts (id,tenant_id,campaign_id,subject_ref_hash,answers,background_answers,custom_answers,client_revision)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8) ON CONFLICT (campaign_id,subject_ref_hash) DO UPDATE SET answers=EXCLUDED.answers,background_answers=EXCLUDED.background_answers,custom_answers=EXCLUDED.custom_answers,client_revision=EXCLUDED.client_revision,updated_at=now()
      WHERE response_drafts.client_revision < EXCLUDED.client_revision`,
      [
        randomUUID(),
        tenantId,
        campaignId,
        subjectRefHash,
        JSON.stringify(draft.answers),
        JSON.stringify(draft.backgroundAnswers),
        JSON.stringify(draft.customAnswers),
        draft.clientRevision,
      ],
    );
    return (await this.getResponseDraft(tenantId, campaignId, subjectRefHash))!;
  }

  async saveSubmission(
    submission: ResponseSubmission,
    score: ScoreSnapshot,
    report: ReportSnapshot | null,
    options: {
      subjectRefHash?: string;
      draftSubjectRefHash?: string;
      linkType?: "identified" | "anonymous_self_service";
      retrievalTokenHash?: string;
      departmentIds?: string[];
      publisherActorId?: string;
    } = {},
  ): Promise<void> {
    await this.db.transaction(async (transaction) => {
      await transaction.query(
        `INSERT INTO response_submissions
        (id,tenant_id,campaign_id,participant_ref,answers,background_answers,custom_answers,response_hash,submitted_at,privacy_notice_version,consented_at)
        VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,$10,$11)`,
        [
          submission.id,
          submission.tenantId,
          submission.campaignId,
          submission.participantRef,
          JSON.stringify(submission.answers),
          JSON.stringify(submission.backgroundAnswers),
          JSON.stringify(submission.customAnswers),
          submission.responseHash,
          submission.submittedAt,
          submission.privacyNoticeVersion ?? null,
          submission.consentedAt ?? null,
        ],
      );
      const lineage = await transaction.query<any>(
        `SELECT c.target,c.organization_method,q.id AS questionnaire_release_id,
         q.rule_release_id,q.rule_release_artifact_id
         FROM campaigns c JOIN questionnaire_releases q ON q.campaign_id=c.id
         WHERE c.tenant_id=$1 AND c.id=$2`,
        [submission.tenantId, submission.campaignId],
      );
      const ruleLineage = lineage.rows[0];
      if (
        !ruleLineage?.questionnaire_release_id ||
        !ruleLineage.rule_release_id ||
        !ruleLineage.rule_release_artifact_id
      )
        throw new Error("RULE_RELEASE_LINEAGE_MISSING");
      const assessmentInputId = randomUUID();
      const assessmentInput = {
        schemaVersion: "assessment_input_v0.1",
        assessmentProfile: `${ruleLineage.target}:${ruleLineage.organization_method}`,
        questionnaireReleaseId: ruleLineage.questionnaire_release_id,
        responseId: submission.id,
        coreAnswers: submission.answers,
        backgroundAnswers: submission.backgroundAnswers,
        customAnswerHash: contentHash(submission.customAnswers),
        privacyNoticeVersion: submission.privacyNoticeVersion ?? null,
      };
      const assessmentInputHash = contentHash(assessmentInput);
      await transaction.query(
        `INSERT INTO assessment_input_snapshots
         (id,tenant_id,campaign_id,response_id,assessment_profile,snapshot,content_hash,created_at)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,
        [
          assessmentInputId,
          submission.tenantId,
          submission.campaignId,
          submission.id,
          assessmentInput.assessmentProfile,
          JSON.stringify(assessmentInput),
          assessmentInputHash,
          submission.submittedAt,
        ],
      );
      await transaction.query(
        `INSERT INTO score_snapshots
         (id,tenant_id,campaign_id,response_id,assessment_input_snapshot_id,rule_release_id,rule_release_artifact_id,snapshot,input_hash,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
        [
          score.id,
          submission.tenantId,
          submission.campaignId,
          submission.id,
          assessmentInputId,
          ruleLineage.rule_release_id,
          ruleLineage.rule_release_artifact_id,
          JSON.stringify(score),
          score.inputHash,
          score.createdAt,
        ],
      );
      await transaction.query(
        `INSERT INTO scoring_runs
         (id,tenant_id,campaign_id,assessment_input_snapshot_id,rule_release_id,rule_release_artifact_id,score_snapshot_id,status,input_hash,output_hash,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'succeeded',$8,$9,$10)`,
        [
          randomUUID(),
          submission.tenantId,
          submission.campaignId,
          assessmentInputId,
          ruleLineage.rule_release_id,
          ruleLineage.rule_release_artifact_id,
          score.id,
          assessmentInputHash,
          contentHash(score),
          score.createdAt,
        ],
      );
      if (report)
        await transaction.query(
          `INSERT INTO report_snapshots
           (id,tenant_id,campaign_id,response_id,assessment_input_snapshot_id,rule_release_id,rule_release_artifact_id,report_type,status,snapshot,content_hash,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)`,
          [
            report.id,
            report.tenantId,
            report.campaignId,
            report.responseId,
            assessmentInputId,
            ruleLineage.rule_release_id,
            ruleLineage.rule_release_artifact_id,
            report.reportType,
            report.status,
            JSON.stringify(report),
            report.contentHash,
            report.createdAt,
          ],
        );
      if (report?.status === "published" && options.publisherActorId) {
        const publicationId = randomUUID();
        await transaction.query(
          `INSERT INTO report_publications
          (id,tenant_id,report_snapshot_id,audience,status,reviewed_by,reviewed_at,published_by,published_at)
          VALUES ($1,$2,$3,'employee','published',$4,now(),$4,now())
          ON CONFLICT (report_snapshot_id,audience) DO NOTHING`,
          [publicationId, submission.tenantId, report.id, options.publisherActorId],
        );
        for (const action of ["report.reviewed", "report.published"])
          await transaction.query(
            "INSERT INTO audit_events (tenant_id,actor_id,action,object_type,object_id,outcome,metadata) VALUES ($1,$2,$3,'report',$4,'success',$5::jsonb)",
            [
              submission.tenantId,
              options.publisherActorId,
              action,
              report.id,
              JSON.stringify({ audience: "employee", reviewType: "automatic" }),
            ],
          );
      }
      if (options.subjectRefHash)
        await transaction.query(
          "INSERT INTO response_subject_links (id,tenant_id,campaign_id,response_id,subject_ref_hash,link_type,department_ids) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)",
          [
            randomUUID(),
            submission.tenantId,
            submission.campaignId,
            submission.id,
            options.subjectRefHash,
            options.linkType ?? "anonymous_self_service",
            JSON.stringify(options.departmentIds ?? []),
          ],
        );
      if (report && options.retrievalTokenHash)
        await transaction.query(
          "INSERT INTO report_retrieval_tokens (id,tenant_id,report_snapshot_id,token_hash,expires_at) VALUES ($1,$2,$3,$4,now()+interval '365 days')",
          [
            randomUUID(),
            submission.tenantId,
            report.id,
            options.retrievalTokenHash,
          ],
        );
      if (options.draftSubjectRefHash)
        await transaction.query(
          "DELETE FROM response_drafts WHERE tenant_id=$1 AND campaign_id=$2 AND subject_ref_hash=$3",
          [
            submission.tenantId,
            submission.campaignId,
            options.draftSubjectRefHash,
          ],
        );
      await transaction.query(
        "INSERT INTO audit_events (tenant_id,actor_id,action,object_type,object_id,outcome,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)",
        [
          submission.tenantId,
          submission.participantRef,
          "response.submitted",
          "response",
          submission.id,
          "success",
          JSON.stringify({ campaignId: submission.campaignId }),
        ],
      );
    });
  }

  async submissionResultByResponseHash(
    tenantId: string,
    campaignId: string,
    responseHash: string,
  ): Promise<{
    submission: ResponseSubmission;
    score: ScoreSnapshot;
    report: ReportSnapshot | null;
  } | null> {
    const result = await this.db.query<any>(
      `SELECT r.*,s.snapshot AS score_snapshot,
       (SELECT rp.snapshot FROM report_snapshots rp
        WHERE rp.tenant_id=r.tenant_id AND rp.response_id=r.id
        AND rp.report_type IN ('immediate_personal','personal_scoped','personal_observer')
        ORDER BY rp.created_at LIMIT 1) AS report_snapshot
       FROM response_submissions r
       JOIN score_snapshots s ON s.response_id=r.id
       WHERE r.tenant_id=$1 AND r.campaign_id=$2 AND r.response_hash=$3`,
      [tenantId, campaignId, responseHash],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      submission: {
        id: row.id,
        tenantId: row.tenant_id,
        campaignId: row.campaign_id,
        participantRef: row.participant_ref,
        answers: json(row.answers),
        backgroundAnswers: json(row.background_answers),
        customAnswers: json(row.custom_answers),
        submittedAt: toIso(row.submitted_at),
        responseHash: row.response_hash,
        privacyNoticeVersion: row.privacy_notice_version ?? null,
        consentedAt: row.consented_at ? toIso(row.consented_at) : null,
      },
      score: json(row.score_snapshot),
      report: row.report_snapshot ? json(row.report_snapshot) : null,
    };
  }

  async createReportRetrievalToken(
    tenantId: string,
    reportId: string,
    tokenHash: string,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO report_retrieval_tokens
       (id,tenant_id,report_snapshot_id,token_hash,expires_at)
       VALUES ($1,$2,$3,$4,now()+interval '365 days')`,
      [randomUUID(), tenantId, reportId, tokenHash],
    );
  }

  async saveReport(
    report: ReportSnapshot,
    audit = true,
    automaticPublication?: {
      actorId: string;
      audience: ReportPublication["audience"];
    },
  ): Promise<boolean> {
    return this.db.transaction(async (transaction) => {
      const lineage = await transaction.query<any>(
        `SELECT c.target,c.organization_method,q.id AS questionnaire_release_id,
         q.rule_release_id,q.rule_release_artifact_id
         FROM campaigns c JOIN questionnaire_releases q ON q.campaign_id=c.id
         WHERE c.tenant_id=$1 AND c.id=$2`,
        [report.tenantId, report.campaignId],
      );
      const ruleLineage = lineage.rows[0];
      if (
        !ruleLineage?.questionnaire_release_id ||
        !ruleLineage.rule_release_id ||
        !ruleLineage.rule_release_artifact_id
      )
        throw new Error("RULE_RELEASE_LINEAGE_MISSING");
      const sourceScores = await transaction.query<{
        id: string;
        input_hash: string;
      }>(
        `SELECT id,input_hash FROM score_snapshots
         WHERE tenant_id=$1 AND campaign_id=$2
         ORDER BY response_id,id`,
        [report.tenantId, report.campaignId],
      );
      const assessmentInputId = randomUUID();
      const assessmentInput = {
        schemaVersion: "report_input_v0.1",
        assessmentProfile: `${ruleLineage.target}:${ruleLineage.organization_method}`,
        questionnaireReleaseId: ruleLineage.questionnaire_release_id,
        reportId: report.id,
        reportType: report.reportType,
        responseId: report.responseId,
        scoreInputHash: report.score.inputHash,
        sourceScoreHashes: sourceScores.rows.map((row) => row.input_hash),
        organizationBenchmarkHash: report.organizationBenchmark
          ? contentHash(report.organizationBenchmark)
          : null,
        retestComparisonHash: report.retestComparison
          ? contentHash(report.retestComparison)
          : null,
      };
      const assessmentInputHash = contentHash(assessmentInput);
      await transaction.query(
        `INSERT INTO assessment_input_snapshots
         (id,tenant_id,campaign_id,response_id,assessment_profile,snapshot,content_hash,created_at)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,
        [
          assessmentInputId,
          report.tenantId,
          report.campaignId,
          report.responseId,
          assessmentInput.assessmentProfile,
          JSON.stringify(assessmentInput),
          assessmentInputHash,
          report.createdAt,
        ],
      );
      const saved = await transaction.query(
        `INSERT INTO report_snapshots
         (id,tenant_id,campaign_id,response_id,assessment_input_snapshot_id,rule_release_id,rule_release_artifact_id,report_type,status,snapshot,content_hash,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)
         ON CONFLICT (campaign_id,response_id,report_type,content_hash) DO NOTHING`,
        [
          report.id,
          report.tenantId,
          report.campaignId,
          report.responseId,
          assessmentInputId,
          ruleLineage.rule_release_id,
          ruleLineage.rule_release_artifact_id,
          report.reportType,
          report.status,
          JSON.stringify(report),
          report.contentHash,
          report.createdAt,
        ],
      );
      if (!saved.rowCount) {
        await transaction.query(
          "DELETE FROM assessment_input_snapshots WHERE id=$1",
          [assessmentInputId],
        );
      } else if (
        report.responseId === null &&
        [
          "organization",
          "organization_scoped",
          "manager_self_assessment",
        ].includes(report.reportType)
      ) {
        await transaction.query(
          `INSERT INTO scoring_runs
           (id,tenant_id,campaign_id,assessment_input_snapshot_id,rule_release_id,rule_release_artifact_id,score_snapshot_id,status,input_hash,output_hash,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,NULL,'succeeded',$7,$8,$9)`,
          [
            randomUUID(),
            report.tenantId,
            report.campaignId,
            assessmentInputId,
            ruleLineage.rule_release_id,
            ruleLineage.rule_release_artifact_id,
            assessmentInputHash,
            contentHash(report.score),
            report.createdAt,
          ],
        );
      }
      if (audit && saved.rowCount)
        await transaction.query(
          "INSERT INTO audit_events (tenant_id,actor_id,action,object_type,object_id,outcome,metadata) VALUES ($1,'system','report.generated','report',$2,'success',$3::jsonb)",
          [
            report.tenantId,
            report.id,
            JSON.stringify({ reportType: report.reportType }),
          ],
        );
      if (
        saved.rowCount &&
        report.status === "published" &&
        automaticPublication
      ) {
        await transaction.query(
          `INSERT INTO report_publications
          (id,tenant_id,report_snapshot_id,audience,status,reviewed_by,reviewed_at,published_by,published_at)
          VALUES ($1,$2,$3,$4,'published',$5,now(),$5,now())`,
          [
            randomUUID(),
            report.tenantId,
            report.id,
            automaticPublication.audience,
            automaticPublication.actorId,
          ],
        );
        for (const action of ["report.reviewed", "report.published"])
          await transaction.query(
            "INSERT INTO audit_events (tenant_id,actor_id,action,object_type,object_id,outcome,metadata) VALUES ($1,$2,$3,'report',$4,'success',$5::jsonb)",
            [
              report.tenantId,
              automaticPublication.actorId,
              action,
              report.id,
              JSON.stringify({
                audience: automaticPublication.audience,
                reviewType: "automatic",
              }),
            ],
          );
      }
      return saved.rowCount > 0;
    });
  }

  async listReports(
    tenantId: string,
    campaignId?: string,
  ): Promise<ReportSnapshot[]> {
    const result = campaignId
      ? await this.db.query<any>(
          "SELECT r.snapshot, EXISTS(SELECT 1 FROM report_publications p WHERE p.report_snapshot_id=r.id AND p.status='published' AND p.revoked_at IS NULL) AS published FROM report_snapshots r WHERE r.tenant_id=$1 AND r.campaign_id=$2 ORDER BY r.created_at DESC",
          [tenantId, campaignId],
        )
      : await this.db.query<any>(
          "SELECT r.snapshot, EXISTS(SELECT 1 FROM report_publications p WHERE p.report_snapshot_id=r.id AND p.status='published' AND p.revoked_at IS NULL) AS published FROM report_snapshots r WHERE r.tenant_id=$1 ORDER BY r.created_at DESC",
          [tenantId],
        );
    return result.rows.map((row) => {
      const snapshot = json<ReportSnapshot>(row.snapshot);
      return {
        ...snapshot,
        status: row.published ? "published" : snapshot.status,
      };
    });
  }

  async listReportsForActor(
    context: AuthContext,
    campaignId?: string,
  ): Promise<ReportSnapshot[]> {
    const reports = await this.listReports(context.tenantId, campaignId);
    const personalTypes = new Set([
      "immediate_personal",
      "second_stage_personal",
      "personal_scoped",
      "personal_observer",
    ]);
    const grants = await this.db.query<any>(
      `SELECT report_snapshot_id FROM report_access_grants WHERE tenant_id=$1 AND grantee_user_id=$2
      AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now()) AND operations ? 'view'`,
      [context.tenantId, context.userId],
    );
    const granted = new Set(grants.rows.map((row) => row.report_snapshot_id));
    return reports.filter((report) => {
      if (
        ["owner", "hr_admin"].includes(context.role) &&
        !personalTypes.has(report.reportType)
      )
        return true;
      return (
        granted.has(report.id) &&
        (context.role !== "manager" || report.status === "published")
      );
    });
  }

  async getReport(
    tenantId: string,
    id: string,
  ): Promise<ReportSnapshot | null> {
    const result = await this.db.query<any>(
      "SELECT r.snapshot, EXISTS(SELECT 1 FROM report_publications p WHERE p.report_snapshot_id=r.id AND p.status='published' AND p.revoked_at IS NULL) AS published FROM report_snapshots r WHERE r.tenant_id=$1 AND r.id=$2",
      [tenantId, id],
    );
    if (!result.rows[0]) return null;
    const snapshot = json<ReportSnapshot>(result.rows[0].snapshot);
    return {
      ...snapshot,
      status: result.rows[0].published ? "published" : snapshot.status,
    };
  }

  async assertReportReplayLineage(
    tenantId: string,
    reportId: string,
  ): Promise<void> {
    const result = await this.db.query<any>(
      `SELECT r.snapshot AS report_snapshot,
       rr.manifest_hash,rr.status AS rule_status,
       ra.artifact,ra.content_hash AS artifact_content_hash,
       ra.signature_algorithm,ra.signature,ra.verification_key,ra.retention_status,
       ai.snapshot AS input_snapshot,ai.content_hash AS input_content_hash
       FROM report_snapshots r
       JOIN rule_releases rr ON rr.id=r.rule_release_id
       JOIN rule_release_artifacts ra ON ra.id=r.rule_release_artifact_id
         AND ra.rule_release_id=rr.id
       JOIN assessment_input_snapshots ai ON ai.id=r.assessment_input_snapshot_id
       WHERE r.tenant_id=$1 AND r.id=$2`,
      [tenantId, reportId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("REPORT_REPLAY_LINEAGE_MISSING");
    const report = json<ReportSnapshot>(row.report_snapshot);
    if (row.rule_status !== "released" || row.retention_status !== "retained")
      throw new Error("REPORT_REPLAY_RULE_ARTIFACT_UNAVAILABLE");
    if (report.ruleManifestHash !== row.manifest_hash)
      throw new Error("REPORT_REPLAY_RULE_MANIFEST_MISMATCH");
    const actualArtifactHash = contentHash(json(row.artifact));
    if (actualArtifactHash !== row.artifact_content_hash)
      throw new Error("REPORT_REPLAY_RULE_ARTIFACT_HASH_MISMATCH");
    if (
      row.signature_algorithm !== "ed25519_v1" ||
      !row.verification_key ||
      !verifySignature(
        null,
        Buffer.from(canonicalJson(json(row.artifact))),
        row.verification_key,
        Buffer.from(row.signature, "base64"),
      )
    )
      throw new Error("REPORT_REPLAY_RULE_ARTIFACT_SIGNATURE_INVALID");
    if (contentHash(json(row.input_snapshot)) !== row.input_content_hash)
      throw new Error("REPORT_REPLAY_INPUT_SNAPSHOT_HASH_MISMATCH");
  }

  async getReportByContentHash(
    id: string,
    contentHash: string,
  ): Promise<ReportSnapshot | null> {
    const result = await this.db.query<any>(
      "SELECT snapshot FROM report_snapshots WHERE id=$1 AND content_hash=$2",
      [id, contentHash],
    );
    return result.rows[0]
      ? json<ReportSnapshot>(result.rows[0].snapshot)
      : null;
  }

  async saveReportArtifact(input: {
    tenantId: string;
    reportSnapshotId: string;
    storageKey: string;
    contentHash: string;
    byteSize: number;
  }): Promise<ReportArtifact> {
    const id = randomUUID();
    await this.db.query(
      `INSERT INTO report_artifacts (id,tenant_id,report_snapshot_id,artifact_type,storage_key,content_hash,byte_size,mime_type)
      VALUES ($1,$2,$3,'pdf',$4,$5,$6,'application/pdf')
      ON CONFLICT (report_snapshot_id,artifact_type,content_hash) DO NOTHING`,
      [
        id,
        input.tenantId,
        input.reportSnapshotId,
        input.storageKey,
        input.contentHash,
        input.byteSize,
      ],
    );
    const artifact = await this.getReportArtifact(
      input.tenantId,
      input.reportSnapshotId,
      input.contentHash,
    );
    if (!artifact) throw new Error("REPORT_ARTIFACT_NOT_PERSISTED");
    return artifact;
  }

  async getReportArtifact(
    tenantId: string,
    reportSnapshotId: string,
    contentHash?: string,
  ): Promise<ReportArtifact | null> {
    const result = await this.db.query<any>(
      `SELECT * FROM report_artifacts WHERE tenant_id=$1 AND report_snapshot_id=$2 AND artifact_type='pdf'
      AND ($3::text IS NULL OR content_hash=$3) ORDER BY created_at DESC LIMIT 1`,
      [tenantId, reportSnapshotId, contentHash ?? null],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          tenantId: row.tenant_id,
          reportSnapshotId: row.report_snapshot_id,
          artifactType: "pdf",
          storageKey: row.storage_key,
          contentHash: row.content_hash,
          byteSize: Number(row.byte_size),
          mimeType: "application/pdf",
          createdAt: toIso(row.created_at),
        }
      : null;
  }

  async hasReportDownloadGrant(
    tenantId: string,
    reportId: string,
    userId: string,
  ): Promise<boolean> {
    const result = await this.db.query(
      `SELECT 1 FROM report_access_grants WHERE tenant_id=$1 AND report_snapshot_id=$2 AND grantee_user_id=$3
      AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now()) AND operations ? 'download'`,
      [tenantId, reportId, userId],
    );
    return Boolean(result.rows[0]);
  }

  async getReportForActor(
    context: AuthContext,
    id: string,
  ): Promise<ReportSnapshot | null> {
    const report = await this.getReport(context.tenantId, id);
    if (!report) return null;
    const personalTypes = [
      "immediate_personal",
      "second_stage_personal",
      "personal_scoped",
      "personal_observer",
    ];
    if (
      ["owner", "hr_admin"].includes(context.role) &&
      !personalTypes.includes(report.reportType)
    )
      return report;
    const grant = await this.db.query<any>(
      `SELECT 1 FROM report_access_grants WHERE tenant_id=$1 AND report_snapshot_id=$2 AND grantee_user_id=$3
      AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now()) AND operations ? 'view'`,
      [context.tenantId, id, context.userId],
    );
    if (
      !grant.rows[0] ||
      (context.role === "manager" && report.status !== "published")
    )
      return null;
    await this.audit(
      context.tenantId,
      context.userId,
      "report.viewed",
      "report",
      id,
      "success",
      { role: context.role },
    );
    return report;
  }

  async getReportByRetrievalToken(
    id: string,
    tokenHash: string,
  ): Promise<ReportSnapshot | null> {
    const result = await this.db.query<any>(
      `SELECT r.snapshot, EXISTS(SELECT 1 FROM report_publications p WHERE p.report_snapshot_id=r.id AND p.status='published' AND p.revoked_at IS NULL) AS published
      FROM report_snapshots r JOIN report_retrieval_tokens t ON t.report_snapshot_id=r.id
      WHERE r.id=$1 AND t.token_hash=$2 AND t.revoked_at IS NULL AND t.expires_at>now()`,
      [id, tokenHash],
    );
    return result.rows[0]
      ? {
          ...json<ReportSnapshot>(result.rows[0].snapshot),
          status: result.rows[0].published
            ? "published"
            : json<ReportSnapshot>(result.rows[0].snapshot).status,
        }
      : null;
  }

  async listPersonalReportsBySubjectHashes(
    tenantId: string,
    subjectHashes: string[],
  ): Promise<PersonalReportListItem[]> {
    if (!subjectHashes.length) return [];
    const accepted = new Set(subjectHashes);
    const result = await this.db.query<any>(
      `SELECT r.snapshot,c.name AS campaign_name,l.subject_ref_hash
      FROM response_subject_links l JOIN report_snapshots r ON r.response_id=l.response_id JOIN campaigns c ON c.id=r.campaign_id
      WHERE l.tenant_id=$1 AND r.report_type IN ('immediate_personal','second_stage_personal','personal_scoped','personal_observer','manager_self_assessment','employee_organization_summary')
      ORDER BY r.created_at DESC`,
      [tenantId],
    );
    return result.rows
      .filter((row) => accepted.has(row.subject_ref_hash))
      .map((row) => ({
        report: json<ReportSnapshot>(row.snapshot),
        campaignName: row.campaign_name,
      }));
  }

  async getPersonalReportBySubjectHashes(
    tenantId: string,
    reportId: string,
    subjectHashes: string[],
  ): Promise<ReportSnapshot | null> {
    const accepted = new Set(subjectHashes);
    if (!accepted.size) return null;
    const result = await this.db.query<any>(
      `SELECT r.snapshot,l.subject_ref_hash FROM response_subject_links l JOIN report_snapshots r ON r.response_id=l.response_id
      WHERE l.tenant_id=$1 AND r.id=$2 AND r.report_type IN ('immediate_personal','second_stage_personal','personal_scoped','personal_observer','manager_self_assessment','employee_organization_summary')`,
      [tenantId, reportId],
    );
    const row = result.rows.find((entry) =>
      accepted.has(entry.subject_ref_hash),
    );
    return row ? json<ReportSnapshot>(row.snapshot) : null;
  }

  async createReportGrant(
    tenantId: string,
    reportId: string,
    granteeUserId: string,
    operations: ReportAccessGrant["operations"],
    expiresAt: string | null,
    actorId: string,
  ): Promise<ReportAccessGrant | null> {
    const report = await this.getReport(tenantId, reportId);
    if (!report) return null;
    const user = await this.db.query<any>(
      "SELECT 1 FROM users WHERE tenant_id=$1 AND id=$2",
      [tenantId, granteeUserId],
    );
    if (!user.rows[0]) throw new Error("GRANTEE_NOT_IN_TENANT");
    const id = randomUUID();
    await this.db.query(
      "INSERT INTO report_access_grants (id,tenant_id,report_snapshot_id,grantee_user_id,expires_at,pdf_allowed,operations,granted_by) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)",
      [
        id,
        tenantId,
        reportId,
        granteeUserId,
        expiresAt,
        operations.includes("download"),
        JSON.stringify(operations),
        actorId,
      ],
    );
    await this.audit(
      tenantId,
      actorId,
      "report.access_granted",
      "report",
      reportId,
      "success",
      { granteeUserId, operations, expiresAt },
    );
    return {
      id,
      tenantId,
      reportSnapshotId: reportId,
      granteeUserId,
      operations,
      expiresAt,
      revokedAt: null,
    };
  }

  async listReportGrants(
    tenantId: string,
    reportId: string,
  ): Promise<ReportAccessGrantListItem[]> {
    const result = await this.db.query<any>(
      `SELECT g.*,u.display_name,u.role FROM report_access_grants g
      JOIN users u ON u.tenant_id=g.tenant_id AND u.id=g.grantee_user_id
      WHERE g.tenant_id=$1 AND g.report_snapshot_id=$2
      ORDER BY g.created_at DESC,g.id`,
      [tenantId, reportId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      reportSnapshotId: row.report_snapshot_id,
      granteeUserId: row.grantee_user_id,
      granteeDisplayName: row.display_name,
      granteeRole: row.role,
      operations: json<ReportAccessGrant["operations"]>(row.operations),
      expiresAt: row.expires_at ? toIso(row.expires_at) : null,
      revokedAt: row.revoked_at ? toIso(row.revoked_at) : null,
      grantedBy: row.granted_by ?? null,
      grantedAt: toIso(row.created_at),
    }));
  }

  async revokeReportGrant(
    tenantId: string,
    grantId: string,
    actorId: string,
  ): Promise<boolean> {
    const result = await this.db.query(
      "UPDATE report_access_grants SET revoked_at=now() WHERE tenant_id=$1 AND id=$2 AND revoked_at IS NULL",
      [tenantId, grantId],
    );
    if (result.rowCount)
      await this.audit(
        tenantId,
        actorId,
        "report.access_revoked",
        "report_grant",
        grantId,
        "success",
        {},
      );
    return result.rowCount > 0;
  }

  async createIndividualReportGrant(input: {
    tenantId: string;
    campaignId: string;
    granteeUserId: string;
    operations: IndividualReportGrant["operations"];
    expiresAt: string | null;
    grantedBy: string;
  }): Promise<IndividualReportGrant> {
    const campaign = await this.getCampaign(input.tenantId, input.campaignId);
    if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND");
    if (campaign.mode !== "identified")
      throw new Error("INDIVIDUAL_REPORT_GRANT_REQUIRES_IDENTIFIED_CAMPAIGN");
    if (!['personal', 'combined'].includes(campaign.target))
      throw new Error("CAMPAIGN_HAS_NO_PERSONAL_REPORTS");
    const user = await this.db.query<any>(
      "SELECT display_name,role FROM users WHERE tenant_id=$1 AND id=$2",
      [input.tenantId, input.granteeUserId],
    );
    if (!user.rows[0] || !["owner", "hr_admin"].includes(user.rows[0].role))
      throw new Error("INDIVIDUAL_REPORT_GRANTEE_MUST_BE_HR");
    const id = randomUUID();
    await this.db.query(
      `INSERT INTO individual_report_grants
      (id,tenant_id,campaign_id,grantee_user_id,operations,expires_at,granted_by)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
      [
        id,
        input.tenantId,
        input.campaignId,
        input.granteeUserId,
        JSON.stringify(input.operations),
        input.expiresAt,
        input.grantedBy,
      ],
    );
    await this.audit(
      input.tenantId,
      input.grantedBy,
      "individual_report.access_granted",
      "campaign",
      input.campaignId,
      "success",
      {
        granteeUserId: input.granteeUserId,
        operations: input.operations,
        expiresAt: input.expiresAt,
      },
    );
    const grant = (await this.listIndividualReportGrants(
      input.tenantId,
      input.campaignId,
    )).find((item) => item.id === id);
    if (!grant) throw new Error("INDIVIDUAL_REPORT_GRANT_NOT_PERSISTED");
    return grant;
  }

  async listIndividualReportGrants(
    tenantId: string,
    campaignId: string,
  ): Promise<IndividualReportGrant[]> {
    const result = await this.db.query<any>(
      `SELECT g.*,u.display_name FROM individual_report_grants g
      JOIN users u ON u.tenant_id=g.tenant_id AND u.id=g.grantee_user_id
      WHERE g.tenant_id=$1 AND g.campaign_id=$2 ORDER BY g.created_at DESC,g.id`,
      [tenantId, campaignId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      campaignId: row.campaign_id,
      granteeUserId: row.grantee_user_id,
      granteeDisplayName: row.display_name,
      operations: json<IndividualReportGrant["operations"]>(row.operations),
      expiresAt: row.expires_at ? toIso(row.expires_at) : null,
      revokedAt: row.revoked_at ? toIso(row.revoked_at) : null,
      grantedBy: row.granted_by,
      grantedAt: toIso(row.created_at),
    }));
  }

  async revokeIndividualReportGrant(
    tenantId: string,
    grantId: string,
    actorId: string,
  ): Promise<boolean> {
    const result = await this.db.query<any>(
      `UPDATE individual_report_grants SET revoked_at=now()
      WHERE tenant_id=$1 AND id=$2 AND revoked_at IS NULL RETURNING campaign_id`,
      [tenantId, grantId],
    );
    if (result.rows[0])
      await this.audit(
        tenantId,
        actorId,
        "individual_report.access_revoked",
        "campaign",
        result.rows[0].campaign_id,
        "success",
        { grantId },
      );
    return Boolean(result.rows[0]);
  }

  async hasIndividualReportGrant(
    tenantId: string,
    campaignId: string,
    userId: string,
    operation: "view" | "download",
  ): Promise<boolean> {
    const result = await this.db.query(
      `SELECT 1 FROM individual_report_grants WHERE tenant_id=$1 AND campaign_id=$2
      AND grantee_user_id=$3 AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at>now()) AND operations ? $4 LIMIT 1`,
      [tenantId, campaignId, userId, operation],
    );
    return Boolean(result.rows[0]);
  }

  async listIndividualReportsForActor(
    context: AuthContext,
    campaignId: string,
  ): Promise<IndividualReportListItem[] | null> {
    if (
      !(await this.hasIndividualReportGrant(
        context.tenantId,
        campaignId,
        context.userId,
        "view",
      ))
    )
      return null;
    const result = await this.db.query<any>(
      `SELECT r.id AS report_id,r.report_type,r.created_at,s.participant_ref,
      COALESCE(es.display_name,u.display_name,'员工') AS display_name
      FROM report_snapshots r
      JOIN response_submissions s ON s.id=r.response_id
      LEFT JOIN enterprise_subjects es ON es.tenant_id=r.tenant_id
        AND es.external_subject_id=s.participant_ref
      LEFT JOIN users u ON u.tenant_id=r.tenant_id AND u.external_id=s.participant_ref
      WHERE r.tenant_id=$1 AND r.campaign_id=$2 AND s.participant_ref IS NOT NULL
      AND r.report_type IN ('immediate_personal','second_stage_personal','personal_scoped','personal_observer')
      ORDER BY display_name,r.created_at DESC`,
      [context.tenantId, campaignId],
    );
    await this.audit(
      context.tenantId,
      context.userId,
      "individual_report.list_viewed",
      "campaign",
      campaignId,
      "success",
      { reportCount: result.rows.length },
    );
    return result.rows.map((row) => ({
      reportId: row.report_id,
      campaignId,
      externalSubjectId: row.participant_ref,
      subjectDisplayName: row.display_name,
      reportType: row.report_type,
      createdAt: toIso(row.created_at),
    }));
  }

  async getIndividualReportForActor(
    context: AuthContext,
    campaignId: string,
    externalSubjectId: string,
    operation: "view" | "download" = "view",
  ): Promise<ReportSnapshot | null> {
    if (
      !(await this.hasIndividualReportGrant(
        context.tenantId,
        campaignId,
        context.userId,
        operation,
      ))
    )
      return null;
    const result = await this.db.query<{ id: string }>(
      `SELECT r.id FROM report_snapshots r JOIN response_submissions s ON s.id=r.response_id
      WHERE r.tenant_id=$1 AND r.campaign_id=$2 AND s.participant_ref=$3
      AND r.report_type IN ('immediate_personal','second_stage_personal','personal_scoped','personal_observer')
      ORDER BY CASE WHEN r.report_type='second_stage_personal' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 1`,
      [context.tenantId, campaignId, externalSubjectId],
    );
    const report = result.rows[0]
      ? await this.getReport(context.tenantId, result.rows[0].id)
      : null;
    if (!report || report.status !== "published") return null;
    if (operation === "view")
      await this.audit(
        context.tenantId,
        context.userId,
        "individual_report.viewed",
        "report",
        report.id,
        "success",
        {
          campaignId,
          subjectRef: createHash("sha256").update(externalSubjectId).digest("hex"),
        },
      );
    return report;
  }

  async publishReport(
    tenantId: string,
    reportId: string,
    audience: ReportPublication["audience"],
    actorId = "user-hr-demo",
  ): Promise<(ReportPublication & { created: boolean }) | null> {
    const report = await this.getReport(tenantId, reportId);
    if (!report) return null;
    return this.db.transaction(async (transaction) => {
      const id = randomUUID();
      const inserted = await transaction.query<any>(
        `INSERT INTO report_publications
        (id,tenant_id,report_snapshot_id,audience,status,reviewed_by,reviewed_at,published_by,published_at)
        VALUES ($1,$2,$3,$4,'reviewed',$5,now(),$5,now())
        ON CONFLICT (report_snapshot_id,audience) DO NOTHING RETURNING *`,
        [id, tenantId, reportId, audience, actorId],
      );
      if (inserted.rowCount) {
        await transaction.query(
          "INSERT INTO audit_events (tenant_id,actor_id,action,object_type,object_id,outcome,metadata) VALUES ($1,$2,'report.reviewed','report',$3,'success',$4::jsonb)",
          [
            tenantId,
            actorId,
            reportId,
            JSON.stringify({ audience, reviewType: "manual" }),
          ],
        );
        await transaction.query(
          "UPDATE report_publications SET status='published',published_by=$2,published_at=now() WHERE id=$1",
          [id, actorId],
        );
        await transaction.query(
          "INSERT INTO audit_events (tenant_id,actor_id,action,object_type,object_id,outcome,metadata) VALUES ($1,$2,'report.published','report',$3,'success',$4::jsonb)",
          [tenantId, actorId, reportId, JSON.stringify({ audience })],
        );
      }
      const result = await transaction.query<any>(
        "SELECT * FROM report_publications WHERE tenant_id=$1 AND report_snapshot_id=$2 AND audience=$3 AND revoked_at IS NULL",
        [tenantId, reportId, audience],
      );
      const row = result.rows[0];
      return row
        ? {
            id: row.id,
            tenantId: row.tenant_id,
            reportSnapshotId: row.report_snapshot_id,
            audience: row.audience,
            status: row.status,
            reviewedBy: row.reviewed_by,
            reviewedAt: toIso(row.reviewed_at),
            publishedBy: row.published_by,
            publishedAt: toIso(row.published_at),
            supersededAt: row.superseded_at ? toIso(row.superseded_at) : null,
            created: inserted.rowCount > 0,
          }
        : null;
    });
  }

  async createActionPlanItem(
    tenantId: string,
    reportId: string,
    input: CreateActionPlanInput,
    actorId = "user-hr-demo",
  ): Promise<ActionPlanItem | null> {
    const report = await this.getReport(tenantId, reportId);
    if (!report) return null;
    if (report.status !== "published")
      throw new Error("REPORT_NOT_PUBLISHED_FOR_ACTION");
    if (
      !report.recommendations.some((item) => item.id === input.recommendationId)
    )
      throw new Error("RECOMMENDATION_NOT_IN_REPORT");
    const recommendation = report.recommendations.find(
      (item) => item.id === input.recommendationId,
    )!;
    const evidenceReferences = report.evidenceReferences.filter((reference) =>
      recommendation.evidenceIds.includes(reference.id),
    );
    const riskConditions = [
      recommendation.isSafetyPrerequisite
        ? "扩大执行前必须先确认数据、合规、人工复核和异常升级边界。"
        : null,
      recommendation.isScalingAction
        ? "必须先小范围试运行并达到成功指标，不得从问卷结果直接推导全面扩大。"
        : null,
      recommendation.isMeasurementAction
        ? "评估时同时记录质量、返工、异常和价值，不以使用次数替代效果。"
        : null,
      recommendation.releaseEligible
        ? null
        : "该建议仍处于产品试点验证阶段，执行结果需要在复测与复盘中核对，不得表述为已证明有效的干预。",
    ].filter((value): value is string => Boolean(value));
    const milestones: ActionMilestone[] = input.milestones.map((milestone) => ({
      id: randomUUID(),
      title: milestone.title,
      dueAt: milestone.dueAt,
      status: "pending",
    }));
    const id = randomUUID();
    const inserted = await this.db.query<any>(
      `INSERT INTO action_plan_items
      (id,tenant_id,campaign_id,source_report_id,recommendation_id,dimension_id,title,owner,starts_at,due_at,success_metric,resources,milestones,evidence_ids,evidence_references,risk_conditions,retest_at,status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,$17,'planned')
      ON CONFLICT (tenant_id,source_report_id,recommendation_id) DO NOTHING
      RETURNING *`,
      [
        id,
        tenantId,
        report.campaignId,
        report.id,
        input.recommendationId,
        recommendation.dimensionId,
        input.title,
        input.owner,
        input.startsAt,
        input.dueAt,
        input.successMetric,
        input.resources,
        JSON.stringify(milestones),
        JSON.stringify(recommendation.evidenceIds),
        JSON.stringify(evidenceReferences),
        JSON.stringify(riskConditions),
        input.retestAt,
      ],
    );
    let row = inserted.rows[0];
    if (!row)
      row = (
        await this.db.query<any>(
          `SELECT * FROM action_plan_items
           WHERE tenant_id=$1 AND source_report_id=$2 AND recommendation_id=$3`,
          [tenantId, report.id, input.recommendationId],
        )
      ).rows[0];
    if (!row) throw new Error("ACTION_IDEMPOTENCY_LOOKUP_FAILED");
    if (inserted.rowCount)
      await this.audit(
        tenantId,
        actorId,
        "action.created",
        "action",
        id,
        "success",
        {
          reportId,
          recommendationId: input.recommendationId,
          dimensionId: recommendation.dimensionId,
          retestAt: input.retestAt,
        },
      );
    return actionFromRow(row);
  }

  async listActionPlanItems(
    tenantId: string,
    campaignId: string,
  ): Promise<ActionPlanItem[]> {
    const result = await this.db.query<any>(
      "SELECT * FROM action_plan_items WHERE tenant_id=$1 AND campaign_id=$2 ORDER BY due_at,id",
      [tenantId, campaignId],
    );
    return result.rows.map(actionFromRow);
  }

  async listTenantActionPlanItems(
    tenantId: string,
  ): Promise<ActionPlanListItem[]> {
    const result = await this.db.query<any>(
      `SELECT a.*,c.name AS campaign_name FROM action_plan_items a JOIN campaigns c ON c.id=a.campaign_id
      WHERE a.tenant_id=$1 ORDER BY CASE a.status WHEN 'active' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END,a.due_at,a.id`,
      [tenantId],
    );
    return result.rows.map((row) => ({
      ...actionFromRow(row),
      campaignName: row.campaign_name,
    }));
  }

  async transitionActionPlanItem(
    tenantId: string,
    id: string,
    status: ActionPlanItem["status"],
    actorId: string,
  ): Promise<ActionPlanItem | null> {
    const current = await this.db.query<any>(
      "SELECT * FROM action_plan_items WHERE tenant_id=$1 AND id=$2",
      [tenantId, id],
    );
    const row = current.rows[0];
    if (!row) return null;
    const allowed: Record<
      ActionPlanItem["status"],
      ActionPlanItem["status"][]
    > = {
      planned: ["active", "cancelled"],
      active: ["completed", "cancelled"],
      completed: [],
      cancelled: [],
    };
    if (!allowed[row.status as ActionPlanItem["status"]].includes(status))
      throw new Error(`INVALID_ACTION_TRANSITION:${row.status}->${status}`);
    const milestones = json<ActionMilestone[]>(row.milestones ?? []).map(
      (milestone) =>
        status === "completed"
          ? { ...milestone, status: "completed" as const }
          : milestone,
    );
    await this.db.query(
      `UPDATE action_plan_items SET status=$3,
       progress_percent=CASE WHEN $3='completed' THEN 100 ELSE progress_percent END,
       milestones=$4::jsonb,updated_at=now() WHERE tenant_id=$1 AND id=$2`,
      [tenantId, id, status, JSON.stringify(milestones)],
    );
    await this.audit(
      tenantId,
      actorId,
      `action.${status}`,
      "action",
      id,
      "success",
      { from: row.status },
    );
    return {
      ...actionFromRow(row),
      status,
      progressPercent: status === "completed" ? 100 : Number(row.progress_percent),
      milestones,
      updatedAt: new Date().toISOString(),
    };
  }

  async transitionActionMilestone(
    tenantId: string,
    id: string,
    milestoneId: string,
    status: ActionMilestone["status"],
    actorId: string,
  ): Promise<ActionPlanItem | null> {
    const current = await this.db.query<any>(
      "SELECT * FROM action_plan_items WHERE tenant_id=$1 AND id=$2",
      [tenantId, id],
    );
    const row = current.rows[0];
    if (!row) return null;
    if (!["planned", "active"].includes(row.status))
      throw new Error(`ACTION_MILESTONE_NOT_EDITABLE:${row.status}`);
    const milestones = json<ActionMilestone[]>(row.milestones ?? []);
    const index = milestones.findIndex((milestone) => milestone.id === milestoneId);
    if (index < 0) throw new Error("ACTION_MILESTONE_NOT_FOUND");
    milestones[index] = { ...milestones[index]!, status };
    await this.db.query(
      `UPDATE action_plan_items SET milestones=$3::jsonb,updated_at=now()
       WHERE tenant_id=$1 AND id=$2`,
      [tenantId, id, JSON.stringify(milestones)],
    );
    await this.audit(
      tenantId,
      actorId,
      `action.milestone_${status}`,
      "action",
      id,
      "success",
      { milestoneId },
    );
    return {
      ...actionFromRow(row),
      milestones,
      updatedAt: new Date().toISOString(),
    };
  }

  async updateActionPlanProgress(
    tenantId: string,
    id: string,
    progressPercent: number,
    latestUpdate: string,
    actorId: string,
  ): Promise<ActionPlanItem | null> {
    const current = await this.db.query<any>(
      "SELECT * FROM action_plan_items WHERE tenant_id=$1 AND id=$2",
      [tenantId, id],
    );
    const row = current.rows[0];
    if (!row) return null;
    if (!["planned", "active"].includes(row.status))
      throw new Error(`ACTION_PROGRESS_NOT_EDITABLE:${row.status}`);
    const checkInId = randomUUID();
    await this.db.transaction(async (transaction) => {
      await transaction.query(
        `UPDATE action_plan_items SET progress_percent=$3,latest_update=$4,
         status=CASE WHEN status='planned' AND $3>0 THEN 'active' ELSE status END,
         updated_at=now() WHERE tenant_id=$1 AND id=$2`,
        [tenantId, id, progressPercent, latestUpdate],
      );
      await transaction.query(
        `INSERT INTO action_check_ins
         (id,tenant_id,action_plan_item_id,progress_percent,note,created_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [checkInId, tenantId, id, progressPercent, latestUpdate, actorId],
      );
    });
    await this.audit(tenantId, actorId, "action.progress_updated", "action", id, "success", {
      progressPercent,
    });
    const updated = await this.db.query<any>(
      "SELECT * FROM action_plan_items WHERE tenant_id=$1 AND id=$2",
      [tenantId, id],
    );
    const value = updated.rows[0];
    return actionFromRow(value);
  }

  async listActionCheckIns(
    tenantId: string,
    actionPlanItemId: string,
  ): Promise<ActionCheckIn[] | null> {
    const action = await this.db.query(
      "SELECT id FROM action_plan_items WHERE tenant_id=$1 AND id=$2",
      [tenantId, actionPlanItemId],
    );
    if (!action.rows[0]) return null;
    const result = await this.db.query<any>(
      `SELECT * FROM action_check_ins
       WHERE tenant_id=$1 AND action_plan_item_id=$2
       ORDER BY created_at DESC,id DESC`,
      [tenantId, actionPlanItemId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      actionPlanItemId: row.action_plan_item_id,
      progressPercent: Number(row.progress_percent),
      note: row.note,
      createdBy: row.created_by,
      createdAt: toIso(row.created_at),
    }));
  }

  async responseScores(
    tenantId: string,
    campaignId: string,
  ): Promise<ScoreSnapshot[]> {
    const result = await this.db.query<any>(
      "SELECT s.snapshot FROM score_snapshots s WHERE s.tenant_id=$1 AND s.campaign_id=$2 ORDER BY s.created_at",
      [tenantId, campaignId],
    );
    return result.rows.map((row) => json<ScoreSnapshot>(row.snapshot));
  }

  async customAnswerRows(
    tenantId: string,
    campaignId: string,
  ): Promise<
    Array<{
      responseId: string;
      participantRef: string | null;
      participantName: string | null;
      customAnswers: Record<string, string | string[]>;
      submittedAt: string;
    }>
  > {
    const result = await this.db.query<any>(
      `SELECT r.id,r.participant_ref,r.custom_answers,r.submitted_at,
        COALESCE(s.display_name,u.display_name) AS display_name
       FROM response_submissions r
       LEFT JOIN enterprise_subjects s ON s.tenant_id=r.tenant_id
        AND s.external_subject_id=r.participant_ref AND s.active=true
       LEFT JOIN users u ON u.tenant_id=r.tenant_id
        AND u.external_id=r.participant_ref
       WHERE r.tenant_id=$1 AND r.campaign_id=$2
       ORDER BY r.submitted_at,r.id`,
      [tenantId, campaignId],
    );
    return result.rows.map((row) => ({
      responseId: row.id,
      participantRef: row.participant_ref ?? null,
      participantName: row.display_name ?? null,
      customAnswers: json(row.custom_answers),
      submittedAt: toIso(row.submitted_at),
    }));
  }

  async responseScoreRecords(
    tenantId: string,
    campaignId: string,
  ): Promise<
    Array<{
      responseId: string;
      score: ScoreSnapshot;
      departmentIds: string[];
      backgroundAnswers: Record<string, string>;
    }>
  > {
    const result = await this.db.query<any>(
      `SELECT s.response_id,s.snapshot,COALESCE(l.department_ids,'[]'::jsonb) AS department_ids,
        COALESCE(r.background_answers,'{}'::jsonb) AS background_answers
      FROM score_snapshots s
      JOIN response_submissions r ON r.id=s.response_id
      LEFT JOIN response_subject_links l ON l.response_id=s.response_id
      WHERE s.tenant_id=$1 AND s.campaign_id=$2 ORDER BY s.created_at,s.response_id`,
      [tenantId, campaignId],
    );
    return result.rows.map((row) => ({
      responseId: row.response_id,
      score: json<ScoreSnapshot>(row.snapshot),
      departmentIds: json<string[]>(row.department_ids),
      backgroundAnswers: json<Record<string, string>>(row.background_answers),
    }));
  }

  async scoreForReport(
    tenantId: string,
    reportId: string,
  ): Promise<ScoreSnapshot | null> {
    const result = await this.db.query<any>(
      `SELECT s.snapshot FROM report_snapshots r JOIN score_snapshots s ON s.response_id=r.response_id
      WHERE r.tenant_id=$1 AND r.id=$2`,
      [tenantId, reportId],
    );
    return result.rows[0] ? json<ScoreSnapshot>(result.rows[0].snapshot) : null;
  }

  async deleteSubjectData(
    tenantId: string,
    subjectRefHashes: string[],
    actorId: string,
    reason: string,
  ): Promise<{
    responseCount: number;
    reportCount: number;
    draftCount: number;
  }> {
    const hashes = [...new Set(subjectRefHashes.filter(Boolean))];
    if (!hashes.length) throw new Error("SUBJECT_HASHES_REQUIRED");
    return this.db.transaction(async (transaction) => {
      const linked = await transaction.query<{ response_id: string }>(
        "SELECT response_id FROM response_subject_links WHERE tenant_id=$1 AND subject_ref_hash=ANY($2::text[])",
        [tenantId, hashes],
      );
      const responseIds = [
        ...new Set(linked.rows.map((row) => row.response_id)),
      ];
      let reportCount = 0;
      if (responseIds.length) {
        const reports = await transaction.query<{ id: string }>(
          "SELECT id FROM report_snapshots WHERE tenant_id=$1 AND response_id=ANY($2::text[])",
          [tenantId, responseIds],
        );
        const reportIds = reports.rows.map((row) => row.id);
        reportCount = reportIds.length;
        if (reportIds.length) {
          for (const table of [
            "report_artifacts",
            "report_publications",
            "report_access_grants",
            "report_retrieval_tokens",
          ])
            await transaction.query(
              `DELETE FROM ${table} WHERE tenant_id=$1 AND report_snapshot_id=ANY($2::text[])`,
              [tenantId, reportIds],
            );
          await transaction.query(
            "DELETE FROM report_snapshots WHERE tenant_id=$1 AND id=ANY($2::text[])",
            [tenantId, reportIds],
          );
        }
        const inputRows = await transaction.query<{ id: string }>(
          `SELECT id FROM assessment_input_snapshots
           WHERE tenant_id=$1 AND response_id=ANY($2::text[])`,
          [tenantId, responseIds],
        );
        const inputIds = inputRows.rows.map((row) => row.id);
        if (inputIds.length)
          await transaction.query(
            "DELETE FROM scoring_runs WHERE tenant_id=$1 AND assessment_input_snapshot_id=ANY($2::text[])",
            [tenantId, inputIds],
          );
        await transaction.query(
          "DELETE FROM score_snapshots WHERE tenant_id=$1 AND response_id=ANY($2::text[])",
          [tenantId, responseIds],
        );
        if (inputIds.length)
          await transaction.query(
            "DELETE FROM assessment_input_snapshots WHERE tenant_id=$1 AND id=ANY($2::text[])",
            [tenantId, inputIds],
          );
        await transaction.query(
          "DELETE FROM response_subject_links WHERE tenant_id=$1 AND response_id=ANY($2::text[])",
          [tenantId, responseIds],
        );
        await transaction.query(
          "DELETE FROM response_submissions WHERE tenant_id=$1 AND id=ANY($2::text[])",
          [tenantId, responseIds],
        );
      }
      const drafts = await transaction.query(
        "DELETE FROM response_drafts WHERE tenant_id=$1 AND subject_ref_hash=ANY($2::text[])",
        [tenantId, hashes],
      );
      await transaction.query(
        "INSERT INTO audit_events (tenant_id,actor_id,action,object_type,object_id,outcome,metadata) VALUES ($1,$2,'subject_data.deleted','data_subject',$3,'success',$4::jsonb)",
        [
          tenantId,
          actorId,
          createHash("sha256").update(hashes.sort().join(":")).digest("hex"),
          JSON.stringify({
            reason,
            responseCount: responseIds.length,
            reportCount,
            draftCount: drafts.rowCount,
          }),
        ],
      );
      return {
        responseCount: responseIds.length,
        reportCount,
        draftCount: drafts.rowCount,
      };
    });
  }

  async createDataDeletionRequest(input: {
    id: string;
    tenantId: string;
    requestedBy: string | null;
    requesterKind: DataDeletionRequest["requesterKind"];
    reason: string;
    subjectRefHashes: string[];
    statusTokenHash?: string | null;
  }): Promise<DataDeletionRequest> {
    const hashes = [...new Set(input.subjectRefHashes.filter(Boolean))].sort();
    if (!hashes.length) throw new Error("SUBJECT_HASHES_REQUIRED");
    await this.db.query(
      `INSERT INTO data_deletion_requests
      (id,tenant_id,requested_by,requester_kind,status,reason,subject_scope_hash,subject_count,status_token_hash)
      VALUES ($1,$2,$3,$4,'queued',$5,$6,$7,$8)`,
      [
        input.id,
        input.tenantId,
        input.requestedBy,
        input.requesterKind,
        input.reason,
        createHash("sha256").update(hashes.join(":")).digest("hex"),
        hashes.length,
        input.statusTokenHash ?? null,
      ],
    );
    const created = await this.dataDeletionRequest(input.tenantId, input.id);
    if (!created) throw new Error("DATA_DELETION_REQUEST_NOT_PERSISTED");
    return created;
  }

  async dataDeletionRequest(
    tenantId: string,
    requestId: string,
  ): Promise<DataDeletionRequest | null> {
    const result = await this.db.query<any>(
      "SELECT * FROM data_deletion_requests WHERE tenant_id=$1 AND id=$2",
      [tenantId, requestId],
    );
    return result.rows[0] ? deletionRequestFromRow(result.rows[0]) : null;
  }

  async latestDataDeletionRequestForUser(
    tenantId: string,
    userId: string,
  ): Promise<DataDeletionRequest | null> {
    const result = await this.db.query<any>(
      `SELECT * FROM data_deletion_requests WHERE tenant_id=$1 AND requested_by=$2
      ORDER BY requested_at DESC LIMIT 1`,
      [tenantId, userId],
    );
    return result.rows[0] ? deletionRequestFromRow(result.rows[0]) : null;
  }

  async dataDeletionRequestByStatusToken(
    requestId: string,
    statusTokenHash: string,
  ): Promise<DataDeletionRequest | null> {
    const result = await this.db.query<any>(
      "SELECT * FROM data_deletion_requests WHERE id=$1 AND status_token_hash=$2",
      [requestId, statusTokenHash],
    );
    return result.rows[0] ? deletionRequestFromRow(result.rows[0]) : null;
  }

  async setDataDeletionRequestStatus(
    tenantId: string,
    requestId: string,
    status: DataDeletionRequest["status"],
    result?: DataDeletionRequest["result"],
    errorCode?: string | null,
  ): Promise<DataDeletionRequest | null> {
    const updated = await this.db.query<any>(
      `UPDATE data_deletion_requests SET status=$3,result=$4::jsonb,error_code=$5,
      updated_at=now(),completed_at=CASE WHEN $3 IN ('completed','failed') THEN now() ELSE NULL END
      WHERE tenant_id=$1 AND id=$2 RETURNING *`,
      [
        tenantId,
        requestId,
        status,
        result ? JSON.stringify(result) : null,
        errorCode ?? null,
      ],
    );
    return updated.rows[0] ? deletionRequestFromRow(updated.rows[0]) : null;
  }

  async subjectHashesForReportToken(
    reportId: string,
    tokenHash: string,
  ): Promise<{ tenantId: string; subjectRefHashes: string[] } | null> {
    const result = await this.db.query<any>(
      `SELECT r.tenant_id,l.subject_ref_hash FROM report_retrieval_tokens t
      JOIN report_snapshots r ON r.id=t.report_snapshot_id
      JOIN response_subject_links l ON l.response_id=r.response_id AND l.tenant_id=r.tenant_id
      WHERE r.id=$1 AND t.token_hash=$2 AND t.revoked_at IS NULL AND t.expires_at>now()`,
      [reportId, tokenHash],
    );
    if (!result.rows.length) return null;
    return {
      tenantId: result.rows[0].tenant_id,
      subjectRefHashes: [
        ...new Set(result.rows.map((row) => String(row.subject_ref_hash))),
      ],
    };
  }

  async subjectArtifactStorageKeys(
    tenantId: string,
    subjectRefHashes: string[],
  ): Promise<string[]> {
    const hashes = [...new Set(subjectRefHashes.filter(Boolean))];
    if (!hashes.length) return [];
    const result = await this.db.query<{ storage_key: string }>(
      `SELECT DISTINCT a.storage_key FROM response_subject_links l
      JOIN report_snapshots r ON r.response_id=l.response_id
      JOIN report_artifacts a ON a.report_snapshot_id=r.id
      WHERE l.tenant_id=$1 AND l.subject_ref_hash=ANY($2::text[])`,
      [tenantId, hashes],
    );
    return result.rows.map((row) => row.storage_key);
  }

  private mapCampaign(row: any): CampaignRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      target: row.target,
      organizationMethod: row.organization_method,
      assessmentProfileId: row.assessment_profile_id,
      questionnairePackageId: row.questionnaire_package_id,
      mode: row.mode,
      status: row.status,
      startsAt: toIso(row.starts_at),
      closesAt: toIso(row.closes_at),
      backgroundItemIds: json<string[]>(row.background_item_ids),
      customItems: json(row.custom_items),
      invitedCount: Number(row.invited_count),
      baselineCampaignId: row.baseline_campaign_id ?? null,
      designatedAssessorExternalId:
        row.designated_assessor_external_id ?? null,
      versions: json(row.versions),
      createdAt: toIso(row.created_at),
      submittedCount: Number(row.submitted_count ?? 0),
      validCount: Number(row.valid_count ?? 0),
    };
  }

  async recordAuditEvent(input: {
    tenantId: string;
    actorId: string | null;
    action: string;
    objectType: string;
    objectId: string;
    outcome: string;
    metadata?: object;
  }) {
    return this.audit(
      input.tenantId,
      input.actorId,
      input.action,
      input.objectType,
      input.objectId,
      input.outcome,
      input.metadata ?? {},
    );
  }

  private async audit(
    tenantId: string,
    actorId: string | null,
    action: string,
    objectType: string,
    objectId: string,
    outcome: string,
    metadata: object,
  ) {
    await this.db.query(
      "INSERT INTO audit_events (tenant_id,actor_id,action,object_type,object_id,outcome,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)",
      [
        tenantId,
        actorId,
        action,
        objectType,
        objectId,
        outcome,
        JSON.stringify(metadata),
      ],
    );
  }
}
