import { access } from "node:fs/promises";
import { chromium } from "playwright-core";
import { PDFDocument } from "pdf-lib";

const chromiumCandidates = () =>
  [
    process.env.CHROMIUM_PATH,
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].filter((value): value is string => Boolean(value));

async function findChromium(): Promise<string> {
  for (const candidate of chromiumCandidates()) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next explicit system browser path.
    }
  }
  throw new Error("CHROMIUM_EXECUTABLE_NOT_FOUND");
}

export async function renderReportPdf(input: {
  webOrigin: string;
  reportId: string;
  renderToken: string;
}): Promise<Buffer> {
  const browser = await chromium.launch({
    executablePath: await findChromium(),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      locale: "zh-CN",
    });
    const url = new URL(`/render/reports/${input.reportId}`, input.webOrigin);
    url.searchParams.set("token", input.renderToken);
    await page.goto(url.toString(), {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    await page.locator("#print-report[data-report-ready='true']").waitFor({
      state: "visible",
      timeout: 30_000,
    });
    const metadata = await page.evaluate(async () => {
      await document.fonts.ready;
      for (const details of document.querySelectorAll<HTMLDetailsElement>("#print-report details"))
        details.open = true;
      const report = document.querySelector<HTMLElement>("#print-report");
      const title = report?.querySelector("h1")?.textContent?.trim() || "AI 组织转型诊断报告";
      document.title = title;
      return {
        title,
        reportType: report?.dataset.reportType || "report",
        snapshotId: report?.dataset.snapshotId || "unknown",
        createdAt: report?.dataset.createdAt || new Date(0).toISOString(),
        watermark: report?.querySelector(".report-watermark")?.textContent?.trim() || "AI 组织转型诊断",
      };
    });
    const pathwayCards = await page.locator("#print-report .development-map .pathway-card").count();
    if (pathwayCards === 0) throw new Error("PDF_DEVELOPMENT_MAP_MISSING");
    await page.emulateMedia({ media: "print" });
    const pdfBytes = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="display:flex;justify-content:space-between;width:100%;padding:0 10mm;color:#66756f;font-size:8px;"><span>${metadata.watermark}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
      margin: { top: "6mm", right: "0", bottom: "12mm", left: "0" },
    });
    const pdfDocument = await PDFDocument.load(pdfBytes);
    const stableDate = new Date(metadata.createdAt);
    pdfDocument.setTitle(metadata.title);
    pdfDocument.setAuthor("AI 组织转型诊断");
    pdfDocument.setSubject(`${metadata.reportType} · 快照 ${metadata.snapshotId}`);
    pdfDocument.setKeywords([metadata.reportType, "report_template_v0.9.3", "fixed_v0.9.3"]);
    pdfDocument.setCreator("AI Readiness Product");
    pdfDocument.setProducer("AI Readiness PDF Renderer pdf_layout_v0.4");
    pdfDocument.setCreationDate(stableDate);
    pdfDocument.setModificationDate(stableDate);
    return Buffer.from(await pdfDocument.save({ useObjectStreams: false }));
  } finally {
    await browser.close();
  }
}
