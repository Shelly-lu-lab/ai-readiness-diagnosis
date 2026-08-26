import { useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import type {
  ActionCheckIn,
  ActionPlanListItem,
  CampaignMode,
  CampaignRecord,
  CampaignScheduleAmendment,
  CustomAnswer,
  CustomQuestionSnapshot,
  CustomQuestionType,
  DataDeletionRequest,
  AssessmentProfileId,
  AssessmentTarget,
  AccountSession,
  LoginIntent,
  EnterpriseUser,
  EnterpriseDirectory,
  IndividualReportGrant,
  IndividualReportListItem,
  PersonalResearchProfile,
  PersonalResearchProfileInput,
  PersonalReportListItem,
  PersonContextCohortSnapshot,
  PersonContextMappingInput,
  RawAnswer,
  RecommendationSnapshot,
  ReportAccessGrantListItem,
  ReportSnapshot,
} from "@ai-readiness/contracts";
import { PERSONAL_RESEARCH_NOTICE_VERSION } from "@ai-readiness/contracts";
import {
  api,
  individualReportPdfUrl,
  myReportPdfUrl,
  publicReportPdfUrl,
  reportPdfUrl,
} from "./api";
import { ReportView } from "./components/ReportView";

const targetLabels = {
  personal: "个人专项",
  organization: "组织专项",
  combined: "个人及组织",
} as const;
const campaignStatusLabels = {
  draft: "草稿",
  scheduled: "待开始",
  active: "进行中",
  closed: "已关闭",
  cancelled: "已取消",
  archived: "已归档",
} as const;

const splitEmailEntries = (value: string) =>
  value
    .split(/[\s,，;；]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

export function parseEmailInvitationCsv(value: string): string[] {
  const lines = value
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const parseLine = (line: string) => {
    const cells: string[] = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index]!;
      if (character === '"' && line[index + 1] === '"' && quoted) {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = !quoted;
      else if (character === "," && !quoted) {
        cells.push(cell.trim());
        cell = "";
      } else cell += character;
    }
    cells.push(cell.trim());
    return cells;
  };
  const rows = lines.map(parseLine);
  const normalizedHeader = rows[0]!.map((cell) => cell.toLowerCase());
  const emailColumn = normalizedHeader.findIndex((cell) =>
    ["email", "email_address", "邮箱", "邮箱地址"].includes(cell),
  );
  const values = emailColumn >= 0
    ? rows.slice(1).map((row) => row[emailColumn] ?? "")
    : rows.flatMap((row) => row);
  return [...new Set(values.flatMap(splitEmailEntries).map((email) => email.toLowerCase()))];
}

function EmailLogin({ fixedIntent }: { fixedIntent?: LoginIntent } = {}) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const intent = fixedIntent ??
    (["personal", "enterprise", "platform"].includes(String(params.get("intent")))
      ? (params.get("intent") as LoginIntent)
      : "personal");
  const returnTo = (() => {
    const value = params.get("returnTo");
    return value && value.startsWith("/") && !value.startsWith("//")
      ? value
      : intent === "platform"
        ? "/platform"
        : intent === "enterprise"
          ? "/enterprise"
          : "/app/personal";
  })();
  const switchingWorkspace = params.get("switch") === "1";
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [retryAfter, setRetryAfter] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [developmentCode, setDevelopmentCode] = useState("");

  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = window.setInterval(
      () => setRetryAfter((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [retryAfter]);

  useEffect(() => {
    if (switchingWorkspace) return;
    api.session().then(async (session) => {
      if (intent === "personal") {
        if (session.activeWorkspace.kind !== "personal")
          await api.switchWorkspace("personal");
        navigate(returnTo, { replace: true });
        return;
      }
      if (intent === "platform") {
        if (!session.platformRoles.includes("platform_admin")) return;
        if (session.activeWorkspace.kind !== "platform")
          await api.switchWorkspace("platform");
        navigate("/platform", { replace: true });
        return;
      }
      if (session.platformRoles.includes("platform_admin")) {
        if (session.activeWorkspace.kind !== "platform")
          await api.switchWorkspace("platform");
        navigate("/platform", { replace: true });
        return;
      }
      if (session.activeWorkspace.kind === "organization") {
        navigate(`/app/org/${session.activeWorkspace.organizationId}`, { replace: true });
      } else if (session.organizations.length === 1) {
        const organizationId = session.organizations[0]!.organizationId;
        await api.switchWorkspace("organization", organizationId);
        navigate(`/app/org/${organizationId}`, { replace: true });
      } else {
        navigate(session.organizations.length ? "/enterprise/organizations" : "/enterprise/no-access", { replace: true });
      }
    }).catch(() => undefined);
  }, [intent, navigate, returnTo, switchingWorkspace]);

  const sendCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setDevelopmentCode("");
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setError("请输入有效的邮箱地址。");
      return;
    }
    if (retryAfter > 0) return;
    setBusy(true);
    try {
      const result = await api.requestEmailOtp(normalized);
      setEmail(normalized);
      setChallengeId(result.challengeId);
      setRetryAfter(Math.max(1, result.retryAfterSeconds || 60));
      setSent(true);
      setNotice(
        result.developmentCode
          ? "当前为开发环境，不会发送真实验证码邮件，请使用下方显示的开发验证码。"
          : "验证码已发送，请检查邮箱。验证码 10 分钟内有效。",
      );
      setDevelopmentCode(result.developmentCode ?? "");
    } catch (reason: any) {
      const serverRetryAfter = Number(reason?.details?.retryAfterSeconds);
      if (Number.isFinite(serverRetryAfter) && serverRetryAfter > 0) {
        setRetryAfter(Math.ceil(serverRetryAfter));
      }
      if (reason?.code === "EMAIL_OTP_RATE_LIMITED" && serverRetryAfter > 0) {
        setError(`验证码发送太频繁，请在 ${Math.ceil(serverRetryAfter)} 秒后重试。`);
      } else {
        setError(reason.message || "验证码发送失败，请稍后重试。");
      }
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!/^\d{6}$/.test(code.trim())) {
      setError("请输入 6 位数字验证码。");
      return;
    }
    setBusy(true);
    try {
      const result = await api.verifyEmailOtp(
        email.trim().toLowerCase(),
        code.trim(),
        challengeId,
        returnTo,
        intent,
      );
      navigate(result.nextPath, { replace: true });
    } catch (reason: any) {
      setError(reason.message || "验证码不正确或已过期。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-mark">AI</div>
        <p className="eyebrow">AI READINESS DIAGNOSTIC</p>
        <h1>{intent === "platform" ? "登录平台管理后台" : intent === "enterprise" ? "登录企业工作台" : "登录个人中心"}</h1>
        <p className="auth-intro">
          {intent === "platform"
            ? "该入口只对预先授权的平台管理员开放。"
            : intent === "enterprise"
              ? "已有企业成员会直接进入所属企业；尚未开通的用户可以提交企业使用申请。"
              : "无需设置密码。登录后可以开始测评、找回报告并管理自己的数据。"}
        </p>
        {!sent ? (
          <form onSubmit={sendCode} className="auth-form">
            <label>
              <span>邮箱地址</span>
              <input
                autoFocus
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@company.com"
                autoComplete="email"
              />
            </label>
            <button className="primary auth-submit" disabled={busy || retryAfter > 0}>
              {busy ? "正在发送…" : retryAfter > 0 ? `${retryAfter} 秒后重新发送` : "获取邮箱验证码"}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="auth-form">
            <label>
              <span>验证码</span>
              <input
                autoFocus
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                placeholder="输入 6 位验证码"
                autoComplete="one-time-code"
              />
            </label>
            <button className="primary auth-submit" disabled={busy}>
              {busy ? "正在验证…" : "登录"}
            </button>
            <div className="auth-secondary-actions">
              <button
                type="button"
                className="text-button"
                disabled={busy || retryAfter > 0}
                onClick={() => void sendCode({ preventDefault: () => undefined } as React.FormEvent)}
              >
                {retryAfter > 0 ? `${retryAfter} 秒后重新发送` : "重新发送验证码"}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setSent(false);
                  setCode("");
                  setChallengeId("");
                  setRetryAfter(0);
                  setDevelopmentCode("");
                  setNotice("");
                  setError("");
                }}
              >
                更换邮箱
              </button>
            </div>
          </form>
        )}
        {notice && <p className="auth-notice" aria-live="polite">{notice}</p>}
        {import.meta.env.DEV && sent && developmentCode && (
          <p className="auth-notice">开发环境验证码：{developmentCode}</p>
        )}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <p className="auth-footnote">
          {intent === "platform"
            ? "平台管理操作会记录安全审计；平台身份不会自动获得个人答卷访问权。"
            : "邮箱仅用于登录、邀请和找回报告。进入测评前会单独说明数据用途。"}
        </p>
      </section>
    </main>
  );
}

function PublicHome() {
  const [session, setSession] = useState<AccountSession | null>(null);
  useEffect(() => {
    api.session().then(setSession).catch(() => setSession(null));
  }, []);
  const personalTarget = session
    ? "/app/personal"
    : "/login?intent=personal&returnTo=/app/personal";
  const workspaceTarget = "/enterprise";
  return (
    <main className="public-home">
      <header className="public-nav">
        <Link to="/" className="brand public-brand">
          <i>AI</i>
          <span>AI 准备度诊断<small>READINESS DIAGNOSTIC</small></span>
        </Link>
        <nav>
          {session && <Link to="/app/personal">个人中心</Link>}
          <Link className="secondary" to={workspaceTarget}>企业工作台</Link>
        </nav>
      </header>
      <section className="public-hero">
        <div className="public-hero-copy">
          <p className="eyebrow">PERSONAL & ORGANIZATION AI READINESS</p>
          <h1>看清 AI 准备度，<br />找到下一步怎么提升。</h1>
          <p>
            通过结构化测评，了解个人能力、组织条件和已经产生的 AI 影响，
            获得具体、可执行的提升建议。
          </p>
          <div className="public-hero-actions">
            <Link className="primary" to={personalTarget}>开始个人测评</Link>
            <Link className="secondary" to={workspaceTarget}>企业使用</Link>
          </div>
          <small>无需设置密码 · 邮箱验证码登录 · 完成后可随时找回报告</small>
        </div>
        <aside className="public-map" aria-label="测评会提供的三类结果">
          <span>01</span><h2>看见现状</h2><p>用分数、八维画像和二维定位理解当前所处的位置。</p>
          <span>02</span><h2>找到断点</h2><p>具体说明哪些行为已经形成，哪些做法还不稳定。</p>
          <span>03</span><h2>开始改变</h2><p>把诊断结果转成个人提升路径或组织改进行动。</p>
        </aside>
      </section>
      <section className="public-proof">
        <article><b>个人测评</b><p>可选择只了解自己，或同时看看你感受到的组织支持环境。</p></article>
        <article><b>组织测评</b><p>汇总员工或管理者观察，识别组织层面的支持条件和关键障碍。</p></article>
        <article><b>科学边界</b><p>结果用于发展和诊断，不用于能力认证或人事评价；量表仍在持续验证。</p></article>
      </section>
      <footer className="public-footer">
        <span>AI 准备度诊断</span>
        <p>本工具为基于公开研究构念的二次设计，不是微软官方量表。</p>
      </footer>
    </main>
  );
}

function PersonalHome() {
  const [session, setSession] = useState<AccountSession | null>(null);
  const [reports, setReports] = useState<PersonalReportListItem[]>([]);
  const [profile, setProfile] = useState<PersonalResearchProfile | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api.session().then(async (current) => {
      if (current.activeWorkspace.kind !== "personal") {
        await api.switchWorkspace("personal");
        window.location.replace("/app/personal");
        return;
      }
      setSession(current);
      const [nextReports, nextProfile] = await Promise.all([
        api.myReports(),
        api.personalResearchProfile(),
      ]);
      setReports(nextReports);
      setProfile(nextProfile);
    }).catch((reason) => {
      if (reason.code === "AUTHENTICATION_REQUIRED")
        window.location.replace("/login?intent=personal&returnTo=/app/personal");
      else setError(reason.message);
    });
  }, []);
  return (
    <Shell>
      <main className="personal-home">
        <header>
          <p className="eyebrow">PERSONAL CENTER</p>
          <h1>个人中心</h1>
          <p>从这里开始新的测评、继续了解自己的变化，并找回已经生成的报告。</p>
        </header>
        {error && <div className="notice warning">{error}</div>}
        <section className="personal-home-grid">
          <article className="personal-home-primary">
            <span>开始测评</span>
            <h2>了解你的 AI 准备度</h2>
            <p>可以选择26题只了解自己，或42题同时了解你感受到的组织支持环境。</p>
            <Link className="primary" to="/personal/start">选择测评范围</Link>
          </article>
          <article>
            <span>我的报告</span>
            <strong>{reports.length}</strong>
            <p>{reports.length ? `最近一份生成于 ${new Date(reports[0]!.report.createdAt).toLocaleDateString("zh-CN")}` : "完成测评后，报告会保存在这里。"}</p>
            <Link className="secondary" to="/my-reports">查看全部报告</Link>
          </article>
          <article>
            <span>工作背景</span>
            <h2>{profile ? "资料已填写" : "尚未填写"}</h2>
            <p>背景信息不参与计分。每次测评前可以确认或更新，也可以选择不愿回答。</p>
            <Link className="secondary" to="/personal/start">{profile ? "确认或更新" : "填写资料"}</Link>
          </article>
        </section>
        {session && (session.organizations.length || session.platformRoles.includes("platform_admin")) ? (
          <section className="personal-organization-access">
            <div><span>企业管理</span><h2>{session.platformRoles.includes("platform_admin") ? "管理企业客户" : "切换到企业工作区"}</h2><p>个人报告与企业管理任务分开呈现，切换后不会混在同一个首页。</p></div>
            <Link className="secondary" to={session.platformRoles.includes("platform_admin") ? "/platform" : "/enterprise/organizations"}>{session.platformRoles.includes("platform_admin") ? "进入企业管理" : "查看我的企业"}</Link>
          </section>
        ) : null}
      </main>
    </Shell>
  );
}

function EnterpriseLanding() {
  const [session, setSession] = useState<AccountSession | null>(null);
  useEffect(() => { api.session().then(setSession).catch(() => undefined); }, []);
  const enterTarget = session
    ? session.platformRoles.includes("platform_admin")
      ? "/platform"
      : session.organizations.length === 1
      ? `/app/org/${session.organizations[0]!.organizationId}`
      : session.organizations.length > 1
        ? "/enterprise/organizations"
        : "/enterprise/no-access"
    : "/login?intent=enterprise&returnTo=/enterprise";
  return (
    <main className="enterprise-entry">
      <header className="public-nav">
        <Link to="/" className="brand public-brand"><i>AI</i><span>AI 准备度诊断<small>ENTERPRISE DIAGNOSTIC</small></span></Link>
        <Link to="/">返回产品首页</Link>
      </header>
      <section>
        <p className="eyebrow">FOR ORGANIZATIONS</p>
        <h1>为企业发起 AI 准备度诊断</h1>
        <p>平台管理员可以建立客户企业，企业管理者可以创建调研、邀请员工、查看进度，并获得组织报告和行动建议。</p>
        <div>
          <Link className="primary" to={enterTarget}>{session ? "进入企业管理" : "登录企业管理"}</Link>
          {!session && <Link className="secondary" to="/login?intent=enterprise&returnTo=/enterprise">企业成员登录</Link>}
        </div>
        <small>企业空间由平台管理员创建；普通个人账户不会自动获得企业管理权限。</small>
      </section>
    </main>
  );
}

function EnterpriseNoAccess() {
  const [session, setSession] = useState<AccountSession | null>(null);
  useEffect(() => {
    api.session()
      .then(setSession)
      .catch(() => window.location.replace("/login?intent=enterprise&returnTo=/enterprise/no-access"));
  }, []);
  if (!session) return <div className="loading">正在检查企业权限…</div>;
  if (session.platformRoles.includes("platform_admin")) return <Navigate to="/platform" replace />;
  if (session.organizations.length)
    return <Navigate to={session.organizations.length === 1 ? `/app/org/${session.organizations[0]!.organizationId}` : "/enterprise/organizations"} replace />;
  return (
    <Shell>
      <main className="enterprise-no-access">
        <Link to="/enterprise">← 返回企业入口</Link>
        <header><p className="eyebrow">ENTERPRISE ACCESS</p><h1>你还没有企业权限</h1><p>企业工作区由平台管理员创建并分配。请联系平台运营人员，把你的邮箱添加为企业所有者、HR 管理员或成员。</p></header>
        <section className="enterprise-access-explainer">
          <span>如何开始</span>
          <ol><li>平台管理员创建企业工作区</li><li>企业负责人完成基本资料</li><li>创建调研并邀请员工参与</li></ol>
          <Link className="secondary" to="/app/personal">返回个人中心</Link>
        </section>
      </main>
    </Shell>
  );
}

function EnterpriseOrganizations() {
  const [session, setSession] = useState<AccountSession | null>(null);
  const [busyId, setBusyId] = useState("");
  useEffect(() => { api.session().then(setSession).catch(() => window.location.replace("/login?intent=enterprise&returnTo=/enterprise/organizations")); }, []);
  const enter = async (organizationId: string) => {
    setBusyId(organizationId);
    await api.switchWorkspace("organization", organizationId);
    window.location.assign(`/app/org/${organizationId}`);
  };
  if (!session) return <div className="loading">正在读取企业身份…</div>;
  if (session.platformRoles.includes("platform_admin")) return <Navigate to="/platform" replace />;
  if (!session.organizations.length) return <Navigate to="/enterprise/no-access" replace />;
  return (
    <Shell><main className="enterprise-organizations"><header><p className="eyebrow">MY ORGANIZATIONS</p><h1>我的企业</h1><p>选择你当前要处理的企业。只有当账号确实属于多个企业时，才会看到这个页面。</p></header><section>{session.organizations.map((item, index) => <button key={item.organizationId} onClick={() => void enter(item.organizationId)} disabled={Boolean(busyId)}><i>{String(index + 1).padStart(2, "0")}</i><span><b>{item.organizationName}</b><small>{item.role === "owner" ? "企业所有者" : item.role === "hr_admin" ? "HR管理员" : item.role === "manager" ? "管理者" : "企业成员"}</small></span><strong>{busyId === item.organizationId ? "正在进入…" : "进入工作台 →"}</strong></button>)}</section></main></Shell>
  );
}

function OrganizationEntry() {
  const { organizationId = "" } = useParams();
  const [error, setError] = useState("");
  const entering = useRef(false);
  useEffect(() => {
    if (entering.current) return;
    entering.current = true;
    api.session().then(async (session) => {
      if (session.activeWorkspace.kind !== "organization" || session.activeWorkspace.organizationId !== organizationId)
        await api.switchWorkspace("organization", organizationId);
      window.location.replace("/workspace");
    }).catch((reason) => {
      entering.current = false;
      setError(reason.message);
    });
  }, [organizationId]);
  return error ? <main className="survey-error"><h1>无法进入这个企业工作区</h1><p>{error}</p><Link to="/enterprise/organizations">返回企业列表</Link></main> : <div className="loading">正在进入企业工作区…</div>;
}

function PlatformDashboard() {
  const [session, setSession] = useState<AccountSession | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const load = () => api.session().then(setSession);
  useEffect(() => { load().catch(() => window.location.replace("/platform/login")); }, []);
  const createOrganization = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    const data = new FormData(event.currentTarget);
    try {
      const created = await api.createPlatformOrganization(String(data.get("organizationName")));
      await load();
      setCreating(false);
      setNotice(`${created.organizationName} 已创建。现在可以进入工作台完成资料并创建调研。`);
    } catch (reason: any) {
      setNotice(reason.message);
    } finally {
      setBusy(false);
    }
  };
  const enter = async (organizationId: string) => {
    setBusyId(organizationId);
    setNotice("");
    try {
      await api.switchWorkspace("organization", organizationId);
      window.location.assign(`/app/org/${organizationId}`);
    } catch (reason: any) {
      setBusyId("");
      setNotice(reason.message);
    }
  };
  if (!session) return <div className="loading">正在进入平台管理后台…</div>;
  if (!session.platformRoles.includes("platform_admin")) return <Navigate to="/" replace />;
  return (
    <Shell>
      <main className="platform-organizations">
        <header className="platform-organizations-hero">
          <div><p className="eyebrow">CLIENT ORGANIZATIONS</p><h1>企业客户</h1><p>先建立一个真实企业，再进入它的工作台创建调研、邀请员工并查看报告。</p></div>
          <div className="platform-organization-count"><strong>{session.organizations.length}</strong><small>个企业工作区</small></div>
          <button className="primary" onClick={() => setCreating(true)}>＋ 添加企业</button>
        </header>
        {notice && <div className="notice">{notice}</div>}
        {creating && <section className="platform-create-organization" aria-label="添加企业">
          <div><p className="eyebrow">NEW ORGANIZATION</p><h2>添加一个企业</h2><p>这里只建立企业工作区。行业、规模和研究授权会由企业负责人进入后补充。</p></div>
          <form onSubmit={createOrganization}>
            <label><span>企业全称</span><input name="organizationName" required autoFocus maxLength={120} placeholder="请输入工商登记或正式对外使用的名称" /></label>
            <div><button type="button" className="secondary" onClick={() => setCreating(false)}>取消</button><button className="primary" disabled={busy}>{busy ? "正在创建…" : "创建企业"}</button></div>
          </form>
        </section>
        }
        <section className="platform-organization-list">
          <div className="platform-organization-list-heading"><div><p className="eyebrow">ACTIVE WORKSPACES</p><h2>已创建企业</h2></div><p>点击企业即可进入对应工作台。</p></div>
          {session.organizations.length ? session.organizations.map((item, index) => <article key={item.organizationId}>
            <i>{String(index + 1).padStart(2, "0")}</i>
            <div><span>企业工作区</span><h3>{item.organizationName}</h3><p>你的角色：{item.role === "owner" ? "企业所有者" : item.role === "hr_admin" ? "HR 管理员" : item.role === "manager" ? "管理者" : "企业成员"}</p></div>
            <button className="secondary" disabled={Boolean(busyId)} onClick={() => void enter(item.organizationId)}>{busyId === item.organizationId ? "正在进入…" : "进入工作台 →"}</button>
          </article>) : <div className="platform-organization-empty"><span>00</span><h3>还没有企业</h3><p>添加第一个企业后，就可以进入工作台创建调研活动。</p><button className="primary" onClick={() => setCreating(true)}>添加第一个企业</button></div>}
        </section>
      </main>
    </Shell>
  );
}

export function organizationWorkspaceLanding(role: AccountSession["user"]["role"]):
  | "member"
  | "reports"
  | "admin" {
  if (role === "employee") return "member";
  if (role === "manager") return "reports";
  return "admin";
}

function OrganizationMemberHome({ session }: { session: AccountSession }) {
  return (
    <Shell>
      <main className="organization-member-home">
        <header>
          <p className="eyebrow">ENTERPRISE MEMBER</p>
          <h1>{session.tenant.name}</h1>
          <p>你已进入企业工作区。这里展示与你的企业成员身份有关的测评入口和报告，不提供 HR 管理功能。</p>
        </header>
        <section className="organization-member-grid">
          <article className="organization-member-primary">
            <span>企业测评</span>
            <h2>从企业发放的专属链接进入问卷</h2>
            <p>企业测评需要使用 HR 发出的邮件或邀请链接进入，以确保活动、身份和数据边界正确关联。</p>
          </article>
          <article>
            <span>我的企业报告</span>
            <h2>查看与你本人有关的报告</h2>
            <p>只有已经发布且你有权限查看的个人报告会出现在列表中，组织整体报告不会自动向个人开放。</p>
            <Link className="secondary" to="/my-reports">查看我的报告</Link>
          </article>
          <article>
            <span>当前身份</span>
            <h2>企业成员</h2>
            <p>{session.account.email ?? session.user.name} · {session.tenant.name}</p>
            <Link className="secondary" to="/app/personal">切换回个人中心</Link>
          </article>
        </section>
      </main>
    </Shell>
  );
}

function WorkspaceByRole() {
  const [session, setSession] = useState<any>(null);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [profileChecked, setProfileChecked] = useState(false);
  const [profileConfigured, setProfileConfigured] = useState(false);
  const [params] = useSearchParams();
  useEffect(() => {
    api
      .session()
      .then(async (current) => {
        setSession(current);
        if (["owner", "hr_admin"].includes(current.user.role)) {
          const configured = await api.researchProfile().then(() => true).catch(() => false);
          setProfileConfigured(configured);
        }
        setProfileChecked(true);
      })
      .catch(() => setUnauthenticated(true));
  }, []);
  if (unauthenticated) return <Navigate to="/login" replace />;
  if (!session) return <div className="loading">正在进入企业工作区…</div>;
  if (session.tenant.id === "tenant-personal")
    return <Navigate to="/enterprise/no-access" replace />;
  const landing = organizationWorkspaceLanding(session.user.role);
  if (landing === "member")
    return <OrganizationMemberHome session={session} />;
  if (landing === "reports")
    return <Navigate to="/reports" replace />;
  if (!profileChecked) return <div className="loading">正在检查企业资料…</div>;
  if (!profileConfigured && params.get("skipSetup") !== "1")
    return <OrganizationFirstUse session={session} />;
  return <Dashboard />;
}

function OrganizationFirstUse({ session }: { session: AccountSession }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    const data = new FormData(event.currentTarget);
    try {
      await api.saveResearchProfile({
        country: "CN",
        headquartersProvince: String(data.get("province")),
        industryRaw: String(data.get("industryRaw")),
        industryStandardCode: "other",
        industryMappingVersion: "GB/T 4754—2017",
        headcount: Number(data.get("headcount")),
        aiStage: "local_exploration",
        aiStartDuration: "under_6m",
        questionnaireLanguage: "zh-CN",
        primaryWorkLanguage: "zh-CN",
      });
      if (session.user.role === "owner" && data.get("normAuthorization") === "on")
        await api.setNormAuthorization("authorized");
      window.location.assign("/workspace");
    } catch (reason: any) {
      setNotice(reason.message);
      setBusy(false);
    }
  };
  return (
    <Shell>
      <main className="organization-first-use">
        <Link to="/">← 返回产品首页</Link>
        <header><p className="eyebrow">ORGANIZATION SETUP</p><h1>完成企业基本设置</h1><p>只需填写四项基本信息即可开始使用；其他研究和集成配置可以稍后完成。</p></header>
        {notice && <div className="notice warning">{notice}</div>}
        <form onSubmit={submit}>
          <section>
            <span>01</span>
            <div><h2>企业基本资料</h2><p>用于识别企业工作区和说明本次调研背景，不参与员工个人计分。</p></div>
            <div className="onboarding-fields">
              <label><span>企业名称</span><input value={session.tenant.name} disabled /></label>
              <label><span>总部所在省份</span><input name="province" required placeholder="例如：上海市" /></label>
              <label><span>企业所属行业</span><input name="industryRaw" required placeholder="例如：互联网和相关服务" /></label>
              <label><span>当前从业人数</span><input name="headcount" type="number" min="1" required placeholder="例如：300" /></label>
            </div>
          </section>
          <section className="organization-research-choice">
            <span>02</span>
            <div><h2>研究授权（选填）</h2><p>不同意不影响企业测评和报告；授权后也只允许符合条件的去标识数据进入候选研究。</p>{session.user.role === "owner" ? <label className="consent-check"><input type="checkbox" name="normAuthorization" /><span>我代表企业同意将符合条件的去标识数据用于问卷验证和未来常模候选研究。</span></label> : <small>该授权只能由企业所有者确认，你可以先完成企业资料。</small>}</div>
          </section>
          <footer><Link className="secondary" to="/workspace?skipSetup=1">先浏览工作台</Link><button className="primary" disabled={busy}>{busy ? "正在保存…" : "保存并进入工作台"}</button></footer>
        </form>
      </main>
    </Shell>
  );
}

function PersonalStart() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<PersonalResearchProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [assessmentProfileId, setAssessmentProfileId] =
    useState<AssessmentProfileId>("personal_iv_v0.1");
  const navigate = useNavigate();
  useEffect(() => {
    api.session()
      .then(async (session) => {
        if (session.activeWorkspace.kind !== "personal") {
          await api.switchWorkspace("personal");
          window.location.replace("/personal/start");
          return null;
        }
        return api.personalResearchProfile();
      })
      .then((value) => {
        if (value === null) {
          setEditing(true);
          return;
        }
        setProfile(value);
        setEditing(!value);
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoaded(true));
  }, []);
  const start = async () => {
    if (!profile) {
      setEditing(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api.createPersonalEntry(assessmentProfileId);
      window.location.assign(result.url);
    } catch (reason: any) {
      setError(reason.message || "暂时无法进入个人测评。");
      setBusy(false);
    }
  };
  return (
    <Shell>
      <main className="personal-start-page">
        <Link to="/app/personal">← 返回个人中心</Link>
        <header>
          <p className="eyebrow">PERSONAL ASSESSMENT</p>
          <h1>开始个人 AI 准备度测评</h1>
          <p>先选择这次想了解的范围，再核对工作背景。背景信息不参与计分，也不会出现在个人报告中。</p>
        </header>
        <fieldset className="personal-scope-picker">
          <legend>这次想了解什么？</legend>
          <div>
            <label className={assessmentProfileId === "personal_iv_v0.1" ? "chosen" : ""}>
              <input type="radio" name="personalScope" checked={assessmentProfileId === "personal_iv_v0.1"} onChange={() => setAssessmentProfileId("personal_iv_v0.1")} />
              <span><b>只了解我自己</b><small>26题 · 了解个人 AI 能力与已经产生的工作影响</small></span><em>约 8 分钟</em>
            </label>
            <label className={assessmentProfileId === "personal_iov_observer_v0.1" ? "chosen" : ""}>
              <input type="radio" name="personalScope" checked={assessmentProfileId === "personal_iov_observer_v0.1"} onChange={() => setAssessmentProfileId("personal_iov_observer_v0.1")} />
              <span><b>同时了解我和所在组织</b><small>42题 · 增加你对组织支持环境的观察与双轴定位</small></span><em>约 12 分钟</em>
            </label>
          </div>
          {assessmentProfileId === "personal_iov_observer_v0.1" && <p>组织相关结果只代表你的个人观察，不是公司正式诊断，也不代表其他员工的共同看法。</p>}
        </fieldset>
        {!loaded ? <div className="loading">正在读取你的测评资料…</div> : editing ? (
          <PersonalResearchForm
            profile={profile}
            onSaved={(value) => {
              setProfile(value);
              setEditing(false);
              setError("");
            }}
          />
        ) : (
          <PersonalResearchSummary
            profile={profile!}
            busy={busy}
            error={error}
            onEdit={() => setEditing(true)}
            onStart={() => void start()}
          />
        )}
        <button className="text-button personal-switch-account" onClick={() => navigate("/login?returnTo=/personal/start&switch=1")}>使用其他邮箱登录</button>
      </main>
    </Shell>
  );
}

const PERSONAL_PROFILE_LABELS = {
  industryCode: {
    internet: "互联网、软件与信息服务",
    manufacturing: "制造业",
    finance: "金融业",
    professional_services: "专业服务",
    consumer_retail: "消费与零售",
    culture_media: "文化、传媒与娱乐",
    healthcare: "医疗与生命科学",
    education: "教育",
    public_nonprofit: "公共部门与非营利组织",
    other: "其他行业",
    unknown: "不清楚",
    prefer_not_to_say: "不愿回答",
  },
  jobFamily: {
    management_strategy: "综合管理与战略",
    product_project: "产品与项目",
    engineering_data_research: "研发、工程、数据与研究",
    design_content_creative: "设计、内容与创意",
    marketing_brand_growth: "市场、品牌与增长",
    sales_business_customer_success: "销售、商务与客户成功",
    operations_supply_production_delivery: "运营、供应链、生产与服务交付",
    finance_legal_risk_audit: "财务、法务、风控与审计",
    people_admin_procurement_support: "人力、行政、采购与内部支持",
    frontline_other: "一线服务及其他",
    unknown: "不清楚／其他",
    prefer_not_to_say: "不愿回答",
  },
  careerStage: {
    junior_ic: "初级个人贡献者",
    experienced_ic: "成熟个人贡献者",
    senior_expert: "资深专家",
    frontline_manager: "一线管理者",
    middle_manager: "中层管理者",
    senior_manager: "高层管理者",
    other_unknown: "其他／不清楚",
    prefer_not_to_say: "不愿回答",
  },
  tenureBand: {
    under_1y: "不足1年",
    "1_to_2y": "1—2年",
    "3_to_5y": "3—5年",
    "6_to_10y": "6—10年",
    over_10y: "10年以上",
    unknown: "不清楚",
    prefer_not_to_say: "不愿回答",
  },
} as const;

function PersonalResearchSummary({
  profile,
  busy,
  error,
  onEdit,
  onStart,
}: {
  profile: PersonalResearchProfile;
  busy: boolean;
  error: string;
  onEdit: () => void;
  onStart: () => void;
}) {
  const optionalText = (value: string) =>
    value === "prefer_not_to_say" ? "不愿回答" : value;
  const items = [
    ["主要工作城市", optionalText(profile.workCity)],
    ["工作所在省级地区", optionalText(profile.province)],
    ["企业所属行业", PERSONAL_PROFILE_LABELS.industryCode[profile.industryCode as keyof typeof PERSONAL_PROFILE_LABELS.industryCode] ?? profile.industryCode],
    ["企业人员规模", profile.companySizeBand === "unknown" ? "不清楚" : profile.companySizeBand === "prefer_not_to_say" ? "不愿回答" : profile.companySizeBand],
    ["岗位类型", PERSONAL_PROFILE_LABELS.jobFamily[profile.jobFamily]],
    ["职业阶段", PERSONAL_PROFILE_LABELS.careerStage[profile.careerStage]],
    ["人员管理职责", profile.peopleManager === true ? "是" : profile.peopleManager === false ? "否" : "不清楚／不愿回答"],
    ["当前企业工作年限", PERSONAL_PROFILE_LABELS.tenureBand[profile.tenureBand]],
  ] as const;
  return (
    <section className="personal-ready-card" aria-labelledby="personal-background-confirmation">
      <header>
        <h2 id="personal-background-confirmation">确认工作背景</h2>
        <p>请先核对已保存的信息，再开始测评。这些信息只用于样本描述与问卷验证，不影响诊断分数。</p>
      </header>
      <dl className="personal-profile-summary">
        {items.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className={`personal-research-status ${profile.researchConsent ? "authorized" : "not-authorized"}`}>
        <b>研究授权状态</b>
        <span>{profile.researchConsent ? "已授权去标识数据用于问卷验证和常模候选研究" : "未授权研究使用，不影响测评和报告"}</span>
      </div>
      {error && <p className="auth-error">{error}</p>}
      <div className="personal-ready-actions">
        <button className="primary" disabled={busy} onClick={onStart}>{busy ? "正在进入…" : "信息正确，开始测评"}</button>
        <button className="secondary" disabled={busy} onClick={onEdit}>修改背景信息</button>
      </div>
    </section>
  );
}

function PersonalResearchForm({
  profile,
  onSaved,
}: {
  profile: PersonalResearchProfile | null;
  onSaved: (profile: PersonalResearchProfile) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const researchConsent = data.get("researchConsent") === "on";
    const optionalText = (name: string) =>
      String(data.get(name) ?? "").trim() || "prefer_not_to_say";
    const input: PersonalResearchProfileInput = {
      workCity: optionalText("workCity"),
      province: optionalText("province"),
      industryCode: String(data.get("industryCode")),
      companySizeBand: String(data.get("companySizeBand")) as PersonalResearchProfileInput["companySizeBand"],
      jobFamily: String(data.get("jobFamily")) as PersonalResearchProfileInput["jobFamily"],
      careerStage: String(data.get("careerStage")) as PersonalResearchProfileInput["careerStage"],
      peopleManager: data.get("peopleManager") === "yes" ? true : data.get("peopleManager") === "no" ? false : null,
      tenureBand: String(data.get("tenureBand")) as PersonalResearchProfileInput["tenureBand"],
      researchConsent,
      noticeVersion: PERSONAL_RESEARCH_NOTICE_VERSION,
      consentedAt: researchConsent ? new Date().toISOString() : null,
    };
    try {
      onSaved(await api.savePersonalResearchProfile(input));
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="personal-context-form" onSubmit={submit}>
      <section>
        <h2>工作背景</h2>
        <p>请选择与你当前主要工作最接近的情况。所有题目均可选择“不清楚／不愿回答”。</p>
        <div className="personal-context-grid">
          <label><span>主要工作城市</span><input name="workCity" defaultValue={profile?.workCity === "prefer_not_to_say" ? "" : profile?.workCity ?? ""} placeholder="例如：上海市；可留空" /><small>留空表示不愿回答。</small></label>
          <label><span>工作所在省级地区</span><input name="province" defaultValue={profile?.province === "prefer_not_to_say" ? "" : profile?.province ?? ""} placeholder="例如：上海市；可留空" /><small>留空表示不愿回答。</small></label>
          <label><span>企业所属行业</span><select name="industryCode" defaultValue={profile?.industryCode ?? "unknown"}>{[
            ["internet", "互联网、软件与信息服务"], ["manufacturing", "制造业"], ["finance", "金融业"], ["professional_services", "专业服务"], ["consumer_retail", "消费与零售"], ["culture_media", "文化、传媒与娱乐"], ["healthcare", "医疗与生命科学"], ["education", "教育"], ["public_nonprofit", "公共部门与非营利组织"], ["other", "其他行业"], ["unknown", "不清楚"], ["prefer_not_to_say", "不愿回答"],
          ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>企业人员规模</span><select name="companySizeBand" defaultValue={profile?.companySizeBand ?? "unknown"}>{["<50", "50—199", "200—499", "500—999", "1000—4999", "≥5000"].map((value) => <option key={value}>{value}</option>)}<option value="unknown">不清楚</option><option value="prefer_not_to_say">不愿回答</option></select></label>
          <label><span>岗位类型</span><select name="jobFamily" defaultValue={profile?.jobFamily ?? "unknown"}>{[
            ["management_strategy", "综合管理与战略"], ["product_project", "产品与项目"], ["engineering_data_research", "研发、工程、数据与研究"], ["design_content_creative", "设计、内容与创意"], ["marketing_brand_growth", "市场、品牌与增长"], ["sales_business_customer_success", "销售、商务与客户成功"], ["operations_supply_production_delivery", "运营、供应链、生产与服务交付"], ["finance_legal_risk_audit", "财务、法务、风控与审计"], ["people_admin_procurement_support", "人力、行政、采购与内部支持"], ["frontline_other", "一线服务及其他"], ["unknown", "不清楚／其他"], ["prefer_not_to_say", "不愿回答"],
          ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>职业阶段</span><select name="careerStage" defaultValue={profile?.careerStage ?? "other_unknown"}>{[
            ["junior_ic", "初级个人贡献者"], ["experienced_ic", "成熟个人贡献者"], ["senior_expert", "资深专家"], ["frontline_manager", "一线管理者"], ["middle_manager", "中层管理者"], ["senior_manager", "高层管理者"], ["other_unknown", "其他／不清楚"], ["prefer_not_to_say", "不愿回答"],
          ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>是否承担人员管理职责</span><select name="peopleManager" defaultValue={profile?.peopleManager === true ? "yes" : profile?.peopleManager === false ? "no" : "unknown"}><option value="yes">是</option><option value="no">否</option><option value="unknown">不清楚／不愿回答</option></select></label>
          <label><span>在当前企业的工作年限</span><select name="tenureBand" defaultValue={profile?.tenureBand ?? "unknown"}><option value="under_1y">不足1年</option><option value="1_to_2y">1—2年</option><option value="3_to_5y">3—5年</option><option value="6_to_10y">6—10年</option><option value="over_10y">10年以上</option><option value="unknown">不清楚</option><option value="prefer_not_to_say">不愿回答</option></select></label>
        </div>
      </section>
      <section className="research-consent-panel">
        <h2>是否帮助我们改进这套测评？</h2>
        <p>如果你同意，我们会把去除邮箱等身份信息后的答卷和上述工作背景，用于信效度分析和未来常模候选研究。不同意不会影响答题、分数或报告。</p>
        <label className="consent-check"><input name="researchConsent" type="checkbox" defaultChecked={profile?.researchConsent ?? false} /><span>我同意将去标识数据用于问卷验证和常模候选研究。我知道可以在“我的数据”中撤回授权或申请删除。</span></label>
        <small>不会进入研究数据：邮箱、企业名称、精确职位、个人报告正文和自由文本。说明版本：{PERSONAL_RESEARCH_NOTICE_VERSION}</small>
      </section>
      {error && <p className="auth-error">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? "正在保存…" : "保存并继续"}</button>
    </form>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AccountSession | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    api
      .session()
      .then(setSession)
      .catch(() => undefined);
  }, []);
  const accountLabel = session?.account.displayName || session?.account.email || "账户";
  const initials = session?.account.displayName
    ? session.account.displayName.slice(0, 2).toUpperCase()
    : "账号";
  const activeLabel = session?.activeWorkspace.kind === "platform"
    ? "平台管理"
    : session?.activeWorkspace.kind === "organization"
      ? session.tenant.name
      : "个人中心";
  const switchTo = async (
    kind: "personal" | "organization" | "platform",
    organizationId?: string,
  ) => {
    await api.switchWorkspace(kind, organizationId);
    window.location.assign(
      kind === "platform"
        ? "/platform"
        : kind === "organization"
          ? `/app/org/${organizationId}`
          : "/app/personal",
    );
  };
  return (
    <>
      <header className="app-header">
        <Link to={session?.activeWorkspace.kind === "platform" ? "/platform" : session?.activeWorkspace.kind === "organization" ? "/workspace" : "/app/personal"} className="brand">
          <i>AI</i>
          <span>
            组织转型诊断<small>ENTERPRISE WORKSPACE</small>
          </span>
        </Link>
        <div className="header-spacer" />
        <button className="account-button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen}>
          <span className="user" aria-hidden="true">{initials}</span>
          <span className="account-copy"><b>{activeLabel}</b><small>{session?.account.email ?? accountLabel}</small></span>
          <span aria-hidden="true">⌄</span>
        </button>
        {menuOpen && (
          <div className="account-menu">
            <small className="account-menu-label">切换工作区</small>
            <button className={session?.activeWorkspace.kind === "personal" ? "active" : ""} onClick={() => void switchTo("personal")}>个人中心</button>
            {session?.organizations.map((organization) => (
              <button key={organization.organizationId} className={session.activeWorkspace.organizationId === organization.organizationId ? "active" : ""} onClick={() => void switchTo("organization", organization.organizationId)}>{organization.organizationName}<small>{organization.role === "owner" ? "企业所有者" : organization.role === "hr_admin" ? "HR管理员" : organization.role === "manager" ? "管理者" : "企业成员"}</small></button>
            ))}
            {session?.platformRoles.includes("platform_admin") && <button className={session.activeWorkspace.kind === "platform" ? "active" : ""} onClick={() => void switchTo("platform")}>平台管理</button>}
            <hr />
            <Link to="/account">账户信息</Link>
            {session?.activeWorkspace.kind === "personal" && <Link to="/my-reports">我的报告</Link>}
            {session?.activeWorkspace.kind === "organization" && ["owner", "hr_admin"].includes(session.user.role) && <Link to="/settings">企业设置</Link>}
            <button onClick={async () => { await api.logout(); window.location.assign("/"); }}>退出登录</button>
          </div>
        )}
      </header>
      {children}
    </>
  );
}

function Dashboard() {
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [session, setSession] = useState<any>(null);
  const load = () => api.campaigns().then(setCampaigns);
  useEffect(() => {
    void load();
    void api.session().then(setSession);
  }, []);
  const visible = campaigns.filter(
    (campaign) => filter === "all" || campaign.status === filter,
  );
  const active = campaigns.filter(
    (campaign) => campaign.status === "active",
  ).length;
  const submitted = campaigns.reduce(
    (sum, campaign) => sum + campaign.submittedCount,
    0,
  );
  return (
    <Shell>
      <div className="workspace">
        <aside className="sidebar">
          <span>当前企业</span>
          <h2>{session?.tenant?.name ?? "正在读取…"}</h2>
          <p>企业诊断工作区</p>
          <nav>
            <Link className="active" to="/workspace">
              01　调研活动
            </Link>
            <Link to="/reports">02　报告中心</Link>
            <Link to="/actions">03　下一步行动</Link>
            <Link to="/settings">04　企业设置</Link>
          </nav>
          <footer>
            <small>当前身份</small>
            <b>
              {session?.user?.name ?? "—"} · {session?.user?.role ?? "—"}
            </b>
          </footer>
        </aside>
        <main className="main">
          <section className="hero">
            <div>
              <p className="eyebrow">CAMPAIGN OPERATIONS</p>
              <h1>
              看清组织的 AI 准备度，
                <br />
                找到真正的改进重点。
              </h1>
              <p>发起组织测评，了解员工能力、组织支持条件和已经产生的 AI 影响。</p>
            </div>
            <button className="primary" onClick={() => setOpen(true)}>
              ＋ 创建调研活动
            </button>
          </section>
          <section className="stat-grid">
            <article>
              <span>全部活动</span>
              <strong>{campaigns.length}</strong>
              <small>已创建的测评</small>
            </article>
            <article>
              <span>进行中</span>
              <strong>{active}</strong>
              <small>正在接收答卷</small>
            </article>
            <article>
              <span>已提交答卷</span>
              <strong>{submitted}</strong>
              <small>本企业累计提交</small>
            </article>
            <article>
              <span>待发布报告</span>
              <strong>
                {campaigns.filter((item) => item.status === "closed").length}
              </strong>
              <small>需要HR审核</small>
            </article>
          </section>
          <section className="campaign-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">SURVEY CAMPAIGNS</p>
                <h2>调研活动</h2>
              </div>
              <div className="filters">
                {["all", "draft", "scheduled", "active", "closed"].map((value) => (
                  <button
                    key={value}
                    className={filter === value ? "selected" : ""}
                    onClick={() => setFilter(value)}
                  >
                    {
                      (
                        {
                          all: "全部",
                          draft: "草稿",
                          scheduled: "待开始",
                          active: "进行中",
                          closed: "已关闭",
                        } as any
                      )[value]
                    }
                  </button>
                ))}
              </div>
            </div>
            {visible.length ? (
              <div className="campaign-list">
                {visible.map((campaign) => (
                  <Link
                    className="campaign-row"
                    to={`/campaigns/${campaign.id}`}
                    key={campaign.id}
                  >
                    <div>
                      <em className={`status ${campaign.status}`}>
                        {
                          (
                            {
                              draft: "草稿",
                              scheduled: "待开始",
                              active: "进行中",
                              closed: "已关闭",
                              cancelled: "已取消",
                              archived: "已归档",
                            } as any
                          )[campaign.status]
                        }
                      </em>
                      <h3>{campaign.name}</h3>
                      <p>
                        {campaign.target === "combined"
                          ? "个人及组织"
                          : campaign.target === "personal"
                            ? "个人专项"
                            : "组织专项"}{" "}
                        · {campaign.mode === "anonymous" ? "匿名" : "实名"}
                      </p>
                    </div>
                    <div>
                      <span>截止时间</span>
                      <b>
                        {new Date(campaign.closesAt).toLocaleString("zh-CN", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </b>
                    </div>
                    <div>
                      <span>进度</span>
                      <b>
                        {campaign.submittedCount} /{" "}
                        {campaign.invitedCount || "—"}
                      </b>
                    </div>
                    <div>
                      <span>报告</span>
                      <b>
                        {campaign.status === "closed" ? "查看结果" : "等待关闭"}
                      </b>
                    </div>
                    <strong>打开活动 →</strong>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="empty">
                <span>01</span>
                <h3>还没有符合条件的活动</h3>
                <p>创建第一场调研，开始真实测试完整闭环。</p>
              </div>
            )}
          </section>
        </main>
      </div>
      {open && (
        <CreateCampaign
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false);
            void load();
          }}
        />
      )}
    </Shell>
  );
}

function CreateCampaign({
  onClose,
  onCreated,
  campaign,
}: {
  onClose: () => void;
  onCreated: () => void;
  campaign?: CampaignRecord;
}) {
  const [target, setTarget] = useState<AssessmentTarget>(
    campaign?.target ?? "combined",
  );
  const [mode, setMode] = useState<CampaignMode>(campaign?.mode ?? "anonymous");
  const [organizationMethod, setMethod] = useState<
    "workforce_survey" | "single_manager_self_assessment"
  >(campaign?.organizationMethod ?? "workforce_survey");
  const [designatedAssessorExternalId, setDesignatedAssessorExternalId] =
    useState(campaign?.designatedAssessorExternalId ?? "dev-hr");
  const [customItems, setCustomItems] = useState<CustomQuestionSnapshot[]>(
    campaign?.customItems ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [baselineCampaigns, setBaselineCampaigns] = useState<CampaignRecord[]>(
    [],
  );
  useEffect(() => {
    api
      .campaigns()
      .then((campaigns) =>
        setBaselineCampaigns(
          campaigns.filter((campaign) =>
            ["closed", "archived"].includes(campaign.status),
          ),
        ),
      )
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (target !== "organization") setMethod("workforce_survey");
  }, [target]);
  useEffect(() => {
    if (organizationMethod === "single_manager_self_assessment")
      setMode("identified");
  }, [organizationMethod]);
  useEffect(() => {
    if (mode === "anonymous")
      setCustomItems((items) =>
        items.filter((item) => item.type !== "short_text"),
      );
  }, [mode]);
  const addCustomItem = (type: CustomQuestionType) => {
    if (customItems.length >= 5 || (type === "short_text" && mode === "anonymous"))
      return;
    setCustomItems((items) => [
      ...items,
      {
        id: `CQ${String(items.length + 1).padStart(2, "0")}`,
        type,
        text: "",
        required: false,
        options:
          type === "short_text"
            ? []
            : [
                { value: "1", label: "选项一" },
                { value: "2", label: "选项二" },
              ],
      },
    ]);
  };
  const updateCustomItem = (
    index: number,
    changes: Partial<CustomQuestionSnapshot>,
  ) =>
    setCustomItems((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...changes } : item,
      ),
    );
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    const input = {
      name: String(data.get("name")),
      target,
      mode,
      organizationMethod,
      startsAt: new Date(String(data.get("startsAt"))).toISOString(),
      closesAt: new Date(String(data.get("closesAt"))).toISOString(),
      backgroundItemIds: data.getAll("background").map(String),
      customItems: customItems.map((item, index) => ({
        ...item,
        id: `CQ${String(index + 1).padStart(2, "0")}`,
      })),
      invitedCount: Number(data.get("invitedCount") || 0),
      baselineCampaignId: String(data.get("baselineCampaignId") || "") || null,
      designatedAssessorExternalId:
        organizationMethod === "single_manager_self_assessment"
          ? designatedAssessorExternalId
          : null,
    };
    if (campaign) await api.updateCampaign(campaign.id, input);
    else await api.createCampaign(input);
    onCreated();
  };
  const startsNow = new Date(Date.now() - 60_000);
  const nextWeek = new Date(Date.now() + 7 * 86_400_000);
  const inputDate = (value: Date) =>
    new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">{campaign ? "EDIT CAMPAIGN" : "CREATE CAMPAIGN"}</p>
            <h2>{campaign ? "编辑调研草稿" : "创建调研活动"}</h2>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="form-body">
          <label>
            <span>活动名称</span>
            <input
              name="name"
              required
              defaultValue={campaign?.name ?? "2026 AI 工作方式调研"}
            />
          </label>
          <fieldset>
            <legend>测评目标</legend>
            <div className="choice-grid">
              {[
                ["combined", "个人及组织", "42题 · 两类报告"],
                ["personal", "个人", "26题 · 个人报告"],
                ["organization", "组织", "16题 · 组织报告"],
              ].map(([value, title, copy]) => (
                <label key={value} className={target === value ? "chosen" : ""}>
                  <input
                    type="radio"
                    checked={target === value}
                    onChange={() => setTarget(value as AssessmentTarget)}
                  />
                  <b>{title}</b>
                  <small>{copy}</small>
                </label>
              ))}
            </div>
          </fieldset>
          {target !== "personal" && (
            <details className="campaign-advanced-block">
              <summary><span>高级设置</span><small>组织测量方式通常无需调整</small></summary>
              <fieldset>
                <legend>组织测量方法</legend>
                <div className="choice-grid two">
                {[
                  ["workforce_survey", "员工群体调研", "7人起生成方向性报告"],
                  ...(target === "organization"
                    ? [[
                        "single_manager_self_assessment",
                        "管理者单人自评",
                        "1名指定管理者完成组织视角报告",
                      ]]
                    : []),
                ].map(([value, title, copy]) => (
                  <label
                    key={value}
                    className={organizationMethod === value ? "chosen" : ""}
                  >
                    <input
                      type="radio"
                      checked={organizationMethod === value}
                      onChange={() => setMethod(value as any)}
                    />
                    <b>{title}</b>
                    <small>{copy}</small>
                  </label>
                ))}
                </div>
              </fieldset>
              {organizationMethod === "single_manager_self_assessment" && (
                <label>
                  <span>指定评估人飞书 Open ID</span>
                  <input
                    name="designatedAssessorExternalId"
                    required
                    value={designatedAssessorExternalId}
                    onChange={(event) => setDesignatedAssessorExternalId(event.target.value.trim())}
                    placeholder="ou_xxx；本地测试使用 dev-hr"
                  />
                  <small>活动发布后只有该管理者能作答；此报告不代表员工共识。</small>
                </label>
              )}
            </details>
          )}
          <fieldset>
            <legend>调研方式</legend>
            <div className="choice-grid two">
              {[
                ["anonymous", "匿名", "HR不可查看个人答案"],
                ["identified", "实名", "授权HR可查看个人报告"],
              ].map(([value, title, copy]) => (
                <label key={value} className={mode === value ? "chosen" : ""}>
                  <input
                    type="radio"
                    checked={mode === value}
                    disabled={
                      organizationMethod ===
                        "single_manager_self_assessment" && value === "anonymous"
                    }
                    onChange={() => setMode(value as CampaignMode)}
                  />
                  <b>{title}</b>
                  <small>{copy}</small>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="form-row">
            <label>
              <span>开始时间</span>
              <input
                name="startsAt"
                type="datetime-local"
                required
                defaultValue={inputDate(campaign ? new Date(campaign.startsAt) : startsNow)}
              />
            </label>
            <label>
              <span>截止时间</span>
              <input
                name="closesAt"
                type="datetime-local"
                required
                defaultValue={inputDate(campaign ? new Date(campaign.closesAt) : nextWeek)}
              />
            </label>
            <label>
              <span>预计邀请人数</span>
              <input
                name="invitedCount"
                type="number"
                min="1"
                defaultValue={
                  organizationMethod === "single_manager_self_assessment"
                    ? 1
                    : (campaign?.invitedCount ?? 20)
                }
              />
            </label>
          </div>
          <details className="campaign-advanced-block">
            <summary><span>更多可选配置</span><small>背景题、企业补充题与历史比较</small></summary>
            <fieldset>
              <legend>可选背景题</legend>
              <div className="checks">
              <label>
                <input
                  name="background"
                  value="BG01"
                  type="checkbox"
                  defaultChecked={campaign ? campaign.backgroundItemIds.includes("BG01") : true}
                />
                AI使用天数
              </label>
              <label>
                <input
                  name="background"
                  value="BG02"
                  type="checkbox"
                  defaultChecked={campaign ? campaign.backgroundItemIds.includes("BG02") : true}
                />
                适合AI的任务机会
              </label>
              <label>
                <input
                  name="background"
                  value="BG03"
                  type="checkbox"
                  defaultChecked={campaign?.backgroundItemIds.includes("BG03")}
                />
                工具与权限满足度
              </label>
              </div>
            </fieldset>
            <fieldset className="custom-question-editor">
            <legend>企业补充题（可选，最多5道）</legend>
            <p>
              位于核心题之后，不参与诊断计分。匿名活动不开放简短文字题；最多2道选择题可设为必答。
            </p>
            {customItems.map((item, index) => {
              const requiredChoiceCount = customItems.filter(
                (entry) => entry.required && entry.type !== "short_text",
              ).length;
              return (
                <article key={`${item.id}-${index}`}>
                  <header>
                    <strong>补充题 {index + 1}</strong>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        setCustomItems((items) =>
                          items.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      删除
                    </button>
                  </header>
                  <div className="form-row custom-question-row">
                    <label>
                      <span>题型</span>
                      <select
                        value={item.type}
                        onChange={(event) => {
                          const type = event.target.value as CustomQuestionType;
                          updateCustomItem(index, {
                            type,
                            required: type === "short_text" ? false : item.required,
                            options:
                              type === "short_text"
                                ? []
                                : item.options.length >= 2
                                  ? item.options
                                  : [
                                      { value: "1", label: "选项一" },
                                      { value: "2", label: "选项二" },
                                    ],
                          });
                        }}
                      >
                        <option value="single_choice">单选题</option>
                        <option value="multiple_choice">多选题</option>
                        {mode === "identified" && (
                          <option value="short_text">简短文字题</option>
                        )}
                      </select>
                    </label>
                    <label className="custom-question-text">
                      <span>题目</span>
                      <input
                        required
                        maxLength={300}
                        value={item.text}
                        onChange={(event) =>
                          updateCustomItem(index, { text: event.target.value })
                        }
                        placeholder="请输入企业希望补充了解的问题"
                      />
                    </label>
                  </div>
                  {item.type !== "short_text" && (
                    <label>
                      <span>选项（每行一个，2—10项）</span>
                      <textarea
                        required
                        rows={Math.max(2, item.options.length)}
                        value={item.options.map((option) => option.label).join("\n")}
                        onChange={(event) =>
                          updateCustomItem(index, {
                            options: event.target.value
                              .split("\n")
                              .slice(0, 10)
                              .map((label, optionIndex) => ({
                                value: String(optionIndex + 1),
                                label,
                              })),
                          })
                        }
                      />
                    </label>
                  )}
                  {item.type !== "short_text" && (
                    <label className="inline-check">
                      <input
                        type="checkbox"
                        checked={item.required}
                        disabled={!item.required && requiredChoiceCount >= 2}
                        onChange={(event) =>
                          updateCustomItem(index, { required: event.target.checked })
                        }
                      />
                      设为必答
                    </label>
                  )}
                </article>
              );
            })}
            <div className="custom-question-actions">
              <button
                type="button"
                className="secondary"
                disabled={customItems.length >= 5}
                onClick={() => addCustomItem("single_choice")}
              >
                ＋单选题
              </button>
              <button
                type="button"
                className="secondary"
                disabled={customItems.length >= 5}
                onClick={() => addCustomItem("multiple_choice")}
              >
                ＋多选题
              </button>
              {mode === "identified" && (
                <button
                  type="button"
                  className="secondary"
                  disabled={customItems.length >= 5}
                  onClick={() => addCustomItem("short_text")}
                >
                  ＋简短文字题
                </button>
              )}
            </div>
            </fieldset>
            {target !== "personal" && baselineCampaigns.some(
            (item) =>
              item.target === target &&
              item.organizationMethod === organizationMethod &&
              ["closed", "archived"].includes(item.status),
          ) && (
            <label>
              <span>是否与过去的测评结果比较</span>
              <select
                name="baselineCampaignId"
                defaultValue={campaign?.baselineCampaignId ?? ""}
              >
                <option value="">这是一次独立测评，不做历史比较</option>
                {baselineCampaigns
                  .filter(
                    (campaign) =>
                      campaign.target === target &&
                      campaign.organizationMethod === organizationMethod,
                  )
                  .map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      与 {new Date(campaign.createdAt).toLocaleDateString("zh-CN")} 的“{campaign.name}”比较
                    </option>
                  ))}
              </select>
              <small>
                组织报告会描述两次测评的分数变化，但不会把变化直接解释为某项措施已经产生效果。
              </small>
            </label>
            )}
          </details>
        </div>
        <footer>
          <button type="button" className="secondary" onClick={onClose}>
            取消
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "正在保存…" : campaign ? "保存修改" : "创建草稿"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function FeishuDeliveryDialog({
  campaignId,
  campaignName,
  campaignStatus,
  campaignStartsAt,
  onClose,
}: {
  campaignId: string;
  campaignName: string;
  campaignStatus: CampaignRecord["status"];
  campaignStartsAt: string;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [directory, setDirectory] = useState<EnterpriseDirectory | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [departmentId, setDepartmentId] = useState("all");
  useEffect(() => {
    api
      .directory()
      .then((value) => {
        setDirectory(value);
        setSelected(
          new Set(
            value.subjects
              .filter((subject) => subject.active)
              .map((subject) => subject.externalSubjectId),
          ),
        );
      })
      .catch(() => setDirectory(null));
  }, []);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const manualOpenIds = String(data.get("openIds") ?? "")
      .split(/[\s,，;；]+/)
      .filter(Boolean);
    const openIds = [...new Set([...selected, ...manualOpenIds])];
    if (!openIds.length) {
      setError("请至少选择一名员工。通讯录为空时，可在下方输入飞书 Open ID。 ");
      setBusy(false);
      return;
    }
    try {
      setResult(
        await api.sendFeishuInvitations(campaignId, {
          openIds,
          title: String(data.get("title")),
          body: String(data.get("body")),
          buttonLabel: String(data.get("buttonLabel")),
        }),
      );
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop">
      {result ? (
        <section className="modal action-success">
          <h2>飞书发放已完成</h2>
          <p>
            成功 {result.sent} 人，失败 {result.failed}{" "}
            人。只有SaaS收到完整答卷才计为完成。
          </p>
          <button className="primary" onClick={onClose}>
            完成
          </button>
        </section>
      ) : (
        <form className="modal delivery-dialog" onSubmit={submit}>
          <header>
            <div>
              <p className="eyebrow">FEISHU DELIVERY</p>
              <h2>编辑并发送飞书问卷卡片</h2>
            </div>
            <button type="button" onClick={onClose}>
              ×
            </button>
          </header>
          <div className="form-body">
            {error && <div className="notice">{error}</div>}
            <section className="directory-picker">
              <div className="directory-picker-head">
                <div>
                  <b>选择发放对象</b>
                  <small>
                    已选择 {selected.size} 人
                    {directory?.lastSyncedAt
                      ? ` · 通讯录同步于 ${new Date(directory.lastSyncedAt).toLocaleString("zh-CN")}`
                      : " · 尚无同步记录"}
                  </small>
                </div>
                <select
                  value={departmentId}
                  onChange={(event) => setDepartmentId(event.target.value)}
                >
                  <option value="all">全部部门</option>
                  {directory?.departments.map((department) => (
                    <option
                      key={department.externalDepartmentId}
                      value={department.externalDepartmentId}
                    >
                      {department.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    setSelected(
                      new Set(
                        (directory?.subjects ?? [])
                          .filter(
                            (subject) =>
                              subject.active &&
                              (departmentId === "all" ||
                                subject.departmentIds.includes(departmentId)),
                          )
                          .map((subject) => subject.externalSubjectId),
                      ),
                    )
                  }
                >
                  全选当前范围
                </button>
              </div>
              <div className="directory-subjects">
                {(directory?.subjects ?? [])
                  .filter(
                    (subject) =>
                      subject.active &&
                      (departmentId === "all" ||
                        subject.departmentIds.includes(departmentId)),
                  )
                  .map((subject) => (
                    <label key={subject.externalSubjectId}>
                      <input
                        type="checkbox"
                        checked={selected.has(subject.externalSubjectId)}
                        onChange={(event) => {
                          const next = new Set(selected);
                          if (event.target.checked)
                            next.add(subject.externalSubjectId);
                          else next.delete(subject.externalSubjectId);
                          setSelected(next);
                        }}
                      />
                      <span>
                        <b>{subject.displayName}</b>
                        <small>
                          {subject.departmentIds
                            .map(
                              (id) =>
                                directory?.departments.find(
                                  (department) =>
                                    department.externalDepartmentId === id,
                                )?.name ?? id,
                            )
                            .join("、") || "未分配部门"}
                        </small>
                      </span>
                    </label>
                  ))}
                {!directory?.subjects.some((subject) => subject.active) && (
                  <p>尚未同步到员工。请先在企业设置中同步飞书通讯录。</p>
                )}
              </div>
            </section>
            <label>
              <span>临时补充 Open ID（可选）</span>
              <textarea
                name="openIds"
                rows={2}
                placeholder="仅在通讯录缺失时使用，可输入多个 ou_ 开头的 Open ID"
              />
            </label>
            <label>
              <span>卡片标题</span>
              <input name="title" required defaultValue={campaignName} />
            </label>
            <label>
              <span>卡片正文</span>
              <textarea
                name="body"
                required
                rows={5}
                defaultValue={
                  campaignStatus === "scheduled"
                    ? `邀请你参加“${campaignName}”。问卷将于${new Date(campaignStartsAt).toLocaleString("zh-CN")}开放；届时请根据过去3个月的真实工作体验作答。问卷会自动保存，可以分次完成。`
                    : `邀请你参加“${campaignName}”。请根据过去3个月的真实工作体验作答。问卷会自动保存，可以分次完成。`
                }
              />
            </label>
            <label>
              <span>按钮文字</span>
              <input
                name="buttonLabel"
                required
                defaultValue={campaignStatus === "scheduled" ? "查看活动" : "开始填写"}
              />
            </label>
            <p className="form-help">
              所有内容都在当前SaaS页面编辑；发送时系统为每位员工生成独立签名入口，不需要跳转飞书后台。
            </p>
          </div>
          <footer>
            <button type="button" className="secondary" onClick={onClose}>
              取消
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "正在发送…" : "确认发送"}
            </button>
          </footer>
        </form>
      )}
    </div>
  );
}

function EmailDeliveryDialog({
  campaignId,
  campaignName,
  campaignStatus,
  campaignStartsAt,
  onClose,
}: {
  campaignId: string;
  campaignName: string;
  campaignStatus: CampaignRecord["status"];
  campaignStartsAt: string;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const [error, setError] = useState("");
  const [emailsText, setEmailsText] = useState("");
  const emailCount = useMemo(
    () => new Set(splitEmailEntries(emailsText).map((email) => email.toLowerCase())).size,
    [emailsText],
  );
  const importEmails = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = parseEmailInvitationCsv(await file.text());
      if (!imported.length) throw new Error("CSV中没有找到邮箱地址");
      const combined = [...splitEmailEntries(emailsText), ...imported];
      setEmailsText([...new Set(combined.map((email) => email.toLowerCase()))].join("\n"));
      setError("");
    } catch (reason: any) {
      setError(reason.message || "CSV读取失败");
    } finally {
      event.target.value = "";
    }
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    const emails = [...new Set(splitEmailEntries(String(data.get("emails") ?? "")).map((email) => email.toLowerCase()))];
    try {
      const sent = await api.sendEmailInvitations(campaignId, {
        emails,
        subject: String(data.get("subject") ?? ""),
        body: String(data.get("body") ?? ""),
        buttonLabel: String(data.get("buttonLabel") ?? "开始填写"),
      });
      setResult(sent);
    } catch (reason: any) { setError(reason.message || "邮件发送失败"); }
    finally { setBusy(false); }
  };
  return <div className="modal-backdrop">{result ? <section className="modal action-success"><h2>邮箱邀请已发送</h2><p>成功 {result.sent} 人，失败 {result.failed} 人。</p><button className="primary" onClick={onClose}>完成</button></section> : <form className="modal delivery-dialog" onSubmit={submit}>
    <header><div><p className="eyebrow">EMAIL DELIVERY</p><h2>编辑并发送邮箱邀请</h2></div><button type="button" onClick={onClose}>×</button></header>
    <div className="form-body">{error && <div className="notice">{error}</div>}
      <label><span>员工邮箱</span><textarea name="emails" rows={7} required value={emailsText} onChange={(event) => setEmailsText(event.target.value)} placeholder="手工输入邮箱：每行一个，也可以用逗号分隔" /></label>
      <div className="email-import-row">
        <label className="secondary file-button">导入邮箱CSV<input type="file" accept=".csv,text/csv" onChange={importEmails} /></label>
        <small>已识别 {emailCount} 个邮箱；CSV支持 email、email_address、邮箱或邮箱地址列，也可直接使用单列邮箱。</small>
      </div>
      <label><span>邮件标题</span><input name="subject" required defaultValue={`邀请你参加“${campaignName}”`} /></label>
      <label><span>邮件正文</span><textarea name="body" required rows={5} defaultValue={campaignStatus === "scheduled" ? `邀请你参加“${campaignName}”。问卷将于${new Date(campaignStartsAt).toLocaleString("zh-CN")}开放。` : `邀请你参加“${campaignName}”。请根据真实工作体验完成问卷。`} /></label>
      <label><span>按钮文字</span><input name="buttonLabel" required defaultValue="开始填写" /></label>
      <p className="form-help">每位员工会收到独立邀请链接。匿名活动中，邮箱不会写入答卷。</p>
    </div><footer><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={busy}>{busy ? "正在发送…" : "确认发送"}</button></footer>
  </form>}</div>;
}

function FeishuReminderDialog({
  campaignId,
  campaignName,
  campaignStatus,
  campaignClosesAt,
  onClose,
}: {
  campaignId: string;
  campaignName: string;
  campaignStatus: CampaignRecord["status"];
  campaignClosesAt: string;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    sent: number;
    failed: number;
    skipped?: string;
  } | null>(null);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      setResult(
        await api.sendFeishuReminders(campaignId, {
          title: String(data.get("title")),
          body: String(data.get("body")),
          buttonLabel: String(data.get("buttonLabel")),
        }),
      );
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop">
      {result ? (
        <section className="modal action-success">
          <h2>{result.skipped ? "没有需要提醒的员工" : "提醒已发送"}</h2>
          <p>
            {result.skipped
              ? "当前通过飞书成功发放的员工都已经提交，系统没有重复打扰。"
              : `成功 ${result.sent} 人，失败 ${result.failed} 人。系统只选择尚未提交的员工。`}
          </p>
          <button className="primary" onClick={onClose}>
            完成
          </button>
        </section>
      ) : (
        <form className="modal delivery-dialog" onSubmit={submit}>
          <header>
            <div>
              <p className="eyebrow">FEISHU REMINDER</p>
              <h2>提醒尚未完成的员工</h2>
            </div>
            <button type="button" onClick={onClose}>
              ×
            </button>
          </header>
          <div className="form-body">
            {error && <div className="notice">{error}</div>}
            <label>
              <span>卡片标题</span>
              <input
                name="title"
                required
                defaultValue={`${campaignName} · ${campaignStatus === "scheduled" ? "时间更新" : "填写提醒"}`}
              />
            </label>
            <label>
              <span>卡片正文</span>
              <textarea
                name="body"
                required
                rows={5}
                defaultValue={
                  campaignStatus === "scheduled"
                    ? `“${campaignName}”的时间安排已更新，新的截止时间是${new Date(campaignClosesAt).toLocaleString("zh-CN")}。问卷开放后可通过本卡片进入。`
                    : `你尚未完成“${campaignName}”。已经填写的内容会保留，请在${new Date(campaignClosesAt).toLocaleString("zh-CN")}前继续完成。`
                }
              />
            </label>
            <label>
              <span>按钮文字</span>
              <input name="buttonLabel" required defaultValue="继续填写" />
            </label>
            <p className="form-help">
              系统根据SaaS中的提交状态筛选接收人，不向已经提交的员工发送提醒。
            </p>
          </div>
          <footer>
            <button type="button" className="secondary" onClick={onClose}>
              取消
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "正在发送…" : "确认提醒"}
            </button>
          </footer>
        </form>
      )}
    </div>
  );
}

function ExtendDeadlineDialog({
  campaign,
  onClose,
  onSaved,
}: {
  campaign: CampaignRecord;
  onClose: () => void;
  onSaved: (campaign: CampaignRecord) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const proposed = new Date(
    new Date(campaign.closesAt).getTime() + 3 * 86_400_000,
  );
  const localDateTime = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const result = await api.extendCampaignDeadline(
        campaign.id,
        new Date(String(data.get("newClosesAt"))).toISOString(),
        String(data.get("reason")),
      );
      onSaved(result.campaign);
    } catch (reason: any) {
      setError(reason.message);
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">DEADLINE AMENDMENT</p>
            <h2>延长调研截止时间</h2>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="form-body">
          {error && <div className="notice">{error}</div>}
          <p>
            当前截止时间：
            {new Date(campaign.closesAt).toLocaleString("zh-CN")}
          </p>
          <label>
            <span>新的截止时间</span>
            <input
              name="newClosesAt"
              type="datetime-local"
              min={localDateTime(new Date(campaign.closesAt))}
              defaultValue={localDateTime(proposed)}
              required
            />
          </label>
          <label>
            <span>延期原因</span>
            <textarea
              name="reason"
              rows={4}
              maxLength={1000}
              required
              placeholder="说明为什么延期，便于后续审计和复盘。"
            />
          </label>
          <p className="form-help">
            保存后会追加延期记录，不覆盖原截止时间；接下来可编辑飞书提醒发送给未完成人员。
          </p>
        </div>
        <footer>
          <button type="button" className="secondary" onClick={onClose}>
            取消
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "正在保存…" : "保存延期并编辑提醒"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function IndividualReportAccessPanel({ campaign }: { campaign: CampaignRecord }) {
  const [session, setSession] = useState<any>(null);
  const [users, setUsers] = useState<EnterpriseUser[]>([]);
  const [grants, setGrants] = useState<IndividualReportGrant[]>([]);
  const [reports, setReports] = useState<IndividualReportListItem[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const load = async () => {
    const [nextSession, nextUsers, nextGrants] = await Promise.all([
      api.session(),
      api.users(),
      api.individualReportGrants(campaign.id),
    ]);
    setSession(nextSession);
    setUsers(
      nextUsers.filter((user) => ["owner", "hr_admin"].includes(user.role)),
    );
    setGrants(nextGrants);
    try {
      setReports(await api.individualReports(campaign.id));
    } catch {
      setReports([]);
    }
  };
  useEffect(() => {
    void load().catch((cause) => setError(cause.message));
  }, [campaign.id]);
  const grant = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError("");
    try {
      await api.grantIndividualReports(campaign.id, {
        granteeUserId: String(data.get("granteeUserId")),
        operations: data.get("download") ? ["view", "download"] : ["view"],
        expiresAt: String(data.get("expiresAt") || "") || null,
      });
      setNotice("实名个人报告权限已授予；每次查看和下载都会记录审计。 ");
      await load();
    } catch (cause: any) {
      setError(cause.message);
    }
  };
  const expires = new Date(Date.now() + 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return (
    <section className="individual-access-panel">
      <div className="individual-access-heading">
        <div>
          <p className="eyebrow">IDENTIFIED REPORT ACCESS</p>
          <h2>实名个人报告权限</h2>
          <p>
            该权限与团队报告授权严格分开，只对本次实名活动生效；不包含逐题答案。
          </p>
        </div>
      </div>
      {notice && <div className="notice">{notice}</div>}
      {error && <div className="notice">{error}</div>}
      {session?.user?.role === "owner" && (
        <form className="individual-grant-form" onSubmit={grant}>
          <label>
            <span>授权给</span>
            <select name="granteeUserId" required>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName} · {user.role === "owner" ? "企业所有者" : "HR管理员"}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>到期日</span>
            <input name="expiresAt" type="date" defaultValue={expires} required />
          </label>
          <label className="inline-check">
            <input name="download" type="checkbox" />
            允许下载PDF
          </label>
          <button className="primary">授予权限</button>
        </form>
      )}
      <div className="individual-grant-list">
        {grants.length ? grants.map((item) => {
          const expired = Boolean(item.expiresAt && new Date(item.expiresAt) <= new Date());
          const active = !item.revokedAt && !expired;
          return (
            <article key={item.id}>
              <div>
                <strong>{item.granteeDisplayName}</strong>
                <span>{item.operations.includes("download") ? "查看及下载" : "仅查看"}</span>
              </div>
              <span>{item.expiresAt ? `${new Date(item.expiresAt).toLocaleDateString("zh-CN")} 到期` : "长期有效"}</span>
              <b className={active ? "active" : ""}>{item.revokedAt ? "已撤销" : expired ? "已到期" : "生效中"}</b>
              {session?.user?.role === "owner" && active && (
                <button
                  className="secondary compact"
                  onClick={async () => {
                    if (!window.confirm(`确认撤销 ${item.granteeDisplayName} 的实名个人报告权限？`)) return;
                    await api.revokeIndividualReportGrant(item.id);
                    await load();
                  }}
                >
                  撤销
                </button>
              )}
            </article>
          );
        }) : <p className="muted-copy">尚未授予任何实名个人报告权限。</p>}
      </div>
      <div className="individual-report-index">
        <h3>我有权查看的个人报告</h3>
        {reports.length ? reports.map((report) => (
          <Link
            key={`${report.reportId}:${report.externalSubjectId}`}
            to={`/campaigns/${campaign.id}/individual-reports/${encodeURIComponent(report.externalSubjectId)}`}
          >
            <span>{report.subjectDisplayName}</span>
            <b>{report.reportType === "second_stage_personal" ? "二阶段个人报告" : "个人报告"}</b>
            <strong>查看并记录审计 →</strong>
          </Link>
        )) : (
          <p className="muted-copy">
            当前账号尚未获得有效权限，或本次活动还没有可查看的个人报告。
          </p>
        )}
      </div>
    </section>
  );
}

function CampaignDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [campaign, setCampaign] = useState<CampaignRecord | null>(null);
  const [reports, setReports] = useState<ReportSnapshot[]>([]);
  const [amendments, setAmendments] = useState<CampaignScheduleAmendment[]>([]);
  const [invite, setInvite] = useState<string>("");
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [emailDeliveryOpen, setEmailDeliveryOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const load = async () => {
    const [nextCampaign, nextReports, nextAmendments] = await Promise.all([
      api.campaign(id),
      api.campaignReports(id),
      api.campaignScheduleAmendments(id),
    ]);
    setCampaign(nextCampaign);
    setReports(nextReports);
    setAmendments(nextAmendments);
  };
  useEffect(() => {
    void load();
    void api.session().then(setSession).catch(() => undefined);
  }, [id]);
  if (!campaign)
    return (
      <Shell>
        <div className="loading">正在读取活动…</div>
      </Shell>
    );
  const transition = async (status: string) => {
    if (
      status === "cancelled" &&
      !window.confirm(
        "确认取消这个活动？已提交的数据会保留用于审计，但活动将停止接收答卷。",
      )
    )
      return;
    const result = await api.transition(id, status);
    setNotice(
      status === "active"
        ? result.campaign.status === "scheduled"
          ? "活动已排期，题目、计分、范围和研究上下文版本已经冻结；到开始时间后系统自动开放。"
          : campaign.status === "scheduled"
            ? "活动已提前开始，现在可以接收答卷。"
            : "活动已发布，题目、计分和研究上下文版本已经冻结。"
        : status === "closed"
          ? "活动已关闭，系统已按样本规则生成报告。"
          : status === "cancelled"
            ? "活动已取消并停止接收答卷。"
            : "活动已归档，可继续在历史记录中查阅。",
    );
    await load();
  };
  const createInvite = async () => {
    const result = await api.invite(id);
    setInvite(result.url);
    await navigator.clipboard?.writeText(result.url);
    setNotice("本地测试入口已生成并复制。它绑定当前管理员身份，提交后会计入本活动；正式发放请使用“通过邮箱发放”。");
  };
  const deleteDraft = async () => {
    if (!window.confirm("确认永久删除这个草稿？此操作不能撤销。")) return;
    await api.deleteCampaign(id);
    navigate("/workspace");
  };
  const progress = campaign.invitedCount
    ? Math.round((campaign.submittedCount / campaign.invitedCount) * 100)
    : 0;
  return (
    <Shell>
      <main className="detail-page">
        <Link to="/workspace" className="back">
          ← 返回活动列表
        </Link>
        <section className="detail-cover">
          <div>
            <em className={`status ${campaign.status}`}>
              {campaignStatusLabels[campaign.status]}
            </em>
            <h1>{campaign.name}</h1>
            <p>活动编号 {campaign.id.slice(0, 8)} · 题目 v2.0 · 计分 v1.1</p>
          </div>
          <div className="actions">
            {campaign.status === "draft" && (
              <>
                <button
                  className="secondary dark"
                  onClick={() => setEditOpen(true)}
                >
                  编辑草稿
                </button>
                <button
                  className="primary"
                  onClick={() => transition("active")}
                >
                  确认并发布
                </button>
                <button
                  className="danger"
                  onClick={deleteDraft}
                >
                  删除草稿
                </button>
              </>
            )}
            {campaign.status === "active" && (
              <>
                <button
                  className="primary"
                  onClick={() => setEmailDeliveryOpen(true)}
                >
                  通过邮箱发放
                </button>
                {session?.authentication !== "email_otp" && (
                  <>
                    <button className="primary" onClick={() => setDeliveryOpen(true)}>
                      通过飞书发放
                    </button>
                    <button className="secondary dark" onClick={() => setReminderOpen(true)}>
                      提醒未完成人员
                    </button>
                  </>
                )}
                <button
                  className="secondary dark"
                  onClick={() => setDeadlineOpen(true)}
                >
                  延长截止时间
                </button>
                {import.meta.env.DEV && (
                  <button className="secondary dark" onClick={createInvite}>
                    生成本地测试入口
                  </button>
                )}
                <button
                  className="secondary dark"
                  onClick={() => transition("cancelled")}
                >
                  取消活动
                </button>
                <button className="danger" onClick={() => transition("closed")}>
                  关闭活动
                </button>
              </>
            )}
            {campaign.status === "scheduled" && (
              <>
                <button
                  className="primary"
                  onClick={() => setEmailDeliveryOpen(true)}
                >
                  通过邮箱预先发放
                </button>
                {session?.authentication !== "email_otp" && (
                  <button className="primary" onClick={() => setDeliveryOpen(true)}>
                    通过飞书预先发放
                  </button>
                )}
                <button
                  className="secondary dark"
                  onClick={() => transition("active")}
                >
                  提前开始
                </button>
                <button
                  className="secondary dark"
                  onClick={() => setDeadlineOpen(true)}
                >
                  延长截止时间
                </button>
                {import.meta.env.DEV && (
                  <button className="secondary dark" onClick={createInvite}>
                    生成本地测试入口
                  </button>
                )}
                <button
                  className="secondary dark"
                  onClick={() => transition("cancelled")}
                >
                  取消活动
                </button>
              </>
            )}
            {campaign.status === "closed" && (
              <>
                <button
                  className="secondary dark"
                  onClick={() => window.print()}
                >
                  导出活动摘要
                </button>
                <button
                  className="secondary dark"
                  onClick={() => transition("archived")}
                >
                  归档
                </button>
              </>
            )}
            {campaign.status === "cancelled" && (
              <button
                className="secondary dark"
                onClick={() => transition("archived")}
              >
                归档
              </button>
            )}
          </div>
          <dl>
            <div>
              <dt>测评目标</dt>
              <dd>{targetLabels[campaign.target]}</dd>
            </div>
            <div>
              <dt>调研方式</dt>
              <dd>{campaign.mode === "anonymous" ? "匿名" : "实名"}</dd>
            </div>
            <div>
              <dt>组织测量</dt>
              <dd>
                {campaign.organizationMethod === "workforce_survey"
                  ? "员工群体"
                  : "管理者单人"}
              </dd>
            </div>
            <div>
              <dt>截止时间</dt>
              <dd>
                {new Date(campaign.closesAt).toLocaleString("zh-CN")}
                {amendments.length > 0 && (
                  <small>已延期 {amendments.length} 次</small>
                )}
              </dd>
            </div>
          </dl>
        </section>
        {notice && <div className="notice">{notice}</div>}
        {amendments.length > 0 && (
          <details className="schedule-history">
            <summary>查看截止时间变更记录</summary>
            <ol>
              {amendments.map((amendment) => (
                <li key={amendment.id}>
                  <strong>第 {amendment.sequence} 次延期</strong>
                  <span>
                    {new Date(amendment.previousClosesAt).toLocaleString("zh-CN")}
                    {" → "}
                    {new Date(amendment.newClosesAt).toLocaleString("zh-CN")}
                  </span>
                  <p>{amendment.reason}</p>
                </li>
              ))}
            </ol>
          </details>
        )}
        <div className={`detail-grid ${import.meta.env.DEV ? "" : "single"}`}>
          <section className="progress-card">
            <p className="eyebrow">LIVE PROGRESS</p>
            <h2>真实回收进度</h2>
            <strong>
              {progress}
              <small>%</small>
            </strong>
            <div className="progress">
              <i style={{ width: `${Math.min(100, progress)}%` }} />
            </div>
            <p>
              {campaign.submittedCount} / {campaign.invitedCount || "—"} 已提交
            </p>
          </section>
          {import.meta.env.DEV && (
            <aside className="invite-card">
              <p className="eyebrow">LOCAL TEST ENTRY</p>
              <h2>本地测试入口</h2>
              {invite ? (
                <>
                  <code>{invite}</code>
                  <button
                    className="primary"
                    onClick={() => window.open(invite, "_blank")}
                  >
                    打开员工作答页
                  </button>
                </>
              ) : (
                <>
                  <p>
                    {["scheduled", "active"].includes(campaign.status)
                      ? "仅供开发验收，提交会计入当前活动；正式活动请使用邮箱发放。"
                      : "发布活动后才能生成测试入口。"}
                  </p>
                  <button
                    className="secondary"
                    disabled={!["scheduled", "active"].includes(campaign.status)}
                    onClick={createInvite}
                  >
                    生成并复制测试入口
                  </button>
                </>
              )}
            </aside>
          )}
        </div>
        {campaign.customItems.length > 0 && (
          <CustomResultsPanel campaign={campaign} />
        )}
        <section className="reports-panel">
          <p className="eyebrow">REPORT CENTER</p>
          <h2>报告中心</h2>
          {reports.length ? (
            <div className="report-list">
              {reports.map((report) => (
                <article key={report.id}>
                  <div>
                    <em>{report.status === "draft" ? "待审核" : "已发布"}</em>
                    <h3>
                      {report.reportType === "organization"
                        ? "组织整体报告"
                        : report.reportType === "organization_scoped"
                          ? "组织专项报告"
                          : report.reportType === "manager_self_assessment"
                            ? "管理者组织自评报告"
                            : "个人报告"}
                    </h3>
                    <p>
                      快照 {report.id.slice(0, 8)} · n={report.sampleSize}
                    </p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() => navigate(`/reports/${report.id}`)}
                  >
                    查看完整报告
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty small">
              <h3>报告尚未生成</h3>
              <p>
                {["scheduled", "active"].includes(campaign.status)
                  ? "员工提交后生成个人报告；关闭活动后按样本规则生成组织报告。"
                  : "当前没有满足生成条件的报告。"}
              </p>
            </div>
          )}
        </section>
        {campaign.mode === "identified" &&
          ["personal", "combined"].includes(campaign.target) && (
            <IndividualReportAccessPanel campaign={campaign} />
          )}
      </main>
      {deliveryOpen && (
        <FeishuDeliveryDialog
          campaignId={campaign.id}
          campaignName={campaign.name}
          campaignStatus={campaign.status}
          campaignStartsAt={campaign.startsAt}
          onClose={() => setDeliveryOpen(false)}
        />
      )}
      {emailDeliveryOpen && (
        <EmailDeliveryDialog
          campaignId={campaign.id}
          campaignName={campaign.name}
          campaignStatus={campaign.status}
          campaignStartsAt={campaign.startsAt}
          onClose={() => setEmailDeliveryOpen(false)}
        />
      )}
      {editOpen && (
        <CreateCampaign
          campaign={campaign}
          onClose={() => setEditOpen(false)}
          onCreated={() => {
            setEditOpen(false);
            void load();
          }}
        />
      )}
      {reminderOpen && (
        <FeishuReminderDialog
          campaignId={campaign.id}
          campaignName={campaign.name}
          campaignStatus={campaign.status}
          campaignClosesAt={campaign.closesAt}
          onClose={() => setReminderOpen(false)}
        />
      )}
      {deadlineOpen && (
        <ExtendDeadlineDialog
          campaign={campaign}
          onClose={() => setDeadlineOpen(false)}
          onSaved={(updatedCampaign) => {
            setCampaign(updatedCampaign);
            setDeadlineOpen(false);
            setNotice(
              "新截止时间已生效，原时间和延期原因已写入审计记录。",
            );
            void api.campaignScheduleAmendments(id).then(setAmendments);
            setReminderOpen(true);
          }}
        />
      )}
    </Shell>
  );
}

function CustomResultsPanel({ campaign }: { campaign: CampaignRecord }) {
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState("");
  const canLoad =
    campaign.mode === "identified" ||
    ["closed", "archived"].includes(campaign.status);
  useEffect(() => {
    if (!canLoad) return;
    api
      .customResults(campaign.id)
      .then(setResults)
      .catch((reason) => setError(reason.message));
  }, [campaign.id, campaign.submittedCount, campaign.status, canLoad]);
  return (
    <section className="custom-results-panel">
      <p className="eyebrow">ENTERPRISE SUPPLEMENT</p>
      <h2>企业补充题结果</h2>
      <p className="custom-results-boundary">
        企业补充题不参与诊断计分、类型判断、常模或跨期标准比较。
      </p>
      {!canLoad ? (
        <div className="empty small">
          <h3>活动关闭后展示</h3>
          <p>匿名活动进行中不开放补充题结果，避免根据提交顺序反推个人答案。</p>
        </div>
      ) : error ? (
        <div className="notice">{error}</div>
      ) : !results ? (
        <div className="loading">正在汇总补充题…</div>
      ) : results.status === "suppressed" ? (
        <div className="empty small">
          <h3>样本不足，暂不展示</h3>
          <p>{results.boundary}</p>
        </div>
      ) : (
        <div className="custom-result-list">
          {results.items.map((item: any) => (
            <article key={item.id}>
              <header>
                <div>
                  <span>
                    {item.id} ·{" "}
                    {item.type === "single_choice"
                      ? "单选"
                      : item.type === "multiple_choice"
                        ? "多选"
                        : "简短文字"}
                  </span>
                  <h3>{item.text}</h3>
                </div>
                <strong>{item.responseCount}份回答</strong>
              </header>
              {item.optionCounts && (
                <div className="custom-option-counts">
                  {item.optionCounts.map((option: any) => (
                    <div key={option.value}>
                      <span>{option.label}</span>
                      <b>{option.count}</b>
                    </div>
                  ))}
                </div>
              )}
              {item.textResponses && (
                <div className="custom-text-results">
                  <p className="risk-note">
                    实名原文属于高风险个人数据；本次查看已写入审计记录。不要复制到团队报告或PDF。
                  </p>
                  {item.textResponses.map((response: any) => (
                    <blockquote key={response.responseId}>
                      <p>{response.text}</p>
                      <footer>
                        {response.participantName} ·{" "}
                        {new Date(response.submittedAt).toLocaleString("zh-CN")}
                      </footer>
                    </blockquote>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Survey() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const legacyToken = params.get("token") || "";
  const fragmentToken = new URLSearchParams(
    window.location.hash.replace(/^#/, ""),
  ).get("token");
  if (fragmentToken) {
    sessionStorage.setItem(`survey-entry:${id}`, fragmentToken);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  }
  const token =
    fragmentToken ||
    legacyToken ||
    sessionStorage.getItem(`survey-entry:${id}`) ||
    "";
  const storageKey = `survey:${id}:${token.slice(-8)}`;
  const revision = useRef(0);
  const advanceTimer = useRef<number | null>(null);
  const [data, setData] = useState<any>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, RawAnswer>>({});
  const [backgroundAnswers, setBackgroundAnswers] = useState<
    Record<string, string>
  >({});
  const [customAnswers, setCustomAnswers] = useState<
    Record<string, CustomAnswer>
  >({});
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [consentedAt, setConsentedAt] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);
  useEffect(() => {
    const loadSurvey = async () => {
      try {
        const saved = localStorage.getItem(storageKey);
        const local = saved
          ? JSON.parse(saved)
          : {
              answers: {},
              backgroundAnswers: {},
              customAnswers: {},
              clientRevision: 0,
            };
        const normalizedLocal = local.answers
          ? local
          : {
              answers: local,
              backgroundAnswers: {},
              customAnswers: {},
              clientRevision: 0,
            };
        const [campaignData, serverDraft] = await Promise.all([
          api.publicCampaign(id, token),
          api.surveyDraft(id, token),
        ]);
        const useServer =
          Number(serverDraft.clientRevision ?? 0) >=
          Number(normalizedLocal.clientRevision ?? 0);
        const selected = useServer ? serverDraft : normalizedLocal;
        revision.current = Math.max(
          Number(serverDraft.clientRevision ?? 0),
          Number(normalizedLocal.clientRevision ?? 0),
        );
        setAnswers(selected.answers ?? {});
        setBackgroundAnswers(selected.backgroundAnswers ?? {});
        setCustomAnswers(selected.customAnswers ?? {});
        if (
          normalizedLocal.privacyNoticeVersion ===
            campaignData.privacyNotice.version &&
          normalizedLocal.consentedAt
        )
          setConsentedAt(normalizedLocal.consentedAt);
        setData(campaignData);
      } catch (reason: any) {
        setError(reason.message);
      }
    };
    api
      .session()
      .then(loadSurvey)
      .catch((e: any) => {
        if (e?.code === "AUTHENTICATION_REQUIRED") {
          const returnTo = `${window.location.pathname}${window.location.search}`;
          window.location.replace(
            `/login?intent=enterprise&returnTo=${encodeURIComponent(returnTo)}`,
          );
          return;
        }
        setError(e.message);
      });
  }, [id, token]);
  const questions = data
    ? [
        ...data.items.map((item: any) => ({ ...item, kind: "core" })),
        ...data.backgroundItems.map((item: any) => ({
          ...item,
          kind: "background",
        })),
        ...data.customItems.map((item: any) => ({
          ...item,
          kind: "custom",
        })),
      ]
    : [];
  const customSelectedCount = Object.values(customAnswers).filter((value) =>
    Array.isArray(value) ? value.length > 0 : value.trim().length > 0,
  ).length;
  const selectedCount =
    Object.keys(answers).length +
    Object.keys(backgroundAnswers).length +
    customSelectedCount;
  const requiredCustomComplete =
    data?.customItems.every((item: any) => {
      if (!item.required) return true;
      const value = customAnswers[item.id];
      return Array.isArray(value)
        ? value.length > 0
        : typeof value === "string" && value.trim().length > 0;
    }) ?? false;
  const complete =
    data &&
    Object.keys(answers).length === data.items.length &&
    Object.keys(backgroundAnswers).length === data.backgroundItems.length &&
    requiredCustomComplete;
  const current = questions[index];
  const persist = (
    nextAnswers: Record<string, RawAnswer>,
    nextBackground: Record<string, string>,
    nextCustom: Record<string, CustomAnswer>,
  ) => {
    revision.current += 1;
    const clientRevision = revision.current;
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        answers: nextAnswers,
        backgroundAnswers: nextBackground,
        customAnswers: nextCustom,
        clientRevision,
        privacyNoticeVersion: data?.privacyNotice?.version,
        consentedAt,
      }),
    );
    void api
      .saveSurveyDraft(id, token, {
        answers: nextAnswers,
        backgroundAnswers: nextBackground,
        customAnswers: nextCustom,
        clientRevision,
      })
      .catch(() => undefined);
  };
  const advance = () => {
    if (index < questions.length - 1 && advanceTimer.current === null)
      advanceTimer.current = window.setTimeout(() => {
        setIndex((currentIndex) =>
          Math.min(currentIndex + 1, questions.length - 1),
        );
        advanceTimer.current = null;
      }, 170);
  };
  const answer = (value: RawAnswer) => {
    const next = { ...answers, [current.id]: value };
    setAnswers(next);
    persist(next, backgroundAnswers, customAnswers);
    advance();
  };
  const answerBackground = (value: string) => {
    const next = { ...backgroundAnswers, [current.id]: value };
    setBackgroundAnswers(next);
    persist(answers, next, customAnswers);
    advance();
  };
  const answerCustom = (value: CustomAnswer, autoAdvance = false) => {
    const next = { ...customAnswers, [current.id]: value };
    setCustomAnswers(next);
    persist(answers, backgroundAnswers, next);
    if (autoAdvance) advance();
  };
  const toggleCustomOption = (value: string) => {
    const currentValues = Array.isArray(customAnswers[current.id])
      ? (customAnswers[current.id] as string[])
      : [];
    answerCustom(
      currentValues.includes(value)
        ? currentValues.filter((entry) => entry !== value)
        : [...currentValues, value],
    );
  };
  const submit = async () => {
    if (!complete || submitting) return;
    setSubmitting(true);
    try {
      const submission = await api.submit(
        id,
        token,
        answers,
        backgroundAnswers,
        customAnswers,
        data.privacyNotice.version,
        consentedAt,
      );
      localStorage.removeItem(storageKey);
      const personalReport = submission.report;
      if (personalReport && submission.reportAccessToken) {
        const key = "ai-readiness:my-reports";
        const current = JSON.parse(localStorage.getItem(key) || "[]");
        localStorage.setItem(
          key,
          JSON.stringify([
            {
              id: personalReport.id,
              accessToken: submission.reportAccessToken,
              campaignName: data.campaign.name,
              createdAt: personalReport.createdAt,
              reportType: personalReport.reportType,
            },
            ...current.filter((item: any) => item.id !== personalReport.id),
          ]),
        );
      }
      setConfirming(false);
      setResult(submission);
    } catch (e: any) {
      setConfirming(false);
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };
  if (error)
    return (
      <Shell>
        <div className="survey-error">
          <h1>暂时无法进入问卷</h1>
          <p>{error}</p>
        </div>
      </Shell>
    );
  if (!data)
    return (
      <Shell>
        <div className="loading">正在验证入口并读取问卷…</div>
      </Shell>
    );
  if (!consentedAt)
    return (
      <Shell>
        <main className="consent-page">
          <section className="consent-card">
            <p className="eyebrow">BEFORE YOU START</p>
            <h1>{data.privacyNotice.title}</h1>
            <p className="consent-intro">
              开始前请确认你理解本次测评的用途、可见范围和数据处理方式。
            </p>
            <dl>
              <div>
                <dt>HR可以看到什么</dt>
                <dd>{data.privacyNotice.hrVisibility}</dd>
              </div>
              <div>
                <dt>结果用于什么</dt>
                <dd>{data.privacyNotice.purpose}</dd>
              </div>
              <div>
                <dt>保存与删除</dt>
                <dd>{data.privacyNotice.retention}</dd>
              </div>
              <div>
                <dt>科学性边界</dt>
                <dd>{data.privacyNotice.researchBoundary}</dd>
              </div>
            </dl>
            <label className="consent-check">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(event) => setConsentChecked(event.target.checked)}
              />
              <span>
                我已经阅读并理解以上说明，愿意继续填写。本次确认只用于记录我看到的说明版本，不代表放弃依法享有的数据权利。
              </span>
            </label>
            <button
              className="primary"
              disabled={!consentChecked}
              onClick={() => {
                const accepted = new Date().toISOString();
                setConsentedAt(accepted);
                localStorage.setItem(
                  storageKey,
                  JSON.stringify({
                    answers,
                    backgroundAnswers,
                    customAnswers,
                    clientRevision: revision.current,
                    privacyNoticeVersion: data.privacyNotice.version,
                    consentedAt: accepted,
                  }),
                );
              }}
            >
              同意并开始填写
            </button>
            <small>说明版本：{data.privacyNotice.version}</small>
          </section>
        </main>
      </Shell>
    );
  if (result)
    return (
      <Shell>
        <main className="completion">
          <div className="check">✓</div>
          <p className="eyebrow">SUBMISSION RECEIVED</p>
          <h1>问卷已经提交。</h1>
          <p>答案、分数和报告快照已写入正式产品数据库。</p>
          {result.report ? (
            <>
              <div className="completion-actions">
                <button
                  className="primary"
                  onClick={() => setResult({ ...result, showReport: true })}
                >
                  查看完整个人报告
                </button>
                <Link className="secondary" to="/my-reports">
                  进入我的报告
                </Link>
              </div>
              {result.showReport && <ReportView report={result.report} />}
            </>
          ) : (
            <p className="notice">
              本活动只生成组织报告。HR关闭活动并审核后再发布结果。
            </p>
          )}
        </main>
      </Shell>
    );
  return (
    <Shell>
      <main className="survey-page">
        <header>
          <div>
            <p className="eyebrow">
              {current.kind === "core"
                ? "FORMAL CORE ITEMS"
                : current.kind === "background"
                  ? "NON-SCORING CONTEXT"
                  : "ENTERPRISE SUPPLEMENT"}
            </p>
            <h1>{data.campaign.name}</h1>
            <small>
              {current.kind === "core"
                ? "请根据过去3个月的实际工作体验作答，答案会自动保存。"
                : current.kind === "background"
                  ? "以下是HR选配的不计分背景题，不影响你的诊断分数。"
                  : "这是企业补充题，不参与诊断计分、类型判断或常模比较。"}
            </small>
          </div>
          <div>
            <b>
              {selectedCount}/{questions.length}
            </b>
            <strong>
              {Math.round((selectedCount / questions.length) * 100)}%
            </strong>
            <i>
              <i
                style={{
                  width: `${(selectedCount / questions.length) * 100}%`,
                }}
              />
            </i>
          </div>
        </header>
        <section
          className={`question-card ${current.kind !== "core" ? "background-question" : ""}`}
        >
          <span>
            {String(index + 1).padStart(2, "0")} / {questions.length}
          </span>
          <h2>{current.text}</h2>
          {current.kind === "core" ? (
            <>
              <div className="scale">
                {data.scale.map((entry: any) => (
                  <button
                    className={
                      answers[current.id] === entry.value ? "chosen" : ""
                    }
                    key={entry.value}
                    onClick={() => answer(entry.value)}
                  >
                    <strong>{entry.value}</strong>
                    <small>{entry.label}</small>
                  </button>
                ))}
              </div>
              <button
                className={`unavailable ${answers[current.id] === null ? "chosen" : ""}`}
                onClick={() => answer(null)}
              >
                {current.unavailableLabel}
              </button>
            </>
          ) : current.kind === "background" ? (
            <div className="background-options">
              {current.options.map((entry: any) => (
                <button
                  className={
                    backgroundAnswers[current.id] === entry.value
                      ? "chosen"
                      : ""
                  }
                  key={entry.value}
                  onClick={() => answerBackground(entry.value)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          ) : current.type === "short_text" ? (
            <div className="custom-text-answer">
              <textarea
                value={
                  typeof customAnswers[current.id] === "string"
                    ? (customAnswers[current.id] as string)
                    : ""
                }
                maxLength={500}
                rows={6}
                placeholder="请简要填写；避免写入与问题无关的个人敏感信息。"
                onChange={(event) => answerCustom(event.target.value)}
              />
              <small>最多500字{current.required ? " · 必答" : " · 选答"}</small>
            </div>
          ) : (
            <div className="background-options">
              {current.options.map((entry: any) => {
                const chosen =
                  current.type === "multiple_choice"
                    ? Array.isArray(customAnswers[current.id]) &&
                      (customAnswers[current.id] as string[]).includes(entry.value)
                    : customAnswers[current.id] === entry.value;
                return (
                  <button
                    className={chosen ? "chosen" : ""}
                    key={entry.value}
                    onClick={() =>
                      current.type === "multiple_choice"
                        ? toggleCustomOption(entry.value)
                        : answerCustom(entry.value, true)
                    }
                  >
                    {current.type === "multiple_choice" && (
                      <span>{chosen ? "✓" : "□"}</span>
                    )}
                    {entry.label}
                  </button>
                );
              })}
              <small className="custom-answer-note">
                {current.type === "multiple_choice" ? "可多选" : "单选"} ·{" "}
                {current.required ? "必答" : "选答"} · 不参与诊断计分
              </small>
            </div>
          )}
          <footer>
            <button
              className="secondary"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
            >
              上一题
            </button>
            <div>
              <button
                className="secondary"
                disabled={index === questions.length - 1}
                onClick={() => setIndex(index + 1)}
              >
                下一题
              </button>
              <button
                className="primary"
                disabled={!complete}
                onClick={() => setConfirming(true)}
              >
                检查并提交
              </button>
            </div>
          </footer>
        </section>
      </main>
      {confirming && (
        <div className="modal-backdrop">
          <section className="modal action-success">
            <p className="eyebrow">FINAL CONFIRMATION</p>
            <h2>确认提交这份问卷？</h2>
            <p>
              已完成 {data.items.length} 道核心题
              {data.backgroundItems.length
                ? `和 ${data.backgroundItems.length} 道背景题`
                : ""}
              {data.customItems.length
                ? `；另有 ${data.customItems.length} 道企业补充题（其中选答题可留空）`
                : ""}
              。提交后答案不能修改，系统会立即保存分数和适用的报告快照。
            </p>
            <div className="completion-actions">
              <button
                className="secondary"
                disabled={submitting}
                onClick={() => setConfirming(false)}
              >
                返回检查
              </button>
              <button
                className="primary"
                disabled={submitting}
                onClick={submit}
              >
                {submitting ? "正在提交…" : "确认提交"}
              </button>
            </div>
          </section>
        </div>
      )}
    </Shell>
  );
}

function ActionDialog({
  reportId,
  recommendation,
  onClose,
}: {
  reportId: string;
  recommendation: RecommendationSnapshot;
  onClose: () => void;
}) {
  const today = new Date();
  const due = new Date(Date.now() + 30 * 86_400_000);
  const retest = new Date(Date.now() + 90 * 86_400_000);
  const day = (value: Date) => value.toISOString().slice(0, 10);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    await api.createAction(reportId, {
      recommendationId: recommendation.id,
      title: String(data.get("title")),
      owner: String(data.get("owner")),
      startsAt: String(data.get("startsAt")),
      dueAt: String(data.get("dueAt")),
      successMetric: String(data.get("successMetric")),
      resources: String(data.get("resources")),
      milestones: [
        {
          title: String(data.get("milestoneTitle")),
          dueAt: String(data.get("milestoneDueAt")),
        },
      ],
      retestAt: String(data.get("retestAt")),
    });
    setDone(true);
    setBusy(false);
  };
  return (
    <div className="modal-backdrop">
      {done ? (
        <section className="modal action-success">
          <h2>行动计划已创建</h2>
          <p>
            建议已经转成一条可跟踪的真实任务，负责人和日期来自本次确认，不是系统自动指派。
          </p>
          <button className="primary" onClick={onClose}>
            完成
          </button>
        </section>
      ) : (
        <form className="modal action-dialog" onSubmit={submit}>
          <header>
            <div>
              <p className="eyebrow">CREATE ACTION</p>
              <h2>把建议转成行动计划</h2>
            </div>
            <button type="button" onClick={onClose}>
              ×
            </button>
          </header>
          <div className="form-body">
            <p className="action-source">
              来源：{recommendation.dimensionId} · {recommendation.title}
            </p>
            <label>
              <span>行动名称</span>
              <input
                name="title"
                required
                defaultValue={recommendation.title}
              />
            </label>
            <div className="form-row">
              <label>
                <span>负责人</span>
                <input
                  name="owner"
                  required
                  placeholder="由HR确认真实姓名或角色"
                />
              </label>
              <label>
                <span>开始日期</span>
                <input
                  name="startsAt"
                  type="date"
                  required
                  defaultValue={day(today)}
                />
              </label>
              <label>
                <span>截止日期</span>
                <input
                  name="dueAt"
                  type="date"
                  required
                  defaultValue={day(due)}
                />
              </label>
            </div>
            <label>
              <span>成功指标</span>
              <input
                name="successMetric"
                required
                defaultValue={recommendation.successSignal}
              />
            </label>
            <label>
              <span>已确认的资源与支持</span>
              <textarea
                name="resources"
                rows={3}
                required
                placeholder="例如：每周2小时试点时间、已批准工具、流程负责人参与"
              />
            </label>
            <div className="form-row">
              <label>
                <span>第一个里程碑</span>
                <input
                  name="milestoneTitle"
                  required
                  defaultValue={`完成“${recommendation.title}”的首轮试运行与复盘`}
                />
              </label>
              <label>
                <span>里程碑日期</span>
                <input
                  name="milestoneDueAt"
                  type="date"
                  required
                  defaultValue={day(due)}
                />
              </label>
              <label>
                <span>复测节点</span>
                <input
                  name="retestAt"
                  type="date"
                  required
                  defaultValue={day(retest)}
                />
              </label>
            </div>
            <p className="field-help">
              证据来源、风险与适用条件由系统从本次报告快照冻结；建议90天后使用同版本发起复测。
            </p>
          </div>
          <footer>
            <button type="button" className="secondary" onClick={onClose}>
              取消
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "正在创建…" : "确认创建"}
            </button>
          </footer>
        </form>
      )}
    </div>
  );
}

function GrantDialog({
  reportId,
  onClose,
}: {
  reportId: string;
  onClose: () => void;
}) {
  const [users, setUsers] = useState<EnterpriseUser[]>([]);
  const [done, setDone] = useState(false);
  const [doneMessage, setDoneMessage] = useState(
    "授权会在每次访问时重新校验，并可以单独撤销。",
  );
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .users()
      .then((items) =>
        setUsers(
          items.filter(
            (item) => item.role === "manager" || item.role === "hr_admin",
          ),
        ),
      )
      .catch((reason) => setError(reason.message));
  }, []);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await api.grantReport(reportId, {
        granteeUserId: String(data.get("userId")),
        operations: data.get("download") ? ["view", "download"] : ["view"],
        expiresAt: String(data.get("expiresAt") || "") || null,
        notify: Boolean(data.get("notify")),
        notificationTitle: String(data.get("notificationTitle") || ""),
        notificationBody: String(data.get("notificationBody") || ""),
        notificationButtonLabel: String(
          data.get("notificationButtonLabel") || "",
        ),
      });
      if (result.notification?.status === "sent")
        setDoneMessage("权限已授予，飞书通知也已发送给该管理者。");
      else if (result.notification?.status === "failed")
        setDoneMessage(
          `权限已授予，但飞书通知发送失败：${result.notification.reason}`,
        );
      else if (result.notification?.reason === "FEISHU_NOT_CONFIGURED")
        setDoneMessage("权限已授予；当前未配置飞书，因此没有发送通知。");
      setDone(true);
    } catch (reason: any) {
      setError(reason.message);
    }
  };
  const expires = new Date(Date.now() + 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return (
    <div className="modal-backdrop">
      {done ? (
        <section className="modal action-success">
          <h2>报告权限已授予</h2>
          <p>{doneMessage}</p>
          <button className="primary" onClick={onClose}>
            完成
          </button>
        </section>
      ) : (
        <form className="modal action-dialog" onSubmit={submit}>
          <header>
            <div>
              <p className="eyebrow">REPORT ACCESS</p>
              <h2>授权管理者查看报告</h2>
            </div>
            <button type="button" onClick={onClose}>
              ×
            </button>
          </header>
          <div className="form-body">
            {error && <div className="notice">{error}</div>}
            {users.length ? (
              <>
                <label>
                  <span>授权对象</span>
                  <select name="userId" required>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.displayName} ·{" "}
                        {user.role === "manager" ? "管理者" : "HR管理员"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>权限到期日</span>
                  <input name="expiresAt" type="date" defaultValue={expires} />
                </label>
                <label className="inline-check">
                  <input name="download" type="checkbox" />
                  允许下载PDF
                </label>
                <label className="inline-check">
                  <input name="notify" type="checkbox" defaultChecked />
                  同时通过飞书通知该管理者
                </label>
                <label>
                  <span>通知标题</span>
                  <input
                    name="notificationTitle"
                    defaultValue="组织诊断报告已向你开放"
                  />
                </label>
                <label>
                  <span>通知正文</span>
                  <textarea
                    name="notificationBody"
                    defaultValue="你已获得一份组织诊断报告的查看权限。点击下方按钮即可安全查看。"
                  />
                </label>
                <label>
                  <span>按钮文字</span>
                  <input
                    name="notificationButtonLabel"
                    defaultValue="查看报告"
                  />
                </label>
              </>
            ) : (
              <div className="empty small">
                <h3>还没有可授权的管理者</h3>
                <p>
                  管理者首次用飞书登录后，由企业所有者在企业设置中授予管理者角色。
                </p>
              </div>
            )}
          </div>
          <footer>
            <button type="button" className="secondary" onClick={onClose}>
              取消
            </button>
            {users.length > 0 && <button className="primary">确认授权</button>}
          </footer>
        </form>
      )}
    </div>
  );
}

function ReportPage() {
  const { id = "" } = useParams();
  const [report, setReport] = useState<ReportSnapshot | null>(null);
  const [action, setAction] = useState<RecommendationSnapshot | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [grants, setGrants] = useState<ReportAccessGrantListItem[]>([]);
  const [notice, setNotice] = useState("");
  const [access, setAccess] = useState({
    canView: false,
    canManage: false,
    canDownload: false,
  });
  const load = () =>
    Promise.all([api.report(id), api.reportAccess(id)]).then(
      ([nextReport, nextAccess]) => {
        setReport(nextReport);
        setAccess(nextAccess);
        return nextAccess.canManage
          ? api.reportGrants(id).then(setGrants)
          : setGrants([]);
      },
    );
  useEffect(() => {
    void load();
  }, [id]);
  const publish = async () => {
    await api.publishReport(id, "organization");
    await load();
    setNotice("报告已审核发布，发布记录已写入审计链路。");
  };
  return (
    <Shell>
      <main className="report-page">
        <div className="report-toolbar">
          <Link to="/">← 返回工作台</Link>
          <div>
            {access.canManage && report?.status === "draft" && (
              <button className="secondary" onClick={publish}>
                审核并发布
              </button>
            )}
            {access.canDownload && (
              <button
                className="primary"
                onClick={() => window.open(reportPdfUrl(id), "_blank")}
              >
                下载归档 PDF
              </button>
            )}
          </div>
        </div>
        {notice && <div className="notice">{notice}</div>}
        {report ? (
          <>
            <ReportView report={report} />
            {access.canManage && (
              <section className="action-conversion">
                <p className="eyebrow">ACTION CONVERSION</p>
                <h2>把确定的建议变成可跟踪行动</h2>
                <p>
                  这里才填写真实负责人、日期和成功指标。报告中的角色与周期只作为设计建议。
                </p>
                <div>
                  {report.recommendations.map((item) => (
                    <button
                      className="secondary"
                      key={item.id}
                      onClick={() => setAction(item)}
                    >
                      {item.dimensionId} · {item.title}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {access.canManage && report.status === "published" && (
              <section className="grant-management">
                <div className="grant-management-heading">
                  <div>
                    <p className="eyebrow">REPORT ACCESS</p>
                    <h2>报告授权管理</h2>
                    <p>每次访问都会校验授权状态；撤销后立即失效。</p>
                  </div>
                  <button className="secondary" onClick={() => setGrantOpen(true)}>
                    新增授权
                  </button>
                </div>
                {grants.length ? (
                  <div className="grant-list">
                    {grants.map((grant) => {
                      const expired = Boolean(
                        grant.expiresAt && new Date(grant.expiresAt) <= new Date(),
                      );
                      const state = grant.revokedAt
                        ? "已撤销"
                        : expired
                          ? "已到期"
                          : "生效中";
                      return (
                        <article key={grant.id}>
                          <div>
                            <strong>{grant.granteeDisplayName}</strong>
                            <span>
                              {grant.granteeRole === "manager" ? "管理者" : "HR管理员"}
                            </span>
                          </div>
                          <span>
                            {grant.operations.includes("download")
                              ? "查看及下载"
                              : "仅查看"}
                          </span>
                          <span>
                            {grant.expiresAt
                              ? `${new Date(grant.expiresAt).toLocaleDateString("zh-CN")} 到期`
                              : "长期有效"}
                          </span>
                          <b className={state === "生效中" ? "active" : ""}>{state}</b>
                          {!grant.revokedAt && !expired && (
                            <button
                              className="secondary compact"
                              onClick={async () => {
                                if (!window.confirm(`确认撤销 ${grant.granteeDisplayName} 的报告权限？`)) return;
                                await api.revokeReportGrant(grant.id);
                                await load();
                                setNotice("报告授权已撤销，对方再次访问时将被拒绝。");
                              }}
                            >
                              撤销
                            </button>
                          )}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty small">
                    <h3>尚未授权给其他管理者</h3>
                    <p>报告仍仅对有管理权限的HR开放。</p>
                  </div>
                )}
              </section>
            )}
          </>
        ) : (
          <div className="loading">正在加载报告快照…</div>
        )}
        {action && (
          <ActionDialog
            reportId={id}
            recommendation={action}
            onClose={() => setAction(null)}
          />
        )}
        {grantOpen && (
          <GrantDialog
            reportId={id}
            onClose={() => {
              setGrantOpen(false);
              void load();
            }}
          />
        )}
      </main>
    </Shell>
  );
}

interface StoredReport {
  id: string;
  accessToken: string;
  campaignName: string;
  createdAt: string;
  reportType: string;
}

const deletionStatusLabels: Record<DataDeletionRequest["status"], string> = {
  queued: "已提交，等待处理",
  processing: "正在删除相关数据",
  completed: "删除已完成",
  failed: "处理失败，请联系管理员",
};

const personalReportTypeLabel = (reportType: string) =>
  reportType === "personal_observer"
    ? "个人与组织环境观察 · 42题"
    : reportType === "personal_scoped"
      ? "个人专项 · 26题"
      : reportType === "second_stage_personal"
        ? "二阶段个人报告"
        : "个人及组织报告";

function DataDeletionDialog({
  reportId,
  accessToken,
  onClose,
  onChanged,
}: {
  reportId?: string;
  accessToken?: string;
  onClose: () => void;
  onChanged?: (request: DataDeletionRequest) => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [request, setRequest] = useState<DataDeletionRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (confirmation !== "删除我的数据") return;
    setBusy(true);
    setError("");
    try {
      const created =
        reportId && accessToken
          ? await api.requestAnonymousDataDeletion(reportId, accessToken, reason)
          : await api.requestMyDataDeletion(reason);
      setRequest(created);
      onChanged?.(created);
    } catch (cause: any) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop">
      <section className="modal deletion-dialog">
        <header>
          <div>
            <p className="eyebrow">DATA RIGHTS</p>
            <h2>删除我的测评数据</h2>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="form-body">
          {request ? (
            <div className="deletion-result">
              <h3>{deletionStatusLabels[request.status]}</h3>
              <p>请求编号：{request.id}</p>
              <p>
                系统会删除与你当前身份或当前匿名报告凭证关联的答卷、分数、个人报告和PDF；依法必须保留的审计记录只保存处理结果，不保存答卷内容。
              </p>
              {request.result?.manifest && (
                <ul className="deletion-manifest">
                  {request.result.manifest.map((entry) => (
                    <li key={entry.system}>
                      <strong>
                        {entry.system === "object_storage"
                          ? "PDF对象存储"
                          : entry.system === "database"
                            ? "业务数据库"
                            : "处理审计"}
                        ：{entry.status === "deleted" ? "已删除" : "依法保留"}
                      </strong>
                      <span>{entry.note}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <>
              <div className="notice warning">
                删除完成后无法恢复，你也将无法再次打开相关个人报告。组织汇总中的去标识统计不会据此反推出你的个人答案。
              </div>
              {error && <div className="notice">{error}</div>}
              <label>
                <span>删除原因（选填）</span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="例如：不再希望平台保存本次测评数据"
                />
              </label>
              <label>
                <span>请输入“删除我的数据”确认</span>
                <input
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="off"
                />
              </label>
            </>
          )}
        </div>
        <footer>
          <button type="button" className="secondary" onClick={onClose}>
            {request ? "完成" : "取消"}
          </button>
          {!request && (
            <button
              type="button"
              className="danger"
              disabled={busy || confirmation !== "删除我的数据"}
              onClick={submit}
            >
              {busy ? "正在提交…" : "确认永久删除"}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

function MyReports() {
  const localReports = JSON.parse(
    localStorage.getItem("ai-readiness:my-reports") || "[]",
  ) as StoredReport[];
  const [remoteReports, setRemoteReports] = useState<PersonalReportListItem[]>(
    [],
  );
  const [loaded, setLoaded] = useState(false);
  const [identityBacked, setIdentityBacked] = useState(false);
  const [error, setError] = useState("");
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [deletion, setDeletion] = useState<DataDeletionRequest | null>(null);
  useEffect(() => {
    api.session()
      .then(async (session) => {
        if (session.authentication !== "email_otp") return;
        setIdentityBacked(true);
        setRemoteReports(await api.myReports());
        api.latestDataDeletion().then(setDeletion).catch(() => undefined);
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoaded(true));
  }, []);
  const reports = identityBacked
    ? remoteReports.map((item) => ({
        id: item.report.id,
        campaignName: item.campaignName,
        createdAt: item.report.createdAt,
        reportType: item.report.reportType,
        organizationName: item.organizationName,
        accessToken: "",
      }))
    : localReports;
  return (
    <Shell>
      <main className="my-reports">
        <p className="eyebrow">MY REPORTS</p>
        <h1>我的报告</h1>
        <p>
          {identityBacked
            ? "通过你的邮箱安全找回，不依赖当前浏览器或设备。"
            : "开发环境使用当前浏览器保存的测试凭证。"}
        </p>
        {error && <div className="notice">{error}</div>}
        {!loaded ? (
          <div className="loading">正在读取你的报告…</div>
        ) : reports.length ? (
          <div>
            {reports.map((report) => (
              <Link
                key={report.id}
                to={
                  report.accessToken
                    ? `/my-reports/${report.id}?access=${encodeURIComponent(report.accessToken)}`
                    : `/my-reports/${report.id}`
                }
              >
                <span>
                  {report.campaignName}
                  <small>
                    {personalReportTypeLabel(report.reportType)}
                    {"organizationName" in report && report.organizationName
                      ? ` · ${report.organizationName}`
                      : ""}
                  </small>
                </span>
                <b>{new Date(report.createdAt).toLocaleString("zh-CN")}</b>
                <strong>查看报告 →</strong>
              </Link>
            ))}
          </div>
        ) : (
          <section className="empty">
            <h3>还没有可找回的个人报告</h3>
            <p>完成个人或个人及组织测评后，报告会出现在这里。</p>
          </section>
        )}
        {identityBacked && (
          <section className="privacy-panel">
            <div>
              <p className="eyebrow">DATA RIGHTS</p>
              <h2>我的数据</h2>
              <p>
                你可以申请删除与当前邮箱身份关联的答卷、个人分数和个人报告。
              </p>
              {deletion && (
                <>
                  <p className={`deletion-status ${deletion.status}`}>
                    最近一次删除请求：{deletionStatusLabels[deletion.status]} · {new Date(deletion.updatedAt).toLocaleString("zh-CN")}
                  </p>
                  {deletion.result?.manifest && (
                    <p className="deletion-status-detail">
                      已删除 {deletion.result.responseCount} 份答卷、
                      {deletion.result.reportCount} 份个人报告和
                      {deletion.result.artifactCount} 个PDF对象；仅保留不含答案的处理审计。
                    </p>
                  )}
                </>
              )}
            </div>
            <button className="secondary" onClick={() => setDeletionOpen(true)}>
              删除我的测评数据
            </button>
          </section>
        )}
        {deletionOpen && (
          <DataDeletionDialog
            onClose={() => setDeletionOpen(false)}
            onChanged={setDeletion}
          />
        )}
      </main>
    </Shell>
  );
}
function EmployeeReportPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const access = params.get("access") || "";
  const [report, setReport] = useState<ReportSnapshot | null>(null);
  const [error, setError] = useState("");
  const [deletionOpen, setDeletionOpen] = useState(false);
  useEffect(() => {
    const load = access ? api.publicReport(id, access) : api.myReport(id);
    load.then(setReport).catch((reason) => setError(reason.message));
  }, [id, access]);
  return (
    <Shell>
      <main className="report-page">
        <div className="report-toolbar">
          <Link to="/my-reports">← 返回我的报告</Link>
          <div>
            {import.meta.env.PROD && (
              <button className="secondary" onClick={() => setDeletionOpen(true)}>
                删除本次测评数据
              </button>
            )}
            <button
              className="primary"
              onClick={() =>
                window.open(
                  access ? publicReportPdfUrl(id, access) : myReportPdfUrl(id),
                  "_blank",
                )
              }
            >
              下载报告
            </button>
          </div>
        </div>
        {error ? (
          <div className="survey-error">
            <h1>报告访问凭证无效或已过期</h1>
            <p>{error}</p>
          </div>
        ) : report ? (
          <ReportView report={report} />
        ) : (
          <div className="loading">正在验证并读取报告…</div>
        )}
        {deletionOpen && (
          <DataDeletionDialog
            reportId={access ? id : undefined}
            accessToken={access || undefined}
            onClose={() => setDeletionOpen(false)}
          />
        )}
      </main>
    </Shell>
  );
}

function AuthorizedIndividualReportPage() {
  const { id = "", subjectId = "" } = useParams();
  const [report, setReport] = useState<ReportSnapshot | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .individualReport(id, subjectId)
      .then(setReport)
      .catch((cause) => setError(cause.message));
  }, [id, subjectId]);
  return (
    <Shell>
      <main className="report-page">
        <div className="report-toolbar">
          <Link to={`/campaigns/${id}`}>← 返回活动工作台</Link>
          <div>
            <span className="high-risk-label">高风险读取·已记录审计</span>
            <button
              className="primary"
              onClick={() =>
                window.open(individualReportPdfUrl(id, subjectId), "_blank")
              }
            >
              下载授权 PDF
            </button>
          </div>
        </div>
        <div className="notice warning">
          本页仅因你获得了本次实名活动的专用个人报告权限而开放。权限不包含员工逐题答案，不得将结果单独用于绩效、晋升、薪酬或淘汰决策。
        </div>
        {error ? (
          <div className="survey-error">
            <h1>你无权查看这份个人报告</h1>
            <p>权限可能已到期或被撤销。</p>
          </div>
        ) : report ? (
          <ReportView report={report} />
        ) : (
          <div className="loading">正在校验专用权限并记录审计…</div>
        )}
      </main>
    </Shell>
  );
}

function RenderReportPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const [report, setReport] = useState<ReportSnapshot | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .renderReport(id, params.get("token") || "")
      .then(setReport)
      .catch((reason) => setError(reason.message));
  }, [id, params]);
  if (error)
    return (
      <main className="survey-error">
        <h1>报告渲染凭证无效</h1>
        <p>{error}</p>
      </main>
    );
  return report ? (
    <main className="render-report-page">
      <ReportView report={report} />
    </main>
  ) : (
    <div className="loading">正在准备报告…</div>
  );
}

function AccountPage() {
  const [session, setSession] = useState<any>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.session().then(setSession).catch(() => undefined);
  }, []);
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const saved = await api.updateAccountProfile(String(data.get("displayName")));
      setSession((value: any) => ({
        ...value,
        account: { ...value.account, displayName: saved.displayName },
        user: { ...value.user, name: saved.displayName },
      }));
      setNotice("账户名称已更新。");
    } catch (reason: any) {
      setNotice(reason.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell>
      <main className="account-page">
        <Link to={session?.activeWorkspace.kind === "platform" ? "/platform" : session?.activeWorkspace.kind === "organization" ? "/workspace" : "/app/personal"}>← 返回</Link>
        <header><p className="eyebrow">ACCOUNT</p><h1>账户信息</h1><p>这里显示与你的邮箱登录身份关联的信息，不会编造姓名或头像。</p></header>
        {notice && <div className="notice">{notice}</div>}
        {session && (
          <section>
            <form onSubmit={save}>
              <label><span>显示名称</span><input name="displayName" required maxLength={80} defaultValue={session.account.displayName ?? ""} placeholder="填写你的真实姓名或称呼" /></label>
              <label><span>登录邮箱</span><input value={session.account.email ?? "未提供"} disabled /></label>
              <label><span>当前空间</span><input value={session.activeWorkspace.kind === "platform" ? "平台管理" : session.activeWorkspace.kind === "organization" ? session.tenant.name : "个人中心"} disabled /></label>
              <label><span>当前角色</span><input value={session.activeWorkspace.kind === "platform" ? "平台管理员" : session.activeWorkspace.kind === "personal" ? "个人账户" : session.user.role === "owner" ? "企业所有者" : session.user.role === "hr_admin" ? "HR管理员" : session.user.role === "manager" ? "管理者" : "企业成员"} disabled /></label>
              <button className="primary" disabled={busy}>{busy ? "正在保存…" : "保存账户信息"}</button>
            </form>
            <aside><h2>数据与隐私</h2><p>你可以在“我的报告”中查看报告、管理研究授权，并申请删除与当前邮箱关联的个人测评数据。</p><Link className="secondary" to="/my-reports">进入我的报告</Link></aside>
          </section>
        )}
      </main>
    </Shell>
  );
}

function Settings() {
  const [users, setUsers] = useState<EnterpriseUser[]>([]);
  const [feishu, setFeishu] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [norm, setNorm] = useState<any>(null);
  const [contextCohorts, setContextCohorts] = useState<
    PersonContextCohortSnapshot[]
  >([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<any>(null);
  const load = () =>
    Promise.all([
      api.users(),
      api.feishuStatus(),
      api.researchProfile().catch(() => null),
      api.normAuthorization().catch(() => null),
      api.personContextPreview().catch(() => []),
      api.session(),
    ]).then(([userList, status, researchProfile, authorization, cohorts, currentSession]) => {
      setUsers(userList);
      setFeishu(status);
      setProfile(researchProfile);
      setNorm(authorization);
      setContextCohorts(cohorts);
      setSession(currentSession);
    });
  useEffect(() => {
    void load();
  }, []);
  const updateRole = async (
    user: EnterpriseUser,
    role: EnterpriseUser["role"],
  ) => {
    try {
      await api.updateUserRole(user.id, role);
      setNotice(`${user.displayName} 的角色已更新。`);
      await load();
    } catch (reason: any) {
      setNotice(reason.message);
    }
  };
  const sync = async () => {
    setBusy(true);
    try {
      const result = await api.syncFeishu();
      setNotice(`飞书通讯录同步完成，共写入 ${result.subjectCount} 名成员。`);
      await load();
    } catch (reason: any) {
      setNotice(reason.message);
    } finally {
      setBusy(false);
    }
  };
  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const saved = await api.saveResearchProfile({
        country: "CN",
        headquartersProvince: String(data.get("province")),
        industryRaw: String(data.get("industryRaw")),
        industryStandardCode: String(data.get("industryCode")),
        industryMappingVersion: "GB/T 4754—2017",
        headcount: Number(data.get("headcount")),
        aiStage: String(data.get("aiStage")) as any,
        aiStartDuration: String(data.get("aiStartDuration")) as any,
        questionnaireLanguage: "zh-CN",
        primaryWorkLanguage: String(data.get("workLanguage")),
      });
      setProfile(saved);
      setNotice("企业研究档案已保存；后续活动发布时会冻结版本化快照。");
    } catch (reason: any) {
      setNotice(reason.message);
    }
  };
  const saveTenant = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const saved = await api.updateTenantProfile(String(data.get("tenantName")));
      setSession((value: any) => ({ ...value, tenant: { ...value.tenant, name: saved.name } }));
      setNotice("企业名称已更新。");
    } catch (reason: any) {
      setNotice(reason.message);
    }
  };
  const toggleNorm = async () => {
    try {
      const saved = await api.setNormAuthorization(
        norm?.status === "authorized" ? "revoked" : "authorized",
      );
      setNorm(saved);
      setNotice(
        saved.status === "authorized"
          ? "已授权非敏感、去标识数据进入常模候选池。"
          : "常模候选数据授权已撤回，后续活动不再进入候选池。",
      );
    } catch (reason: any) {
      setNotice(reason.message);
    }
  };
  const importPersonContext = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const lines = (await file.text())
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .filter((line) => line.trim());
      const parseLine = (line: string) => {
        const values: string[] = [];
        let value = "";
        let quoted = false;
        for (let index = 0; index < line.length; index += 1) {
          const character = line[index]!;
          if (character === '"' && line[index + 1] === '"' && quoted) {
            value += '"';
            index += 1;
          } else if (character === '"') quoted = !quoted;
          else if (character === "," && !quoted) {
            values.push(value.trim());
            value = "";
          } else value += character;
        }
        values.push(value.trim());
        return values;
      };
      const headers = parseLine(lines.shift() ?? "");
      const requiredHeaders = [
        "external_subject_id",
        "job_family",
        "career_stage",
        "people_manager",
        "tenure_band",
        "province",
        "employment_type",
        "in_target_population",
      ];
      const missingHeaders = requiredHeaders.filter(
        (header) => !headers.includes(header),
      );
      if (missingHeaders.length) {
        throw new Error(`CSV缺少列：${missingHeaders.join("、")}`);
      }
      const rows: Record<string, string>[] = lines.map((line) =>
        Object.fromEntries(
          parseLine(line).map((value, index) => [headers[index] ?? "", value]),
        ),
      );
      const mappings = rows.map((row, index): PersonContextMappingInput => ({
        externalSubjectId:
          row.external_subject_id?.trim() || `missing-row-${index + 2}`,
        source: (row.source?.trim() ||
          "admin_upload") as PersonContextMappingInput["source"],
        jobFamily:
          row.job_family?.trim() as PersonContextMappingInput["jobFamily"],
        careerStage:
          row.career_stage?.trim() as PersonContextMappingInput["careerStage"],
        peopleManager:
          row.people_manager === ""
            ? null
            : ["1", "true", "是"].includes(
                String(row.people_manager).toLowerCase(),
              ),
        tenureBand:
          row.tenure_band?.trim() as PersonContextMappingInput["tenureBand"],
        province: row.province?.trim() || "unknown",
        employmentType: row.employment_type?.trim() || "unknown",
        inTargetPopulation: !["0", "false", "否"].includes(
          String(row.in_target_population).toLowerCase(),
        ),
      }));
      const result = await api.savePersonContextMappings(mappings);
      setNotice(
        `人员研究分类已导入 ${result.saved} 条；系统只会把满足 k≥10 的联合分组写入研究快照。`,
      );
      await load();
    } catch (reason: any) {
      setNotice(`导入失败：${reason.message}`);
    } finally {
      event.target.value = "";
    }
  };
  return (
    <Shell>
      <main className="settings-page">
        <Link to="/workspace" className="back">
          ← 返回企业首页
        </Link>
        <header>
          <p className="eyebrow">ENTERPRISE SETTINGS</p>
          <h1>企业设置</h1>
          <p>管理企业资料、邮箱成员、权限和数据使用方式。飞书与研究技术设置在第一阶段默认收起。</p>
        </header>
        {notice && <div className="notice">{notice}</div>}
        <section className="tenant-profile-settings">
          <div>
            <p className="eyebrow">ORGANIZATION PROFILE</p>
            <h2>企业资料</h2>
            <p>企业名称会显示在工作台和组织报告中；行业、地区和规模只用于组织诊断与研究样本说明。</p>
          </div>
          <form onSubmit={saveTenant}><label><span>企业名称</span><input name="tenantName" required maxLength={120} defaultValue={session?.tenant?.name ?? ""} /></label><button className="primary">保存企业名称</button></form>
        </section>
        <section className="research-settings">
          <div>
            <p className="eyebrow">ORGANIZATION CONTEXT</p>
            <h2>企业背景</h2>
            <p>地区、行业和规模用于说明调研背景，不参与任何员工的个人计分。</p>
          </div>
          <form
            key={profile?.updatedAt ?? "empty-profile"}
            onSubmit={saveProfile}
          >
            <label>
              <span>总部省级地区</span>
              <input
                name="province"
                required
                defaultValue={profile?.headquartersProvince ?? "上海市"}
              />
            </label>
            <label>
              <span>企业原始行业</span>
              <input
                name="industryRaw"
                required
                defaultValue={profile?.industryRaw ?? ""}
                placeholder="按企业内部口径填写"
              />
            </label>
            <label>
              <span>从业人数</span>
              <input
                name="headcount"
                type="number"
                min="1"
                required
                defaultValue={profile?.headcount ?? ""}
              />
            </label>
            <details className="inline-advanced-fields">
              <summary>高级研究字段（选填）</summary>
              <div>
                <label><span>GB/T 4754 行业代码</span><input name="industryCode" required defaultValue={profile?.industryStandardCode ?? "other"} placeholder="如 I65；不确定可填 other" /></label>
                <label><span>AI推进阶段</span><select name="aiStage" defaultValue={profile?.aiStage ?? "local_exploration"}><option value="not_started">尚未统一推进</option><option value="local_exploration">局部探索</option><option value="multi_team">多团队推广</option><option value="company_wide">全公司推广</option><option value="core_workflows">已嵌入核心流程</option></select></label>
                <label><span>正式推进时间</span><select name="aiStartDuration" defaultValue={profile?.aiStartDuration ?? "under_6m"}><option value="not_started">尚未开始</option><option value="under_6m">半年以内</option><option value="6m_to_1y">半年至1年</option><option value="1_to_2y">1—2年</option><option value="over_2y">2年以上</option></select></label>
                <label><span>主要工作语言</span><input name="workLanguage" required defaultValue={profile?.primaryWorkLanguage ?? "zh-CN"} /></label>
              </div>
            </details>
            <button className="primary">保存研究档案</button>
          </form>
          <aside>
            <b>研究授权（选填）</b>
            <p>
              不授权也可以正常测评和生成报告。授权仅适用于符合条件的非敏感、去标识数据。当前状态：
              {norm?.status === "authorized" ? "已授权" : "未授权"}
            </p>
            <button type="button" className="secondary" onClick={toggleNorm}>
              {norm?.status === "authorized" ? "撤回授权" : "确认授权"}
            </button>
          </aside>
        </section>
        <section className="user-admin">
          <div>
            <p className="eyebrow">ROLE MANAGEMENT</p>
            <h2>用户与角色</h2>
            <p>成员通过邮箱邀请加入活动后进入列表；只有企业所有者可以调整管理角色。</p>
          </div>
          <div className="user-table">
            {users.map((user) => (
              <article key={user.id}>
                <div>
                  <b>{user.displayName}</b>
                  <small>{user.emailMasked ?? "邮箱身份待建立"}</small>
                </div>
                <select
                  value={user.role}
                  onChange={(event) =>
                    updateRole(
                      user,
                      event.target.value as EnterpriseUser["role"],
                    )
                  }
                >
                  <option value="owner">企业所有者</option>
                  <option value="hr_admin">HR管理员</option>
                  <option value="manager">管理者</option>
                  <option value="employee">员工</option>
                </select>
              </article>
            ))}
          </div>
        </section>
        <details className="advanced-settings">
          <summary><div><p className="eyebrow">ADVANCED RESEARCH SETTINGS</p><h2>高级研究与未来集成</h2><p>仅在正式验证研究或未来接入飞书时使用，第一阶段日常操作不需要配置。</p></div><span>展开设置</span></summary>
          <section>
            <div><h3>未来飞书接入</h3><p>{feishu?.configured ? "凭证已配置，仍需真实联调。" : "第一阶段使用邮箱登录，飞书接入尚未启用。"}</p></div>
            <button className="secondary" disabled={!feishu?.configured || busy} onClick={sync}>{busy ? "正在同步…" : "同步通讯录"}</button>
          </section>
          <section className="person-context-settings">
            <div><h3>员工背景分类（研究用途）</h3><p>只在有员工名单的正式组织研究中，用于样本描述、非应答分析和测量等值检验；不参与任何人的得分。</p><small>导入前需按研究规范准备岗位族、职业阶段、司龄带和地区等标准字段。</small></div>
            <label className="secondary file-button">导入人员分类CSV<input type="file" accept=".csv,text/csv" onChange={importPersonContext} /></label>
            <div className="context-preview"><b>匿名保护预览</b><span>可进入研究快照：{contextCohorts.filter((cohort) => cohort.protectionStatus === "included").reduce((sum, cohort) => sum + cohort.memberCount, 0)}人</span><span>已抑制：{contextCohorts.filter((cohort) => cohort.protectionStatus === "suppressed").reduce((sum, cohort) => sum + cohort.memberCount, 0)}人</span></div>
          </section>
        </details>
      </main>
    </Shell>
  );
}

function ActionProgressDialog({
  item,
  onClose,
  onSaved,
}: {
  item: ActionPlanListItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    await api.updateActionProgress(
      item.id,
      Number(data.get("progressPercent")),
      String(data.get("latestUpdate")),
    );
    onSaved();
  };
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">ACTION CHECK-IN</p>
            <h2>更新行动进展</h2>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="form-body">
          <p>{item.title}</p>
          <label>
            <span>当前完成度（0—100）</span>
            <input
              name="progressPercent"
              type="number"
              min="0"
              max="100"
              step="5"
              required
              defaultValue={item.progressPercent}
            />
          </label>
          <label>
            <span>本次进展与下一步</span>
            <textarea
              name="latestUpdate"
              rows={5}
              required
              maxLength={2000}
              defaultValue={item.latestUpdate ?? ""}
              placeholder="写明已经完成什么、遇到什么问题，以及下一步准备做什么。"
            />
          </label>
        </div>
        <footer>
          <button type="button" className="secondary" onClick={onClose}>取消</button>
          <button className="primary" disabled={busy}>{busy ? "正在保存…" : "保存进展"}</button>
        </footer>
      </form>
    </div>
  );
}

function ActionHistoryDialog({
  item,
  onClose,
}: {
  item: ActionPlanListItem;
  onClose: () => void;
}) {
  const [checkIns, setCheckIns] = useState<ActionCheckIn[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api.actionCheckIns(item.id).then(setCheckIns).catch((reason) => setError(reason.message));
  }, [item.id]);
  return (
    <div className="modal-backdrop">
      <section className="modal action-history-dialog">
        <header>
          <div>
            <p className="eyebrow">REVIEW HISTORY</p>
            <h2>复盘记录</h2>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="form-body">
          <p>{item.title}</p>
          {error ? (
            <div className="notice">{error}</div>
          ) : checkIns.length ? (
            <ol className="action-history-list">
              {checkIns.map((checkIn) => (
                <li key={checkIn.id}>
                  <strong>{checkIn.progressPercent}%</strong>
                  <time>{new Date(checkIn.createdAt).toLocaleString("zh-CN")}</time>
                  <p>{checkIn.note}</p>
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty compact">还没有复盘记录。</div>
          )}
        </div>
        <footer>
          <button className="primary" onClick={onClose}>关闭</button>
        </footer>
      </section>
    </div>
  );
}

function Actions() {
  const [items, setItems] = useState<ActionPlanListItem[]>([]);
  const [notice, setNotice] = useState("");
  const [progressItem, setProgressItem] = useState<ActionPlanListItem | null>(null);
  const [historyItem, setHistoryItem] = useState<ActionPlanListItem | null>(null);
  const load = () => api.actions().then(setItems);
  useEffect(() => {
    void load();
  }, []);
  const today = new Date().toISOString().slice(0, 10);
  const daysUntil = (date: string) =>
    Math.ceil(
      (new Date(`${date}T00:00:00.000Z`).getTime() -
        new Date(`${today}T00:00:00.000Z`).getTime()) /
        86_400_000,
    );
  const attentionFor = (item: ActionPlanListItem) => {
    if (["completed", "cancelled"].includes(item.status)) {
      const retestDays = daysUntil(item.retestAt);
      if (item.status === "completed" && retestDays >= 0 && retestDays <= 14)
        return `距离复测节点还有${retestDays}天`;
      if (item.status === "completed" && retestDays < 0)
        return `复测节点已超过${Math.abs(retestDays)}天`;
      return null;
    }
    const dueDays = daysUntil(item.dueAt);
    if (dueDays < 0) return `已逾期${Math.abs(dueDays)}天`;
    if (dueDays <= 7) return `距离截止日还有${dueDays}天`;
    const staleDays = Math.floor(
      (Date.now() - new Date(item.updatedAt).getTime()) / 86_400_000,
    );
    if (item.status === "active" && staleDays >= 14)
      return `已${staleDays}天未更新复盘`;
    return null;
  };
  const transition = async (
    item: ActionPlanListItem,
    status: ActionPlanListItem["status"],
  ) => {
    try {
      await api.transitionAction(item.id, status);
      setNotice(
        `“${item.title}”已更新为${status === "active" ? "进行中" : status === "completed" ? "已完成" : "已取消"}。`,
      );
      await load();
    } catch (reason: any) {
      setNotice(reason.message);
    }
  };
  const transitionMilestone = async (
    item: ActionPlanListItem,
    milestoneId: string,
    status: "pending" | "completed",
  ) => {
    try {
      await api.transitionActionMilestone(item.id, milestoneId, status);
      setNotice(`里程碑已更新为${status === "completed" ? "已完成" : "待完成"}。`);
      await load();
    } catch (reason: any) {
      setNotice(reason.message);
    }
  };
  return (
    <Shell>
      <main className="actions-page">
        <Link to="/" className="back">
          ← 返回企业首页
        </Link>
        <header>
          <p className="eyebrow">90-DAY ACTIONS</p>
          <h1>下一步行动</h1>
          <p>
            把组织报告中准备真正执行的建议放到这里，持续记录负责人、时间、进展和复测结果。
          </p>
        </header>
        {notice && <div className="notice">{notice}</div>}
        <div className="action-summary">
          <article>
            <span>全部</span>
            <strong>{items.length}</strong>
          </article>
          <article>
            <span>进行中</span>
            <strong>
              {items.filter((item) => item.status === "active").length}
            </strong>
          </article>
          <article>
            <span>已完成</span>
            <strong>
              {items.filter((item) => item.status === "completed").length}
            </strong>
          </article>
          <article>
            <span>待关注</span>
            <strong>
              {items.filter((item) => attentionFor(item)).length}
            </strong>
          </article>
        </div>
        {items.length ? (
          <section className="action-list">
            {items.map((item) => (
              <article key={item.id}>
                <div>
                  <em className={`status ${item.status}`}>
                    {item.status === "planned"
                      ? "待启动"
                      : item.status === "active"
                        ? "进行中"
                        : item.status === "completed"
                          ? "已完成"
                          : "已取消"}
                  </em>
                  <h2>{item.title}</h2>
                  <p>{item.campaignName}</p>
                  {attentionFor(item) && (
                    <b className="action-attention">{attentionFor(item)}</b>
                  )}
                </div>
                <dl>
                  <div>
                    <dt>负责人</dt>
                    <dd>{item.owner}</dd>
                  </div>
                  <div>
                    <dt>周期</dt>
                    <dd>
                      {item.startsAt} — {item.dueAt}
                    </dd>
                  </div>
                  <div>
                    <dt>成功指标</dt>
                    <dd>{item.successMetric}</dd>
                  </div>
                  <div>
                    <dt>当前进展</dt>
                    <dd>{item.progressPercent}%</dd>
                  </div>
                </dl>
                <div className="action-progress-track">
                  <i style={{ width: `${item.progressPercent}%` }} />
                </div>
                {item.latestUpdate && (
                  <p className="action-latest-update">
                    最近更新：{item.latestUpdate}
                    <small>{new Date(item.updatedAt).toLocaleString("zh-CN")}</small>
                  </p>
                )}
                <div className="action-commitment-summary">
                  <span>目标维度：{item.dimensionId}</span>
                  <span>复测节点：{item.retestAt}</span>
                  <span>里程碑：{item.milestones.length}</span>
                </div>
                <details className="action-governance">
                  <summary>查看资源、里程碑、证据与风险边界</summary>
                  <h3>已确认资源</h3>
                  <p>{item.resources}</p>
                  <h3>里程碑</h3>
                  <ul>
                    {item.milestones.map((milestone) => (
                      <li key={milestone.id}>
                        <span>
                          {milestone.dueAt} · {milestone.title} ·{" "}
                          {milestone.status === "completed" ? "已完成" : "待完成"}
                        </span>
                        {["planned", "active"].includes(item.status) && (
                          <button
                            type="button"
                            className="text-button"
                            onClick={() =>
                              transitionMilestone(
                                item,
                                milestone.id,
                                milestone.status === "completed"
                                  ? "pending"
                                  : "completed",
                              )
                            }
                          >
                            {milestone.status === "completed"
                              ? "重新打开"
                              : "标记完成"}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  <h3>证据来源</h3>
                  <ul>
                    {item.evidenceReferences.map((reference) => (
                      <li key={reference.id}>
                        <a href={reference.url} target="_blank" rel="noreferrer">
                          {reference.title}
                        </a>
                        <small>{reference.boundary}</small>
                      </li>
                    ))}
                  </ul>
                  <h3>风险与适用条件</h3>
                  <ul>
                    {item.riskConditions.map((condition) => (
                      <li key={condition}>{condition}</li>
                    ))}
                  </ul>
                </details>
                <div className="action-buttons">
                  {item.status === "planned" && (
                    <button
                      className="primary"
                      onClick={() => transition(item, "active")}
                    >
                      开始执行
                    </button>
                  )}
                  {item.status === "active" && (
                    <button
                      className="primary"
                      onClick={() => transition(item, "completed")}
                    >
                      标记完成
                    </button>
                  )}
                  {["planned", "active"].includes(item.status) && (
                    <button
                      className="secondary"
                      onClick={() => setProgressItem(item)}
                    >
                      更新进展
                    </button>
                  )}
                  {["planned", "active"].includes(item.status) && (
                    <button
                      className="secondary"
                      onClick={() => transition(item, "cancelled")}
                    >
                      取消
                    </button>
                  )}
                  <button
                    className="secondary"
                    onClick={() => setHistoryItem(item)}
                  >
                    查看复盘记录
                  </button>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="empty">
            <h3>还没有需要跟进的组织行动</h3>
            <p>
              组织报告发布后，选择一条准备执行的建议并确认负责人和时间，它才会出现在这里。
            </p>
          </section>
        )}
        {progressItem && (
          <ActionProgressDialog
            item={progressItem}
            onClose={() => setProgressItem(null)}
            onSaved={() => {
              setProgressItem(null);
              setNotice("行动进展已保存。若完成度大于0，待启动行动会自动转为进行中。");
              void load();
            }}
          />
        )}
        {historyItem && (
          <ActionHistoryDialog
            item={historyItem}
            onClose={() => setHistoryItem(null)}
          />
        )}
      </main>
    </Shell>
  );
}

function ReportCenter() {
  const [reports, setReports] = useState<ReportSnapshot[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    api
      .reports()
      .then(setReports)
      .finally(() => setLoaded(true));
  }, []);
  const organizationReports = reports.filter(
    (report) =>
      ![
        "immediate_personal",
        "second_stage_personal",
        "personal_scoped",
        "personal_observer",
      ].includes(report.reportType),
  );
  return (
    <Shell>
      <main className="report-center">
        <Link to="/workspace" className="back">
          ← 返回企业首页
        </Link>
        <header>
          <p className="eyebrow">REPORT CENTER</p>
          <h1>报告中心</h1>
          <p>
            集中查看组织报告的生成、审核和发布状态；个人报告默认不会出现在HR工作台。
          </p>
        </header>
        {!loaded ? (
          <div className="loading">正在读取报告…</div>
        ) : organizationReports.length ? (
          <section>
            {organizationReports.map((report) => (
              <Link to={`/reports/${report.id}`} key={report.id}>
                <div>
                  <em className={`status ${report.status}`}>
                    {report.status === "published" ? "已发布" : "待审核"}
                  </em>
                  <h2>
                    {report.reportType === "manager_self_assessment"
                      ? "管理者单人组织自评"
                      : report.reportType === "organization_scoped"
                        ? "组织专项报告"
                        : "组织整体报告"}
                  </h2>
                  <p>
                    {report.subjectLabel} · n={report.sampleSize}
                  </p>
                </div>
                <div>
                  <span>生成时间</span>
                  <b>{new Date(report.createdAt).toLocaleString("zh-CN")}</b>
                </div>
                <strong>查看完整报告 →</strong>
              </Link>
            ))}
          </section>
        ) : (
          <section className="empty">
            <h3>还没有组织报告</h3>
            <p>关闭满足样本规则的组织活动后，报告会出现在这里。</p>
          </section>
        )}
      </main>
    </Shell>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<EmailLogin />} />
      <Route path="/platform/login" element={<EmailLogin fixedIntent="platform" />} />
      <Route path="/personal" element={<Navigate to="/login?intent=personal&returnTo=/app/personal" replace />} />
      <Route path="/enterprise" element={<EnterpriseLanding />} />
      <Route path="/enterprise/no-access" element={<EnterpriseNoAccess />} />
      <Route path="/enterprise/organizations" element={<EnterpriseOrganizations />} />
      <Route path="/enterprise/apply" element={<Navigate to="/enterprise/no-access" replace />} />
      <Route path="/enterprise/choose" element={<Navigate to="/enterprise/organizations" replace />} />
      <Route path="/app/personal" element={<PersonalHome />} />
      <Route path="/app/org/:organizationId" element={<OrganizationEntry />} />
      <Route path="/platform" element={<PlatformDashboard />} />
      <Route path="/personal/start" element={<PersonalStart />} />
      <Route path="/" element={<PublicHome />} />
      <Route path="/workspace" element={<WorkspaceByRole />} />
      <Route path="/campaigns/:id" element={<CampaignDetail />} />
      <Route path="/survey/:id" element={<Survey />} />
      <Route path="/reports" element={<ReportCenter />} />
      <Route path="/reports/:id" element={<ReportPage />} />
      <Route path="/my-reports" element={<MyReports />} />
      <Route path="/my-reports/:id" element={<EmployeeReportPage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route
        path="/campaigns/:id/individual-reports/:subjectId"
        element={<AuthorizedIndividualReportPage />}
      />
      <Route path="/render/reports/:id" element={<RenderReportPage />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/actions" element={<Actions />} />
    </Routes>
  );
}
