export interface FeishuConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  baseUrl?: string;
  accountsUrl?: string;
}

export interface FeishuIdentity {
  openId: string;
  unionId?: string;
  tenantKey: string;
  name: string;
  avatarUrl?: string;
}

export interface FeishuDirectoryUser {
  openId: string;
  name: string;
  departmentIds: string[];
  leaderOpenId?: string;
  active: boolean;
}

export interface FeishuDepartment {
  openDepartmentId: string;
  name: string;
  parentDepartmentId?: string;
}

interface FeishuEnvelope<T> {
  code: number;
  msg: string;
  data?: T;
}

export class FeishuApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly logId?: string,
  ) {
    super(`FEISHU_${code}:${message}`);
  }
}

export class FeishuClient {
  private tenantToken: { value: string; expiresAt: number } | null = null;
  private readonly baseUrl: string;
  private readonly accountsUrl: string;
  constructor(
    private readonly config: FeishuConfig,
    private readonly request: typeof fetch = fetch,
  ) {
    this.baseUrl = config.baseUrl ?? "https://open.feishu.cn";
    this.accountsUrl = config.accountsUrl ?? "https://accounts.feishu.cn";
  }

  authorizationUrl(
    state: string,
    scope = "contact:user.base:readonly",
  ): string {
    const url = new URL("/open-apis/authen/v1/authorize", this.accountsUrl);
    url.searchParams.set("app_id", this.config.appId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    if (scope) url.searchParams.set("scope", scope);
    return url.toString();
  }

  async exchangeCode(
    code: string,
  ): Promise<{ accessToken: string; identity: FeishuIdentity }> {
    const token = await this.json<any>("/open-apis/authen/v2/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: this.config.appId,
        client_secret: this.config.appSecret,
        code,
        redirect_uri: this.config.redirectUri,
      }),
    });
    const accessToken = token.access_token as string;
    if (!accessToken)
      throw new FeishuApiError(
        -1,
        "OAuth token response does not contain access_token",
      );
    const info = await this.json<any>("/open-apis/authen/v1/user_info", {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!info.open_id || !info.tenant_key)
      throw new FeishuApiError(-1, "User info response is incomplete");
    return {
      accessToken,
      identity: {
        openId: info.open_id,
        unionId: info.union_id,
        tenantKey: info.tenant_key,
        name: info.name || "飞书用户",
        avatarUrl: info.avatar_url,
      },
    };
  }

  async getTenantAccessToken(): Promise<string> {
    if (this.tenantToken && this.tenantToken.expiresAt > Date.now() + 60_000)
      return this.tenantToken.value;
    const response = await this.json<any>(
      "/open-apis/auth/v3/tenant_access_token/internal",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          app_id: this.config.appId,
          app_secret: this.config.appSecret,
        }),
      },
    );
    const value = response.tenant_access_token as string;
    if (!value)
      throw new FeishuApiError(
        -1,
        "Tenant token response does not contain tenant_access_token",
      );
    this.tenantToken = {
      value,
      expiresAt: Date.now() + Number(response.expire ?? 7_200) * 1_000,
    };
    return value;
  }

  async listDepartmentUsers(
    departmentId: string,
  ): Promise<FeishuDirectoryUser[]> {
    const token = await this.getTenantAccessToken();
    const users: FeishuDirectoryUser[] = [];
    let pageToken = "";
    do {
      const url = new URL(
        "/open-apis/contact/v3/users/find_by_department",
        this.baseUrl,
      );
      url.searchParams.set("department_id", departmentId);
      url.searchParams.set("department_id_type", "open_department_id");
      url.searchParams.set("user_id_type", "open_id");
      url.searchParams.set("page_size", "50");
      if (pageToken) url.searchParams.set("page_token", pageToken);
      const data = await this.json<any>(url.toString(), {
        headers: { authorization: `Bearer ${token}` },
      });
      for (const user of data.items ?? [])
        users.push({
          openId: user.open_id,
          name: user.name,
          departmentIds: user.department_ids ?? [],
          leaderOpenId: user.leader_user_id || undefined,
          active:
            user.status?.is_activated !== false &&
            user.status?.is_resigned !== true,
        });
      pageToken = data.has_more ? (data.page_token ?? "") : "";
    } while (pageToken);
    return users;
  }

  async listChildDepartments(
    departmentId: string,
  ): Promise<FeishuDepartment[]> {
    const token = await this.getTenantAccessToken();
    const departments: FeishuDepartment[] = [];
    let pageToken = "";
    do {
      const url = new URL(
        `/open-apis/contact/v3/departments/${encodeURIComponent(departmentId)}/children`,
        this.baseUrl,
      );
      url.searchParams.set("department_id_type", "open_department_id");
      url.searchParams.set("page_size", "50");
      if (pageToken) url.searchParams.set("page_token", pageToken);
      const data = await this.json<any>(url.toString(), {
        headers: { authorization: `Bearer ${token}` },
      });
      for (const department of data.items ?? []) {
        if (!department.open_department_id) continue;
        departments.push({
          openDepartmentId: department.open_department_id,
          name: department.name || "未命名部门",
          parentDepartmentId: department.parent_department_id || undefined,
        });
      }
      pageToken = data.has_more ? (data.page_token ?? "") : "";
    } while (pageToken);
    return departments;
  }

  async listDepartmentTreeUsers(
    rootDepartmentId = "0",
  ): Promise<FeishuDirectoryUser[]> {
    return (await this.listDirectoryTree(rootDepartmentId)).users;
  }

  async listDirectoryTree(rootDepartmentId = "0"): Promise<{
    users: FeishuDirectoryUser[];
    departments: FeishuDepartment[];
  }> {
    const queue = [rootDepartmentId];
    const visited = new Set<string>();
    const users = new Map<string, FeishuDirectoryUser>();
    const departments = new Map<string, FeishuDepartment>();
    while (queue.length) {
      const departmentId = queue.shift()!;
      if (visited.has(departmentId)) continue;
      visited.add(departmentId);
      const members = await this.listDepartmentUsers(departmentId);
      const children = await this.listChildDepartments(departmentId);
      for (const member of members) users.set(member.openId, member);
      for (const child of children) {
        departments.set(child.openDepartmentId, child);
        if (!visited.has(child.openDepartmentId))
          queue.push(child.openDepartmentId);
      }
    }
    return {
      users: [...users.values()],
      departments: [...departments.values()],
    };
  }

  async sendInteractiveCard(
    openId: string,
    card: object,
  ): Promise<{ messageId: string }> {
    const token = await this.getTenantAccessToken();
    const data = await this.json<any>(
      "/open-apis/im/v1/messages?receive_id_type=open_id",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          receive_id: openId,
          msg_type: "interactive",
          content: JSON.stringify(card),
        }),
      },
    );
    return { messageId: data.message_id };
  }

  private async json<T>(pathOrUrl: string, init: RequestInit): Promise<T> {
    const response = await this.request(
      pathOrUrl.startsWith("http")
        ? pathOrUrl
        : new URL(pathOrUrl, this.baseUrl),
      init,
    );
    const payload = (await response.json()) as FeishuEnvelope<T> & T;
    const code = Number((payload as any).code ?? 0);
    if (!response.ok || code !== 0)
      throw new FeishuApiError(
        code || response.status,
        (payload as any).msg || response.statusText,
        response.headers.get("x-tt-logid") ?? undefined,
      );
    // Feishu currently returns some auth payloads at the top level and others
    // inside `data`; accepting both shapes keeps the adapter compatible across
    // API revisions without weakening the `code === 0` check above.
    return ((payload as any).data ?? payload) as T;
  }
}
