import { createHash, randomUUID } from "node:crypto";
import {
  EXECUTABLE_RULESET_SHA256,
  STANDARD_GROUP_SAMPLE,
  VERSION_TUPLE,
  WORKFORCE_MINIMUM_SAMPLE,
  type AssembledDiagnosis,
  type BehaviorEvidenceSnapshot,
  type ClassificationId,
  type DepartmentBenchmark,
  type DimensionId,
  type ItemPatternRecord,
  type OrganizationBenchmark,
  type ObserverOrganizationNoActionReason,
  type ReportInsight,
  type RecommendationSnapshot,
  type ActionRuleAudit,
  type ReportSnapshot,
  type ReportType,
  type RetestComparison,
  type ScoreSnapshot,
} from "@ai-readiness/contracts";
import {
  aggregateScoreSnapshots,
  DIMENSION_ITEMS,
  scoreBand,
} from "@ai-readiness/domain";
import {
  DIMENSION_LABELS,
  dimensionSummary,
} from "./content.js";
import { buildActionPlan } from "./actions.js";
import { EVIDENCE_REGISTRY } from "./actions.js";
import { assembleDiagnoses, ITEM_SUBDIMENSION_LABELS } from "./diagnosis.js";
import { buildProfileNarrative } from "./profile.js";
import { buildBehaviorEvidence, buildReportStoryline } from "./storyline.js";
import { auditReportContent } from "./quality.js";
import {
  buildDevelopmentPathway,
  completePriorityActions,
} from "./pathway.js";

export interface BuildReportInput {
  tenantId: string;
  campaignId: string;
  responseId?: string | null;
  reportType: ReportType;
  subjectLabel: string;
  sampleSize?: number;
  score: ScoreSnapshot;
  status?: "draft" | "published";
  createdAt?: Date;
  organizationBenchmark?: OrganizationBenchmark | null;
  retestComparison?: RetestComparison | null;
  sourceScores?: ScoreSnapshot[];
  itemPatternRecords?: ItemPatternRecord[];
  diagnoses?: AssembledDiagnosis[];
  backgroundAnswers?: Record<string, string>;
  sourceBackgroundAnswers?: Array<Record<string, string>>;
  systemPlan?: RecommendationSnapshot[];
  recommendations?: RecommendationSnapshot[];
  actionRuleAudit?: ActionRuleAudit[];
}

const PERSONAL_TYPES: ReportType[] = [
  "immediate_personal",
  "second_stage_personal",
  "personal_scoped",
  "personal_observer",
];
type ReportAudience = "personal" | "organization" | "manager";

function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) as string;
  if (Array.isArray(value))
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

function hashPayload(report: Omit<ReportSnapshot, "contentHash">) {
  return {
    contentHashAlgorithm: report.contentHashAlgorithm,
    ruleManifestHash: report.ruleManifestHash,
    campaignId: report.campaignId,
    responseId: report.responseId,
    reportType: report.reportType,
    subjectLabel: report.subjectLabel,
    sampleSize: report.sampleSize,
    scoreHash: report.score.inputHash,
    headline: report.headline,
    overview: report.overview,
    ...(report.metricNarratives
      ? { metricNarratives: report.metricNarratives }
      : {}),
    resultNarrative: report.resultNarrative,
    classificationNarrative: report.classificationNarrative,
    organizationBenchmark: report.organizationBenchmark,
    retestComparison: report.retestComparison,
    evidenceBasis: report.evidenceBasis,
    evidenceBoundary: report.evidenceBoundary,
    strengths: report.strengths,
    developmentAreas: report.developmentAreas,
    ...(report.profileNarrative
      ? { profileNarrative: report.profileNarrative }
      : {}),
    ...(report.behaviorEvidence
      ? { behaviorEvidence: report.behaviorEvidence }
      : {}),
    ...(report.storyline
      ? { storyline: report.storyline }
      : {}),
    ...(report.contentQuality
      ? { contentQuality: report.contentQuality }
      : {}),
    ...(report.observerOrganizationNoActionReason
      ? { observerOrganizationNoActionReason: report.observerOrganizationNoActionReason }
      : {}),
    overallProfile: report.overallProfile,
    ...(report.developmentPathway
      ? { developmentPathway: report.developmentPathway }
      : {}),
    itemPatternRecords: report.itemPatternRecords,
    diagnoses: report.diagnoses,
    systemPlan: report.systemPlan,
    recommendations: report.recommendations,
    actionRuleAudit: report.actionRuleAudit,
    evidenceReferences: report.evidenceReferences,
    versions: report.versions,
  };
}

export function computeReportContentHash(
  report: Omit<ReportSnapshot, "contentHash">,
): string {
  return createHash("sha256")
    .update(canonicalJson(hashPayload(report)))
    .digest("hex");
}

export function verifyReportSnapshot(report: ReportSnapshot): boolean {
  if (report.ruleManifestHash !== EXECUTABLE_RULESET_SHA256) return false;
  return verifyFrozenReportSnapshot(report);
}

// Historical verification intentionally does not compare against the current
// executable manifest. The repository first proves that the snapshot points to
// its own retained, signed rule release; this function then verifies the frozen
// report payload without rerunning today's rules or templates.
export function verifyFrozenReportSnapshot(report: ReportSnapshot): boolean {
  const { contentHash, ...withoutHash } = report;
  return (
    computeReportContentHash(withoutHash) === contentHash
  );
}

function dimensionsFor(type: ReportType): DimensionId[] {
  if (type === "personal_scoped") return ["A1", "A2", "A3", "A4"];
  if (
    type === "organization_scoped" ||
    type === "manager_self_assessment" ||
    type === "employee_organization_summary"
  )
    return ["B1", "B2", "B3", "B4"];
  return ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"];
}

function insight(
  score: ScoreSnapshot,
  id: DimensionId,
  audience: ReportAudience,
): ReportInsight | null {
  const value = score.dimensions[id].value;
  const band = scoreBand(value);
  if (value === null || band === null) return null;
  const relevant = DIMENSION_ITEMS[id]
    .map((itemId) => [itemId, score.items[itemId]] as const)
    .filter(
      (entry): entry is readonly [string, number] =>
        typeof entry[1] === "number",
    );
  const low = [...relevant].sort(
    (a, b) => a[1] - b[1] || a[0].localeCompare(b[0]),
  )[0];
  return {
    dimensionId: id,
    label: DIMENSION_LABELS[id],
    score: value,
    summary: dimensionSummary(id, band, audience),
    itemSignal:
      low && Math.max(...relevant.map((entry) => entry[1])) - low[1] >= 50
        ? `其中“${ITEM_SUBDIMENSION_LABELS[low[0]] ?? low[0]}”与同维度其他行为差距较大，适合结合一个真实任务确认它在哪个环节不稳定。`
        : undefined,
  };
}

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

export function buildOrganizationBenchmark(
  scores: ScoreSnapshot[],
  departmentGroups: Array<{
    departmentId: string;
    label: string;
    scores: ScoreSnapshot[];
  }> = [],
): OrganizationBenchmark {
  if (scores.length < WORKFORCE_MINIMUM_SAMPLE)
    throw new Error("ORGANIZATION_BENCHMARK_REQUIRES_MINIMUM_SAMPLE");
  const metricMedian = (select: (score: ScoreSnapshot) => number | null) =>
    median(
      scores.map(select).filter((value): value is number => value !== null),
    );
  const dimensionIds: DimensionId[] = [
    "A1",
    "A2",
    "A3",
    "A4",
    "B1",
    "B2",
    "B3",
    "B4",
  ];
  const dimensions = Object.fromEntries(
    dimensionIds.map((id) => [
      id,
      metricMedian((score) => score.dimensions[id].value),
    ]),
  ) as Record<DimensionId, number | null>;
  const counts = new Map<ClassificationId, number>();
  for (const score of scores)
    if (score.classificationId)
      counts.set(
        score.classificationId,
        (counts.get(score.classificationId) ?? 0) + 1,
      );
  const classified = [...counts.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  const departments: DepartmentBenchmark[] = departmentGroups
    .filter((group) => group.scores.length >= WORKFORCE_MINIMUM_SAMPLE)
    .map((group) => {
      const score = aggregateScoreSnapshots(group.scores);
      return {
        departmentId: group.departmentId,
        label: group.label,
        sampleSize: group.scores.length,
        sampleStatus:
          group.scores.length >= STANDARD_GROUP_SAMPLE
            ? ("standard" as const)
            : ("directional" as const),
        employeeAiCapability: score.employeeAiCapability.value,
        organizationalAiReadiness: score.organizationalAiReadiness.value,
        realizedAiImpact: score.realizedAiImpact.value,
        classificationId: score.classificationId,
        dimensions: Object.fromEntries(
          dimensionIds.map((id) => [id, score.dimensions[id].value]),
        ) as Record<DimensionId, number | null>,
      };
    })
    .sort(
      (left, right) =>
        right.sampleSize - left.sampleSize ||
        left.label.localeCompare(right.label, "zh-CN"),
    );
  return {
    sampleSize: scores.length,
    sampleStatus: scores.length >= STANDARD_GROUP_SAMPLE ? "standard" : "directional",
    metrics: {
      employeeAiCapability: metricMedian(
        (score) => score.employeeAiCapability.value,
      ),
      organizationalAiReadiness: metricMedian(
        (score) => score.organizationalAiReadiness.value,
      ),
      realizedAiImpact: metricMedian((score) => score.realizedAiImpact.value),
    },
    dimensions,
    classificationDistribution: Object.fromEntries(
      [...counts].map(([id, count]) => [
        id,
        {
          count,
          percentage: classified
            ? Number(((count / classified) * 100).toFixed(1))
            : 0,
        },
      ]),
    ),
    departments,
  };
}

export function buildRetestComparison(input: {
  baselineCampaignId: string;
  baselineReport: ReportSnapshot;
  currentScore: ScoreSnapshot;
  currentSampleSize: number;
}): RetestComparison {
  const delta = (current: number | null, baseline: number | null) =>
    current === null || baseline === null
      ? null
      : Number((current - baseline).toFixed(1));
  const dimensionIds: DimensionId[] = [
    "A1",
    "A2",
    "A3",
    "A4",
    "B1",
    "B2",
    "B3",
    "B4",
  ];
  return {
    baselineCampaignId: input.baselineCampaignId,
    baselineReportId: input.baselineReport.id,
    baselineCreatedAt: input.baselineReport.createdAt,
    baselineSampleSize: input.baselineReport.sampleSize,
    currentSampleSize: input.currentSampleSize,
    metrics: {
      employeeAiCapability: delta(
        input.currentScore.employeeAiCapability.value,
        input.baselineReport.score.employeeAiCapability.value,
      ),
      organizationalAiReadiness: delta(
        input.currentScore.organizationalAiReadiness.value,
        input.baselineReport.score.organizationalAiReadiness.value,
      ),
      realizedAiImpact: delta(
        input.currentScore.realizedAiImpact.value,
        input.baselineReport.score.realizedAiImpact.value,
      ),
    },
    dimensions: Object.fromEntries(
      dimensionIds.map((id) => [
        id,
        delta(
          input.currentScore.dimensions[id].value,
          input.baselineReport.score.dimensions[id].value,
        ),
      ]),
    ) as Record<DimensionId, number | null>,
    caveat:
      "变化表示两次有效样本的描述性差异；样本构成、施测环境或业务变化都可能影响结果，不能据此认定某项干预已经产生因果效果。",
  };
}

function buildObserverOrganizationNoActionReason(
  evidence: BehaviorEvidenceSnapshot[],
  score: ScoreSnapshot,
): ObserverOrganizationNoActionReason {
  const valid = evidence.filter((entry) => entry.score !== null);
  const fragments = uniqueStrings(evidence.flatMap((entry) => entry.sourceFragmentIds));
  const evidenceIds = uniqueStrings(evidence.flatMap((entry) => entry.evidenceIds));
  const dimensionIds = evidence.map((entry) => entry.dimensionId);
  if (!valid.length)
    return {
      reasonCode: "organization_data_insufficient",
      title: "这次没有足够信息筛选组织行动",
      explanation: "B类组织环境观察没有形成足够有效数据，因此不能据此判断组织支持好或不好，也不应虚构改进任务。",
      watchFor: "补充有效观察后，重点看方向是否清楚、经理是否提供工作条件、规则和人工复核是否找得到，以及岗位学习能否进入真实任务。",
      dimensionIds,
      fragmentIds: fragments,
      evidenceIds,
    };
  const allHigh = valid.every((entry) => entry.score! >= 70);
  const hasSpecificBreakpoint = valid.some((entry) =>
    entry.developmentBehaviors.length > 0 && entry.distributionType === "mixed_polarized",
  );
  if (allHigh && !hasSpecificBreakpoint)
    return {
      reasonCode: evidence.some((entry) => entry.distributionType === "insufficient")
        ? "high_support_insufficient_specific_evidence"
        : "high_support_no_specific_breakpoint",
      title: "本次没有需要优先启动的组织行动",
      explanation: "你观察到的组织支持整体较好，目前也没有足够具体的题项断点达到优先改善门槛。这不表示组织已经完美，也不等同于公司正式诊断。",
      watchFor: "继续观察方向和规则是否在不同任务中一致、经理承诺的时间和资源是否真正兑现、异常能否进入人工处理；如果这些条件反复缺失，再带着具体场景与团队核实。",
      dimensionIds,
      fragmentIds: fragments,
      evidenceIds,
    };
  return {
    reasonCode: "priority_or_responsibility_boundary",
    title: "本次先不把组织观察列为优先行动",
    explanation: "组织观察中没有出现足以进入当前优先列表的明确短板，或相关改变需要由有权限的角色负责。为避免放大次要信号，也避免把制度建设责任交给个人，本次不生成组织行动。",
    watchFor: "如果同一支持问题在多个真实任务中重复出现，或规则、人工复核、异常入口变得不清楚，请记录场景、影响和已尝试的处理，再与经理或相关团队核实。",
    dimensionIds,
    fragmentIds: fragments,
    evidenceIds,
  };
}

const uniqueStrings = (values: string[]) => [...new Set(values)];

export function buildReportSnapshot(input: BuildReportInput): ReportSnapshot {
  const audience: ReportAudience = PERSONAL_TYPES.includes(input.reportType)
    ? "personal"
    : input.reportType === "manager_self_assessment"
      ? "manager"
      : "organization";
  const evidenceBasis =
    audience === "personal"
      ? ("individual_self_assessment" as const)
      : audience === "manager"
        ? ("single_manager_self_assessment" as const)
        : ("workforce_aggregate" as const);
  const evidenceBoundary =
    ["personal_observer", "immediate_personal"].includes(input.reportType)
      ? "本报告来自你的个人作答。A类结果反映你的行为自评，B类结果反映你对所在组织环境的观察；它不是公司正式诊断，不代表其他员工的共同看法，也不用于绩效评价。"
      : audience === "personal"
      ? "本报告来自本人行为自评，用于发展性反思，不是能力认证或绩效评价。"
      : audience === "manager"
        ? "本报告仅反映一名指定管理者对组织情况的观察，不代表员工共识、群体统计或制度审计结论。"
        : "本报告反映有效样本的群体自报与共同感知，不替代业务绩效、制度检查或合规审计。";
  const dimensionIds = dimensionsFor(input.reportType);
  const assembled = input.diagnoses
    ? {
        itemPatternRecords: input.itemPatternRecords ?? [],
        diagnoses: input.diagnoses,
      }
    : assembleDiagnoses({
        score: input.score,
        dimensionIds,
        audience,
        sourceScores: input.sourceScores,
        itemPatternRecords: input.itemPatternRecords,
      });
  const { itemPatternRecords, diagnoses } = assembled;
  const allInsights = dimensionIds
    .map((id) => insight(input.score, id, audience))
    .filter((entry): entry is ReportInsight => Boolean(entry));
  const behaviorEvidence = buildBehaviorEvidence({
    score: input.score,
    patterns: itemPatternRecords,
    audience,
  });
  const storyline = buildReportStoryline({
    reportType: input.reportType,
    audience,
    score: input.score,
    evidence: behaviorEvidence,
  });
  const insightByDimension = new Map(allInsights.map((entry) => [entry.dimensionId, entry]));
  const strengths = storyline.strengthDimensionIds
    .map((id) => insightByDimension.get(id))
    .filter((entry): entry is ReportInsight => Boolean(entry));
  const developmentAreas = storyline.developmentDimensionIds
    .map((id) => insightByDimension.get(id))
    .filter((entry): entry is ReportInsight => Boolean(entry));
  const {
    systemPlan: rawSystemPlan,
    actionRuleAudit: ruleActionAudit,
  } = buildActionPlan({
    audience,
    score: input.score,
    itemPatternRecords,
    backgroundAnswers: input.backgroundAnswers,
    sourceBackgroundAnswers: input.sourceBackgroundAnswers,
    systemPlanOverride: input.systemPlan,
    recommendationsOverride: input.recommendations,
    actionRuleAuditOverride: input.actionRuleAudit,
  });
  const allowedActionDimensions = new Set(dimensionIds);
  const restrictActionsToVisibleDimensions = [
    "personal_scoped",
    "organization_scoped",
    "manager_self_assessment",
    "employee_organization_summary",
  ].includes(input.reportType);
  const actionAllowed = (entry: RecommendationSnapshot) =>
    allowedActionDimensions.has(entry.dimensionId) ||
    (input.reportType === "personal_scoped" && entry.id.startsWith("REC-P-CTX-"));
  const systemPlan = restrictActionsToVisibleDimensions
    ? rawSystemPlan.filter(actionAllowed)
    : rawSystemPlan;
  const initialPathway = buildDevelopmentPathway({
    reportType: input.reportType,
    score: input.score,
    recommendations: [],
  });
  const recommendations = completePriorityActions({
    reportType: input.reportType,
    score: input.score,
    pathway: initialPathway,
    recommendations: systemPlan,
  });
  const selectedRecommendationIds = new Set(recommendations.map((entry) => entry.id));
  const actionRuleAudit = [
    ...ruleActionAudit.map((entry) =>
      entry.status === "suppressed"
        ? entry
        : selectedRecommendationIds.has(entry.recommendationId)
          ? { ...entry, status: "selected" as const, reasonCodes: [] }
          : { ...entry, status: "qualified" as const, reasonCodes: ["priority_display_limit" as const] },
    ),
    ...recommendations
      .filter((entry) => !ruleActionAudit.some((audit) => audit.recommendationId === entry.id))
      .map((entry) => ({
        recommendationId: entry.id,
        status: "selected" as const,
        reasonCodes: [],
        triggerFacts: entry.triggerFacts,
      })),
  ].sort((left, right) =>
    left.recommendationId.localeCompare(right.recommendationId),
  );
  const developmentPathway = buildDevelopmentPathway({
    reportType: input.reportType,
    score: input.score,
    recommendations,
  });
  const organizationRecommendations = recommendations.filter((entry) => entry.dimensionId.startsWith("B"));
  const organizationEvidence = behaviorEvidence.filter((entry) => entry.dimensionId.startsWith("B"));
  const observerOrganizationNoActionReason: ObserverOrganizationNoActionReason | undefined =
    input.reportType === "personal_observer" && organizationRecommendations.length === 0
      ? buildObserverOrganizationNoActionReason(organizationEvidence, input.score)
      : undefined;
  const profileNarrative = buildProfileNarrative({
    reportType: input.reportType,
    audience,
    score: input.score,
    insights: allInsights,
    patterns: itemPatternRecords,
    diagnoses,
    evidence: behaviorEvidence,
    storyline,
  });
  const evidenceReferences = [
    ...new Set([
      ...profileNarrative.evidenceIds,
      ...storyline.evidenceIds,
      ...behaviorEvidence.flatMap((entry) => entry.evidenceIds),
      ...[...systemPlan, ...recommendations].flatMap((entry) => entry.evidenceIds),
    ]),
  ]
    .map((id) => EVIDENCE_REGISTRY[id])
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const overallProfile = profileNarrative.paragraphs.map((entry) => entry.text);
  const metricNarratives = storyline.axisStages
    .filter((entry) => entry.value !== null)
    .filter((entry) => input.reportType !== "personal_scoped" || entry.metricId !== "organizationalAiReadiness")
    .filter((entry) => !["organization_scoped", "manager_self_assessment", "employee_organization_summary"].includes(input.reportType) || entry.metricId === "organizationalAiReadiness")
    .map((entry) => ({
      metricId: entry.metricId,
      label: entry.metricId === "employeeAiCapability"
        ? "个人 AI 实践能力"
        : entry.metricId === "organizationalAiReadiness"
          ? (audience === "personal" ? "你感知的组织 AI 准备度" : "组织 AI 准备度")
          : "已实现 AI 影响",
      value: entry.value,
      levelId: entry.levelId,
      levelLabel: entry.stageLabel,
      description: entry.interpretation,
    }));
  const overview = [
    input.score.employeeAiCapability.value !== null
      ? `员工 AI 能力 ${input.score.employeeAiCapability.value.toFixed(1)} 分`
      : null,
    input.score.organizationalAiReadiness.value !== null
      ? `${audience === "personal" ? "你感知的组织 AI 准备度" : "组织 AI 准备度"} ${input.score.organizationalAiReadiness.value.toFixed(1)} 分`
      : null,
    input.score.realizedAiImpact.value !== null
      ? `已实现 AI 影响 ${input.score.realizedAiImpact.value.toFixed(1)} 分`
      : null,
  ]
    .filter(Boolean)
    .join("，");
  const createdAt = (input.createdAt ?? new Date()).toISOString();
  const resultNarrative = storyline.currentState;
  const classificationLabel = input.score.classificationId === "FRONTIER"
    ? "前沿区"
    : input.score.classificationId === "UNCLAIMED_CAPACITY"
      ? "组织待激活区"
      : input.score.classificationId === "STALLED"
        ? "停滞区"
        : input.score.classificationId === "EMERGENT"
          ? "涌现区"
          : "能力受阻区";
  const classificationNarrative = input.score.classificationId === null
    ? null
    : input.score.classificationId === "BLOCKED_AGENCY"
      ? `当前位于能力受阻区：个人AI实践能力领先于${input.reportType === "personal_observer" ? "你观察到的组织支持条件" : "组织准备度"}。先核实治理、人工复核、经理支持和学习机制，再验证成熟个人做法能否安全进入常态流程。`
      : `当前位于${classificationLabel}。${storyline.keyTension}${storyline.nextStageTheme}`;
  const organizationBenchmark = input.organizationBenchmark ?? null;
  const retestComparison = input.retestComparison ?? null;
  const contentQuality = auditReportContent({
    reportType: input.reportType,
    score: input.score,
    storyline,
    profileNarrative,
    observerOrganizationNoActionReason,
    evidence: behaviorEvidence,
    recommendations,
    pathway: developmentPathway,
    visibleTexts: [
      storyline.headline,
      storyline.currentState,
      storyline.formedBehaviorSummary,
      storyline.keyTension,
      storyline.nextStageTheme,
    ],
  });
  const withoutHash: Omit<ReportSnapshot, "contentHash"> = {
    id: randomUUID(),
    tenantId: input.tenantId,
    campaignId: input.campaignId,
    responseId: input.responseId ?? null,
    reportType: input.reportType,
    createdAt,
    status: input.status ?? (audience === "personal" ? "published" : "draft"),
    evidenceBasis,
    evidenceBoundary,
    subjectLabel: input.subjectLabel,
    sampleSize: input.sampleSize ?? 1,
    score: input.score,
    headline: storyline.headline,
    overview,
    metricNarratives,
    resultNarrative,
    classificationNarrative,
    organizationBenchmark,
    retestComparison,
    strengths,
    developmentAreas,
    overallProfile,
    profileNarrative,
    behaviorEvidence,
    storyline,
    contentQuality,
    observerOrganizationNoActionReason,
    developmentPathway,
    itemPatternRecords,
    diagnoses,
    systemPlan,
    recommendations,
    actionRuleAudit,
    evidenceReferences,
    contentHashAlgorithm: "canonical_json_sha256_v1",
    ruleManifestHash: EXECUTABLE_RULESET_SHA256,
    versions: VERSION_TUPLE,
  };
  return {
    ...withoutHash,
    contentHash: computeReportContentHash(withoutHash),
  };
}
