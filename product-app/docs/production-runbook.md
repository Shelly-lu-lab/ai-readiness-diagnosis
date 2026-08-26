# 生产运行与恢复手册

## 上线前放行门

1. `npm ci && npm run check && npm run test:dependencies && npm run test:e2e` 全部通过。
2. API `/health` 返回 200，`/ready` 返回 200 且 `database=ready`。
3. Worker 连接 Redis，成功注册 `activate-due-campaigns` 与 `close-due-campaigns` 调度器；验证未来活动到点开放、到期活动自动关闭；故意制造一次飞书失败后，确认通知任务从 `queued` 经重试转为 `sent`，且重复执行不会再次发送。
4. 完成真实飞书免登、通讯录同步、邀请卡片、提醒卡片和报告通知验收。
5. 对象存储开启服务端加密、版本保护和最小权限访问；不允许公网列举 bucket。
6. 备份恢复演练通过，并记录恢复时间、核对行数和报告哈希抽查结果。
7. 完成信息安全审批、隐私文案审核和 10—20 人内部技术试点。
8. 在独立合成账号上实测一次实名删除和一次匿名凭证删除，确认请求由 `queued` 转为 `completed`，PDF已从对象存储移除，报告原链接不再可访问。
9. 抽查实名个人报告授权、团队报告授权和撤销互不串用；下载PDF后核对页面授权标识与`report.downloaded`审计事件。
10. 用匿名合成活动验证关闭前补充题结果不可见、`n<5`被抑制；用实名活动查看一次文字原文并核对`custom_text_answers.viewed`审计。
11. 抽查一份即时个人报告和一份组织报告：前者发布主体应为`system`，后者应为实际HR用户；两者均须有`report.reviewed`和`report.published`审计事件，且未发布报告不可被员工或管理者访问。
12. 查询生产规则制品：状态必须为`released`、保留状态必须为`retained`、签名算法必须为`ed25519_v1`；抽查分数和报告的`assessment_input_snapshot_id`、`rule_release_id`及`rule_release_artifact_id`均非空。运行一次报告重放，再在隔离演练库分别篡改制品、签名和报告正文，三种情况都必须被阻断。
13. 用两个匿名合成身份在相近时间提交：提交请求结束时邀请仍未标记完成；`completion_receipts`不得含`response_id`、`submitted_at`、`request_id`、`trace_id`或`job_id`；提前运行Worker必须处理0条，随机延迟后才能按批次回写。限制身份域回执表和审计事件的访问权限。
14. 飞书免登负向测试：缺失或替换登录发起浏览器 Cookie 时回调必须失败；同一 `state` 第二次使用必须失败；生产 Session Cookie 必须带 `__Host-`、`Secure`、`HttpOnly` 和 `SameSite=Lax`；伪造 `Origin` 的写请求必须返回 `CROSS_SITE_REQUEST_BLOCKED`。
15. 把一个员工邀请链接转发给同企业另一名已登录员工及另一个租户：前者必须返回 `INVITE_IDENTITY_MISMATCH`，后者不得确认活动存在。打开正确链接后，地址栏不得长期保留邀请凭证。
16. 在日志平台搜索测试用的邀请 Token、报告取回 Token 和 Session Cookie：必须无结果；反向代理、APM 和 CDN 也必须配置为不记录查询凭证。

## 密钥与网络

- `SESSION_SECRET`、`DATA_LINK_SECRET`、`INVITE_SECRET` 和 `INTERNAL_WORKER_SECRET` 必须互不相同，且至少 32 字符，由密钥管理服务注入；缺失、过短或复用时进程会拒绝启动。
- `SESSION_SECRET` 可按会话安全政策轮换；`DATA_LINK_SECRET` 是答卷去重和历史报告找回的稳定伪名化密钥，只能使用经审批的离线迁移流程轮换，不得与 Session 密钥同步更换。`INVITE_SECRET` 轮换会使尚未完成的旧邀请失效，必须在无进行中活动时执行，或由 HR 重新发放邀请。
- 生产启动不得创建 `tenant-demo`、`user-hr-demo` 或其他演示身份；上线检查需在空库初始化后确认租户与用户表仍为空，再通过真实飞书首次登录创建企业身份。
- 首次公司试点前把经确认的企业所有者飞书 Open ID 写入 `FEISHU_BOOTSTRAP_OWNER_OPEN_IDS`；支持以逗号分隔多个值。没有命中该白名单的用户不能创建新租户，也不会因为“第一个登录”自动获得所有者权限。企业初始化完成并至少存在一名所有者后，其他员工按普通员工身份首次登录，再由所有者在 SaaS 内授权角色。
- API 只通过 Web 反向代理对外提供 `/api` 与 `/public`；`/internal` 仅对 Worker 网段可见。
- PostgreSQL、Redis 和对象存储不暴露到公网。
- 飞书 App Secret、对象存储密钥和数据库凭证不写入镜像、日志或 Git。

## 可观测性

- 平台日志按 Fastify `request.id` 聚合，API 同时在 `X-Request-Id` 响应头返回该值。
- 未处理异常的响应体同时返回 `errorId`，其值与 `X-Request-Id` 及服务端错误日志一致；客服和运维使用该编号查询，不要求员工提供问卷答案或 Token。
- 监控系统从 API 内网地址拉取 `/internal/metrics`，并在 `X-Worker-Secret` 中使用 Worker 凭证；Web Nginx 不代理 `/internal`。指标包含请求总数、5xx总数、在途请求、累计耗时、进程运行时间和 RSS 内存。
- 主要告警：`/ready` 连续失败、HTTP 5xx 突增、Worker 失败重试耗尽、Redis 队列积压、PDF 生成失败、飞书通知失败、对象存储读写失败。
- 日志不记录问卷答案、飞书 App Secret、Session Cookie、报告取回 Token 或原始 HR 字段。

## 备份

```bash
DATABASE_URL='postgresql://...' BACKUP_DIRECTORY=/secure/backups \
  ./scripts/backup-postgres.sh
./scripts/verify-postgres-backup.sh /secure/backups/ai-readiness-YYYYMMDDTHHMMSSZ.dump
```

- 建议每日全量备份，保留 35 天；生产数据库另开启 PITR。
- PDF 可由不可变 `report_snapshot` 重建，但对象存储仍应开启版本保护与生命周期策略。
- 备份与生产密钥分开保管，并在不同可用区保留副本。

## 恢复演练

`restore-postgres.sh` 会清理并覆盖目标数据库，只能对已核对的空白演练库执行：

```bash
RESTORE_DATABASE_URL='postgresql://.../ai_readiness_restore_drill' \
ALLOW_DATABASE_RESTORE=YES \
  ./scripts/restore-postgres.sh /secure/backups/ai-readiness-YYYYMMDDTHHMMSSZ.dump
```

恢复后必须再执行：

1. `/ready` 数据库就绪检查。
2. 租户数、活动数、答卷数、报告数与备份记录对账。
3. 随机抽查 10 份报告 `content_hash`，运行历史重放任务。
4. 验证匿名活动不能通过报告、导出或接口还原个人身份。
5. 记录实际 RPO/RTO；未达内部批准目标时不放行。

## 故障处理

- API 可用、`/ready` 失败：停止新发布和提交，检查 PostgreSQL 网络、凭证、连接池和存储。
- Worker 失败：已经开放的活动仍可作答，但自动开卷、自动关卷、PDF 预生成和重试停止；修复 Redis/Worker 后重放失败任务。
- 飞书故障：不改变答卷与报告状态，通知记为失败并重试，必要时由 HR 从 SaaS 复制已签名入口。
- 对象存储故障：网页报告仍可查看，PDF 下载显示暂不可用，恢复后从 `report_snapshot` 重建。
- 数据删除失败：不得手工把请求改为已完成；先核对 `data_deletion_requests.error_code`、Worker 重试和对象存储删除结果，修复后用同一 `requestId` 重放，并抽查原报告凭证已失效。
