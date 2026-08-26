import {
  VERSION_TUPLE,
  type AssembledDiagnosis,
  type BehaviorEvidenceSnapshot,
  type DimensionId,
  type ItemPatternRecord,
  type ProfileNarrative,
  type ProfileNarrativeBlock,
  type ReportMetricId,
  type ReportStoryline,
  type ReportType,
  type ScoreSnapshot,
} from "@ai-readiness/contracts";

const METRIC_IDS: ReportMetricId[] = [
  "employeeAiCapability",
  "organizationalAiReadiness",
  "realizedAiImpact",
];

export interface BuildProfileNarrativeInput {
  reportType: ReportType;
  audience: "personal" | "organization" | "manager";
  score: ScoreSnapshot;
  insights: Array<{ dimensionId: DimensionId; label: string; score: number }>;
  patterns: ItemPatternRecord[];
  diagnoses: AssembledDiagnosis[];
  evidence: BehaviorEvidenceSnapshot[];
  storyline: ReportStoryline;
}

const unique = <T>(values: T[]): T[] => [...new Set(values)];
const trimStop = (text: string) => text.replace(/[。！？!?]+$/u, "");
const behaviorList = (entry: BehaviorEvidenceSnapshot, kind: "strength" | "development") =>
  (kind === "strength" ? entry.strengthBehaviors : entry.developmentBehaviors).slice(0, 2);

function block(
  input: BuildProfileNarrativeInput,
  kind: ProfileNarrativeBlock["kind"],
  text: string,
  dimensionIds: DimensionId[],
  metricIds: ReportMetricId[] = [],
): ProfileNarrativeBlock {
  const resolvedDimensionIds = dimensionIds.length
    ? dimensionIds
    : input.evidence.map((entry) => entry.dimensionId);
  const dimensions = new Set(resolvedDimensionIds);
  const patterns = input.patterns.filter((entry) => dimensions.has(entry.dimensionId));
  const diagnoses = input.diagnoses.filter((entry) => dimensions.has(entry.dimensionId));
  const evidence = input.evidence.filter((entry) => dimensions.has(entry.dimensionId));
  return {
    kind,
    text,
    metricIds,
    dimensionIds: unique(resolvedDimensionIds),
    diagnosisIds: diagnoses.flatMap((entry) => entry.diagnosisId ? [entry.diagnosisId] : []),
    patternIds: unique(patterns.flatMap((entry) => entry.patternIds)),
    fragmentIds: unique(evidence.flatMap((entry) => entry.sourceFragmentIds)),
    fallbackIds: unique(patterns.flatMap((entry) => entry.fallbackIds)),
    evidenceIds: unique(["E-MICROSOFT-WTI-001", ...evidence.flatMap((entry) => entry.evidenceIds)]),
  };
}

function scorePhrase(value: number | null, low: string, middle: string, high: string) {
  if (value === null) return "目前信息不足";
  return value < 55 ? low : value < 70 ? middle : high;
}

function profileTexts(input: BuildProfileNarrativeInput) {
  const capability = input.score.employeeAiCapability.value;
  const readiness = input.score.organizationalAiReadiness.value;
  const impact = input.score.realizedAiImpact.value;
  const personal = input.audience === "personal";
  const observer = input.reportType === "personal_observer";
  const aEvidence = input.evidence.filter((entry) => entry.dimensionId.startsWith("A") && entry.score !== null);
  const bEvidence = input.evidence.filter((entry) => entry.dimensionId.startsWith("B") && entry.score !== null);
  const matureA = aEvidence.filter((entry) => entry.score! >= 70);
  const matureB = bEvidence.filter((entry) => entry.score! >= 70);
  const weakA = aEvidence.filter((entry) => entry.score! < 55).sort((a, b) => a.score! - b.score! || a.dimensionId.localeCompare(b.dimensionId));
  const weakB = bEvidence.filter((entry) => entry.score! < 55).sort((a, b) => a.score! - b.score! || a.dimensionId.localeCompare(b.dimensionId));
  const mixed = input.evidence.filter((entry) => entry.distributionType === "mixed_polarized");

  const stateSubject = personal ? "你目前的AI工作方式" : input.audience === "manager" ? "这位管理者看到的团队工作方式" : "本次样本反映的共同工作方式";
  const state = `${stateSubject}${scorePhrase(capability, "还在建立基础", "已经开始成形", "已经形成较稳定的方法")}。${
    observer
      ? `与此同时，你${scorePhrase(readiness, "较少感受到组织提供稳定支持", "已经感受到部分组织支持", "观察到较完整的组织支持条件")}；${scorePhrase(impact, "实际结果变化还不明显", "部分工作结果已经出现变化", "效率、质量或工作方式上的变化已经较明显")}。`
      : input.audience === "organization"
        ? `${scorePhrase(readiness, "组织支持尚未稳定进入日常工作", "部分团队已经得到支持", "组织支持条件整体较成熟")}；${scorePhrase(impact, "实际影响仍有限", "部分结果已经变化", "多项工作结果已经出现较明显变化")}。`
        : `${scorePhrase(readiness, "组织支持仍需核实", "部分支持条件已经出现", "已经观察到较成熟的组织支持条件")}。`
  }${capability !== null && readiness !== null && Math.abs(capability - readiness) >= 15
    ? capability > readiness
      ? personal ? "个人做法走在环境支持前面，能否持续不只取决于个人努力。" : "员工实践走在组织支持前面，稳定扩展需要补上工作条件。"
      : personal ? "环境条件走在个人方法前面，当前重点是把支持转成自己能重复使用的做法。" : "组织条件走在员工实践前面，当前重点是让支持进入真实任务。"
    : "能力与支持没有形成单一领先项，更适合沿完整工作链判断下一步。"}`;

  const formed = unique(matureA.flatMap((entry) => behaviorList(entry, "strength"))).slice(0, 4);
  const organizationFormed = unique(matureB.flatMap((entry) => behaviorList(entry, "strength"))).slice(0, 3);
  const firstConcreteEvidence = input.evidence.find((entry) =>
    entry.distributionType !== "insufficient" && entry.concreteBehavior.trim(),
  );
  const workingChain = formed.length
    ? `${personal ? "在具体工作中，你已经会" : "在共同工作中，已经较常看到员工会"}${formed.join("、")}。这些行为把任务说明、实际使用、结果检查和经验积累中的${formed.length >= 3 ? "多个环节" : "部分环节"}连接了起来，说明当前优势不只是会用工具，而是开始形成可重复的工作方法。${observer && organizationFormed.length ? `组织环境方面，你还观察到${organizationFormed.join("、")}；这是组织提供的条件，不等同于个人能力。` : ""}`
    : `${personal ? "目前还没有一组个人行为稳定贯穿任务说明、实际使用、结果检查和复盘。" : "目前样本中还没有一组行为稳定贯穿任务说明、实际使用、结果检查和复盘。"}${firstConcreteEvidence ? `具体来看，${trimStop(firstConcreteEvidence.concreteBehavior)}。` : ""}${observer && organizationFormed.length ? `不过，你已经观察到${organizationFormed.join("、")}等组织支持。这是环境条件，不等同于你的个人能力，但可以成为你建立稳定方法的起点。` : "先把一个真实任务完整跑通，比同时追求更多工具或更复杂流程更重要。"}`;

  const primaryGap = weakA[0] ?? weakB[0] ?? mixed[0];
  const gapBehaviors = primaryGap ? behaviorList(primaryGap, "development") : [];
  const mixedDetail = mixed.find((entry) => entry.dimensionId === primaryGap?.dimensionId);
  const breakpoint = primaryGap
    ? `${primaryGap.dimensionId.startsWith("B") && observer ? "从你的观察看，链路目前更可能断在" : "这条工作链目前更可能断在"}${gapBehaviors.length ? gapBehaviors.join("、") : trimStop(primaryGap.concreteBehavior)}。${trimStop(primaryGap.impactOrRisk)}。${mixedDetail ? `同一维度里已有部分做法出现，说明问题不是完全没有基础，而是不同任务中的表现还不一致。` : ""}${observer && weakB.length ? "组织相关结论仍是个人观察，需要带着真实场景与团队核实。" : ""}`
    : impact !== null && capability !== null && impact + 10 < capability
      ? `个人方法已经较成熟，但实际影响没有同步跟上。现实中这常意味着做法虽然能完成任务，却还没有稳定减少返工、改善质量或释放高价值时间；下一步需要用真实结果而不是使用次数判断价值。`
      : `当前没有一个明显低分环节主导全局。更需要留意的是成熟做法在不同任务中的稳定性，以及结果变化能否持续，而不是为了寻找短板而制造短板。`;

  const next = `${trimStop(input.storyline.nextStageTheme)}。这是当前行动顺序的理由：先把最前面的依赖跑通并留下可检查记录，再决定是否进入复盘、分享或扩展；不能由个人改变的组织条件，只作为沟通和共同核实的线索。`;
  return { state, workingChain, breakpoint, next };
}

export function buildProfileNarrative(input: BuildProfileNarrativeInput): ProfileNarrative {
  const validMetrics = METRIC_IDS.filter((id) => input.score[id].value !== null);
  const texts = profileTexts(input);
  const capability = input.score.employeeAiCapability.value;
  const impact = input.score.realizedAiImpact.value;
  const paragraphs = [
    block(input, "integrated_state", texts.state, input.evidence.map((entry) => entry.dimensionId), validMetrics),
    block(input, "working_chain", texts.workingChain, input.storyline.strengthDimensionIds),
    block(input, "breakpoint_impact", texts.breakpoint, input.storyline.developmentDimensionIds),
    block(input, "next_priority", texts.next, input.storyline.actionPriorityDimensionIds),
  ];
  const boundaryNotice = block(input, "boundary", input.storyline.boundary, [], validMetrics);
  const archetypeId = input.storyline.qualityFlags.includes("dimension_insufficient")
    ? "insufficient_data"
    : capability !== null && impact !== null && capability >= 70 && impact < 55
      ? "capability_formed_impact_unstable"
      : capability !== null && impact !== null && capability < 55 && impact >= 70
        ? "impact_ahead_of_method"
        : input.storyline.qualityFlags.includes("governance_prerequisite")
          ? "governance_before_scaling"
          : input.storyline.developmentDimensionIds.length ? "mixed_readiness" : "mature_validation";
  return {
    version: VERSION_TUPLE.profileNarrativeVersion,
    archetypeId,
    headline: input.storyline.headline,
    paragraphs,
    boundaryNotice,
    evidenceIds: unique([...paragraphs, boundaryNotice].flatMap((entry) => entry.evidenceIds)),
    qualityFlags: input.storyline.qualityFlags,
  };
}
