import {
  VERSION_TUPLE,
  type BehaviorEvidenceSnapshot,
  type DimensionId,
  type ItemPatternAudience,
  type ItemPatternRecord,
  type ReportAxisStage,
  type ReportMetricId,
  type ReportStoryline,
  type ReportType,
  type ScoreSnapshot,
} from "@ai-readiness/contracts";
import { scoreBand } from "@ai-readiness/domain";
import { DIMENSION_LABELS, dimensionSummary } from "./content.js";
import { ITEM_BEHAVIOR_ACTIONS } from "./diagnosis.js";

const METRICS: ReportMetricId[] = [
  "employeeAiCapability",
  "organizationalAiReadiness",
  "realizedAiImpact",
];

const DEVELOPMENT_ITEMS: Record<DimensionId, string[]> = {
  A1: ["I01", "I02", "I03"],
  A2: ["I05", "I06", "I08"],
  A3: ["I10", "I12", "I11"],
  A4: ["I13", "I15", "I16"],
  B1: ["O01", "O03", "O04"],
  B2: ["O07", "O06", "O08"],
  B3: ["O09", "O10", "O12"],
  B4: ["O13", "O14", "O16"],
};

const IMPACT_BY_STAGE: Record<DimensionId, Record<"low" | "middle" | "high" | "insufficient", string>> = {
  A1: {
    low: "任务目标、背景或完成标准不清时，AI容易给出看似完整却不合用的结果，也会增加反复修改。",
    middle: "任务说明已有基础；下一步要看它能否在不同任务里持续减少返工，并让结果更容易检查。",
    high: "清楚的任务定义已经成为优势；继续记录适用和失效条件，才能把成熟方法安全复用。",
    insufficient: "信息不足时，不据此判断任务设计能力；先补齐真实任务中的做法和结果。",
  },
  A2: {
    low: "使用停留在零散步骤时，时间收益容易被交接、返工和人工补救抵消。",
    middle: "流程已经开始形成；需要同时记录时间、质量、返工和人工接手点，确认它能稳定运行。",
    high: "较成熟的流程编排有助于减少重复劳动；扩展前仍要保留质量门、数据边界和人工接手点。",
    insufficient: "信息不足时，不判断流程成熟度；先核对一个真实流程的输入、步骤和人工检查。",
  },
  A3: {
    low: "缺少事实核查、人机分工或停止条件，会直接增加错误进入正式工作的风险。",
    middle: "核查做法已经出现；需要用真实输出检验能否发现关键错误，并明确最终责任。",
    high: "稳定的核查和责任边界能降低错误外溢；扩展应用时仍要保留人工最终判断。",
    insufficient: "信息不足时，不推断判断与核查能力；涉及重要权益的任务应继续由人负责。",
  },
  A4: {
    low: "缺少复盘和小步试验时，个人尝试容易停留在一次性技巧，也难以分清哪些做法真正有效。",
    middle: "学习和复盘已经开始；下一步要用重复验证和他人反馈确认经验是否可靠。",
    high: "持续复盘让有效经验更容易积累；分享或扩展时仍要讲清适用条件和失败点。",
    insufficient: "信息不足时，不判断学习习惯；先记录一次尝试的预期、结果和调整。",
  },
  B1: {
    low: "方向和试验边界不清时，员工可能减少尝试或不愿报告问题；这需要与团队进一步核实。",
    middle: "你已经看到部分方向和安全试验条件；还需核实不同任务和成员是否有一致理解。",
    high: "你观察到较清楚的方向和试验空间，这是组织支持条件；仍需通过团队反馈确认它是否普遍。",
    insufficient: "组织观察信息不足，暂不判断方向和试验环境。",
  },
  B2: {
    low: "缺少时间、资源或质量标准时，个人很难把AI尝试稳定地带进真实工作；这需要与经理核实。",
    middle: "你已经感受到部分经理支持；下一步要核实这些条件能否在真实任务中持续兑现。",
    high: "你观察到经理能提供较明确的工作支持，这是组织条件优势，不等同于个人能力。",
    insufficient: "组织观察信息不足，暂不判断经理支持条件。",
  },
  B3: {
    low: "规则、人工复核或异常入口不清，会限制成熟做法进入常态流程，也会增加错误和责任风险。",
    middle: "你已经看到部分治理条件；需要用真实流程核实规则是否找得到、看得懂、执行得了。",
    high: "你观察到较完整的规则、复核和异常处理条件；扩展前仍要抽查它们在真实流程中是否有效。",
    insufficient: "组织观察信息不足，暂不判断治理条件；高风险任务仍应先走人工复核。",
  },
  B4: {
    low: "岗位学习和经验复用不足时，成熟做法容易停留在少数个人或一次性试验中。",
    middle: "你已经感受到部分学习支持；下一步要核实学习是否真正进入岗位任务并产生反馈。",
    high: "你观察到学习、反馈和经验复用条件较完整，这是组织支持优势；仍需检验实际使用效果。",
    insufficient: "组织观察信息不足，暂不判断岗位学习和经验复用条件。",
  },
};

function impactFor(dimensionId: DimensionId, score: number | null): string {
  const stage = score === null ? "insufficient" : score < 55 ? "low" : score < 70 ? "middle" : "high";
  return IMPACT_BY_STAGE[dimensionId][stage];
}

const PERSONAL_STRENGTH_OPENINGS: Record<DimensionId, string> = {
  A1: "在界定任务时，你已经较稳定地会",
  A2: "进入较复杂的工作流程后，你通常能够",
  A3: "面对需要判断和核查的结果时，你会",
  A4: "在学习、复盘和经验沉淀方面，你已经能够",
  B1: "在你当前的工作环境中，较常能看到",
  B2: "从经理提供的实际支持来看，较常能感受到",
  B3: "在规则、复核和异常处理方面，较常能看到",
  B4: "在岗位学习和经验复用方面，较常能感受到",
};

const ORGANIZATION_GAP_OPENINGS: Record<DimensionId, string> = {
  A1: "任务定义方面仍较少出现",
  A2: "复杂流程中仍较少出现",
  A3: "判断、核查和责任环节仍较少出现",
  A4: "学习与经验沉淀方面仍较少出现",
  B1: "你较少看到",
  B2: "在经理支持方面，你还不常感受到",
  B3: "谈到规则、复核和异常处理，你较少看到",
  B4: "在岗位学习和经验复用上，你目前较少感受到",
};

const unique = <T>(values: T[]): T[] => [...new Set(values)];

function orderedActions(pattern: ItemPatternRecord, signal: "strength" | "development") {
  const preferred = DEVELOPMENT_ITEMS[pattern.dimensionId];
  const stats = [...pattern.itemSignalStats]
    .filter((entry): entry is typeof entry & { itemScore: number } => entry.itemScore !== null)
    .sort((left, right) => {
      const scoreOrder = signal === "strength"
        ? right.itemScore - left.itemScore
        : left.itemScore - right.itemScore;
      const leftPreference = preferred.indexOf(left.itemId);
      const rightPreference = preferred.indexOf(right.itemId);
      return scoreOrder ||
        (leftPreference < 0 ? preferred.length : leftPreference) -
          (rightPreference < 0 ? preferred.length : rightPreference) ||
        left.itemId.localeCompare(right.itemId);
    });
  const selected = pattern.distributionType === "uniform_high"
    ? stats
    : pattern.distributionType === "uniform_low"
      ? preferred.map((id) => stats.find((entry) => entry.itemId === id)).filter((entry): entry is typeof stats[number] => Boolean(entry)).slice(0, 3)
      : stats.filter((entry) => signal === "strength" ? entry.itemScore >= 75 : entry.itemScore <= 50).slice(0, 2);
  return unique(selected.map((entry) => ITEM_BEHAVIOR_ACTIONS[entry.itemId]).filter((entry): entry is string => Boolean(entry)));
}

function behaviorSentence(
  pattern: ItemPatternRecord,
  audience: ItemPatternAudience,
  strength: string[],
  development: string[],
): string {
  const label = DIMENSION_LABELS[pattern.dimensionId];
  if (pattern.distributionType === "insufficient")
    return `${label}的有效信息不足，暂不判断具体行为组合。`;
  const organizationDimension = pattern.dimensionId.startsWith("B");
  if (pattern.distributionType === "uniform_high") {
    const list = strength.join("、");
    if (audience === "personal")
      return `${PERSONAL_STRENGTH_OPENINGS[pattern.dimensionId]}${list}。`;
    if (audience === "manager") return `这位管理者观察到，${list}都较常出现。`;
    return `员工群体的回答显示，${list}在多个环节都较常出现。`;
  }
  if (pattern.distributionType === "uniform_low") {
    const list = development.join("、");
    if (audience === "personal" && organizationDimension)
      return `${ORGANIZATION_GAP_OPENINGS[pattern.dimensionId]}${list}。`;
    if (audience === "personal") return `你的回答显示，当前更需要从${list}这几项基础行为起步。`;
    if (audience === "manager") return `这位管理者较少观察到${list}，仍需员工样本和流程材料核实。`;
    return `员工群体较少感受到${list}，需要结合真实流程确认差异出现在哪里。`;
  }
  if (pattern.distributionType === "mixed_polarized") {
    const formed = strength.length ? `比较稳定的做法是${strength.join("、")}` : "部分做法已经开始出现";
    const gap = development.length ? `还需要补稳的是${development.join("、")}` : "其余环节还需要放进真实任务检验";
    if (audience === "personal" && organizationDimension)
      return `你同时观察到两种情况：${formed}；${gap}。`;
    return `${formed}；${gap}。`;
  }
  const actions = pattern.distributionType === "uniform_mid_high" ? strength : development;
  if (!actions.length)
    return `${label}的几项回答接近，说明当前表现较一致，不必人为区分单项高低。`;
  if (pattern.distributionType === "uniform_mid_high")
    return audience === "personal" && organizationDimension
      ? `你在多个情境中都观察到${actions.join("、")}，但还需要核实这些支持是否稳定。`
      : `${actions.join("、")}已经较常出现，下一步是检验它们在不同任务中的稳定性。`;
  return audience === "personal" && organizationDimension
    ? `你对${actions.join("、")}的感受整体偏弱，适合带着真实场景与团队核实。`
    : `${actions.join("、")}已经开始出现，但还没有形成稳定习惯。`;
}

export function buildBehaviorEvidence(input: {
  score: ScoreSnapshot;
  patterns: ItemPatternRecord[];
  audience: ItemPatternAudience;
}): BehaviorEvidenceSnapshot[] {
  return input.patterns.map((pattern) => {
    const score = input.score.dimensions[pattern.dimensionId].value;
    const strengthBehaviors = orderedActions(pattern, "strength");
    const developmentBehaviors = orderedActions(pattern, "development");
    const band = scoreBand(score);
    return {
      dimensionId: pattern.dimensionId,
      score,
      distributionType: pattern.distributionType,
      distributionStats: pattern.distributionStats,
      strengthBehaviors,
      developmentBehaviors,
      overallMeaning: band ? dimensionSummary(pattern.dimensionId, band, input.audience) : "有效信息不足，暂不生成维度判断。",
      concreteBehavior: behaviorSentence(pattern, input.audience, strengthBehaviors, developmentBehaviors),
      impactOrRisk: impactFor(pattern.dimensionId, score),
      boundary: pattern.dimensionId.startsWith("B") && input.audience === "personal"
        ? "这反映你对当前组织环境的个人观察，不代表员工共识或制度审计。"
        : input.audience === "organization"
          ? "这反映有效样本的群体自报，需要与流程、质量和业务结果交叉核对。"
          : input.audience === "manager"
            ? "这是一名管理者的观察，需要员工样本和实际流程进一步核实。"
            : "这来自行为自评，不是客观能力认证或绩效结论。",
      sourceFragmentIds: unique([...pattern.distributionFragmentIds, ...pattern.developmentFragmentIds, ...pattern.strengthFragmentIds]),
      evidenceIds: pattern.evidenceIds,
    };
  });
}

function axisStage(metricId: ReportMetricId, score: ScoreSnapshot, reportType: ReportType): ReportAxisStage {
  const value = score[metricId].value;
  const levelId = scoreBand(value);
  const levelLabel = levelId === "S1" ? "起步" : levelId === "S2" ? "初步形成" : levelId === "S3" ? "发展中" : levelId === "S4" ? "较成熟" : "数据不足";
  const interpretation = metricId === "employeeAiCapability"
    ? value === null ? "这一轴的数据不足。" : value >= 70 ? "相关实践已经较成熟，仍需用真实结果验证价值。" : value >= 55 ? "相关实践已有基础，但不同任务中的稳定性仍需验证。" : "相关实践仍需要从具体、低风险任务建立基础。"
    : metricId === "organizationalAiReadiness"
      ? reportType === "personal_observer"
        ? value === null ? "组织环境观察数据不足。" : value >= 70 ? "你观察到较多组织支持条件。" : value >= 55 ? "你观察到部分支持条件，但体验可能因情境而不同。" : "你较少观察到清晰方向、经理支持、可执行治理或岗位学习条件；这仍需团队核实。"
        : value === null ? "组织准备度数据不足。" : value >= 70 ? "员工群体感受到较系统的组织支持条件。" : value >= 55 ? "部分组织支持条件已经出现，但一致性仍需验证。" : "员工群体对组织支持条件的感受偏弱，需要结合真实流程确认。"
      : value === null ? "已实现AI影响数据不足。" : value >= 70 ? "多个结果维度已感受到明显变化，但仍不能替代客观绩效数据。" : value >= 55 ? "部分工作结果已经感受到变化，但范围、持续性和归因仍需验证。" : "目前感受到的实际影响仍有限，适合先建立可检查的结果记录。";
  return { metricId, value, levelId, stageLabel: levelLabel, interpretation };
}

export function buildReportStoryline(input: {
  reportType: ReportType;
  audience: ItemPatternAudience;
  score: ScoreSnapshot;
  evidence: BehaviorEvidenceSnapshot[];
}): ReportStoryline {
  const capability = input.score.employeeAiCapability.value;
  const readiness = input.score.organizationalAiReadiness.value;
  const impact = input.score.realizedAiImpact.value;
  const valid = input.evidence.filter((entry): entry is BehaviorEvidenceSnapshot & { score: number } => entry.score !== null);
  const strengths = valid.filter((entry) => entry.score >= 70).sort((a, b) => b.score - a.score || a.dimensionId.localeCompare(b.dimensionId));
  const development = valid.filter((entry) => entry.score < 55).sort((a, b) => a.score - b.score || a.dimensionId.localeCompare(b.dimensionId));
  const governanceBlocked = (input.score.dimensions.B3.value ?? 100) < 45;
  const capabilityGap = capability !== null && readiness !== null ? capability - readiness : null;
  const impactGap = capability !== null && impact !== null ? capability - impact : null;
  const personalObserver = input.reportType === "personal_observer";
  const personalReport = ["immediate_personal", "second_stage_personal", "personal_scoped", "personal_observer"].includes(input.reportType);
  const capabilityLow = capability !== null && capability < 55;
  const capabilityMature = capability !== null && capability >= 70;
  const readinessLow = readiness !== null && readiness < 55;
  const readinessMature = readiness !== null && readiness >= 70;
  const impactMature = impact !== null && impact >= 70;
  const capabilityLabel = input.audience === "organization"
    ? "员工AI实践能力"
    : input.audience === "manager"
      ? "管理者观察到的员工AI实践能力"
      : "个人AI实践能力";
  const readinessLabel = input.audience === "personal"
    ? "你观察到的组织支持条件"
    : "组织准备度";
  const currentState = personalObserver && capabilityGap !== null && capabilityGap >= 10
    ? `你的个人AI实践能力为${capability!.toFixed(1)}分，已经明显走在你观察到的组织支持条件（${readiness!.toFixed(1)}分）前面。`
    : capability !== null && readiness !== null
      ? `${capabilityLabel}为${capability.toFixed(1)}分，${readinessLabel}为${readiness.toFixed(1)}分；两条轴需要分别理解。`
      : "当前只对有足够数据的能力轴和组织轴分别作出判断。";
  const strengthExamples = unique(
    strengths
      .flatMap((entry) => entry.strengthBehaviors.slice(0, 1))
      .filter(Boolean),
  ).slice(0, 4);
  const maturePersonalDimensions = strengths.filter((entry) =>
    entry.dimensionId.startsWith("A"),
  );
  const matureOrganizationDimensions = strengths.filter((entry) =>
    entry.dimensionId.startsWith("B"),
  );
  const personalCapabilityLead = input.audience === "organization"
    ? "员工实践中"
    : input.audience === "manager"
      ? "从这位管理者观察到的员工实践看"
      : "个人能力中";
  const formedBehaviorSummary = strengths.length
    ? [
        maturePersonalDimensions.length
          ? `${personalCapabilityLead}，${maturePersonalDimensions.map((entry) => DIMENSION_LABELS[entry.dimensionId]).join("、")}已经达到较成熟水平。`
          : personalReport
            ? "个人能力暂未形成覆盖完整链路的稳定优势。"
            : "员工实践暂未形成覆盖完整链路的稳定优势。",
        maturePersonalDimensions.length && strengthExamples.length
          ? `具体表现为${strengthExamples.join("、")}。`
          : "",
        matureOrganizationDimensions.length
          ? personalObserver
            ? `组织支持方面，你观察到${matureOrganizationDimensions.map((entry) => DIMENSION_LABELS[entry.dimensionId]).join("、")}较为成熟；这是环境条件，不等同于你的个人能力。`
            : `${matureOrganizationDimensions.map((entry) => DIMENSION_LABELS[entry.dimensionId]).join("、")}体现了较成熟的组织支持条件。`
          : "",
      ].filter(Boolean).join("")
    : personalReport
      ? "个人能力和组织支持中都没有维度达到较成熟水平，先从少量具体行为建立可重复做法。"
      : "当前没有维度达到较成熟水平，先从最低成熟链路建立可重复做法。";
  const tensions = [
    capabilityGap !== null && Math.abs(capabilityGap) >= 10
      ? `${capabilityLabel}与${readinessLabel}相差${Math.abs(capabilityGap).toFixed(1)}分`
      : null,
    impactGap !== null && impactGap >= 10
      ? `${capabilityLabel}与已感受到的实际影响相差${impactGap.toFixed(1)}分`
      : impactGap !== null && impactGap <= -10
        ? `已感受到的实际影响比${capabilityLabel}高${Math.abs(impactGap).toFixed(1)}分，影响可能集中在少数场景`
        : null,
    governanceBlocked ? "治理、复核和异常处理条件尚需优先核实" : null,
  ].filter((entry): entry is string => Boolean(entry));
  const keyTension = tensions.length
    ? `${tensions.join("；")}。这些关系只说明当前结构，不证明因果。`
    : "当前没有出现单一主导张力，适合继续用真实任务验证稳定性。";
  const nextStageTheme = governanceBlocked
    ? capabilityMature
      ? "先把规则、人工复核和异常入口核实清楚，再让成熟个人做法进入更多真实流程。"
      : "先建立一个边界清楚的真实任务和基本核查方法，同时与团队核实规则、人工复核和异常入口。"
    : capabilityLow
      ? impactMature
        ? "先把已经出现的结果还原到具体任务，依次补上任务定义、实际使用和结果核查，再判断哪些影响能够稳定复现。"
        : "先选一个低风险真实任务，依次写清目标、完成一次使用并核查结果；基础跑稳后再做复盘分享。"
      : impactGap !== null && impactGap >= 10
        ? "把成熟方法放入真实任务，记录质量、返工和结果变化，再决定是否扩展。"
        : "围绕一个高频真实任务验证方法、结果和复用边界。";
  const headline = personalReport && capabilityLow
    ? impactMature && readinessMature
      ? "组织支持和实际影响已经显现，个人方法仍需从基础链路补稳"
      : impactMature
        ? "实际影响已经显现，个人方法仍需从基础链路补稳"
        : readinessMature
          ? "组织支持条件较好，个人AI实践仍需从真实任务起步"
          : "先建立个人AI实践的基础链路，再验证实际影响"
    : personalObserver && capabilityMature && readinessLow
      ? "个人AI实践能力已经成熟，组织环境观察显示支持条件仍需核实"
      : governanceBlocked
        ? "当前应先补齐治理和复核条件，再讨论扩大应用"
        : input.audience === "organization" && readinessMature
          ? "组织支持条件较成熟，下一步验证员工实践和实际效果"
          : maturePersonalDimensions.length
            ? "个人方法已有基础，下一步验证价值与复用边界"
            : matureOrganizationDimensions.length
              ? "组织支持条件已经形成，下一步补稳实际工作链路"
              : "从具体行为起步，逐步建立稳定方法";
  return {
    version: VERSION_TUPLE.reportStorylineVersion,
    headline,
    currentState,
    formedBehaviorSummary,
    keyTension,
    nextStageTheme,
    boundary: personalObserver
      ? "A类来自你的行为自评；B类来自你对组织环境的个人观察。两者不能平均为一个整体成熟度，也不代表公司正式诊断。"
      : input.audience === "organization"
        ? "结果反映有效样本的群体自报，不替代业务绩效、制度检查或合规审计。"
        : input.audience === "manager"
          ? "结果只反映一名指定管理者的观察，不代表员工共识。"
          : "结果来自行为自评，用于个人发展，不是能力认证或绩效评价。",
    axisStages: METRICS.map((metricId) => axisStage(metricId, input.score, input.reportType)),
    strengthDimensionIds: strengths.map((entry) => entry.dimensionId),
    developmentDimensionIds: development.map((entry) => entry.dimensionId),
    actionPriorityDimensionIds: unique([...development.map((entry) => entry.dimensionId), ...strengths.map((entry) => entry.dimensionId)]),
    evidenceIds: unique(input.evidence.flatMap((entry) => entry.evidenceIds)),
    qualityFlags: [
      ...(governanceBlocked ? ["governance_prerequisite"] : []),
      ...(valid.length > 1 && Math.max(...valid.map((entry) => entry.score)) - Math.min(...valid.map((entry) => entry.score)) < 10 ? ["low_discrimination"] : []),
      ...(input.score.realizedAiImpact.value === null ? ["impact_insufficient"] : []),
      ...(input.evidence.some((entry) => entry.distributionType === "insufficient") ? ["dimension_insufficient"] : []),
    ],
  };
}
