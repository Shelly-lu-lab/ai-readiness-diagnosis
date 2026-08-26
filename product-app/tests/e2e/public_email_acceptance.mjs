import assert from "node:assert/strict";
import { accessSync, constants } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const outputDirectory = new URL("../../test-results/public-email/", import.meta.url);
const baseUrl = process.env.WEB_ORIGIN ?? "http://localhost:5173";
const appOrigin = new URL(baseUrl).origin;
await mkdir(outputDirectory, { recursive: true });

const goldenItemOrder = [
  "I01", "O01", "I05", "O05", "I09", "O09", "I13", "O13",
  "I02", "O02", "I06", "O06", "I10", "O10", "I14", "O14",
  "I03", "O03", "I07", "O07", "I11", "O11", "I15", "O15",
  "I04", "O04", "I08", "O08", "I12", "O12", "I16", "O16",
  "V01", "V02", "V03", "V04", "V05", "V06", "V07", "V08", "V09", "V10",
];
const goldenRawAnswer = (itemId) => itemId.startsWith("I")
  ? 5
  : /^O0[1-8]$/.test(itemId)
    ? 2
    : itemId.startsWith("O")
      ? 1
      : itemId === "V01" || itemId === "V02"
        ? 4
        : 3;
const clickGoldenScale = async (page) => {
  for (let index = 0; index < goldenItemOrder.length; index += 1) {
    await page.locator(".scale button").nth(goldenRawAnswer(goldenItemOrder[index]) - 1).click();
    if (index < goldenItemOrder.length - 1) await page.waitForTimeout(220);
  }
};

const clickScale = async (page, count, optionIndex) => {
  for (let index = 0; index < count; index += 1) {
    await page.locator(".scale button").nth(optionIndex).click();
    if (index < count - 1) await page.waitForTimeout(220);
  }
};

const clickBackground = async (page, count, optionIndex) => {
  for (let index = 0; index < count; index += 1) {
    await page.locator(".background-options button").nth(optionIndex).click();
    if (index < count - 1) await page.waitForTimeout(220);
  }
};

function chromiumPath() {
  for (const candidate of [
    process.env.E2E_CHROMIUM_PATH,
    chromium.executablePath(),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/chromium",
  ].filter(Boolean)) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  throw new Error("E2E_CHROMIUM_EXECUTABLE_NOT_FOUND");
}

const browser = await chromium.launch({
  headless: true,
  executablePath: chromiumPath(),
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedResponses = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().startsWith("Failed to load resource:")
    )
      consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("response", (response) => {
    if (
      response.status() >= 400 &&
      response.url().startsWith(appOrigin) &&
      !response.url().includes("favicon") &&
      !(response.status() === 401 && response.url().endsWith("/api/session"))
    )
      failedResponses.push(`${response.status()} ${response.url()}`);
  });

  await page.goto(`${baseUrl}/`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("heading", {
    name: /看清 AI 准备度，\s*找到下一步怎么提升。/,
  }).waitFor();
  await page.getByRole("link", { name: "企业工作台" }).waitFor();
  await page.screenshot({
    path: decodeURIComponent(new URL("public-home-desktop.png", outputDirectory).pathname),
    fullPage: true,
  });
  console.log("PUBLIC_HOME_DESKTOP_OK");

  await page.getByRole("link", { name: "开始个人测评" }).click();
  await page.waitForURL(/\/login/);
  const email = `acceptance.${Date.now()}@example.com`;
  await page.locator('input[type="email"]').fill(email);
  await page.getByRole("button", { name: "获取邮箱验证码" }).click();
  const developmentCode = (await page.getByText(/开发环境验证码：/).innerText())
    .match(/[0-9]{6}/)?.[0];
  assert.ok(developmentCode);
  await page.locator('input[inputmode="numeric"]').fill(developmentCode);
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL(/\/app\/personal/);
  await page.getByRole("heading", { name: "个人中心" }).waitFor();
  await page.getByRole("link", { name: "选择测评范围" }).click();
  await page.waitForURL(/\/personal\/start/);
  await page.getByRole("heading", { name: "开始个人 AI 准备度测评" }).waitFor();
  console.log("EMAIL_OTP_LOGIN_OK");

  await page.locator('input[name="workCity"]').fill("上海市");
  await page.locator('input[name="province"]').fill("上海市");
  await page.locator('select[name="industryCode"]').selectOption("internet");
  await page.locator('select[name="companySizeBand"]').selectOption("200—499");
  await page.locator('select[name="jobFamily"]').selectOption("engineering_data_research");
  await page.locator('select[name="careerStage"]').selectOption("experienced_ic");
  await page.locator('select[name="peopleManager"]').selectOption("no");
  await page.locator('select[name="tenureBand"]').selectOption("3_to_5y");
  await page.locator('input[name="researchConsent"]').check();
  await page.screenshot({
    path: decodeURIComponent(new URL("personal-profile-desktop.png", outputDirectory).pathname),
    fullPage: true,
  });
  await page.getByRole("button", { name: "保存并继续" }).click();
  const readyCard = page.locator(".personal-ready-card");
  await readyCard.getByRole("heading", { name: "确认工作背景" }).waitFor();
  await readyCard.getByText("上海市", { exact: true }).first().waitFor();
  await readyCard.getByText("互联网、软件与信息服务", { exact: true }).waitFor();
  await readyCard.getByText("200—499", { exact: true }).waitFor();
  await readyCard.getByText("研发、工程、数据与研究", { exact: true }).waitFor();
  await readyCard.getByText("成熟个人贡献者", { exact: true }).waitFor();
  await readyCard.getByText(/已授权去标识数据/).waitFor();
  await readyCard.getByRole("button", { name: "修改背景信息" }).waitFor();
  await readyCard.getByRole("button", { name: "信息正确，开始测评" }).waitFor();
  await page.getByText("只了解我自己", { exact: true }).waitFor();
  await page.getByText("同时了解我和所在组织", { exact: true }).waitFor();

  await readyCard.getByRole("button", { name: "修改背景信息" }).click();
  assert.equal(await page.locator('input[name="workCity"]').inputValue(), "上海市");
  await page.getByRole("button", { name: "保存并继续" }).click();
  await readyCard.getByRole("heading", { name: "确认工作背景" }).waitFor();

  const mobileProfile = await context.newPage();
  await mobileProfile.setViewportSize({ width: 390, height: 844 });
  await mobileProfile.goto(`${baseUrl}/personal/start`);
  const mobileReadyCard = mobileProfile.locator(".personal-ready-card");
  await mobileReadyCard.getByRole("heading", { name: "确认工作背景" }).waitFor();
  await mobileReadyCard.getByText("研发、工程、数据与研究", { exact: true }).waitFor();
  await mobileReadyCard.getByRole("button", { name: "修改背景信息" }).waitFor();
  await mobileReadyCard.getByRole("button", { name: "信息正确，开始测评" }).waitFor();
  assert.equal(
    await mobileProfile.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await mobileProfile.screenshot({
    path: decodeURIComponent(new URL("personal-profile-confirmation-mobile.png", outputDirectory).pathname),
    fullPage: true,
  });
  await mobileProfile.close();
  console.log("PERSONAL_RESEARCH_PROFILE_CONFIRMATION_OK");

  await page.getByText("同时了解我和所在组织", { exact: true }).click();
  await page.getByText(/组织相关结果只代表你的个人观察/).waitFor();
  await readyCard.getByRole("button", { name: "信息正确，开始测评" }).click();
  await page.waitForURL(/\/survey\//);
  await page.getByRole("heading", { name: "个人自助测评与数据说明" }).waitFor();
  await page.getByText(/不是公司正式诊断/).waitFor();
  await page.locator('.consent-check input[type="checkbox"]').check();
  await page.getByRole("button", { name: "同意并开始填写" }).click();
  await page.locator(".question-card h2").waitFor();
  assert.equal(await page.locator(".question-card > span").innerText(), "01 / 45");
  assert.doesNotMatch(await page.locator("body").innerText(), /暂时无法进入问卷/);
  await clickGoldenScale(page);
  await clickBackground(page, 3, 2);
  await page.getByRole("button", { name: "检查并提交" }).click();
  await page.getByRole("heading", { name: "确认提交这份问卷？" }).waitFor();
  await page.getByRole("button", { name: "确认提交", exact: true }).click();
  await page.getByRole("heading", { name: "问卷已经提交。" }).waitFor();
  await page.getByRole("button", { name: "查看完整个人报告" }).click();
  await page.getByText("你感知的组织 AI 准备度", { exact: true }).first().waitFor();
  await page.getByText(/两者不能平均为一个整体成熟度/).first().waitFor();
  assert.equal(await page.locator(".behavior-evidence-grid > article").count(), 8);
  await page.getByText("具体表现", { exact: true }).first().waitFor();
  await page.getByText("为什么重要", { exact: true }).first().waitFor();
  assert.equal(
    await page.locator(".quadrant").getAttribute("data-y-axis-label"),
    "你感知的组织 AI 准备度 ↑",
  );
  assert.equal(
    await page.locator(".emergent-zone polygon").getAttribute("points"),
    "45,100 70,100 70,45 100,45 100,30 70,30 70,0 55,0 55,30 0,30 0,55 45,55",
  );
  await page.getByText("由45／55／70阈值形成的过渡区域", { exact: true }).waitFor();
  await page.getByRole("heading", {
    name: "个人AI实践能力已经成熟，组织环境观察显示支持条件仍需核实",
  }).first().waitFor();
  await page.locator(".profile-narrative p").filter({ hasText: "B类来自你对组织环境的个人观察" }).waitFor();
  const actionSection = page.locator(".action-plan-section");
  await actionSection.getByRole("heading", { name: "当前优先行动" }).first().waitFor();
  assert.equal(await actionSection.locator(".priorities > article").count(), 5);
  assert.equal(await actionSection.locator(".action-audience-personal .priorities > article").count(), 3);
  assert.equal(await actionSection.locator(".action-audience-organization .priorities > article").count(), 2);
  for (const label of ["P1", "P2", "P3", "O1", "O2"])
    await actionSection.locator(".priorities > article > strong").getByText(label, { exact: true }).waitFor();
  await actionSection.getByText("为什么现在做", { exact: true }).first().waitFor();
  await actionSection.getByText("具体动作", { exact: true }).first().waitFor();
  await actionSection.getByText("完成标准", { exact: true }).first().waitFor();
  await actionSection.getByText("需团队核实", { exact: true }).first().waitFor();
  assert.equal(await actionSection.locator("details.development-map").count(), 2);
  assert.equal(await actionSection.locator("details.development-map[open]").count(), 0);
  assert.doesNotMatch((await actionSection.locator(".priorities").allInnerTexts()).join(" "), /REC-|IF-[POM]-|PAT-/);
  const reportListResponse = await page.request.get(`${baseUrl}/api/my-reports`);
  assert.equal(reportListResponse.ok(), true, await reportListResponse.text());
  const reportList = await reportListResponse.json();
  const personalReportId = reportList[0]?.report?.id;
  assert.ok(personalReportId);
  const pdfResponse = await page.request.get(
    `${baseUrl}/api/my-reports/${personalReportId}/pdf`,
    { timeout: 60_000 },
  );
  assert.equal(pdfResponse.ok(), true, await pdfResponse.text());
  const pdf = await pdfResponse.body();
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.byteLength > 50_000);
  await writeFile(new URL("personal-observer-report-v09.pdf", outputDirectory), pdf);
  await page.screenshot({
    path: decodeURIComponent(new URL("personal-observer-profile-v09-desktop.png", outputDirectory).pathname),
    fullPage: true,
  });
  const mobileReport = await context.newPage();
  await mobileReport.setViewportSize({ width: 390, height: 844 });
  await mobileReport.goto(`${baseUrl}/my-reports/${personalReportId}`);
  await mobileReport.getByRole("heading", {
    name: "个人AI实践能力已经成熟，组织环境观察显示支持条件仍需核实",
  }).first().waitFor();
  await mobileReport.getByRole("heading", { name: "当前优先行动" }).first().waitFor();
  const mobileOverflow = await mobileReport.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    offenders: Array.from(document.querySelectorAll("body *"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right > window.innerWidth + 1 || rect.left < -1;
      })
      .slice(0, 12)
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        parentClassName: element.parentElement?.className ?? "",
        text: element.textContent?.trim().slice(0, 80) ?? "",
        left: Math.round(element.getBoundingClientRect().left),
        right: Math.round(element.getBoundingClientRect().right),
        scrollWidth: element.scrollWidth,
      })),
  }));
  assert.equal(mobileOverflow.documentWidth <= mobileOverflow.viewport, true, JSON.stringify(mobileOverflow));
  await mobileReport.getByText(/查看后续完整发展地图/).first().focus();
  await mobileReport.keyboard.press("Enter");
  assert.equal(await mobileReport.locator("details.development-map[open]").count(), 1);
  await mobileReport.screenshot({
    path: decodeURIComponent(new URL("personal-observer-profile-v09-mobile.png", outputDirectory).pathname),
    fullPage: true,
  });
  await mobileReport.close();
  console.log("PERSONAL_SCOPE_SELECTION_OK");
  console.log("PERSONAL_OBSERVER_REPORT_LANGUAGE_OK");
  console.log("PERSONAL_OBSERVER_PROFILE_V09_WEB_PDF_OK");

  await page.goto(`${baseUrl}/account`);
  await page.getByRole("heading", { name: "账户信息" }).waitFor();
  const accountText = await page.locator("body").innerText();
  assert.match(accountText, new RegExp(email.replace(".", "\\.")));
  assert.doesNotMatch(accountText, /陈霖/);
  await page.screenshot({
    path: decodeURIComponent(new URL("account-desktop.png", outputDirectory).pathname),
    fullPage: true,
  });
  console.log("REAL_ACCOUNT_IDENTITY_OK");

  const noAccessContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const noAccessPage = await noAccessContext.newPage();
  await noAccessPage.goto(`${baseUrl}/enterprise`);
  await noAccessPage.getByRole("link", { name: "登录企业管理" }).click();
  const organizationEmail = `organization.${Date.now()}@example.com`;
  await noAccessPage.locator('input[type="email"]').fill(organizationEmail);
  await noAccessPage.getByRole("button", { name: "获取邮箱验证码" }).click();
  const organizationCode = (
    await noAccessPage.getByText(/开发环境验证码：/).innerText()
  ).match(/[0-9]{6}/)?.[0];
  assert.ok(organizationCode);
  await noAccessPage.locator('input[inputmode="numeric"]').fill(organizationCode);
  await noAccessPage.getByRole("button", { name: "登录" }).click();
  await noAccessPage.waitForURL(/\/enterprise\/no-access/);
  await noAccessPage.getByRole("heading", { name: "你还没有企业权限" }).waitFor();
  assert.doesNotMatch(await noAccessPage.locator("body").innerText(), /示例公司|跃迁科技/);
  await noAccessContext.close();
  console.log("ORGANIZATION_NO_ACCESS_OK");

  const platformContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const platformPage = await platformContext.newPage();
  await platformPage.goto(`${baseUrl}/platform/login`);
  await platformPage.getByRole("heading", { name: "登录平台管理后台" }).waitFor();
  await platformPage.locator('input[type="email"]').fill(
    process.env.TEST_PLATFORM_EMAIL ?? "platform.acceptance@example.com",
  );
  await platformPage.getByRole("button", { name: "获取邮箱验证码" }).click();
  const platformCode = (
    await platformPage.getByText(/开发环境验证码：/).innerText()
  ).match(/[0-9]{6}/)?.[0];
  assert.ok(platformCode);
  await platformPage.locator('input[inputmode="numeric"]').fill(platformCode);
  await platformPage.getByRole("button", { name: "登录" }).click();
  await platformPage.waitForURL(/\/platform$/);
  await platformPage.getByRole("heading", { name: "企业客户" }).waitFor();
  assert.doesNotMatch(await platformPage.locator("body").innerText(), /示例公司|跃迁科技/);
  await platformPage.screenshot({
    path: decodeURIComponent(new URL("platform-organizations-empty.png", outputDirectory).pathname),
    fullPage: true,
  });
  await platformPage.getByRole("button", { name: "添加第一个企业" }).click();
  await platformPage.locator('input[name="organizationName"]').fill("邮箱入口验收组织");
  await platformPage.getByRole("button", { name: "创建企业", exact: true }).click();
  await platformPage.getByText(/邮箱入口验收组织 已创建/).waitFor();
  await platformPage.screenshot({
    path: decodeURIComponent(new URL("platform-organizations-created.png", outputDirectory).pathname),
    fullPage: true,
  });
  const organizationCard = platformPage.locator(".platform-organization-list article").filter({ hasText: "邮箱入口验收组织" });
  await organizationCard.getByRole("button", { name: "进入工作台 →" }).click();
  const organizationPage = platformPage;
  await organizationPage.getByRole("heading", { name: "完成企业基本设置" }).waitFor();
  await organizationPage.locator('input[name="province"]').fill("上海市");
  await organizationPage.locator('input[name="industryRaw"]').fill("互联网和相关服务");
  await organizationPage.locator('input[name="headcount"]').fill("120");
  await organizationPage.getByRole("button", { name: "保存并进入工作台" }).click();
  await organizationPage.getByRole("heading", { name: "调研活动" }).waitFor();
  console.log("PLATFORM_ORGANIZATION_CREATION_OK");
  console.log("ORGANIZATION_FIRST_USE_OK");
  await organizationPage.getByRole("button", { name: "＋ 创建调研活动" }).click();
  await organizationPage.locator('input[name="name"]').fill("邮箱组织问卷入口验收");
  await organizationPage.getByRole("button", { name: "创建草稿" }).click();
  await organizationPage.getByText("邮箱组织问卷入口验收").click();
  await organizationPage.getByRole("heading", { name: "邮箱组织问卷入口验收" }).waitFor();
  await organizationPage.getByRole("button", { name: "确认并发布" }).click();
  await organizationPage.locator(".detail-cover .status.active").waitFor();
  await organizationPage
    .getByRole("button", { name: "生成本地测试入口" })
    .click();
  await organizationPage.getByRole("button", { name: "打开员工作答页" }).waitFor();
  const organizationSurveyPromise = platformContext.waitForEvent("page");
  await organizationPage.getByRole("button", { name: "打开员工作答页" }).click();
  const organizationSurvey = await organizationSurveyPromise;
  await organizationSurvey.getByRole("heading", { name: "对企业管理员匿名的测评" }).waitFor();
  assert.doesNotMatch(
    await organizationSurvey.locator("body").innerText(),
    /INVITE_IDENTITY_MISMATCH|暂时无法进入问卷/,
  );
  await organizationSurvey.close();

  await organizationPage.getByRole("button", { name: "通过邮箱发放" }).click();
  await organizationPage
    .locator('.delivery-dialog textarea[name="emails"]')
    .fill(`delivery.${Date.now()}@example.com`);
  await organizationPage.getByRole("button", { name: "确认发送" }).click();
  await organizationPage
    .getByText(/当前环境尚未接通真实邮件服务/)
    .waitFor();
  await organizationPage.locator(".delivery-dialog header button").click();
  console.log("EMAIL_PROVIDER_NOT_CONFIGURED_NOTICE_OK");

  await platformContext.close();
  console.log("ORGANIZATION_LOCAL_SURVEY_ENTRY_OK");

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(`${baseUrl}/`);
  await mobile.waitForLoadState("networkidle");
  await mobile.getByRole("heading", {
    name: /看清 AI 准备度，\s*找到下一步怎么提升。/,
  }).waitFor();
  await mobile.screenshot({
    path: decodeURIComponent(new URL("public-home-mobile.png", outputDirectory).pathname),
    fullPage: true,
  });
  console.log("PUBLIC_HOME_MOBILE_OK");

  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(failedResponses, []);
  console.log("PUBLIC_EMAIL_ACCEPTANCE_OK");
} finally {
  await browser.close();
}
