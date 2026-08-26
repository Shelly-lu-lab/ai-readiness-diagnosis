import type {
  ActionCheckIn,
  ActionPlanItem,
  ActionPlanListItem,
  AssessmentProfileId,
  CampaignScheduleAmendment,
  DataDeletionRequest,
  CampaignRecord,
  CreateActionPlanInput,
  CreateCampaignInput,
  CustomAnswer,
  UpdateCampaignInput,
  EnterpriseUser,
  IndividualReportGrant,
  IndividualReportListItem,
  EnterpriseDirectory,
  AccountSession,
  EnterpriseApplication,
  EnterpriseApplicationStatus,
  LoginIntent,
  WorkspaceMembership,
  WorkspaceKind,
  NormAuthorization,
  OrganizationResearchProfile,
  PersonContextCohortSnapshot,
  PersonContextMappingInput,
  PersonalReportListItem,
  PersonalResearchProfile,
  PersonalResearchProfileInput,
  RawAnswer,
  ReportAccessGrant,
  ReportAccessGrantListItem,
  ReportPublication,
  ReportSnapshot,
  ScoreSnapshot,
} from "@ai-readiness/contracts";

const API = import.meta.env.VITE_API_URL || "";
const ERROR_MESSAGES: Record<string, string> = {
  CAMPAIGN_NOT_STARTED: "问卷尚未到开放时间，请在开始后通过原链接进入。",
  CAMPAIGN_DEADLINE_PASSED: "本次问卷已经截止，如有疑问请联系活动发起人。",
  CAMPAIGN_NOT_AVAILABLE: "这个问卷当前不可访问，可能已经取消、关闭或归档。",
  CAMPAIGN_NOT_ACTIVE: "这个问卷当前没有开放作答。",
  INVALID_INVITE: "问卷入口无效或已经过期，请从最新的飞书消息重新进入。",
  CAMPAIGN_RULESET_UNAVAILABLE: "问卷版本暂时不可用，系统已阻止使用不匹配的题目或计分规则。",
  NO_LINKED_ASSESSMENT_DATA: "当前身份没有可删除的测评数据。",
  BACKGROUND_JOBS_NOT_CONFIGURED: "数据删除服务暂未就绪，请稍后重试或联系管理员。",
  DATA_DELETION_QUEUE_FAILED: "删除请求暂时无法处理，系统已留存失败状态，请联系管理员。",
  INDIVIDUAL_REPORT_GRANT_REQUIRES_IDENTIFIED_CAMPAIGN: "匿名活动不允许授权 HR 查看个人报告。",
  CAMPAIGN_HAS_NO_PERSONAL_REPORTS: "这个活动不产生员工个人报告。",
  INDIVIDUAL_REPORT_GRANTEE_MUST_BE_HR: "实名个人报告权限只能授予企业所有者或 HR 管理员。",
  USE_INDIVIDUAL_REPORT_GRANT_FOR_PERSONAL_REPORTS: "个人报告必须使用活动级实名专用授权，不能复用团队报告权限。",
  ANONYMOUS_CUSTOM_RESULTS_AVAILABLE_AFTER_CLOSE: "匿名活动关闭后才会展示企业补充题的汇总结果。",
  EMAIL_OTP_RATE_LIMITED: "验证码发送太频繁，请稍后再试。",
  EMAIL_SEND_FAILED: "验证码邮件暂时发送失败，请稍后重试。",
  EMAIL_PROVIDER_NOT_CONFIGURED: "当前环境尚未接通真实邮件服务，邮件不会实际送达。请先配置邮件服务商和发件地址。",
  PERSONAL_CAMPAIGN_NOT_AVAILABLE: "当前没有开放的个人测评活动，请稍后再试。",
  EMAIL_AUTH_REQUIRED: "请先使用邮箱验证码登录。",
  INVALID_EMAIL_OTP: "验证码不正确或已过期，请重新获取。",
  PLATFORM_ROLE_REQUIRED: "当前邮箱没有平台管理员权限。",
  WORKSPACE_ACCESS_REQUIRED: "当前账户没有这个工作区的访问权限。",
  ENTERPRISE_APPROVAL_REQUIRED: "企业工作台需要先提交申请并由平台审核开通。",
  ORGANIZATION_PROFILE_REQUIRED_BEFORE_PUBLISH: "发布活动前，请先完成企业基本资料。",
};
export const reportPdfUrl = (id: string) => `${API}/api/reports/${id}/pdf`;
export const myReportPdfUrl = (id: string) => `${API}/api/my-reports/${id}/pdf`;
export const publicReportPdfUrl = (id: string, accessToken: string) =>
  `${API}/public/reports/${id}/pdf?access_token=${encodeURIComponent(accessToken)}`;
export const individualReportPdfUrl = (
  campaignId: string,
  subjectId: string,
) =>
  `${API}/api/campaigns/${campaignId}/individual-reports/${encodeURIComponent(subjectId)}/pdf`;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "content-type": "application/json", ...options?.headers },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (
    response.status === 401 &&
    !path.startsWith("/public/") &&
    !path.startsWith("/api/auth/") &&
    path !== "/api/session" &&
    window.location.pathname !== "/login"
  ) {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }
  if (!response.ok) {
    const code = body.code || `HTTP_${response.status}`;
    const error = new Error(body.message || ERROR_MESSAGES[code] || code);
    Object.assign(error, { code, details: body });
    throw error;
  }
  return body as T;
}

export const api = {
  session: () => request<AccountSession>("/api/session"),
  updateAccountProfile: (displayName: string) =>
    request<{ displayName: string }>("/api/account/profile", {
      method: "PATCH",
      body: JSON.stringify({ displayName }),
    }),
  updateTenantProfile: (name: string) =>
    request<{ name: string }>("/api/tenant/profile", {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  requestEmailOtp: (email: string) =>
    request<{
      challengeId: string;
      expiresInSeconds: number;
      retryAfterSeconds: number;
      developmentCode?: string;
    }>(
      "/api/auth/email/request",
      {
        method: "POST",
        body: JSON.stringify({ email, purpose: "login" }),
      },
    ),
  verifyEmailOtp: (
    email: string,
    code: string,
    challengeId?: string,
    returnTo?: string,
    intent?: LoginIntent,
  ) =>
    request<{ authenticated: true; user: any; tenant?: any; nextPath: string }>(
      "/api/auth/email/verify",
      {
        method: "POST",
        body: JSON.stringify({ email, code, challengeId, returnTo, intent, purpose: "login" }),
      },
    ),
  switchWorkspace: (kind: WorkspaceKind, organizationId?: string) =>
    request<{ activeWorkspace: { kind: WorkspaceKind; organizationId: string | null } }>(
      "/api/session/context",
      {
        method: "POST",
        body: JSON.stringify({ kind, organizationId }),
      },
    ),
  myEnterpriseApplications: () =>
    request<EnterpriseApplication[]>("/api/enterprise-applications/mine"),
  createEnterpriseApplication: (input: {
    applicantName: string;
    applicantRole: string;
    organizationName: string;
    website?: string;
    expectedHeadcountBand: string;
    useCase: string;
  }) =>
    request<EnterpriseApplication>("/api/enterprise-applications", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  enterpriseApplications: (status?: EnterpriseApplicationStatus) =>
    request<EnterpriseApplication[]>(
      `/api/platform/enterprise-applications${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    ),
  reviewEnterpriseApplication: (
    id: string,
    status: "approved" | "rejected",
  ) =>
    request<EnterpriseApplication>(`/api/platform/enterprise-applications/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  createPlatformOrganization: (organizationName: string) =>
    request<WorkspaceMembership>("/api/platform/organizations", {
      method: "POST",
      body: JSON.stringify({ organizationName }),
    }),
  logout: () =>
    request<void>("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  openPersonalCampaigns: () => request<CampaignRecord[]>("/api/personal/open-campaign"),
  createPersonalEntry: (assessmentProfileId: AssessmentProfileId) =>
    request<{ campaign: CampaignRecord; url: string; participantId: string }>(
      "/api/personal/open-entry",
      {
        method: "POST",
        body: JSON.stringify({ assessmentProfileId }),
      },
    ),
  personalResearchProfile: () =>
    request<PersonalResearchProfile | null>("/api/personal/research-profile"),
  savePersonalResearchProfile: (input: PersonalResearchProfileInput) =>
    request<PersonalResearchProfile>("/api/personal/research-profile", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  campaigns: () => request<CampaignRecord[]>("/api/campaigns"),
  campaign: (id: string) => request<CampaignRecord>(`/api/campaigns/${id}`),
  customResults: (id: string) =>
    request<any>(`/api/campaigns/${id}/custom-results`),
  campaignScheduleAmendments: (id: string) =>
    request<CampaignScheduleAmendment[]>(
      `/api/campaigns/${id}/schedule-amendments`,
    ),
  extendCampaignDeadline: (
    id: string,
    newClosesAt: string,
    reason: string,
  ) =>
    request<{ amendment: CampaignScheduleAmendment; campaign: CampaignRecord }>(
      `/api/campaigns/${id}/deadline`,
      {
        method: "PATCH",
        body: JSON.stringify({ newClosesAt, reason }),
      },
    ),
  createCampaign: (input: CreateCampaignInput) =>
    request<CampaignRecord>("/api/campaigns", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateCampaign: (id: string, input: UpdateCampaignInput) =>
    request<CampaignRecord>(`/api/campaigns/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  deleteCampaign: (id: string) =>
    request<void>(`/api/campaigns/${id}`, {
      method: "DELETE",
      body: JSON.stringify({}),
    }),
  transition: (id: string, status: string) =>
    request<{
      campaign: CampaignRecord;
      organizationReport: ReportSnapshot | null;
    }>(`/api/campaigns/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
  invite: (id: string) =>
    request<{ token: string; url: string; participantId: string }>(
      `/api/campaigns/${id}/invites`,
      { method: "POST", body: JSON.stringify({}) },
    ),
  publicCampaign: (id: string, token: string) =>
    request<any>(`/public/campaigns/${id}?token=${encodeURIComponent(token)}`),
  surveyDraft: (id: string, token: string) =>
    request<any>(
      `/public/campaigns/${id}/draft?token=${encodeURIComponent(token)}`,
    ),
  saveSurveyDraft: (
    id: string,
    token: string,
    input: {
      answers: Record<string, RawAnswer>;
      backgroundAnswers: Record<string, string>;
      customAnswers: Record<string, CustomAnswer>;
      clientRevision: number;
    },
  ) =>
    request<any>(`/public/campaigns/${id}/draft`, {
      method: "PUT",
      body: JSON.stringify({ token, ...input }),
    }),
  submit: (
    id: string,
    token: string,
    answers: Record<string, RawAnswer>,
    backgroundAnswers: Record<string, string>,
    customAnswers: Record<string, CustomAnswer>,
    privacyNoticeVersion: string,
    consentedAt: string,
  ) =>
    request<{
      submissionId: string;
      score: ScoreSnapshot;
      report: ReportSnapshot | null;
      reportAccessToken: string | null;
    }>(`/public/campaigns/${id}/submissions`, {
      method: "POST",
      body: JSON.stringify({
        token,
        answers,
        backgroundAnswers,
        customAnswers,
        privacyNoticeVersion,
        consentedAt,
      }),
    }),
  publicReport: (id: string, accessToken: string) =>
    request<ReportSnapshot>(
      `/public/reports/${id}?access_token=${encodeURIComponent(accessToken)}`,
    ),
  renderReport: (id: string, token: string) =>
    request<ReportSnapshot>(
      `/public/render/reports/${id}?token=${encodeURIComponent(token)}`,
    ),
  myReports: () => request<PersonalReportListItem[]>("/api/my-reports"),
  myReport: (id: string) => request<ReportSnapshot>(`/api/my-reports/${id}`),
  report: (id: string) => request<ReportSnapshot>(`/api/reports/${id}`),
  reportAccess: (id: string) =>
    request<{ canView: boolean; canManage: boolean; canDownload: boolean }>(
      `/api/reports/${id}/access`,
    ),
  campaignReports: (id: string) =>
    request<ReportSnapshot[]>(`/api/campaigns/${id}/reports`),
  reports: () => request<ReportSnapshot[]>("/api/reports"),
  publishReport: (id: string, audience: ReportPublication["audience"]) =>
    request<ReportPublication>(`/api/reports/${id}/publications`, {
      method: "POST",
      body: JSON.stringify({ audience }),
    }),
  createAction: (id: string, input: CreateActionPlanInput) =>
    request<ActionPlanItem>(`/api/reports/${id}/actions`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  campaignActions: (id: string) =>
    request<ActionPlanItem[]>(`/api/campaigns/${id}/actions`),
  actions: () => request<ActionPlanListItem[]>("/api/actions"),
  actionCheckIns: (id: string) =>
    request<ActionCheckIn[]>(`/api/actions/${id}/check-ins`),
  transitionAction: (id: string, status: ActionPlanItem["status"]) =>
    request<ActionPlanItem>(`/api/actions/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  transitionActionMilestone: (
    id: string,
    milestoneId: string,
    status: "pending" | "completed",
  ) =>
    request<ActionPlanItem>(
      `/api/actions/${id}/milestones/${milestoneId}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status }),
      },
    ),
  updateActionProgress: (
    id: string,
    progressPercent: number,
    latestUpdate: string,
  ) =>
    request<ActionPlanItem>(`/api/actions/${id}/progress`, {
      method: "PATCH",
      body: JSON.stringify({ progressPercent, latestUpdate }),
    }),
  users: () => request<EnterpriseUser[]>("/api/users"),
  updateUserRole: (id: string, role: EnterpriseUser["role"]) =>
    request<EnterpriseUser>(`/api/users/${id}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  grantReport: (
    id: string,
    input: {
      granteeUserId: string;
      operations: Array<"view" | "download">;
      expiresAt: string | null;
      notify?: boolean;
      notificationTitle?: string;
      notificationBody?: string;
      notificationButtonLabel?: string;
    },
  ) =>
    request<
      ReportAccessGrant & {
        notification?: { status: string; reason?: string };
      }
    >(`/api/reports/${id}/grants`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  reportGrants: (id: string) =>
    request<ReportAccessGrantListItem[]>(`/api/reports/${id}/grants`),
  revokeReportGrant: (id: string) =>
    request<void>(`/api/report-grants/${id}`, {
      method: "DELETE",
      body: JSON.stringify({}),
    }),
  individualReportGrants: (campaignId: string) =>
    request<IndividualReportGrant[]>(
      `/api/campaigns/${campaignId}/individual-report-grants`,
    ),
  grantIndividualReports: (
    campaignId: string,
    input: {
      granteeUserId: string;
      operations: Array<"view" | "download">;
      expiresAt: string | null;
    },
  ) =>
    request<IndividualReportGrant>(
      `/api/campaigns/${campaignId}/individual-report-grants`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  revokeIndividualReportGrant: (grantId: string) =>
    request<void>(`/api/individual-report-grants/${grantId}`, {
      method: "DELETE",
      body: JSON.stringify({}),
    }),
  individualReports: (campaignId: string) =>
    request<IndividualReportListItem[]>(
      `/api/campaigns/${campaignId}/individual-reports`,
    ),
  individualReport: (campaignId: string, subjectId: string) =>
    request<ReportSnapshot>(
      `/api/campaigns/${campaignId}/individual-reports/${encodeURIComponent(subjectId)}`,
    ),
  latestDataDeletion: () =>
    request<DataDeletionRequest | null>("/api/privacy/my-data-deletion"),
  requestMyDataDeletion: (reason: string) =>
    request<DataDeletionRequest>("/api/privacy/my-data-deletion", {
      method: "POST",
      body: JSON.stringify({ confirmation: "DELETE_MY_DATA", reason }),
    }),
  requestAnonymousDataDeletion: (
    reportId: string,
    accessToken: string,
    reason: string,
  ) =>
    request<DataDeletionRequest & { statusToken: string }>(
      `/public/reports/${reportId}/data-deletion`,
      {
        method: "POST",
        body: JSON.stringify({
          accessToken,
          confirmation: "DELETE_MY_DATA",
          reason,
        }),
      },
    ),
  anonymousDataDeletionStatus: (requestId: string, statusToken: string) =>
    request<DataDeletionRequest>(
      `/public/data-deletions/${requestId}?status_token=${encodeURIComponent(statusToken)}`,
    ),
  feishuStatus: () => request<any>("/api/integrations/feishu/status"),
  directory: () => request<EnterpriseDirectory>("/api/directory"),
  syncFeishu: (departmentId = "0") =>
    request<{ runId: string; subjectCount: number }>(
      "/api/integrations/feishu/sync",
      { method: "POST", body: JSON.stringify({ departmentId }) },
    ),
  researchProfile: () =>
    request<OrganizationResearchProfile>("/api/research/profile"),
  saveResearchProfile: (
    input: Omit<
      OrganizationResearchProfile,
      "tenantId" | "headcountBand" | "updatedAt"
    >,
  ) =>
    request<OrganizationResearchProfile>("/api/research/profile", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  normAuthorization: () =>
    request<NormAuthorization>("/api/research/norm-authorization"),
  setNormAuthorization: (status: NormAuthorization["status"]) =>
    request<NormAuthorization>("/api/research/norm-authorization", {
      method: "PUT",
      body: JSON.stringify({ status, noticeVersion: "norm_notice_v0.1" }),
    }),
  savePersonContextMappings: (mappings: PersonContextMappingInput[]) =>
    request<{ saved: number; classificationVersion: string }>(
      "/api/research/person-context-mappings",
      { method: "PUT", body: JSON.stringify({ mappings }) },
    ),
  personContextPreview: () =>
    request<PersonContextCohortSnapshot[]>(
      "/api/research/person-context-preview",
    ),
  sendFeishuInvitations: (
    id: string,
    input: {
      openIds: string[];
      title: string;
      body: string;
      buttonLabel: string;
    },
  ) =>
    request<{ sent: number; failed: number }>(
      `/api/campaigns/${id}/feishu-invitations`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  sendEmailInvitations: (
    id: string,
    input: { emails: string[]; subject: string; body: string; buttonLabel: string },
  ) => request<{ sent: number; failed: number; results: Array<{ emailMasked: string; status: "sent" | "failed"; errorCode?: string }> }>(
    `/api/campaigns/${id}/email-invitations`,
    { method: "POST", body: JSON.stringify(input) },
  ),
  sendFeishuReminders: (
    id: string,
    input: { title: string; body: string; buttonLabel: string },
  ) =>
    request<{ sent: number; failed: number; skipped?: string }>(
      `/api/campaigns/${id}/feishu-reminders`,
      { method: "POST", body: JSON.stringify(input) },
    ),
};
