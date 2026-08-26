import { describe, expect, it } from "vitest";
import { createHash, verify } from "node:crypto";
import {
  BUILTIN_RULE_ARTIFACT_PUBLIC_KEY,
  BUILTIN_RULE_ARTIFACT_SIGNATURE,
  EXECUTABLE_RULE_ARTIFACT,
  HISTORICAL_RULE_ARTIFACT_V02,
  HISTORICAL_RULE_ARTIFACT_V02_HASH,
  HISTORICAL_RULE_ARTIFACT_V02_PUBLIC_KEY,
  HISTORICAL_RULE_ARTIFACT_V02_SIGNATURE,
  HISTORICAL_RULE_ARTIFACT_V03,
  HISTORICAL_RULE_ARTIFACT_V03_HASH,
  HISTORICAL_RULE_ARTIFACT_V03_PUBLIC_KEY,
  HISTORICAL_RULE_ARTIFACT_V03_SIGNATURE,
  HISTORICAL_RULE_ARTIFACT_V04,
  HISTORICAL_RULE_ARTIFACT_V04_HASH,
  HISTORICAL_RULE_ARTIFACT_V04_PUBLIC_KEY,
  HISTORICAL_RULE_ARTIFACT_V04_SIGNATURE,
  HISTORICAL_RULE_ARTIFACT_V05,
  HISTORICAL_RULE_ARTIFACT_V05_HASH,
  HISTORICAL_RULE_ARTIFACT_V05_PUBLIC_KEY,
  HISTORICAL_RULE_ARTIFACT_V05_SIGNATURE,
  HISTORICAL_RULE_ARTIFACT_V06,
  HISTORICAL_RULE_ARTIFACT_V06_HASH,
  HISTORICAL_RULE_ARTIFACT_V06_PUBLIC_KEY,
  HISTORICAL_RULE_ARTIFACT_V06_SIGNATURE,
  HISTORICAL_RULE_ARTIFACT_V07,
  HISTORICAL_RULE_ARTIFACT_V07_HASH,
  HISTORICAL_RULE_ARTIFACT_V07_PUBLIC_KEY,
  HISTORICAL_RULE_ARTIFACT_V07_SIGNATURE,
  HISTORICAL_RULE_ARTIFACT_V08,
  HISTORICAL_RULE_ARTIFACT_V08_HASH,
  HISTORICAL_RULE_ARTIFACT_V08_PUBLIC_KEY,
  HISTORICAL_RULE_ARTIFACT_V08_SIGNATURE,
  HISTORICAL_RULE_ARTIFACT_V09,
  HISTORICAL_RULE_ARTIFACT_V09_HASH,
  HISTORICAL_RULE_ARTIFACT_V09_PUBLIC_KEY,
  HISTORICAL_RULE_ARTIFACT_V09_SIGNATURE,
  HISTORICAL_RULE_ARTIFACT_V092,
  HISTORICAL_RULE_ARTIFACT_V092_HASH,
  HISTORICAL_RULE_ARTIFACT_V092_PUBLIC_KEY,
  HISTORICAL_RULE_ARTIFACT_V092_SIGNATURE,
  VERSION_TUPLE,
  type RawAnswer,
} from "@ai-readiness/contracts";
import {
  QUESTIONNAIRE_ITEMS,
  aggregateScoreSnapshots,
  itemIdsForTarget,
  scoreAnswers,
} from "@ai-readiness/domain";
import {
  ACTION_LIBRARY_AUDIT,
  buildOrganizationBenchmark,
  buildReportSnapshot,
  computeReportContentHash,
  verifyFrozenReportSnapshot,
  verifyReportSnapshot,
} from "./index.js";

const highAnswers = Object.fromEntries(
  QUESTIONNAIRE_ITEMS.map((item) => [item.id, 5 as const]),
);

describe("deterministic report snapshots", () => {
  it("publishes report template v0.9 while retaining valid signed historical artifacts", () => {
    const canonical = (value: unknown): string => {
      if (value === null || typeof value !== "object") return JSON.stringify(value);
      if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
        .join(",")}}`;
    };
    expect(VERSION_TUPLE.reportTemplateVersion).toBe("v0.9.3");
    for (const [artifact, hash, publicKey, signature] of [
      [HISTORICAL_RULE_ARTIFACT_V02, HISTORICAL_RULE_ARTIFACT_V02_HASH, HISTORICAL_RULE_ARTIFACT_V02_PUBLIC_KEY, HISTORICAL_RULE_ARTIFACT_V02_SIGNATURE],
      [HISTORICAL_RULE_ARTIFACT_V03, HISTORICAL_RULE_ARTIFACT_V03_HASH, HISTORICAL_RULE_ARTIFACT_V03_PUBLIC_KEY, HISTORICAL_RULE_ARTIFACT_V03_SIGNATURE],
      [HISTORICAL_RULE_ARTIFACT_V04, HISTORICAL_RULE_ARTIFACT_V04_HASH, HISTORICAL_RULE_ARTIFACT_V04_PUBLIC_KEY, HISTORICAL_RULE_ARTIFACT_V04_SIGNATURE],
      [HISTORICAL_RULE_ARTIFACT_V05, HISTORICAL_RULE_ARTIFACT_V05_HASH, HISTORICAL_RULE_ARTIFACT_V05_PUBLIC_KEY, HISTORICAL_RULE_ARTIFACT_V05_SIGNATURE],
      [HISTORICAL_RULE_ARTIFACT_V06, HISTORICAL_RULE_ARTIFACT_V06_HASH, HISTORICAL_RULE_ARTIFACT_V06_PUBLIC_KEY, HISTORICAL_RULE_ARTIFACT_V06_SIGNATURE],
      [HISTORICAL_RULE_ARTIFACT_V07, HISTORICAL_RULE_ARTIFACT_V07_HASH, HISTORICAL_RULE_ARTIFACT_V07_PUBLIC_KEY, HISTORICAL_RULE_ARTIFACT_V07_SIGNATURE],
      [HISTORICAL_RULE_ARTIFACT_V08, HISTORICAL_RULE_ARTIFACT_V08_HASH, HISTORICAL_RULE_ARTIFACT_V08_PUBLIC_KEY, HISTORICAL_RULE_ARTIFACT_V08_SIGNATURE],
      [HISTORICAL_RULE_ARTIFACT_V09, HISTORICAL_RULE_ARTIFACT_V09_HASH, HISTORICAL_RULE_ARTIFACT_V09_PUBLIC_KEY, HISTORICAL_RULE_ARTIFACT_V09_SIGNATURE],
      [HISTORICAL_RULE_ARTIFACT_V092, HISTORICAL_RULE_ARTIFACT_V092_HASH, HISTORICAL_RULE_ARTIFACT_V092_PUBLIC_KEY, HISTORICAL_RULE_ARTIFACT_V092_SIGNATURE],
    ] as const) {
      const bytes = Buffer.from(canonical(artifact));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(hash);
      expect(verify(null, bytes, publicKey, Buffer.from(signature, "base64"))).toBe(true);
    }
    const currentBytes = Buffer.from(canonical(EXECUTABLE_RULE_ARTIFACT));
    expect(
      verify(
        null,
        currentBytes,
        BUILTIN_RULE_ARTIFACT_PUBLIC_KEY,
        Buffer.from(BUILTIN_RULE_ARTIFACT_SIGNATURE, "base64"),
      ),
    ).toBe(true);
  });

  it("builds a full personal observer report without claiming an organization consensus", () => {
    const score = scoreAnswers(highAnswers);
    const report = buildReportSnapshot({
      tenantId: "tenant-personal",
      campaignId: "campaign-personal-observer",
      reportType: "personal_observer",
      subjectLabel: "你的个人报告",
      score,
    });
    expect(report.reportType).toBe("personal_observer");
    expect(report.evidenceBasis).toBe("individual_self_assessment");
    expect(report.evidenceBoundary).toContain("不是公司正式诊断");
    expect(report.metricNarratives?.map((entry) => entry.metricId)).toEqual([
      "employeeAiCapability",
      "organizationalAiReadiness",
      "realizedAiImpact",
    ]);
    const observedOrganization = report.metricNarratives?.find(
      (entry) => entry.metricId === "organizationalAiReadiness",
    );
    expect(observedOrganization?.label).toBe("你感知的组织 AI 准备度");
    expect(observedOrganization?.description).toContain("你观察到");
    expect(report.overview).toContain("你感知的组织 AI 准备度 100.0 分");
    expect(report.storyline?.boundary).toContain("两者不能平均为一个整体成熟度");
    expect(report.profileNarrative?.boundaryNotice?.text).toContain("不代表公司正式诊断");
    expect(report.diagnoses.map((entry) => entry.dimensionId)).toHaveLength(8);
    expect(report.developmentPathway).toHaveLength(8);
    expect(report.score.classificationId).not.toBeNull();
  });

  it("builds v0.9 overall profiles with separate axis stages and traceable evidence", () => {
    const all = (raw: 1 | 2 | 3 | 4 | 5) =>
      Object.fromEntries(QUESTIONNAIRE_ITEMS.map((item) => [item.id, raw])) as Record<string, RawAnswer>;
    const cases = [
      [all(1), "governance_before_scaling"],
      [all(2), "governance_before_scaling"],
      [all(3), "mixed_readiness"],
      [all(4), "mature_validation"],
      [all(5), "mature_validation"],
    ] as const;
    for (const [answers, archetypeId] of cases) {
      const report = buildReportSnapshot({
        tenantId: "tenant-profile-v07",
        campaignId: `campaign-profile-${archetypeId}-${answers.I01}`,
        reportType: "personal_observer",
        subjectLabel: "总体画像门槛测试",
        score: scoreAnswers(answers),
        createdAt: new Date("2026-08-16T00:00:00Z"),
      });
      expect(report.versions.reportTemplateVersion).toBe("v0.9.3");
      expect(report.profileNarrative?.archetypeId).toBe(archetypeId);
      expect(report.profileNarrative?.paragraphs).toHaveLength(4);
      expect(report.profileNarrative?.paragraphs.every((paragraph) => paragraph.evidenceIds.length > 0)).toBe(true);
      if (answers.I01 === 1 || answers.I01 === 2) {
        expect(JSON.stringify(report.profileNarrative)).not.toMatch(/已形成|相对扎实|较稳定优势/);
        expect(report.strengths).toEqual([]);
      }
      if (answers.I01 === 3) {
        expect(JSON.stringify(report.profileNarrative)).not.toContain("较稳定优势门槛");
        expect(report.strengths).toEqual([]);
      }
      if (answers.I01 === 4 || answers.I01 === 5) {
        expect(report.strengths.map((entry) => entry.dimensionId)).toEqual([
          "A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4",
        ]);
        expect(report.developmentAreas).toEqual([]);
        expect(report.profileNarrative?.qualityFlags).toContain("low_discrimination");
        expect(report.profileNarrative?.paragraphs[1]?.text).toContain("任务说明");
        expect(report.profileNarrative?.paragraphs[1]?.text).toContain("实际使用");
        expect(report.profileNarrative?.paragraphs[1]?.text).toContain("结果检查");
        expect(report.profileNarrative?.paragraphs[1]?.text).toContain("经验积累");
        expect(report.profileNarrative?.paragraphs[1]?.text).not.toMatch(/A1|A2|A3|A4|B1|B2|B3|B4/);
        expect(JSON.stringify(report.profileNarrative)).not.toMatch(/按维度编号|第一和第二/);
      }
    }
  });

  it("uses selected multi-item evidence and keeps personal and organization boundaries", () => {
    const answers: Record<string, RawAnswer> = Object.fromEntries(
      QUESTIONNAIRE_ITEMS.map((item) => [item.id, 3]),
    );
    Object.assign(answers, { I09: 5, I10: 5, I11: 4, I12: 2, O01: 4, O02: 4, O03: 1, O04: 1 });
    const score = scoreAnswers(answers);
    const personal = buildReportSnapshot({
      tenantId: "tenant-profile-v07-personal",
      campaignId: "campaign-profile-v07-personal",
      reportType: "personal_observer",
      subjectLabel: "个人观察画像测试",
      score,
      createdAt: new Date("2026-08-16T00:00:00Z"),
    });
    expect(personal.profileNarrative?.paragraphs.some((paragraph) => paragraph.fragmentIds.length > 0)).toBe(true);
    const formedBehavior = personal.profileNarrative?.paragraphs.find((paragraph) => paragraph.kind === "working_chain");
    expect(formedBehavior?.text).not.toContain("人工复核与升级");
    expect(formedBehavior?.fragmentIds).toContain("IF-P-A3-MIXED-POLARIZED");
    expect(JSON.stringify(personal.behaviorEvidence)).toContain("观察");
    expect(JSON.stringify(personal.profileNarrative)).not.toContain("你能够做到");

    const sourceScores = Array.from({ length: 30 }, () => score);
    const organization = buildReportSnapshot({
      tenantId: "tenant-profile-v07-organization",
      campaignId: "campaign-profile-v07-organization",
      reportType: "organization",
      subjectLabel: "组织画像测试",
      score: aggregateScoreSnapshots(sourceScores),
      sourceScores,
      sampleSize: 30,
      createdAt: new Date("2026-08-16T00:00:00Z"),
    });
    expect(JSON.stringify(organization.profileNarrative)).toContain("员工");
    expect(JSON.stringify(organization.profileNarrative)).not.toContain("个人能力");
    expect(JSON.stringify(organization.profileNarrative)).not.toContain("你能够做到");
    for (const evidenceId of organization.profileNarrative?.evidenceIds ?? [])
      expect(organization.evidenceReferences.some((reference) => reference.id === evidenceId)).toBe(true);
  });

  it("keeps profile narrative literal output stable and explains impact lag", () => {
    const answers: Record<string, RawAnswer> = Object.fromEntries(
      QUESTIONNAIRE_ITEMS.map((item) => [item.id, 3]),
    );
    for (const id of QUESTIONNAIRE_ITEMS.filter((item) => item.id.startsWith("I"))) answers[id.id] = 5;
    for (const id of QUESTIONNAIRE_ITEMS.filter((item) => item.id.startsWith("V"))) answers[id.id] = 1;
    const input = {
      tenantId: "tenant-profile-v07-deterministic",
      campaignId: "campaign-profile-v07-deterministic",
      reportType: "personal_observer" as const,
      subjectLabel: "影响滞后测试",
      score: scoreAnswers(answers),
      createdAt: new Date("2026-08-16T00:00:00Z"),
    };
    const first = buildReportSnapshot(input);
    const second = buildReportSnapshot(input);
    expect(first.profileNarrative).toEqual(second.profileNarrative);
    expect(first.profileNarrative?.archetypeId).toBe("capability_formed_impact_unstable");
    expect(first.storyline?.keyTension).toContain("个人AI实践能力与已感受到的实际影响相差");
    expect(verifyReportSnapshot(first)).toBe(true);
  });

  it("turns the A3 fallback into a concrete four-step check without repeated setup language", () => {
    const answers: Record<string, RawAnswer> = Object.fromEntries(
      QUESTIONNAIRE_ITEMS.map((item) => [item.id, 5]),
    );
    for (const item of QUESTIONNAIRE_ITEMS.filter((entry) => entry.id.startsWith("O")))
      answers[item.id] = 1;
    const report = buildReportSnapshot({
      tenantId: "tenant-a3-action",
      campaignId: "campaign-a3-action",
      reportType: "personal_observer",
      subjectLabel: "四步检查行动测试",
      score: scoreAnswers(answers),
      createdAt: new Date("2026-08-18T00:00:00Z"),
    });
    const action = report.recommendations.find((entry) => entry.dimensionId === "A3");

    expect(action?.title).toContain("拿一份真实AI结果做四步检查");
    expect(action?.action).toContain("打开原始出处核对关键说法");
    expect(action?.action).toContain("重算数字");
    expect(action?.action).toContain("遗漏或矛盾");
    expect(action?.action).toContain("敏感信息和人工批准要求");
    expect(action?.action.match(/最近三份/gu)).toHaveLength(1);
  });

  it("covers axis imbalance, impact-ahead and missing-impact profile rules", () => {
    const base = (): Record<string, RawAnswer> => Object.fromEntries(
      QUESTIONNAIRE_ITEMS.map((item) => [item.id, 3]),
    );
    const setGroup = (answers: Record<string, RawAnswer>, prefix: string, value: RawAnswer) => {
      for (const item of QUESTIONNAIRE_ITEMS.filter((entry) => entry.id.startsWith(prefix)))
        answers[item.id] = value;
      return answers;
    };

    const personalAheadAnswers = setGroup(setGroup(base(), "I", 5), "O", 1);
    const personalAhead = buildReportSnapshot({
      tenantId: "tenant-profile-axis-personal-ahead",
      campaignId: "campaign-profile-axis-personal-ahead",
      reportType: "personal_observer",
      subjectLabel: "个人领先测试",
      score: scoreAnswers(personalAheadAnswers),
    });
    expect(personalAhead.profileNarrative?.paragraphs[0]?.text).toContain("已经形成较稳定的方法");
    expect(personalAhead.profileNarrative?.paragraphs[0]?.text).toContain("较少感受到组织提供稳定支持");

    const organizationAheadAnswers = setGroup(setGroup(base(), "I", 1), "O", 5);
    const organizationAhead = buildReportSnapshot({
      tenantId: "tenant-profile-axis-organization-ahead",
      campaignId: "campaign-profile-axis-organization-ahead",
      reportType: "personal_observer",
      subjectLabel: "组织领先测试",
      score: scoreAnswers(organizationAheadAnswers),
    });
    expect(organizationAhead.storyline?.currentState).toContain("两条轴需要分别理解");
    expect(organizationAhead.storyline?.keyTension).toContain("个人AI实践能力与你观察到的组织支持条件相差100.0分");

    const impactAheadAnswers = setGroup(setGroup(base(), "I", 1), "V", 5);
    const impactAhead = buildReportSnapshot({
      tenantId: "tenant-profile-impact-ahead",
      campaignId: "campaign-profile-impact-ahead",
      reportType: "personal_observer",
      subjectLabel: "影响领先测试",
      score: scoreAnswers(impactAheadAnswers),
    });
    expect(impactAhead.profileNarrative?.archetypeId).toBe("impact_ahead_of_method");
    expect(impactAhead.storyline?.keyTension).toContain("影响可能集中在少数场景");

    const missingImpactAnswers = base();
    for (const id of ["V07", "V08", "V09", "V10"]) missingImpactAnswers[id] = null;
    const missingImpact = buildReportSnapshot({
      tenantId: "tenant-profile-impact-missing",
      campaignId: "campaign-profile-impact-missing",
      reportType: "personal_observer",
      subjectLabel: "影响缺失测试",
      score: scoreAnswers(missingImpactAnswers),
    });
    expect(missingImpact.profileNarrative?.qualityFlags).toContain("impact_insufficient");
    expect(missingImpact.storyline?.axisStages.find((entry) => entry.metricId === "realizedAiImpact")?.interpretation).toContain("数据不足");
  });
  it("keeps formal organization report language separate from personal observation", () => {
    const score = scoreAnswers(highAnswers);
    const report = buildReportSnapshot({
      tenantId: "tenant-organization-language",
      campaignId: "campaign-organization-language",
      reportType: "organization",
      subjectLabel: "组织报告表达测试",
      score,
      sampleSize: 30,
    });
    const organizationMetric = report.metricNarratives?.find(
      (entry) => entry.metricId === "organizationalAiReadiness",
    );

    expect(organizationMetric?.label).toBe("组织 AI 准备度");
    expect(organizationMetric?.description).toContain("员工群体感受到");
    expect(report.overview).toContain("组织 AI 准备度 100.0 分");
    expect(report.overview).not.toContain("你感知的");
    expect(report.resultNarrative).not.toContain("两个分数独立计算");

    const existingPersonal = buildReportSnapshot({
      tenantId: "tenant-existing-personal-language",
      campaignId: "campaign-existing-personal-language",
      reportType: "immediate_personal",
      subjectLabel: "既有个人报告表达测试",
      score,
    });
    expect(
      existingPersonal.metricNarratives?.find(
        (entry) => entry.metricId === "organizationalAiReadiness",
      )?.label,
    ).toBe("你感知的组织 AI 准备度");
    expect(existingPersonal.overview).toContain("你感知的组织 AI 准备度 100.0 分");
    expect(existingPersonal.resultNarrative).not.toContain("两个分数独立计算");
  });

  it("keeps user-facing report copy free of known mechanical phrases", () => {
    const score = scoreAnswers(highAnswers);
    for (const [reportType, sourceScores] of [
      ["immediate_personal", undefined],
      ["manager_self_assessment", [score]],
    ] satisfies Array<[
      "immediate_personal" | "manager_self_assessment",
      ReturnType<typeof scoreAnswers>[] | undefined,
    ]>) {
      const report = buildReportSnapshot({
        tenantId: "tenant-copy-quality",
        campaignId: `campaign-copy-${reportType}`,
        reportType,
        subjectLabel: "文案质量测试",
        score,
        sampleSize: 1,
        sourceScores,
      });
      const copy = JSON.stringify(report);
      expect(copy).not.toContain("更值得先处理");
      expect(copy).not.toContain("更值得先核对");
      expect(copy).not.toContain("从你的观察看");
      expect(copy).not.toContain("还不是各处都能做到的日常做法");
    }
  });

  it("describes personal organization dimensions as observations rather than personal ability", () => {
    const score = scoreAnswers({
      ...highAnswers,
      O01: 5,
      O02: 5,
      O03: 5,
      O04: 1,
    });
    const report = buildReportSnapshot({
      tenantId: "tenant-observer-language",
      campaignId: "campaign-observer-language",
      reportType: "personal_observer",
      subjectLabel: "组织环境观察表达测试",
      score,
    });
    const b1 = report.diagnoses.find((entry) => entry.dimensionId === "B1");
    const copy = b1?.visibleText.join(" ") ?? "";
    expect(copy).toContain("在你当前的工作环境中");
    expect(copy).not.toContain("你已经能同时做到");
    expect(copy).not.toContain("你能够做到");
  });
  it("passes the 64+6 action library and evidence integrity gate", () => {
    expect(ACTION_LIBRARY_AUDIT).toMatchObject({
      valid: true,
      counts: { personal: 32, organization: 32, context: 6, evidence: 10 },
      duplicateIds: [],
      missingEvidenceIds: [],
      invalidEvidenceIds: [],
      emptyContentIds: [],
      forbiddenLanguageIds: [],
      draftOnlyCount: 64,
      release: {
        status: "internal_pilot",
        expertReviewed: false,
        externalReleaseEligible: false,
      },
    });
  });

  it("makes every personal and organization action reachable by a valid score pattern", () => {
    const all = (value: 1 | 3 | 5) =>
      Object.fromEntries(QUESTIONNAIRE_ITEMS.map((item) => [item.id, value]));
    const scenarios: Array<Record<string, RawAnswer>> = [
      all(1),
      all(3),
      all(5),
      {
        ...all(5),
        ...Object.fromEntries(
          QUESTIONNAIRE_ITEMS.filter((item) => item.id.startsWith("I"))
            .map((item) => [item.id, 1 as const]),
        ),
      },
      {
        ...all(5),
        ...Object.fromEntries(
          QUESTIONNAIRE_ITEMS.filter((item) => item.id.startsWith("O"))
            .map((item) => [item.id, 1 as const]),
        ),
      },
      {
        ...all(5),
        ...Object.fromEntries(
          QUESTIONNAIRE_ITEMS.filter((item) => item.id.startsWith("V"))
            .map((item) => [item.id, 1 as const]),
        ),
      },
      {
        ...all(5),
        I05: 1,
        I06: 1,
        I07: 1,
        I08: 1,
      },
      ...QUESTIONNAIRE_ITEMS.filter(
        (item) => item.id.startsWith("I") || item.id.startsWith("O"),
      ).map((item) => ({ ...all(5), [item.id]: 1 as const })),
    ];
    const reached = { personal: new Set<string>(), organization: new Set<string>() };
    for (const [index, answers] of scenarios.entries()) {
      for (const [audience, reportType] of [
        ["personal", "immediate_personal"],
        ["organization", "organization"],
      ] as const) {
        const sourceScores =
          audience === "organization"
            ? Array.from({ length: 30 }, () => scoreAnswers(answers))
            : undefined;
        const score = sourceScores
          ? aggregateScoreSnapshots(sourceScores)
          : scoreAnswers(answers);
        const report = buildReportSnapshot({
          tenantId: "tenant-1",
          campaignId: `campaign-reachability-${audience}-${index}`,
          reportType,
          subjectLabel: "触发覆盖验证",
          score,
          sampleSize: audience === "organization" ? 30 : 1,
          sourceScores,
        });
        for (const recommendation of report.systemPlan)
          reached[audience].add(recommendation.id);
      }
    }
    expect(
      ACTION_LIBRARY_AUDIT.ids.personal.filter(
        (id) => !reached.personal.has(id),
      ),
    ).toEqual([]);
    expect(
      ACTION_LIBRARY_AUDIT.ids.organization.filter(
        (id) => !reached.organization.has(id),
      ),
    ).toEqual([]);
  });

  it("uses dimension-specific summaries instead of a repeated score-band sentence", () => {
    const score = scoreAnswers({
      ...highAnswers,
      O01: 3,
      O02: 3,
      O03: 3,
      O04: 3,
    }, new Date("2026-08-10T00:00:00Z"));
    const report = buildReportSnapshot({
      tenantId: "tenant-1",
      campaignId: "campaign-1",
      responseId: "response-1",
      reportType: "immediate_personal",
      subjectLabel: "测试员工",
      score,
      createdAt: new Date("2026-08-10T01:00:00Z"),
    });
    const summaries = [...report.strengths, ...report.developmentAreas].map(
      (entry) => entry.summary,
    );
    expect(new Set(summaries).size).toBeGreaterThan(1);
    expect(summaries.join(" ")).not.toContain("相关能力或条件已经稳定");
    expect(report.overallProfile).toHaveLength(4);
    expect(report.resultNarrative).toContain("两条轴需要分别理解");
    expect(report.classificationNarrative).toContain("这些关系只说明当前结构，不证明因果");
  });

  it("keeps literal content stable for identical inputs and versions", () => {
    const score = scoreAnswers(highAnswers, new Date("2026-08-10T00:00:00Z"));
    const input = {
      tenantId: "tenant-1",
      campaignId: "campaign-1",
      responseId: "response-1",
      reportType: "immediate_personal" as const,
      subjectLabel: "测试员工",
      score,
      createdAt: new Date("2026-08-10T01:00:00Z"),
    };
    const hashes = new Set(
      Array.from({ length: 100 }, () => buildReportSnapshot(input).contentHash),
    );
    expect(hashes.size).toBe(1);
    const report = buildReportSnapshot(input);
    expect(verifyReportSnapshot(report)).toBe(true);
    expect(
      verifyReportSnapshot({ ...report, headline: "被篡改的标题" }),
    ).toBe(false);
    const { contentHash: _contentHash, ...payload } = report;
    const historicalPayload = {
      ...payload,
      ruleManifestHash: HISTORICAL_RULE_ARTIFACT_V08.manifestHash,
      versions: HISTORICAL_RULE_ARTIFACT_V08.versions,
    } as unknown as typeof payload;
    const historical = {
      ...historicalPayload,
      contentHash: computeReportContentHash(historicalPayload),
    } as typeof report;
    expect(verifyFrozenReportSnapshot(historical)).toBe(true);
    expect(verifyReportSnapshot(historical)).toBe(false);
  });

  it("keeps employee organization summaries inside the reviewed organization boundary", () => {
    const sourceScores = Array.from({ length: 30 }, () => scoreAnswers(highAnswers));
    const report = buildReportSnapshot({
      tenantId: "tenant-1",
      campaignId: "campaign-employee-summary",
      reportType: "employee_organization_summary",
      subjectLabel: "员工可见组织摘要",
      sampleSize: 30,
      score: aggregateScoreSnapshots(sourceScores),
      sourceScores,
    });
    expect(report.diagnoses.map((entry) => entry.dimensionId)).toEqual([
      "B1", "B2", "B3", "B4",
    ]);
    expect(report.developmentPathway?.every((entry) =>
      entry.dimensionIds.every((id) => id.startsWith("B")),
    )).toBe(true);
    expect(report.recommendations.every((entry) => entry.dimensionId.startsWith("B"))).toBe(true);
    expect(report.metricNarratives?.map((entry) => entry.metricId)).toEqual([
      "organizationalAiReadiness",
    ]);
  });

  it("uses behavior-specific language and executable priority actions", () => {
    const answers = { ...highAnswers, I01: 1 as const, I02: 2 as const };
    const report = buildReportSnapshot({
      tenantId: "tenant-1",
      campaignId: "campaign-language-gate",
      reportType: "immediate_personal",
      subjectLabel: "语言验收",
      score: scoreAnswers(answers),
    });
    const visible = [
      ...report.overallProfile,
      ...report.diagnoses.flatMap((entry) => entry.visibleText),
    ].join(" ");
    for (const forbidden of [
      "仍需结合题项分布", "你较少报告", "群体较普遍报告",
      "这一维度内部表现不均衡", "做法还不够稳定",
    ]) expect(visible).not.toContain(forbidden);
    expect(visible).toContain("任务");
    expect(report.recommendations.length).toBeGreaterThanOrEqual(3);
    for (const recommendation of report.recommendations)
      expect(recommendation.action).not.toMatch(/^(检查|观察|评估|衡量)(是否|有没有|变化)/);
  });

  it("selects only qualified recommendations and never exceeds five", () => {
    const answers = {
      ...highAnswers,
      O09: 1 as const,
      O10: 1 as const,
      O11: 1 as const,
      O12: 1 as const,
    };
    const score = scoreAnswers(answers);
    const report = buildReportSnapshot({
      tenantId: "tenant-1",
      campaignId: "campaign-1",
      reportType: "organization",
      subjectLabel: "示例公司",
      score,
      sampleSize: 35,
    });
    expect(report.recommendations.length).toBeGreaterThanOrEqual(1);
    expect(report.recommendations.length).toBeLessThanOrEqual(5);
    expect(report.recommendations[0]?.dimensionId).toBe("B3");
    expect(report.systemPlan.length).toBeGreaterThanOrEqual(
      report.recommendations.length,
    );
    expect(report.recommendations[0]).toMatchObject({
      sourceStatus: "draft",
      releaseEligible: false,
      isSafetyPrerequisite: true,
    });
    expect(report.recommendations[0]?.triggerFacts.length).toBeGreaterThan(0);
  });

  it("keeps a complete pathway and useful priorities when the score is high", () => {
    const score = scoreAnswers(highAnswers);
    const report = buildReportSnapshot({
      tenantId: "tenant-1",
      campaignId: "campaign-high-pathway",
      reportType: "personal_scoped",
      subjectLabel: "高分测试员工",
      score,
    });
    expect(report.developmentPathway).toHaveLength(4);
    expect(report.recommendations.length).toBeGreaterThanOrEqual(3);
    expect(report.recommendations.length).toBeLessThanOrEqual(5);
    expect(
      report.recommendations.some((entry) =>
        entry.title.includes("验证") || entry.title.includes("扩展"),
      ),
    ).toBe(true);
    expect(new Set(report.recommendations.map((entry) => entry.action)).size).toBe(
      report.recommendations.length,
    );
  });

  it("adds deterministic pathway priorities without changing the original rule plan", () => {
    const score = scoreAnswers(highAnswers);
    const report = buildReportSnapshot({
      tenantId: "tenant-1",
      campaignId: "campaign-pathway-fallback",
      reportType: "organization_scoped",
      subjectLabel: "组织测试",
      score,
      sampleSize: 1,
    });
    expect(report.developmentPathway).toHaveLength(4);
    expect(report.recommendations.length).toBeGreaterThanOrEqual(3);
    expect(report.recommendations.length).toBeLessThanOrEqual(5);
    expect(
      report.actionRuleAudit.filter((entry) => entry.recommendationId.startsWith("REC-PATH-")),
    ).toHaveLength(report.recommendations.filter((entry) => entry.id.startsWith("REC-PATH-")).length);
    expect(report.systemPlan.every((entry) => !entry.id.startsWith("REC-PATH-"))).toBe(true);
  });

  it("selects v0.9 priorities by score band and concrete item signal", () => {
    const answers = { ...highAnswers } as Record<string, RawAnswer>;
    for (const item of QUESTIONNAIRE_ITEMS.filter((entry) => entry.dimensionId === "A1"))
      answers[item.id] = 1;
    const lowReport = buildReportSnapshot({
      tenantId: "tenant-action-v08",
      campaignId: "campaign-action-single-low",
      reportType: "personal_scoped",
      subjectLabel: "单低维测试",
      score: scoreAnswers(answers),
      createdAt: new Date("2026-08-17T00:00:00Z"),
    });
    expect(lowReport.recommendations).toHaveLength(3);
    expect(lowReport.recommendations[0]?.dimensionId).toBe("A1");
    expect(lowReport.recommendations[0]?.actionMode).toBe("improve");
    expect(lowReport.recommendations.every((entry) => Boolean(entry.selectionReason))).toBe(true);
    expect(verifyReportSnapshot({
      ...lowReport,
      recommendations: lowReport.recommendations.map((entry, index) =>
        index === 0 ? { ...entry, selectionReason: "被篡改的入选理由" } : entry,
      ),
    })).toBe(false);

    const signalAnswers = { ...highAnswers } as Record<string, RawAnswer>;
    for (const item of QUESTIONNAIRE_ITEMS.filter((entry) => entry.dimensionId === "A2"))
      signalAnswers[item.id] = 4;
    signalAnswers.I08 = 2;
    const signalReport = buildReportSnapshot({
      tenantId: "tenant-action-v08",
      campaignId: "campaign-action-specific-signal",
      reportType: "personal_scoped",
      subjectLabel: "具体题项信号测试",
      score: scoreAnswers(signalAnswers),
      createdAt: new Date("2026-08-17T00:00:00Z"),
    });
    expect(signalReport.score.dimensions.A2.value).toBe(62.5);
    expect(signalReport.recommendations.some((entry) =>
      entry.dimensionId === "A2" && entry.actionMode === "validate" && entry.requiredFragmentIds.length > 0,
    )).toBe(true);
  });

  it("never rewrites full or mixed 100-point dimensions as deficits", () => {
    const full = buildReportSnapshot({
      tenantId: "tenant-action-v08",
      campaignId: "campaign-action-full-score",
      reportType: "personal_scoped",
      subjectLabel: "满分测试",
      score: scoreAnswers(highAnswers),
      createdAt: new Date("2026-08-17T00:00:00Z"),
    });
    expect(full.recommendations).toHaveLength(3);
    expect(full.recommendations.every((entry) => entry.actionMode === "scale" || entry.actionMode === "validate")).toBe(true);
    expect(JSON.stringify(full.recommendations)).not.toMatch(/优先改善|尚未形成|补短板/);

    const mixedAnswers = { ...highAnswers } as Record<string, RawAnswer>;
    for (const item of QUESTIONNAIRE_ITEMS.filter((entry) => entry.dimensionId === "A1"))
      mixedAnswers[item.id] = 1;
    const mixed = buildReportSnapshot({
      tenantId: "tenant-action-v08",
      campaignId: "campaign-action-mixed-full",
      reportType: "personal_scoped",
      subjectLabel: "混合满分测试",
      score: scoreAnswers(mixedAnswers),
      createdAt: new Date("2026-08-17T00:00:00Z"),
    });
    for (const entry of mixed.recommendations.filter((item) => mixed.score.dimensions[item.dimensionId].value === 100)) {
      expect(entry.actionMode === "scale" || entry.actionMode === "validate").toBe(true);
      expect(`${entry.title}${entry.selectionReason}`).not.toMatch(/优先改善|尚未形成|补短板/);
    }
  });

  it("groups personal-observer priorities into personal action and team verification", () => {
    const answers = Object.fromEntries(
      QUESTIONNAIRE_ITEMS.map((item) => [item.id, 3 as const]),
    ) as Record<string, RawAnswer>;
    answers.I12 = 1;
    answers.O09 = 1;
    answers.O10 = 1;
    const report = buildReportSnapshot({
      tenantId: "tenant-action-v08",
      campaignId: "campaign-action-observer-groups",
      reportType: "personal_observer",
      subjectLabel: "个人观察行动测试",
      score: scoreAnswers(answers),
      createdAt: new Date("2026-08-17T00:00:00Z"),
    });
    const personal = report.recommendations.filter((entry) => entry.dimensionId.startsWith("A"));
    const organization = report.recommendations.filter((entry) => entry.dimensionId.startsWith("B"));
    expect(report.recommendations.length).toBeGreaterThanOrEqual(3);
    expect(report.recommendations.length).toBeLessThanOrEqual(5);
    expect(personal.length).toBeGreaterThanOrEqual(2);
    expect(personal.length).toBeLessThanOrEqual(3);
    expect(organization.length).toBeGreaterThanOrEqual(1);
    expect(organization.length).toBeLessThanOrEqual(2);
    for (const entry of organization) {
      expect(entry.title).toContain("与团队核实");
      expect(entry.selectionReason).toContain("个人观察");
      expect(entry.action).toContain("核对");
      expect(entry.leadMode).toBe("shared");
    }
  });

  it("deduplicates action families, caps a dimension at two and stays deterministic", () => {
    const answers = Object.fromEntries(
      QUESTIONNAIRE_ITEMS.map((item) => [item.id, 1 as const]),
    ) as Record<string, RawAnswer>;
    const input = {
      tenantId: "tenant-action-v08",
      campaignId: "campaign-action-multi-low",
      reportType: "organization" as const,
      subjectLabel: "多低维组织测试",
      score: scoreAnswers(answers),
      sampleSize: 30,
      createdAt: new Date("2026-08-17T00:00:00Z"),
    };
    const first = buildReportSnapshot(input);
    const second = buildReportSnapshot(input);
    expect(first.recommendations.length).toBeGreaterThanOrEqual(3);
    expect(first.recommendations.length).toBeLessThanOrEqual(5);
    expect(new Set(first.recommendations.map((entry) => entry.actionFamily)).size).toBe(first.recommendations.length);
    for (const dimensionId of Object.keys(first.score.dimensions))
      expect(first.recommendations.filter((entry) => entry.dimensionId === dimensionId).length).toBeLessThanOrEqual(2);
    expect(first.recommendations).toEqual(second.recommendations);
    expect(first.contentHash).toBe(second.contentHash);
  });

  it("classifies the five v0.9 item distributions deterministically", () => {
    const cases: Array<[RawAnswer[], string]> = [
      [[5, 5, 5, 5], "uniform_high"],
      [[3, 4, 4, 3], "uniform_mid_high"],
      [[3, 3, 3, 3], "uniform_mid_low"],
      [[1, 1, 1, 1], "uniform_low"],
      [[1, 5, 1, 5], "mixed_polarized"],
    ];
    const a1Items = QUESTIONNAIRE_ITEMS.filter((entry) => entry.dimensionId === "A1");
    for (const [values, expected] of cases) {
      const answers = Object.fromEntries(QUESTIONNAIRE_ITEMS.map((item) => [item.id, 3 as RawAnswer])) as Record<string, RawAnswer>;
      a1Items.forEach((item, index) => { answers[item.id] = values[index]!; });
      const report = buildReportSnapshot({
        tenantId: "tenant-distribution-v09",
        campaignId: `distribution-${expected}`,
        reportType: "personal_scoped",
        subjectLabel: "分布测试",
        score: scoreAnswers(answers),
        createdAt: new Date("2026-08-17T00:00:00Z"),
      });
      const pattern = report.itemPatternRecords.find((entry) => entry.dimensionId === "A1");
      expect(pattern?.distributionType).toBe(expected);
      expect(pattern?.distributionFragmentIds).toHaveLength(1);
      expect(pattern?.evidenceIds).toContain("E-COSMIN-MEASUREMENT-001");
    }
  });

  it("builds the generic high-personal-low-organization-impact-lag storyline without averaging stages", () => {
    const answers = Object.fromEntries(
      QUESTIONNAIRE_ITEMS.map((item) => [item.id, 3 as RawAnswer]),
    ) as Record<string, RawAnswer>;
    for (const item of QUESTIONNAIRE_ITEMS.filter((entry) => entry.id.startsWith("I"))) answers[item.id] = 5;
    for (const item of QUESTIONNAIRE_ITEMS.filter((entry) => /^O0[1-8]$/.test(entry.id))) answers[item.id] = 2;
    for (const item of QUESTIONNAIRE_ITEMS.filter((entry) => /^O(09|1[0-6])$/.test(entry.id))) answers[item.id] = 1;
    answers.V01 = 4;
    answers.V02 = 4;
    const input = {
      tenantId: "tenant-personal",
      campaignId: "scenario-high-personal-low-organization-impact-lag",
      reportType: "personal_observer" as const,
      subjectLabel: "高个人能力、低组织支持、影响滞后通用结构",
      score: scoreAnswers(answers),
      createdAt: new Date("2026-08-17T00:00:00Z"),
    };
    const report = buildReportSnapshot(input);
    const replay = buildReportSnapshot(input);
    expect(report.score.dimensions).toMatchObject({
      A1: { value: 100 }, A2: { value: 100 }, A3: { value: 100 }, A4: { value: 100 },
      B1: { value: 25 }, B2: { value: 25 }, B3: { value: 0 }, B4: { value: 0 },
    });
    expect(report.score.employeeAiCapability.value).toBe(100);
    expect(report.score.organizationalAiReadiness.value).toBe(12.5);
    expect(report.score.realizedAiImpact.value).toBe(55);
    expect(report.score.classificationId).toBe("BLOCKED_AGENCY");
    expect(report.storyline?.strengthDimensionIds).toEqual(["A1", "A2", "A3", "A4"]);
    expect(report.storyline?.developmentDimensionIds).toEqual(["B3", "B4", "B1", "B2"]);
    expect(report.storyline?.keyTension).toContain("相差87.5分");
    expect(report.storyline?.keyTension).toContain("相差45.0分");
    expect(report.storyline?.boundary).toContain("不能平均为一个整体成熟度");
    for (const dimensionId of ["A1", "A2", "A3", "A4"] as const) {
      const evidence = report.behaviorEvidence?.find((entry) => entry.dimensionId === dimensionId);
      expect(evidence?.distributionType).toBe("uniform_high");
      expect(evidence?.strengthBehaviors).toHaveLength(4);
      expect(evidence?.concreteBehavior.length).toBeGreaterThan(40);
    }
    for (const dimensionId of ["B1", "B2", "B3", "B4"] as const) {
      const evidence = report.behaviorEvidence?.find((entry) => entry.dimensionId === dimensionId);
      expect(evidence?.distributionType).toBe("uniform_low");
      expect(evidence?.developmentBehaviors.length).toBeGreaterThanOrEqual(2);
      expect(evidence?.developmentBehaviors.length).toBeLessThanOrEqual(3);
      expect(evidence?.boundary).toContain("个人观察");
    }
    expect(report.recommendations[0]).toMatchObject({ dimensionId: "B3", actionMode: "improve" });
    expect(report.recommendations.every((entry) => entry.actionMode !== "scale")).toBe(true);
    expect(report.recommendations.filter((entry) => entry.dimensionId.startsWith("A"))).toHaveLength(3);
    expect(report.recommendations.filter((entry) => entry.dimensionId.startsWith("B"))).toHaveLength(2);
    expect(report.developmentPathway?.every((entry) => entry.mode !== "scale")).toBe(true);
    const visible = JSON.stringify({
      headline: report.headline,
      result: report.resultNarrative,
      classification: report.classificationNarrative,
      profile: report.profileNarrative,
      actions: report.recommendations,
      pathway: report.developmentPathway,
    });
    expect(visible).not.toMatch(/整体正从初步实践走向稳定应用|补齐工具|权限不足|工作重构条件来承接|比较成熟用法|有边界地扩展/);
    expect(report.contentHash).toBe(replay.contentHash);
    expect(report.storyline).toEqual(replay.storyline);
  });

  it("uses enabled background facts without inferring missing context", () => {
    const score = scoreAnswers(
      Object.fromEntries(
        itemIdsForTarget("personal").map((id) => [id, 3 as const]),
      ),
    );
    const noBackground = buildReportSnapshot({
      tenantId: "tenant-1",
      campaignId: "campaign-no-background",
      reportType: "personal_scoped",
      subjectLabel: "测试员工",
      score,
    });
    expect(noBackground.systemPlan.some((entry) => entry.id.includes("CTX"))).toBe(false);
    const accessGap = buildReportSnapshot({
      tenantId: "tenant-1",
      campaignId: "campaign-access-gap",
      reportType: "personal_scoped",
      subjectLabel: "测试员工",
      score,
      backgroundAnswers: { BG03: "1" },
    });
    expect(accessGap.systemPlan).toContainEqual(
      expect.objectContaining({ id: "REC-P-CTX-ACCESS" }),
    );
  });

  it("requires two group answers and a thirty percent context signal", () => {
    const sourceScores = Array.from({ length: 2 }, () =>
      scoreAnswers(
        Object.fromEntries(
          itemIdsForTarget("organization").map((id) => [id, 3 as const]),
        ),
      ),
    );
    const report = buildReportSnapshot({
      tenantId: "tenant-1",
      campaignId: "campaign-org-context",
      reportType: "organization_scoped",
      subjectLabel: "测试组织",
      score: aggregateScoreSnapshots(sourceScores),
      sourceScores,
      sourceBackgroundAnswers: [{ BG03: "1" }, { BG03: "4" }],
    });
    expect(report.systemPlan).toContainEqual(
      expect.objectContaining({ id: "REC-O-CTX-ACCESS" }),
    );
  });

  it("suppresses scaling when judgment or governance is at S1", () => {
    const answers = { ...highAnswers };
    Object.assign(answers, { I09: 1, I10: 1, I11: 1, I12: 1 });
    const report = buildReportSnapshot({
      tenantId: "tenant-1",
      campaignId: "campaign-scaling-blocked",
      reportType: "organization",
      subjectLabel: "测试组织",
      score: scoreAnswers(answers),
      sampleSize: 30,
    });
    expect(report.systemPlan.some((entry) => entry.isScalingAction)).toBe(false);
  });

  it("only exposes departments at the protected sample threshold", () => {
    const score = scoreAnswers(highAnswers, new Date("2026-08-10T00:00:00Z"));
    const repeat = (count: number) => Array.from({ length: count }, () => score);
    expect(() => buildOrganizationBenchmark(repeat(1))).toThrow(
      "ORGANIZATION_BENCHMARK_REQUIRES_MINIMUM_SAMPLE",
    );
    const benchmark = buildOrganizationBenchmark(repeat(43), [
      { departmentId: "od-hidden", label: "不足样本部门", scores: repeat(1) },
      { departmentId: "od-directional", label: "方向部门", scores: repeat(2) },
      { departmentId: "od-standard", label: "标准部门", scores: repeat(30) },
    ]);
    expect(benchmark.departments.map((entry) => entry.departmentId)).toEqual([
      "od-standard",
      "od-directional",
    ]);
    expect(benchmark.departments[0]?.sampleStatus).toBe("standard");
    expect(benchmark.departments[1]?.sampleStatus).toBe("directional");
    expect(benchmark.departments[1]?.classificationId).toBe("FRONTIER");
  });

  it("records the personal uneven pattern and selected item fragment", () => {
    const answers = Object.fromEntries(
      itemIdsForTarget("combined").map((id) => [id, 3 as const]),
    );
    Object.assign(answers, { I01: 4, I02: 2, I03: 4, I04: 4 });
    const report = buildReportSnapshot({
      tenantId: "tenant-1",
      campaignId: "campaign-pattern-personal",
      reportType: "immediate_personal",
      subjectLabel: "测试员工",
      score: scoreAnswers(answers),
    });
    const diagnosis = report.diagnoses.find(
      (entry) => entry.dimensionId === "A1",
    )!;
    const pattern = report.itemPatternRecords.find(
      (entry) => entry.dimensionId === "A1",
    )!;
    expect(diagnosis.diagnosisId).toBe("DX-P-A1-S3");
    expect(pattern.patternIds).toEqual([
      "PAT-P-A1-UNEVEN",
      "PAT-P-A1-MULTI-STRENGTH",
      "PAT-P-A1-SELECTED-FACETS",
    ]);
    expect(pattern.developmentFragmentIds).toEqual(["IF-P-I02-D"]);
    expect(
      pattern.suppressedItems
        .filter((entry) => ["I01", "I03", "I04"].includes(entry.itemId))
        .every((entry) => entry.reasonCode === "multi_compression"),
    ).toBe(true);
  });

  it("compresses four low items and does not invent a single weakest item", () => {
    const answers = Object.fromEntries(
      itemIdsForTarget("personal").map((id) => [id, 3 as const]),
    );
    Object.assign(answers, { I01: 2, I02: 2, I03: 2, I04: 2 });
    const report = buildReportSnapshot({
      tenantId: "tenant-1",
      campaignId: "campaign-pattern-multi",
      reportType: "personal_scoped",
      subjectLabel: "测试员工",
      score: scoreAnswers(answers),
    });
    const pattern = report.itemPatternRecords.find(
      (entry) => entry.dimensionId === "A1",
    )!;
    expect(pattern.patternIds).toEqual(["PAT-P-A1-MULTI-DEVELOPMENT"]);
    expect(pattern.developmentFragmentIds).toEqual([]);
    expect(pattern.suppressedItems).toHaveLength(4);
    expect(pattern.visibleText.join(" ")).toContain("几项基础做法都需要一起练习");
    expect(pattern.visibleText.join(" ")).toContain("把任务意图、必要背景和结果要求说清楚");
  });

  it("emits insufficient and no-signal records without placeholder prose", () => {
    const partial = scoreAnswers({ I01: 4, I02: 4 });
    const insufficient = buildReportSnapshot({
      tenantId: "tenant-1",
      campaignId: "campaign-insufficient",
      reportType: "personal_scoped",
      subjectLabel: "测试员工",
      score: partial,
    });
    expect(insufficient.diagnoses[0]).toMatchObject({
      diagnosisId: null,
      patternIds: ["PAT-P-A1-INSUFFICIENT"],
      fallbackIds: ["FB-P-INSUFFICIENT"],
    });
    const equal = scoreAnswers(
      Object.fromEntries(
        itemIdsForTarget("personal").map((id) => [id, 3 as const]),
      ),
    );
    const noSignal = buildReportSnapshot({
      tenantId: "tenant-1",
      campaignId: "campaign-no-signal",
      reportType: "personal_scoped",
      subjectLabel: "测试员工",
      score: equal,
    });
    expect(noSignal.itemPatternRecords[0]).toMatchObject({
      patternIds: ["PAT-P-A1-NO-SIGNAL"],
      fallbackIds: ["FB-P-NO-SIGNAL"],
    });
    expect(noSignal.diagnoses[0]?.visibleText.join(" ")).not.toContain(
      "需结合题项分布",
    );
  });

  it("uses paired organization samples and preserves directional status", () => {
    const sourceScores = Array.from({ length: 20 }, () => {
      const answers: Record<string, RawAnswer> = Object.fromEntries(
        itemIdsForTarget("organization").map((id) => [id, 3 as const]),
      );
      Object.assign(answers, { O09: 2, O10: 2, O11: 4, O12: 4 });
      return scoreAnswers(answers);
    });
    const report = buildReportSnapshot({
      tenantId: "tenant-1",
      campaignId: "campaign-org-pattern",
      reportType: "organization_scoped",
      subjectLabel: "测试组织",
      sampleSize: 20,
      score: aggregateScoreSnapshots(sourceScores),
      sourceScores,
    });
    const diagnosis = report.diagnoses.find(
      (entry) => entry.dimensionId === "B3",
    )!;
    const pattern = report.itemPatternRecords.find(
      (entry) => entry.dimensionId === "B3",
    )!;
    expect(diagnosis.statusId).toBe("BD-O-DIRECTIONAL");
    expect(pattern.developmentFragmentIds).toEqual([
      "IF-O-O09-D",
      "IF-O-O10-D",
    ]);
    expect(pattern.itemSignalStats.find((entry) => entry.itemId === "O09")).toMatchObject({
      pairedValidN: 20,
      lowResponseRatio: 1,
    });
  });

  it("suppresses an organization item when paired valid n is only one", () => {
    const sourceScores = Array.from({ length: 2 }, (_, index) => {
      const answers: Record<string, RawAnswer> = Object.fromEntries(
        itemIdsForTarget("organization").map((id) => [id, 3 as const]),
      );
      if (index === 0) answers.O09 = null;
      return scoreAnswers(answers);
    });
    const report = buildReportSnapshot({
      tenantId: "tenant-1",
      campaignId: "campaign-org-paired-one",
      reportType: "organization_scoped",
      subjectLabel: "测试组织",
      sampleSize: 2,
      score: aggregateScoreSnapshots(sourceScores),
      sourceScores,
    });
    const pattern = report.itemPatternRecords.find(
      (entry) => entry.dimensionId === "B3",
    )!;
    expect(pattern.fallbackIds).toContain("FB-O-ITEM-INSUFFICIENT:O09");
    expect(pattern.suppressedItems).toContainEqual(
      expect.objectContaining({
        itemId: "O09",
        reasonCode: "paired_sample_insufficient",
      }),
    );
    expect(pattern.developmentFragmentIds).not.toContain("IF-O-O09-D");
  });
});
