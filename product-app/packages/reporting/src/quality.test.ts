import { describe, expect, it } from "vitest";
import { scoreAnswers, QUESTIONNAIRE_ITEMS } from "@ai-readiness/domain";
import type { RawAnswer, ReportType } from "@ai-readiness/contracts";
import { buildReportSnapshot } from "./report.js";
import { auditReportLanguage, reportLanguageSections } from "./quality.js";

function matrixAnswers(personal: RawAnswer, organization: RawAnswer, impact: RawAnswer) {
  return Object.fromEntries(QUESTIONNAIRE_ITEMS.map((item) => [
    item.id,
    item.id.startsWith("I") ? personal : item.id.startsWith("O") ? organization : impact,
  ])) as Record<string, RawAnswer>;
}

function matrixReport(name: string, reportType: ReportType, answers: Record<string, RawAnswer>) {
  return buildReportSnapshot({
    tenantId: `tenant-matrix-${name}`,
    campaignId: `campaign-matrix-${name}`,
    reportType,
    subjectLabel: name,
    score: scoreAnswers(answers),
    createdAt: new Date("2026-08-18T00:00:00Z"),
  });
}

describe("report language quality gate", () => {
  it("rejects mechanical wording, repetition and observation agency overreach", () => {
    const issues = auditReportLanguage([
      {
        id: "B1",
        scope: "organization_observation",
        text: "从你的观察看，经理示范 AI 使用更值得先处理。你已经能同时做到把规则讲清楚。",
      },
      {
        id: "B2",
        scope: "organization_observation",
        text: "从你的观察看，学习支持还不是各处都能做到的日常做法。",
      },
      {
        id: "B3",
        scope: "organization_observation",
        text: "从你的观察看，学习支持还不是各处都能做到的日常做法。",
      },
    ]);

    expect(issues.map((entry) => entry.code)).toEqual(
      expect.arrayContaining([
        "forbidden_abstract_phrase",
        "duplicate_sentence",
        "repeated_sentence_opening",
        "observation_agency_overreach",
      ]),
    );
  });

  it("accepts concrete, varied and bounded Chinese report language", () => {
    const issues = auditReportLanguage([
      {
        id: "A1",
        scope: "personal_behavior",
        text: "你已经习惯先说明任务目的、必要背景和交付标准，再让 AI 参与工作。这使你的尝试更容易被检查，也减少了反复补充要求的次数。",
      },
      {
        id: "A2",
        scope: "personal_behavior",
        text: "在复杂任务里，你会把工作拆成几个步骤，并根据中间结果调整下一步。不过，把这些步骤沉淀成可以复用的流程，还可以继续加强。",
      },
      {
        id: "B1",
        scope: "organization_observation",
        text: "你较少看到经理公开示范如何使用 AI，也不常看到团队讨论失败的尝试。这意味着个人经验还不容易变成团队共同做法。",
      },
      {
        id: "action-1",
        scope: "action",
        text: "未来两周选择一个每周重复的任务，写下输入、检查点和完成标准；连续使用三次后，记录节省时间与返工情况。",
      },
    ]);

    expect(issues).toEqual([]);
  });

  it("collects every visible narrative layer without duplicating the legacy profile", () => {
    const answers = Object.fromEntries(
      QUESTIONNAIRE_ITEMS.map((item) => [item.id, 3 as const]),
    );
    const report = buildReportSnapshot({
      tenantId: "tenant-quality-gate",
      campaignId: "campaign-quality-gate",
      reportType: "personal_observer",
      subjectLabel: "报告语言质量门",
      score: scoreAnswers(answers),
      createdAt: new Date("2026-08-17T00:00:00Z"),
    });
    const sections = reportLanguageSections(report);

    expect(sections.some((entry) => entry.id === "profile:integrated_state")).toBe(true);
    expect(sections.some((entry) => entry.id.startsWith("profile:legacy:"))).toBe(false);
    expect(sections.some((entry) => entry.id.startsWith("storyline:"))).toBe(false);
    expect(sections.filter((entry) => entry.id.startsWith("behavior:"))).toHaveLength(
      report.behaviorEvidence?.length ?? 0,
    );
    expect(sections.filter((entry) => entry.id.startsWith("diagnosis:"))).toHaveLength(
      report.behaviorEvidence?.length ? 0 : 8 * 2,
    );
    expect(sections.filter((entry) => entry.id.startsWith("action:"))).toHaveLength(
      report.recommendations.length,
    );
    expect(sections.filter((entry) => entry.id.startsWith("pathway:"))).toHaveLength(
      report.developmentPathway?.length ?? 0,
    );
    expect(
      sections
        .filter((entry) => /^(diagnosis|behavior):B/u.test(entry.id))
        .every((entry) => entry.scope === "organization_observation"),
    ).toBe(true);
  });

  it("keeps low personal capability distinct from high organization support and impact", () => {
    const report = matrixReport("low-a-high-b-impact", "personal_observer", matrixAnswers(2, 5, 5));
    const organizationActions = report.recommendations.filter((entry) => entry.dimensionId.startsWith("B"));

    expect(report.profileNarrative?.headline).toBe("组织支持和实际影响已经显现，个人方法仍需从基础链路补稳");
    expect(report.profileNarrative?.paragraphs.find((entry) => entry.kind === "working_chain")?.text)
      .toContain("这是环境条件，不等同于你的个人能力");
    expect(report.profileNarrative?.headline).not.toMatch(/个人.*(?:成熟|已有基础)/u);
    expect(organizationActions.length).toBeLessThanOrEqual(1);
    expect(report.recommendations.filter((entry) => entry.dimensionId.startsWith("A")).length).toBeGreaterThanOrEqual(2);
    expect(report.storyline?.nextStageTheme).toContain("任务定义、实际使用和结果核查");
  });

  it("adapts explanations and actions across the product-wide score matrix", () => {
    const cases = [
      { name: "double-low", type: "personal_observer" as const, answers: matrixAnswers(2, 2, 2) },
      { name: "double-high", type: "personal_observer" as const, answers: matrixAnswers(5, 5, 5) },
      { name: "tied-mid", type: "personal_observer" as const, answers: matrixAnswers(3, 3, 3) },
      { name: "personal-26", type: "personal_scoped" as const, answers: matrixAnswers(2, 3, 4) },
      { name: "formal-organization", type: "organization" as const, answers: matrixAnswers(2, 4, 4) },
    ];
    for (const entry of cases) {
      const report = matrixReport(entry.name, entry.type, entry.answers);
      expect(report.contentQuality?.status).toBe("passed");
      expect(report.recommendations.length).toBeGreaterThanOrEqual(3);
      expect(report.recommendations.length).toBeLessThanOrEqual(5);
      expect(auditReportLanguage(reportLanguageSections(report)).filter((issue) =>
        issue.code === "forbidden_abstract_phrase" || issue.code === "observation_agency_overreach",
      )).toEqual([]);
    }

    const personal = matrixReport("personal-dependency", "personal_scoped", matrixAnswers(2, 3, 4));
    expect(personal.developmentPathway?.every((step) => step.mode !== "scale")).toBe(true);
    const lowImpact = matrixReport("low-impact-language", "personal_observer", matrixAnswers(2, 2, 2));
    const highImpact = matrixReport("high-impact-language", "personal_observer", matrixAnswers(5, 5, 5));
    expect(lowImpact.behaviorEvidence?.find((entry) => entry.dimensionId === "A3")?.impactOrRisk).toContain("增加错误");
    expect(highImpact.behaviorEvidence?.find((entry) => entry.dimensionId === "A3")?.impactOrRisk).toContain("稳定的核查");
  });

  it("explains why a personal observer report has no organization actions", () => {
    const report = matrixReport("high-support-without-breakpoint", "personal_observer", matrixAnswers(4, 5, 4));
    const organizationActions = report.recommendations.filter((entry) => entry.dimensionId.startsWith("B"));

    expect(organizationActions).toHaveLength(0);
    expect(report.observerOrganizationNoActionReason).toMatchObject({
      reasonCode: "high_support_no_specific_breakpoint",
      title: "本次没有需要优先启动的组织行动",
    });
    expect(report.observerOrganizationNoActionReason?.explanation).toContain("不表示组织已经完美");
    expect(report.observerOrganizationNoActionReason?.watchFor).toContain("继续观察");
    expect(report.contentQuality?.status).toBe("passed");
  });

  it("handles polarized distributions and one-item organization breaks without amplifying them", () => {
    const polarized = matrixAnswers(3, 5, 4);
    Object.assign(polarized, { I01: 5, I02: 1, I03: 5, I04: 1 });
    const polarizedReport = matrixReport("polarized", "personal_observer", polarized);
    const a1 = polarizedReport.behaviorEvidence?.find((entry) => entry.dimensionId === "A1");
    expect(a1?.distributionType).toBe("mixed_polarized");
    expect(a1?.concreteBehavior).toContain("比较稳定的做法");
    expect(a1?.concreteBehavior).toContain("还需要补稳");

    const oneBreak = matrixAnswers(4, 5, 4);
    oneBreak.O10 = 1;
    const oneBreakReport = matrixReport("one-break", "personal_observer", oneBreak);
    const organizationActions = oneBreakReport.recommendations.filter((entry) => entry.dimensionId.startsWith("B"));
    expect(organizationActions.length).toBeLessThanOrEqual(1);
    expect(organizationActions.every((entry) => entry.leadMode === "shared" && entry.title.startsWith("与团队核实"))).toBe(true);
  });
});
