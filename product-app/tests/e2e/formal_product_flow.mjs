import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { accessSync, constants } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const artifacts = new URL("../../test-results/", import.meta.url);
const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:4310";
const webOrigin = process.env.WEB_ORIGIN ?? "http://127.0.0.1:5173";
const artifactPath = (name) => fileURLToPath(new URL(name, artifacts));
await mkdir(fileURLToPath(artifacts), { recursive: true });

function chromiumPath() {
  const candidates = [
    process.env.E2E_CHROMIUM_PATH,
    chromium.executablePath(),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  throw new Error("E2E_CHROMIUM_EXECUTABLE_NOT_FOUND");
}

const visible = async (locator, timeout = 10_000) =>
  locator.waitFor({ state: "visible", timeout });
const clickScale = async (page, count, optionIndex) => {
  for (let index = 0; index < count; index += 1) {
    await page.locator(".scale button").nth(optionIndex).click();
    if (index < count - 1) await page.waitForTimeout(220);
  }
};
const clickBackground = async (page, count) => {
  for (let index = 0; index < count; index += 1) {
    await page.locator(".background-options button").nth(2).click();
    if (index < count - 1) await page.waitForTimeout(220);
  }
};
const localDateTime = (date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const browser = await chromium.launch({
  headless: true,
  executablePath: chromiumPath(),
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(webOrigin);
  await page.waitForLoadState("networkidle");
  await visible(
    page.getByRole("heading", {
      name: /看清 AI 准备度，\s*找到下一步怎么提升。/,
    }),
  );
  await visible(page.getByRole("link", { name: "开始个人测评" }));
  await page.goto(`${webOrigin}/workspace`);
  await page.waitForLoadState("networkidle");
  await visible(page.getByRole("heading", { name: "调研活动" }));

  await page.getByRole("button", { name: "＋ 创建调研活动" }).click();
  await page.locator('input[name="name"]').fill("待编辑删除草稿");
  await page.getByRole("button", { name: "创建草稿" }).click();
  await page.getByText("待编辑删除草稿").click();
  await page.getByRole("button", { name: "编辑草稿" }).click();
  await page.locator('input[name="name"]').fill("已编辑可删除草稿");
  await page.getByRole("button", { name: "保存修改" }).click();
  await visible(page.getByRole("heading", { name: "已编辑可删除草稿" }));
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除草稿" }).click();
  await visible(page.getByRole("heading", { name: "调研活动" }));
  assert.equal(await page.getByText("已编辑可删除草稿").count(), 0);

  await page.getByRole("button", { name: "＋ 创建调研活动" }).click();
  await page.locator('input[name="name"]').fill("未来排期浏览器验收");
  await page
    .locator('input[name="startsAt"]')
    .fill(localDateTime(new Date(Date.now() + 86_400_000)));
  await page
    .locator('input[name="closesAt"]')
    .fill(localDateTime(new Date(Date.now() + 172_800_000)));
  await page.getByRole("button", { name: "创建草稿" }).click();
  await page.getByText("未来排期浏览器验收").click();
  await page.getByRole("button", { name: "确认并发布" }).click();
  await visible(page.getByText("活动已排期", { exact: false }));
  await visible(page.locator(".detail-cover .status.scheduled"));
  await page.getByRole("button", { name: "生成本地测试入口" }).click();
  const scheduledSurveyPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "打开员工作答页" }).click();
  const scheduledSurvey = await scheduledSurveyPromise;
  await visible(
    scheduledSurvey.getByText("问卷尚未到开放时间", { exact: false }),
  );
  await scheduledSurvey.close();
  await page.getByRole("button", { name: "提前开始" }).click();
  await visible(page.getByText("活动已提前开始", { exact: false }));
  await visible(page.locator(".detail-cover .status.active"));
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "取消活动" }).click();
  await page.getByRole("link", { name: "← 返回活动列表" }).click();

  await page.getByRole("button", { name: "＋ 创建调研活动" }).click();
  await page.locator('input[name="name"]').fill("正式产品浏览器验收");
  await page.getByText("更多可选配置", { exact: true }).click();
  await page.getByRole("button", { name: "＋单选题" }).click();
  await page
    .locator('.custom-question-editor input[placeholder="请输入企业希望补充了解的问题"]')
    .fill("你希望公司优先提供哪类支持？");
  await page
    .locator(".custom-question-editor textarea")
    .fill("真实业务案例\n工具操作培训\n流程辅导");
  await page.locator(".custom-question-editor .inline-check input").check();
  await page.getByRole("button", { name: "创建草稿" }).click();
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("link", { name: /\u6b63\u5f0f\u4ea7\u54c1\u6d4f\u89c8\u5668\u9a8c\u6536/ })
    .click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "确认并发布" }).click();
  await visible(page.getByText("活动已发布，题目、计分和研究上下文版本已经冻结。"));
  await page.getByRole("button", { name: "延长截止时间" }).click();
  await page
    .locator('textarea[name="reason"]')
    .fill("为尚未完成的员工保留额外作答时间。 ");
  await page.getByRole("button", { name: "保存延期并编辑提醒" }).click();
  await visible(page.getByText("新截止时间已生效", { exact: false }));
  await visible(page.getByRole("heading", { name: "提醒尚未完成的员工" }));
  const reminderBody = page.locator('textarea[name="body"]');
  assert.match(await reminderBody.inputValue(), /前继续完成/);
  assert.doesNotMatch(await reminderBody.inputValue(), /请在截止时间前/);
  await page.locator(".delivery-dialog header button").click();
  await visible(page.getByText("已延期 1 次"));
  await page.getByText("查看截止时间变更记录").click();
  await visible(page.getByText("第 1 次延期"));
  await visible(page.getByText("为尚未完成的员工保留额外作答时间。"));
  await page.getByRole("button", { name: "生成本地测试入口" }).first().click();
  await visible(page.getByRole("button", { name: "打开员工作答页" }));

  const surveyPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "打开员工作答页" }).click();
  const survey = await surveyPromise;
  await survey.waitForLoadState("networkidle");
  await visible(survey.getByRole("heading", { name: "对企业管理员匿名的测评" }));
  await visible(survey.getByText("HR可查看邀请和完成状态，不能查看你的答案", { exact: false }));
  await survey.locator('.consent-check input').check();
  await survey.getByRole("button", { name: "同意并开始填写" }).click();
  await visible(survey.getByText("请根据过去3个月的实际工作体验作答，答案会自动保存。"));
  await clickScale(survey, 42, 2);
  await clickBackground(survey, 2);
  await survey.waitForTimeout(220);
  await survey.locator(".background-options button").nth(1).click();
  await survey.waitForTimeout(220);
  assert.equal(await survey.getByRole("button", { name: "检查并提交" }).isEnabled(), true);
  await survey.getByRole("button", { name: "检查并提交" }).click();
  await visible(survey.getByRole("heading", { name: "确认提交这份问卷？" }));
  await survey.getByRole("button", { name: "返回检查" }).click();
  await survey.getByRole("button", { name: "检查并提交" }).click();
  await survey.getByRole("button", { name: "确认提交", exact: true }).click();
  await visible(survey.getByRole("heading", { name: "问卷已经提交。" }));
  await survey.getByRole("button", { name: "查看完整个人报告" }).click();
  for (const text of [
    "这不是一个总分，而是一张行动地图。",
    "结合8个维度来看",
    "整体表现解读",
    "这个位置意味着什么",
    "下一步行动计划",
    "涌现区",
  ]) await visible(survey.getByText(text, { exact: false }).first());
  assert.equal(await survey.getByText("优先启动", { exact: false }).count(), 0);
  const priorityCards = survey.locator(".action-plan-section .priorities > article");
  assert.ok((await priorityCards.count()) >= 3 && (await priorityCards.count()) <= 5);
  await visible(survey.getByText("为什么现在做", { exact: true }).first());
  await visible(survey.getByText("具体动作", { exact: true }).first());
  await visible(survey.getByText("完成标准", { exact: true }).first());
  assert.ok(await survey.locator("details.development-map").count() >= 1);
  assert.equal(await survey.locator("details.development-map[open]").count(), 0);
  assert.equal(
    await survey.getByText("相关能力或条件已经稳定，可继续扩大高价值应用").count(),
    0,
  );
  await survey.getByRole("link", { name: "进入我的报告" }).click();
  await survey.getByText("查看报告 →").first().click();
  await visible(survey.getByText("这不是一个总分，而是一张行动地图。"));
  const reportUrl = new URL(survey.url());
  const reportId = reportUrl.pathname.split("/").filter(Boolean).at(-1);
  const accessToken = reportUrl.searchParams.get("access");
  assert.ok(reportId && accessToken);
  const pdfResponse = await survey.request.get(
    `${apiOrigin}/public/reports/${reportId}/pdf?access_token=${encodeURIComponent(accessToken)}`,
    { timeout: 60_000 },
  );
  assert.equal(pdfResponse.ok(), true, await pdfResponse.text());
  const pdf = await pdfResponse.body();
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.byteLength > 50_000);
  assert.ok(pdf.toString("latin1").split("/Type /Page").length - 1 >= 5);
  await writeFile(new URL("formal-personal-report.pdf", artifacts), pdf);
  await survey.screenshot({ path: artifactPath("formal-personal-report.png"), fullPage: true });
  await page.screenshot({ path: artifactPath("formal-campaign-detail.png"), fullPage: true });

  await page.goto(`${webOrigin}/workspace`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "＋ 创建调研活动" }).click();
  await page.locator("label", { hasText: "16题 · 组织报告" }).click();
  await page.getByText("高级设置", { exact: true }).click();
  await page.locator("label", { hasText: "管理者单人自评" }).click();
  await page.locator("label", { hasText: "实名" }).click();
  await page.locator('input[name="name"]').fill("管理者单人组织诊断验收");
  await page.getByRole("button", { name: "创建草稿" }).click();
  await page.waitForLoadState("networkidle");
  await page.getByText("管理者单人组织诊断验收").click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "确认并发布" }).click();
  await page.getByRole("button", { name: "生成本地测试入口" }).first().click();
  const managerPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "打开员工作答页" }).click();
  const managerSurvey = await managerPromise;
  await managerSurvey.waitForLoadState("networkidle");
  await managerSurvey.locator('.consent-check input').check();
  await managerSurvey.getByRole("button", { name: "同意并开始填写" }).click();
  await clickScale(managerSurvey, 16, 3);
  await clickBackground(managerSurvey, 2);
  await managerSurvey.getByRole("button", { name: "检查并提交" }).click();
  await managerSurvey.getByRole("button", { name: "确认提交", exact: true }).click();
  await visible(managerSurvey.getByText("本活动只生成组织报告。"));
  await managerSurvey.close();

  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "关闭活动" }).click();
  await visible(page.getByText("活动已关闭，系统已按样本规则生成报告。"));
  await page.getByRole("button", { name: "查看完整报告" }).click();
  await visible(page.getByText("这不是一个总分，而是一张行动地图。"));
  await visible(page.getByText("整体表现解读"));
  await page.getByRole("button", { name: "审核并发布" }).click();
  await visible(page.getByText("报告已审核发布，发布记录已写入审计链路。"));
  await page.screenshot({ path: artifactPath("formal-organization-report.png"), fullPage: true });
  await page.locator(".action-conversion button").first().click();
  await page.locator('input[name="owner"]').fill("业务负责人");
  await page
    .locator('textarea[name="resources"]')
    .fill("每周2小时试点时间、已批准AI工具和流程负责人参与。");
  await page.getByRole("button", { name: "确认创建" }).click();
  await visible(page.getByRole("heading", { name: "行动计划已创建" }));
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page.goto(`${webOrigin}/actions`);
  await page.waitForLoadState("networkidle");
  await visible(page.getByRole("heading", { name: "下一步行动" }));
  await visible(page.getByText("业务负责人", { exact: true }));
  await page.getByRole("button", { name: "更新进展" }).click();
  await page.locator('input[name="progressPercent"]').fill("35");
  await page
    .locator('textarea[name="latestUpdate"]')
    .fill("已确认负责人和试运行范围，下周开始第一轮复盘。");
  await page.getByRole("button", { name: "保存进展" }).click();
  await visible(page.getByText("行动进展已保存。", { exact: false }));
  await visible(page.getByText("35%", { exact: true }));
  await visible(page.getByText("已确认负责人和试运行范围", { exact: false }).last());
  await visible(page.getByText("复测节点：", { exact: false }));
  await page.getByRole("button", { name: "查看复盘记录" }).click();
  await visible(page.getByRole("heading", { name: "复盘记录" }));
  await visible(page.getByText("已确认负责人和试运行范围", { exact: false }).last());
  await page.getByRole("button", { name: "关闭" }).click();
  await page.screenshot({ path: artifactPath("formal-action-progress.png"), fullPage: true });
  console.log("FORMAL_PRODUCT_E2E_OK");
} finally {
  await browser.close();
}
