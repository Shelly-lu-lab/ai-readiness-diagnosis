# 生产环境输入与联调验收清单

最后更新：2026-08-25

本清单用于把已通过本地回归的正式产品工程部署到公司可真实使用的环境。任何密钥都不得填入本文档、Git、聊天或工单正文；应通过公司密钥管理服务向运行环境注入。

## 1. 需由公司提供的输入

| 类别 | 必需输入 | 验收方式 |
|---|---|---|
| 域名 | Web 正式 HTTPS 域名；API 与 Web 同源反向代理 | 浏览器证书链正常，`WEB_ORIGIN` 与实际 Origin 完全一致 |
| PostgreSQL | 生产和独立恢复演练库的 TLS 连接信息 | `/ready` 返回当前 schema release；备份、恢复和报告哈希抽查通过 |
| Redis | 支持 BullMQ 的内网/TLS 连接 | 三个定时任务注册成功，失败通知可重试 |
| 对象存储 | S3 兼容 endpoint、bucket、region 和最小权限凭证 | PDF 写入、读取、删除及服务端加密通过 |
| 容器环境 | 可构建 Node 22/Chromium/Nginx 镜像的 CI 和镜像仓库 | API、Worker、Web 三镜像构建且以非 root 用户运行 |
| 密钥管理 | 四个互不相同的32+字符随机值 | `SESSION_SECRET`、`DATA_LINK_SECRET`、`INVITE_SECRET`、`INTERNAL_WORKER_SECRET` 缺失/复用时必须拒绝启动 |
| 运维 | 日志、Prometheus 或兼容监控、告警通道 | 内网 `/internal/metrics` 可拉取；`errorId` 可在日志中定位 |
| 交易邮件 | MVP 使用专用 Gmail 与应用专用密码；正式放量后迁移到已认证域名的交易邮件服务 | 验证码、问卷邀请、个人报告和团队结果通知均真实到达，发送日志只保存哈希身份与服务商消息ID |

邮箱第一阶段需通过密钥管理服务注入：

- `EMAIL_PROVIDER=smtp`
- `SMTP_HOST=smtp.gmail.com`、`SMTP_PORT=465`、`SMTP_SECURE=true`
- `SMTP_USER`：专用 Gmail 地址。
- `SMTP_PASS`：Google 应用专用密码，不得使用账户登录密码。
- `EMAIL_FROM`：使用与 `SMTP_USER` 相同的地址，例如 `AI 组织转型诊断 <专用 Gmail>`。
- `EMAIL_REPLY_TO`：可选，建议指向真实支持邮箱。
- `PLATFORM_ADMIN_EMAILS`：允许创建客户企业的平台运营邮箱列表。

真实邮件模式不得返回或在页面显示验证码。Gmail SMTP 只用于小规模 MVP；正式批量发放前仍需迁移到自有认证域名并完成退信和投诉处理。

## 2. 飞书企业自建应用

需提供并通过密钥管理服务注入：

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_REDIRECT_URI`：必须是 HTTPS，并指向 `/api/auth/feishu/callback`。
- `FEISHU_BOOTSTRAP_OWNER_OPEN_IDS`：至少一位经批准的初始企业所有者 Open ID。

应用配置与最小权限：

1. 应用可用范围必须覆盖需登录作答的员工；管理角色仍由 SaaS 服务端授权，不以“能打开飞书应用”代替 HR 权限。
2. OAuth 授权使用 `authen/v2/oauth/token`，再以 `user_access_token` 调用 `authen/v1/user_info`取得 Open ID 和租户标识。[获取 user_access_token](https://open.feishu.cn/document/authentication-management/access-token/get-user-access-token)、[获取用户信息](https://open.feishu.cn/document/server-docs/authentication-management/login-state-management/get?lang=zh-CN)
3. 通讯录只申请产品已使用的用户基础信息与部门组织架构读权限，不申请手机号、邮箱等未使用字段。从根部门递归同步时，应用通讯录权限范围需覆盖全部目标成员。[获取子部门列表](https://open.feishu.cn/document/server-docs/contact-v3/department/children?lang=zh-CN)、[通讯录权限范围](https://open.feishu.cn/document/server-docs/contact-v3/scope/scope_authority?lang=zh-CN)
4. 启用应用机器人能力，申请“以应用的身份发消息”，并发布应用版本；接收人需在机器人可用范围内。[发送消息](https://open.feishu.cn/document/server-docs/im-v1/message/create?lang=zh-CN)
5. 本产品当前不读取员工聊天消息，不应申请单聊或群聊消息读权限。

## 3. 生产环境变量

以 [`.env.example`](../.env.example) 为字段清单，但不得在生产机器上长期保存明文 `.env`。可公开的非密钥值包括：

```text
NODE_ENV=production
API_HOST=0.0.0.0
API_PORT=4310
WEB_ORIGIN=https://<approved-domain>
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
EMAIL_FROM=AI 组织转型诊断 <your-dedicated-account@gmail.com>
FEISHU_REDIRECT_URI=https://<approved-domain>/api/auth/feishu/callback
OBJECT_STORAGE_REGION=<region>
OBJECT_STORAGE_FORCE_PATH_STYLE=<true-or-false>
OBJECT_STORAGE_SSE=AES256
```

## 4. 自动化验收顺序

```bash
npm ci
npm run check
npm audit --audit-level=high
npm run test:dependencies
npm run test:e2e
```

放行的最小证据：

- `npm run check`：全部测试、类型检查和构建通过。
- `npm run test:dependencies`：输出 `PRODUCTION_DEPENDENCIES_OK`。
- `npm run test:e2e`：输出 `FORMAL_PRODUCT_E2E_SUITE_PASSED`。
- API `/ready`：返回 HTTP 200 且 schema release 与当前代码一致。
- 依赖安全审计：无 high/critical 漏洞。
- 日志检查：无问卷答案、Cookie、Authorization、邀请 Token 或报告取回 Token。

## 5. 真实飞书联调用例

| 编号 | 用例 | 通过标准 |
|---|---|---|
| F01 | HR 首次免登 | 只有白名单 Open ID 能初始化企业所有者 |
| F02 | 普通员工免登 | 不能获得 HR 权限，进入自己的问卷/报告空间 |
| F03 | 递归通讯录同步 | 人数、部门层级、离职/未激活状态与飞书抽样对账 |
| F04 | SaaS 内编辑并发送邀请卡片 | 收件人、文案、截止时间和按钮链接正确 |
| F05 | 邀请转发 | 另一员工打开后返回 `INVITE_IDENTITY_MISMATCH` |
| F06 | 匿名提交 | HR 不能查看答案/分数/个人报告；完成状态在随机延迟后更新 |
| F07 | 实名提交 | 只有本活动专用授权的 HR 能查看个人报告 |
| F08 | 提醒与失败重试 | 只向未完成者发送，临时失败后幂等重试 |
| F09 | 报告通知和跨设备找回 | 员工在新设备以同一飞书身份只能查看自己的报告 |
| F10 | 撤销、过期和删除 | 撤销授权立即生效；实名和匿名删除由 `queued` 进入 `completed` |

## 6. 公司内部试点门

1. 先用合成员工完成 F01—F10，不导入真实答卷。
2. 完成公司信息安全、隐私文案与数据保留政策审批。
3. 10—20 人实名技术试点与独立匿名试点，不将试点结果用于人事决策。
4. 修复 P0/P1 问题并重跑全部放行门。
5. 再进入 50—150 份匿名 Beta，开始认知访谈、信效度和测量等值分析；在此前不发布行业常模或百分位。

## 当前环境快照

2026-08-10 在当前开发机实测：Docker、PostgreSQL CLI、Redis CLI 不存在；上述生产环境变量均未配置；`npm run test:dependencies` 在连接任何外部服务前被 `MISSING_DEPENDENCY_TEST_CONFIG:DATABASE_URL` 正确阻断。因此该项不得标记为“生产依赖已验证”。
