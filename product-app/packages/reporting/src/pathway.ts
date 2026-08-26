import type {
  DevelopmentPathwayStep,
  DimensionId,
  RecommendationSnapshot,
  ReportType,
  ScoreSnapshot,
} from "@ai-readiness/contracts";
import { DIMENSION_LABELS } from "./content.js";

type Mode = DevelopmentPathwayStep["mode"];
type PathwayDefinition = {
  id: string;
  dimensionIds: DimensionId[];
  title: string;
  focus: Record<Mode, string>;
  outcome: string;
};

const modeLabels: Record<Mode, string> = {
  improve: "优先改善",
  stabilize: "建立稳定做法",
  validate: "验证真实效果",
  scale: "有边界地扩展",
};

const modeWindows: Record<Mode, string> = {
  improve: "1—2周",
  stabilize: "2—4周",
  validate: "4—6周",
  scale: "6—12周",
};

const observerVerification: Record<
  Extract<DimensionId, "B1" | "B2" | "B3" | "B4">,
  { context: string; action: string; completion: string }
> = {
  B1: {
    context: "这项建议来自你对方向表达和试验氛围的观察",
    action: "带着一个方向不清、试验受阻或不敢提出问题的具体场景，与经理核实团队目前的共同约定",
    completion: "团队明确方向、边界和问题反馈渠道，并决定是否需要进一步行动",
  },
  B2: {
    context: "这项建议来自你对经理支持和工作条件的观察",
    action: "选择一个缺少时间、资源、质量标准或经理支持的真实任务，与经理共同核对缺失条件",
    completion: "团队确认需要补充的支持条件、责任角色和下一步安排",
  },
  B3: {
    context: "这项建议来自你对规则、复核和异常处理的观察",
    action: "用一个真实AI流程核对现有工具规则、人工复核、责任归属和异常入口，并记录不清楚的地方",
    completion: "有权限的责任角色确认规则缺口，并明确补齐、暂缓或停止的处理决定",
  },
  B4: {
    context: "这项建议来自你对岗位学习和经验复用条件的观察",
    action: "选择一个需要学习支持或经验复用的真实任务，与经理核对现有练习、反馈和分享机制",
    completion: "团队明确要补充的学习支持、经验负责人和验证方式",
  },
};

const pathwayRecordFocus: Record<DimensionId, string> = {
  A1: "记录模板在哪些任务条件下有效、失效或需要调整",
  A2: "记录时间、返工、质量变化和人工接手点",
  A3: "记录发现的错误、停止或升级决定以及最终责任人",
  A4: "记录他人复用时的疑问、失败点和修改内容",
  B1: "记录员工对方向、试验边界和问题渠道的理解差异",
  B2: "记录经理承诺的时间、资源、质量标准和跟进安排",
  B3: "记录规则缺口、人工复核、异常入口和处理决定",
  B4: "记录学习内容如何进入真实任务以及经验如何被复用",
};

const pathwayActionStarts: Record<DimensionId, string> = {
  A1: "先选一个边界清楚、结果可检查的真实任务",
  A2: "先画出一个正在运行的真实工作流程",
  A3: "先抽取最近三个AI辅助产出作为样本",
  A4: "先选择一条已经整理过的个人经验",
  B1: "先选择一个方向不清或试验受阻的真实场景",
  B2: "先选择一个需要经理提供条件的真实任务",
  B3: "先选择一个已经进入日常工作的AI流程",
  B4: "先选择一个需要学习支持或经验复用的岗位任务",
};

const personalDefinitions: PathwayDefinition[] = [
  {
    id: "PATH-P-TASK",
    dimensionIds: ["A1"],
    title: "选准场景，写清任务",
    focus: {
      improve: "先从一个低风险、结果可检查的真实任务开始，写清目标、背景、限制和验收标准。",
      stabilize: "把已经尝试过的任务说明固定下来，减少不同场景中靠临时发挥的情况。",
      validate: "用不同类型的真实任务检验现有任务设计方法，确认它在哪些条件下有效。",
      scale: "提炼可复用的任务设计模板，并明确不适用场景，帮助他人在相同边界下使用。",
    },
    outcome: "形成一套能重复使用、也能说明何时不该使用 AI 的任务设计方法。",
  },
  {
    id: "PATH-P-WORKFLOW",
    dimensionIds: ["A2"],
    title: "把单点使用连成可靠流程",
    focus: {
      improve: "先把一个单点用法跑稳定，再尝试连接第二个步骤，并在中间保留人工检查。",
      stabilize: "固定输入、AI步骤、人工接手点和异常处理，让相同任务能够稳定重复。",
      validate: "比较新旧流程的时间、质量、返工和异常，判断流程改造是否真的有价值。",
      scale: "在质量门和数据边界清楚的前提下，把成熟流程扩展到相近任务或协作伙伴。",
    },
    outcome: "形成有人工质量门、可复核价值且能够持续运行的 AI 工作流。",
  },
  {
    id: "PATH-P-JUDGMENT",
    dimensionIds: ["A3"],
    title: "拿一份真实AI结果做四步检查",
    focus: {
      improve: "选一份本周会真正使用的AI结果，依次核对出处、重算数字、查找遗漏或矛盾、检查敏感信息和人工批准要求，并记录修改与采用决定。",
      stabilize: "把出处核对、数字复算、遗漏检查和敏感信息确认放进每次重要任务，保留发现问题和最终处理记录。",
      validate: "抽取最近三份真实AI结果，按出处、数字、遗漏和敏感信息四步复查，确认现有方法能否发现关键错误。",
      scale: "把已经验证有效的四步检查方法教给协作者，并明确哪些重要任务必须停下交由人判断。",
    },
    outcome: "连续三份真实结果都留有四步检查、修改内容和最终采用或停用决定。",
  },
  {
    id: "PATH-P-LEARNING",
    dimensionIds: ["A4"],
    title: "把尝试变成学习和可复用经验",
    focus: {
      improve: "建立每周小试验节奏，每次都记录预期、结果以及保留、修改或停止的结论。",
      stabilize: "把零散尝试整理成固定复盘，并开始分享成功条件、失败点和人工检查方法。",
      validate: "让同事按你的方法完成一次真实任务，用复用结果检验经验是否说得清、做得到。",
      scale: "把成熟经验整理成带适用边界和版本的模板，并持续记录质量与价值变化。",
    },
    outcome: "个人经验能够被复盘、验证和复用，而不只是停留在一次性的工具技巧。",
  },
];

const organizationDefinitions: PathwayDefinition[] = [
  {
    id: "PATH-O-DIRECTION",
    dimensionIds: ["B1"],
    title: "形成清晰方向与安全试验环境",
    focus: {
      improve: "先说明为什么做、优先做什么、不做什么，以及员工提出问题和停止试验的安全渠道。",
      stabilize: "统一领导者和经理的表达，并用真实案例演练如何处理失败、风险和不同意见。",
      validate: "通过保密访谈和情境核查，确认员工是否真的理解方向并愿意报告问题。",
      scale: "把成熟的试验约定扩展到更多团队，同时持续检查心理安全和风险边界。",
    },
    outcome: "员工知道组织要解决什么问题，也知道何时可以试、何时必须停和向谁求助。",
  },
  {
    id: "PATH-O-MANAGER",
    dimensionIds: ["B2"],
    title: "让经理把支持落到真实工作",
    focus: {
      improve: "为经理提供场景选择、质量标准、人机分工和复盘工具，并给出最小可用资源。",
      stabilize: "让经理围绕一个真实流程持续陪跑，而不是只鼓励员工增加使用次数。",
      validate: "选一个正在使用 AI 的真实流程，和员工共同列出所需时间、工具、数据和质量标准，并补齐缺失条件。",
      scale: "把有效的经理陪跑方法整理为可复制管理包，并保留业务负责人和治理角色的支持。",
    },
    outcome: "经理能够共同设计任务、定义质量、处理问题并支持有边界的工作重构。",
  },
  {
    id: "PATH-O-GOVERNANCE",
    dimensionIds: ["B3"],
    title: "建立可执行的治理和质量闭环",
    focus: {
      improve: "优先发布可查找的一页式规则，明确工具、数据、人工复核、决策权和异常入口。",
      stabilize: "为常态流程补齐版本文档、升级路径和事件记录，避免规则只停留在原则层面。",
      validate: "抽查真实流程、人工修改和异常处理，验证员工能否在工作中正确执行规则。",
      scale: "在治理门槛通过后再扩大流程和智能体应用，并持续监测质量、风险和近失事件。",
    },
    outcome: "每个常态 AI 流程都有可执行规则、人工责任、异常处理和持续改进记录。",
  },
  {
    id: "PATH-O-TALENT",
    dimensionIds: ["B4"],
    title: "形成岗位学习与经验复用系统",
    focus: {
      improve: "按岗位连接真实任务、练习、人工判断和反馈，先建立最小学习路径。",
      stabilize: "把 AI 工作改进纳入目标反馈，并认可负责任复盘、报告问题和停止无效做法。",
      validate: "用真实任务产出和他人复用结果检验学习是否转化为工作能力。",
      scale: "建立经验提交、审核、试用、更新和停用闭环，让有效做法能够跨团队复用。",
    },
    outcome: "学习与岗位任务相连，成熟经验能够被验证、更新和规模化复用。",
  },
];

function modeFor(score: number): Mode {
  if (score < 45) return "improve";
  if (score < 55) return "stabilize";
  if (score < 70) return "validate";
  return "scale";
}

function definitionsFor(reportType: ReportType) {
  if (reportType === "personal_scoped") return personalDefinitions;
  if (["organization_scoped", "manager_self_assessment", "employee_organization_summary"].includes(reportType))
    return organizationDefinitions;
  return [...personalDefinitions, ...organizationDefinitions];
}

function averageFor(
  score: ScoreSnapshot,
  dimensionIds: DimensionId[],
): number {
  const values = dimensionIds
    .map((id) => score.dimensions[id].value)
    .filter((value): value is number => value !== null);
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 50;
}

function evidenceForPathway(step: DevelopmentPathwayStep): string[] {
  if (step.dimensionIds.some((id) => id === "A3" || id === "B3"))
    return ["E-NIST-RMF-PLAYBOOK-001", "E-MICROSOFT-WTI-001"];
  if (step.id.includes("LEARNING"))
    return ["E-NASEM-HPL2-2018", "E-MICROSOFT-WTI-001"];
  if (step.id.includes("MANAGER") || step.id.includes("DIRECTION"))
    return ["E-OECD-HCAI-WORK-2025", "E-MICROSOFT-WTI-001"];
  return ["E-GOLLWITZER-SHEERAN-2006", "E-MICROSOFT-WTI-001"];
}

function leadFor(reportType: ReportType): {
  suggestedLead: string;
  leadMode: RecommendationSnapshot["leadMode"];
} {
  if (reportType === "personal_scoped")
    return { suggestedLead: "你", leadMode: "individual" };
  if (
    reportType === "immediate_personal" ||
    reportType === "second_stage_personal" ||
    reportType === "personal_observer"
  )
    return { suggestedLead: "你与直接经理", leadMode: "shared" };
  return {
    suggestedLead: "业务负责人与人力资源团队",
    leadMode: "organization",
  };
}

function scalingBlockedFor(dimensionId: DimensionId, score: ScoreSnapshot): boolean {
  return dimensionId.startsWith("A")
    ? (score.dimensions.A3.value ?? 100) < 45
    : (score.dimensions.B3.value ?? 100) < 45;
}

export function buildDevelopmentPathway(input: {
  reportType: ReportType;
  score: ScoreSnapshot;
  recommendations: RecommendationSnapshot[];
}): DevelopmentPathwayStep[] {
  return definitionsFor(input.reportType).map((definition) => {
    const scored = definition.dimensionIds
      .map((id) => ({ id, value: input.score.dimensions[id].value }))
      .filter((entry): entry is { id: DimensionId; value: number } => entry.value !== null);
    const average = scored.length
      ? scored.reduce((sum, entry) => sum + entry.value, 0) / scored.length
      : 50;
    const governanceBlocked = (input.score.dimensions.B3.value ?? 100) < 45;
    const scalingBlocked = definition.dimensionIds.some((id) => scalingBlockedFor(id, input.score)) ||
      (governanceBlocked && definition.dimensionIds.some((id) => id.startsWith("A")));
    const mode = average >= 70 && scalingBlocked ? "validate" : modeFor(average);
    const scoreText = scored.length
      ? scored.map((entry) => `${entry.id} ${entry.value.toFixed(1)}分`).join("、")
      : "当前有效数据不足";
    return {
      id: definition.id,
      dimensionIds: definition.dimensionIds,
      title: definition.title,
      description: `${scoreText}。${definition.focus[mode]}`,
      outcome: definition.outcome,
      mode,
      relatedRecommendationIds: input.recommendations
        .filter((item) => definition.dimensionIds.includes(item.dimensionId))
        .map((item) => item.id),
    };
  });
}

function actionModeFor(
  recommendation: RecommendationSnapshot,
  score: ScoreSnapshot,
): RecommendationSnapshot["actionMode"] | null {
  const value = score.dimensions[recommendation.dimensionId].value;
  if (value === null) return null;
  if (value < 45) return "improve";
  if (value < 55) return "stabilize";
  const hasSpecificSignal = recommendation.requiredFragmentIds.length > 0;
  const hasImpactGap = recommendation.triggerFacts.some((fact) => fact.includes("影响") && fact.includes("滞后"));
  const needsValidation =
    hasSpecificSignal || hasImpactGap || recommendation.isMeasurementAction ||
    recommendation.isSafetyPrerequisite || recommendation.actionFamily === "qualitative_validation";
  if (value < 70) return needsValidation ? "validate" : null;
  if (recommendation.isScalingAction) return "scale";
  return recommendation.isMeasurementAction || recommendation.actionFamily === "qualitative_validation" ||
    (recommendation.isSafetyPrerequisite && hasSpecificSignal)
    ? "validate"
    : null;
}

function selectionReasonFor(
  recommendation: RecommendationSnapshot,
  score: ScoreSnapshot,
  mode: NonNullable<RecommendationSnapshot["actionMode"]>,
): string {
  const value = score.dimensions[recommendation.dimensionId].value;
  if (value === null)
    return "当前维度有效数据不足；这项行动只用于补齐信息并核实现状，不据此判断已经存在短板。";
  const scoreText = `${value.toFixed(1)}分`;
  const dimensionLabel = DIMENSION_LABELS[recommendation.dimensionId];
  if (mode === "scale")
    return `${dimensionLabel}目前为${scoreText}，本次重点是在质量门和责任边界清楚的前提下扩展成熟做法。`;
  if (mode === "validate" && value >= 70)
    return `${dimensionLabel}目前为${scoreText}，本次重点是核对成熟做法能否跨任务稳定复现，并继续守住安全边界。`;
  if (recommendation.isSafetyPrerequisite)
    return `${dimensionLabel}目前为${scoreText}，同时触发了安全、核查或治理前置条件，因此需要优先确认。`;
  if (recommendation.requiredFragmentIds.length > 0)
    return `${dimensionLabel}目前为${scoreText}，回答中还出现了具体行为发展信号，因此优先处理这一可观察环节。`;
  if (recommendation.triggerFacts.some((fact) => fact.includes("影响") && fact.includes("滞后")))
    return `${dimensionLabel}目前为${scoreText}，同时实际影响相对滞后，因此先验证做法是否真正改善工作结果。`;
  if (recommendation.id.includes("-CTX-"))
    return `${dimensionLabel}目前为${scoreText}，已提供的工作背景显示存在现实障碍，因此需要先处理使用条件。`;
  if (mode === "improve")
    return `${dimensionLabel}目前为${scoreText}，处于需要优先改善的区间，先从一个具体、可检查的动作开始。`;
  if (mode === "stabilize")
    return `${dimensionLabel}目前为${scoreText}，已有尝试但尚不稳定，当前重点是把做法连续跑通。`;
  return `${dimensionLabel}目前为${scoreText}，没有明显短板，本次行动用于验证现有做法在真实任务中的效果。`;
}

function fallbackRecommendation(
  reportType: ReportType,
  score: ScoreSnapshot,
  step: DevelopmentPathwayStep,
): RecommendationSnapshot {
  const dimensionId = step.dimensionIds[0]!;
  const average = averageFor(score, step.dimensionIds);
  const lead = leadFor(reportType);
  const safety = step.dimensionIds.some((id) => id === "A3" || id === "B3");
  const hasValidScore = step.dimensionIds.some((id) => score.dimensions[id].value !== null);
  const mode: NonNullable<RecommendationSnapshot["actionMode"]> = hasValidScore ? step.mode : "validate";
  const action = dimensionId === "A3"
    ? mode === "scale"
      ? "选一份协作者本周会真正使用的AI结果，让对方依次核对原始出处、重算数字、查找遗漏或矛盾，并检查敏感信息和人工批准要求；你只在约定的人工质量门复核，最后共同记录修改和采用决定。"
      : "选取最近三份真实AI结果，逐份打开原始出处核对关键说法、用计算器或原数据重算数字、从收件人角度查找遗漏或矛盾，并检查敏感信息和人工批准要求；把发现的问题、修改内容和最终采用或停用决定记在同一条记录里。"
    : `${pathwayActionStarts[dimensionId]}，在${modeWindows[mode]}内完成本轮验证：${step.description.replace(/^[^。]*。/, "")}并${pathwayRecordFocus[dimensionId]}。`;
  return {
    id: `REC-${step.id}-${mode.toUpperCase()}`,
    dimensionId,
    priority: 0,
    title: hasValidScore ? `${modeLabels[mode]}：${step.title}` : `核实当前情况：${step.title}`,
    rationale: `${step.dimensionIds.join("／")} 当前平均为 ${hasValidScore ? `${average.toFixed(1)} 分` : "有效数据不足"}。`,
    action: hasValidScore
      ? action
      : "先补齐有效信息，并与相关角色核实当前做法和支持条件，再决定后续改善、验证或扩展。",
    successSignal: `${step.outcome.replace(/[。！？!?]+$/u, "")}，同时已经${pathwayRecordFocus[dimensionId]}。`,
    suggestedLead: lead.suggestedLead,
    suggestedWindow: modeWindows[mode],
    evidenceIds: evidenceForPathway(step),
    triggerFacts: [
      ...step.dimensionIds.map((id) => `当前得分${score.dimensions[id].value?.toFixed(1) ?? "数据不足"}`),
      `发展模式为${modeLabels[mode]}`,
    ],
    requiredFragmentIds: [],
    actionFamily: `pathway_${step.id.toLowerCase()}`,
    leadMode: lead.leadMode,
    evidenceStrength: "C",
    sourceStatus: "draft",
    releaseEligible: false,
    priorityScore: 100 - average + (safety ? 10 : 0),
    isSafetyPrerequisite: safety && mode !== "scale",
    isScalingAction: mode === "scale",
    isMeasurementAction: mode === "validate",
    actionMode: mode,
    selectionReason: "",
  };
}

function candidateRank(
  recommendation: RecommendationSnapshot,
  score: ScoreSnapshot,
): [number, number, number, string] {
  const scoreValue = score.dimensions[recommendation.dimensionId].value ?? 101;
  const fallback = recommendation.id.startsWith("REC-PATH-");
  const prerequisite = recommendation.dimensionId === "A3" || recommendation.dimensionId === "B3";
  const foundationOrder: Record<DimensionId, number> = { A1: 1, A2: 2, A3: 3, A4: 4, B1: 1, B2: 2, B3: 3, B4: 4 };
  const earlierPersonalGap = recommendation.dimensionId === "A4" && (["A1", "A2", "A3"] as DimensionId[])
    .some((id) => (score.dimensions[id].value ?? 100) < 45);
  const rank = recommendation.isSafetyPrerequisite && prerequisite
    ? 0
    : fallback && scoreValue >= 55
      ? 6
      : earlierPersonalGap
        ? 5
        : recommendation.requiredFragmentIds.length > 0
          ? 2
          : recommendation.triggerFacts.some((fact) => fact.includes("影响") && fact.includes("滞后"))
            ? 3
            : recommendation.id.includes("-CTX-")
              ? 4
              : 1;
  return [rank, foundationOrder[recommendation.dimensionId], scoreValue, recommendation.id];
}

/**
 * Selects three to five current priorities from the full qualified action pool.
 * The complete dimension pathway remains separate and is never used to imply
 * that a high score is a deficit.
 */
export function completePriorityActions(input: {
  reportType: ReportType;
  score: ScoreSnapshot;
  pathway: DevelopmentPathwayStep[];
  recommendations: RecommendationSnapshot[];
  minimum?: number;
  maximum?: number;
}): RecommendationSnapshot[] {
  const minimum = input.minimum ?? 3;
  const maximum = input.maximum ?? 5;
  const lowDimensionCount = input.pathway.filter(
    (step) => averageFor(input.score, step.dimensionIds) < 55,
  ).length;
  const signalCount = input.recommendations.filter(
    (entry) => entry.requiredFragmentIds.length > 0 || entry.id.includes("-CTX-"),
  ).length;
  const target = Math.min(
    maximum,
    Math.max(minimum, 3 + (lowDimensionCount >= 2 ? 1 : 0) + (lowDimensionCount >= 4 || signalCount >= 4 ? 1 : 0)),
  );
  const governanceBlocked = (input.score.dimensions.B3.value ?? 100) < 45;
  const judgmentBlocked = (input.score.dimensions.A3.value ?? 100) < 45;
  const ruleCandidates = input.recommendations.flatMap((entry) => {
    if (governanceBlocked && entry.dimensionId.startsWith("A") && (entry.isScalingAction || entry.isMeasurementAction)) return [];
    if (governanceBlocked && entry.dimensionId.startsWith("A") && (input.score.dimensions[entry.dimensionId].value ?? 0) >= 70) return [];
    if (entry.isScalingAction && scalingBlockedFor(entry.dimensionId, input.score)) return [];
    if (judgmentBlocked && entry.dimensionId === "A4" && ["peer_learning", "reusable_practice"].includes(entry.actionFamily)) return [];
    const actionMode = actionModeFor(entry, input.score);
    return actionMode
      ? [{ ...entry, actionMode, selectionReason: selectionReasonFor(entry, input.score, actionMode) }]
      : [];
  });
  const fallbackCandidates = input.pathway.flatMap((step) => {
    if (step.dimensionIds.some((id) => ruleCandidates.some((entry) => entry.dimensionId === id)))
      return [];
    const fallback = fallbackRecommendation(input.reportType, input.score, step);
    const prerequisiteValidation = governanceBlocked && step.dimensionIds.some((id) => id.startsWith("A")) && fallback.actionMode === "scale"
      ? { ...fallback, actionMode: "validate" as const, isScalingAction: false, isMeasurementAction: true, title: `验证真实效果：${step.title}` }
      : fallback;
    return [{
      ...prerequisiteValidation,
      selectionReason: selectionReasonFor(prerequisiteValidation, input.score, prerequisiteValidation.actionMode!),
    }];
  });
  const seenIds = new Set<string>();
  const pool = [...ruleCandidates, ...fallbackCandidates]
    .filter((entry) => {
      if (seenIds.has(entry.id)) return false;
      seenIds.add(entry.id);
      return true;
    })
    .sort((left, right) => {
      const a = candidateRank(left, input.score);
      const b = candidateRank(right, input.score);
      return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3].localeCompare(b[3]);
    });
  const selected: RecommendationSnapshot[] = [];
  const add = (candidate: RecommendationSnapshot, groupMaximum?: number) => {
    if (selected.length >= target) return false;
    if (selected.some((entry) => entry.id === candidate.id || entry.actionFamily === candidate.actionFamily)) return false;
    if (selected.filter((entry) => entry.dimensionId === candidate.dimensionId).length >= 2) return false;
    if (groupMaximum !== undefined) {
      const group = candidate.dimensionId.startsWith("A") ? "A" : "B";
      if (selected.filter((entry) => entry.dimensionId.startsWith(group)).length >= groupMaximum) return false;
    }
    selected.push(candidate);
    return true;
  };

  if (input.reportType === "personal_observer") {
    const observerOrganizationCandidates = pool.filter((entry) => entry.dimensionId.startsWith("B"));
    const lowOrganizationDimensions = (["B1", "B2", "B3", "B4"] as DimensionId[])
      .filter((id) => (input.score.dimensions[id].value ?? 100) < 55).length;
    const organizationMaximum = lowOrganizationDimensions >= 2 ? 2 : 1;
    const organizationEligible = lowOrganizationDimensions > 0
      ? observerOrganizationCandidates
      : observerOrganizationCandidates.filter((entry) =>
          entry.requiredFragmentIds.length > 0 && (input.score.dimensions[entry.dimensionId].value ?? 0) >= 70,
        ).slice(0, 1);
    const firstPrerequisite = organizationEligible.find((entry) =>
      entry.isSafetyPrerequisite && (input.score.dimensions[entry.dimensionId].value ?? 100) < 45,
    );
    if (firstPrerequisite) add(firstPrerequisite, organizationMaximum);
    for (const candidate of pool.filter((entry) => entry.dimensionId.startsWith("A"))) {
      if (selected.filter((entry) => entry.dimensionId.startsWith("A")).length >= 3) break;
      add(candidate, 3);
    }
    for (const candidate of organizationEligible) {
      if (selected.filter((entry) => entry.dimensionId.startsWith("B")).length >= organizationMaximum) break;
      add(candidate, organizationMaximum);
    }
    for (const candidate of pool.filter((entry) => entry.dimensionId.startsWith("A"))) add(candidate, 3);
  } else {
    for (const candidate of pool) add(candidate);
  }

  return selected.map((entry, index) => {
    const observerOrganizationAction =
      input.reportType === "personal_observer" && entry.dimensionId.startsWith("B");
    const verification = observerOrganizationAction
      ? observerVerification[entry.dimensionId as keyof typeof observerVerification]
      : null;
    return {
      ...entry,
      priority: index + 1,
      ...(observerOrganizationAction
        ? {
            title: `与团队核实：${entry.title.replace(/^(优先改善|建立稳定做法|验证真实效果|有边界地扩展)：/, "")}`,
            selectionReason: `${verification!.context}，这属于个人观察，需要先与团队共同核实。${entry.selectionReason}`,
            action: `与经理或相关团队共同核实：${verification!.action}；确认现状后，再由有权限的责任角色推进：${entry.action}`,
            successSignal: `${verification!.completion}；如决定推进，${entry.successSignal}`,
            suggestedLead: "你与经理／相关团队",
            leadMode: "shared" as const,
          }
        : {}),
    };
  });
}
