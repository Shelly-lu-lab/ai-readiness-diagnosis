import {
  STANDARD_GROUP_SAMPLE,
  VERSION_TUPLE,
  WORKFORCE_MINIMUM_SAMPLE,
  type AssembledDiagnosis,
  type DimensionId,
  type ItemPatternAudience,
  type ItemPatternRecord,
  type ItemSignalStat,
  type ScoreSnapshot,
} from "@ai-readiness/contracts";
import { DIMENSION_ITEMS, scoreBand } from "@ai-readiness/domain";
import { dimensionSummary } from "./content.js";

export const ITEM_SUBDIMENSION_LABELS: Record<string, string> = {
  I01: "清晰设定意图与要求", I02: "任务与 AI 使用方式匹配", I03: "多步骤任务设计", I04: "AI 自我效能",
  I05: "AI 使用成熟度", I06: "多步骤 AI 工作流", I07: "多工具与智能体组合", I08: "AI 工作流重构",
  I09: "对 AI 结果负责", I10: "AI 输出质量控制", I11: "人与 AI 工作分配", I12: "人工复核与升级",
  I13: "主动 AI 行为", I14: "分享 AI 经验与失误", I15: "可重复的 AI 实践", I16: "AI 价值创造",
  O01: "领导层 AI 方向一致性", O02: "组织 AI 文化", O03: "安全提出 AI 新做法", O04: "AI 试验的心理安全",
  O05: "经理示范 AI 使用", O06: "AI 试验空间", O07: "AI 工作质量标准", O08: "AI 工作重构",
  O09: "AI 治理成熟度", O10: "人工复核与问责", O11: "流程文档化与可重复执行", O12: "AI 错误复盘与改进",
  O13: "AI 技能建设", O14: "AI 纳入目标与反馈", O15: "AI 工作重构激励", O16: "AI 经验沉淀与规模化复用",
};

export const ITEM_BEHAVIOR_ACTIONS: Record<string, string> = {
  I01: "把任务意图、必要背景和结果要求说清楚",
  I02: "判断任务是否适合使用 AI 并选择合适做法",
  I03: "把复杂任务拆成可协作的多个步骤",
  I04: "在不熟悉的任务中继续学习并调整做法",
  I05: "把 AI 用于经常发生的真实工作",
  I06: "连接多个步骤形成人机协作流程",
  I07: "组合多种工具或智能体完成任务",
  I08: "重新设计工作流程，而不是只在原流程上增加工具",
  I09: "对 AI 辅助结果保留最终责任",
  I10: "核查重要事实、数据和关键逻辑",
  I11: "明确 AI 执行、人工判断和共同完成的边界",
  I12: "在高风险或无法核实时暂停并升级人工复核",
  I13: "主动寻找值得尝试的 AI 工作改进",
  I14: "分享有效做法、失败点和人工检查方法",
  I15: "把一次经验整理成可重复使用的方法",
  I16: "把节省的时间转向高价值工作并验证效果",
  O01: "领导层对 AI 方向给出一致说明",
  O02: "组织鼓励用 AI 改善工作，而不是只增加使用量",
  O03: "安全提出新的 AI 工作改进建议",
  O04: "未达预期的负责任试验可以被公开复盘",
  O05: "经理亲自示范并讨论 AI 在真实工作中的用法",
  O06: "团队获得时间和空间进行低风险试验",
  O07: "经理和员工共同说明 AI 工作的质量标准",
  O08: "经理支持重新分配人机工作，而不是简单叠加任务",
  O09: "员工能够找到清晰的工具、数据和使用规则",
  O10: "重要结果明确由谁复核并承担责任",
  O11: "常用 AI 流程有文档、版本和可重复步骤",
  O12: "AI 错误和近失事件有记录、复盘和改进",
  O13: "学习内容与岗位的真实任务相连",
  O14: "AI 工作方式进入目标、反馈和发展讨论",
  O15: "组织认可负责任试验、复盘和改进贡献",
  O16: "成熟经验能够被整理、审核、共享和更新",
};

const codeFor = (audience: ItemPatternAudience) => audience === "personal" ? "P" : audience === "manager" ? "M" : "O";
const boundaryFor = (audience: ItemPatternAudience) => audience === "personal"
  ? "这一结果来自你的自报经历，不是对实际工作质量或能力等级的认证。"
  : audience === "manager"
    ? "这一结果只反映一名指定管理者的观察，不代表员工共识、群体统计或审计结论。"
    : "这一结果反映有效样本的群体自报，不能替代实际绩效、质量、行为数据或合规审计。";

const ITEM_PATTERN_EVIDENCE: Record<DimensionId, string[]> = {
  A1: ["E-MICROSOFT-WTI-001", "E-COSMIN-MEASUREMENT-001"],
  A2: ["E-MICROSOFT-WTI-001", "E-COSMIN-MEASUREMENT-001"],
  A3: ["E-NIST-RMF-PLAYBOOK-001", "E-COSMIN-MEASUREMENT-001"],
  A4: ["E-MICROSOFT-WTI-001", "E-COSMIN-MEASUREMENT-001"],
  B1: ["E-EDMONDSON-1999", "E-COSMIN-MEASUREMENT-001"],
  B2: ["E-MICROSOFT-WTI-001", "E-COSMIN-MEASUREMENT-001"],
  B3: ["E-NIST-RMF-PLAYBOOK-001", "E-COSMIN-MEASUREMENT-001"],
  B4: ["E-NASEM-HPL2-2018", "E-COSMIN-MEASUREMENT-001"],
};

function distributionFor(values: number[]) {
  if (values.length < 3)
    return { type: "insufficient" as const, stats: { validCount: values.length, minimum: null, maximum: null, mean: null, spread: null, lowCount: 0, highCount: 0 } };
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const spread = maximum - minimum;
  const type = spread > 25
    ? "mixed_polarized" as const
    : mean >= 70
      ? "uniform_high" as const
      : mean >= 55
        ? "uniform_mid_high" as const
        : mean >= 45
          ? "uniform_mid_low" as const
          : "uniform_low" as const;
  return { type, stats: { validCount: values.length, minimum, maximum, mean: Number(mean.toFixed(1)), spread, lowCount: values.filter((value) => value <= 25).length, highCount: values.filter((value) => value >= 75).length } };
}

function patternBase(
  audience: ItemPatternAudience,
  dimensionId: DimensionId,
  values: number[],
) {
  const distribution = distributionFor(values);
  const code = codeFor(audience);
  return {
    distributionType: distribution.type,
    distributionStats: distribution.stats,
    distributionFragmentIds: distribution.type === "insufficient"
      ? []
      : [`IF-${code}-${dimensionId}-${distribution.type.toUpperCase().replaceAll("_", "-")}`],
    evidenceIds: ITEM_PATTERN_EVIDENCE[dimensionId],
  };
}

const FALLBACK = {
  insufficientP: "这一维度的有效作答不足，暂不生成分数和具体诊断。",
  insufficientO: "这一群体的有效样本不足，暂不生成独立分数和具体诊断。",
  insufficientM: "这一维度的有效自评不足，暂不生成分数和具体诊断。",
  noSignalP: "四项回答比较接近，本次没有识别出明显突出的单项优势或短板。",
  noSignalO: "本维度四个具体环节的群体结果比较接近，本次没有识别出明显的单项差异。",
  noSignalM: "这个维度的四项回答比较接近，没有出现特别突出或明显偏弱的单项。",
};
const fallbackFor = (audience: ItemPatternAudience, kind: "insufficient" | "noSignal") =>
  FALLBACK[`${kind}${codeFor(audience)}` as keyof typeof FALLBACK];

function fragmentText(audience: ItemPatternAudience, itemId: string, signal: "D" | "S") {
  const label = ITEM_SUBDIMENSION_LABELS[itemId] ?? itemId;
  const action = ITEM_BEHAVIOR_ACTIONS[itemId] ?? label;
  if (audience === "personal") {
    if (itemId.startsWith("O"))
      return signal === "D"
        ? `你对“${label}”的感受相对较弱。在你当前的工作环境里，能看到${action}的情况还比较少。`
        : `你对“${label}”的感受相对较好。在日常工作里，你较常能看到${action}。`;
    return signal === "D"
      ? `“${label}”是你现在更值得先练习的一项。面对不同任务时，你还不一定每次都会${action}。`
      : `“${label}”是你目前做得相对扎实的一项。多数时候，你会${action}。`;
  }
  if (audience === "manager")
    return signal === "D"
      ? `“${label}”是目前较弱的一环。组织还没有普遍做到${action}，不同团队的实际体验可能不一样。`
      : `“${label}”已有一定基础。在实际工作中，已经能够看到${action}。`;
  return signal === "D"
    ? `员工对“${label}”的评价相对较低。结合具体回答看，目前还不是多数员工都能观察到${action}。`
    : `员工对“${label}”的评价相对较好，较多人在日常工作中已经能看到${action}。`;
}

function multiBehaviorText(
  audience: ItemPatternAudience,
  entries: ItemSignalStat[],
  signal: "D" | "S",
) {
  const actions = entries
    .map((entry) => ITEM_BEHAVIOR_ACTIONS[entry.itemId])
    .filter((entry): entry is string => Boolean(entry));
  const joined = actions.join("、");
  const organizationObservation = entries.every((entry) =>
    entry.itemId.startsWith("O"),
  );
  if (audience === "personal" && organizationObservation)
    return signal === "D"
      ? `这组回答没有指向某一个单独环节，而是显示你在当前工作环境中较少看到以下几种做法：${joined}。`
      : `这组回答显示，在你当前的工作环境中，以下几种做法相对更常见：${joined}。`;
  if (audience === "personal")
    return signal === "D"
      ? `这组回答没有指向单一短板，而是几项基础做法都需要一起练习：${joined}。`
      : `这组回答显示，你已经能同时做到${joined}。`;
  if (audience === "manager")
    return signal === "D"
      ? `从这位管理者的观察看，目前较少看到以下几种相互关联的做法：${joined}。`
      : `从这位管理者的观察看，目前较常能看到以下几种做法：${joined}。`;
  return signal === "D"
    ? `员工的回答显示，当前需要一起补齐几项相互关联的做法：${joined}。`
    : `员工的回答显示，组织已经能较为一致地做到${joined}。`;
}

function personalPattern(score: ScoreSnapshot, dimensionId: DimensionId, audience: "personal" | "manager"): ItemPatternRecord {
  const code = codeFor(audience);
  const ids = DIMENSION_ITEMS[dimensionId];
  const dimensionScore = score.dimensions[dimensionId].value;
  const stats: ItemSignalStat[] = ids.map((itemId) => ({
    itemId, itemScore: score.items[itemId] ?? null, dimensionScore,
    internalDifference: typeof score.items[itemId] === "number" && dimensionScore !== null ? Number((score.items[itemId]! - dimensionScore).toFixed(1)) : undefined,
  }));
  const valid = stats.filter((entry): entry is ItemSignalStat & { itemScore: number } => entry.itemScore !== null);
  if (dimensionScore === null || valid.length < 3) return {
    dimensionId, audience, ...patternBase(audience, dimensionId, valid.map((entry) => entry.itemScore)), patternIds: [`PAT-${code}-${dimensionId}-INSUFFICIENT`], validItemIds: valid.map((entry) => entry.itemId), itemSignalStats: stats,
    developmentFragmentIds: [], strengthFragmentIds: [], fallbackIds: [`FB-${code}-INSUFFICIENT`],
    suppressedItems: stats.map((entry) => ({ itemId: entry.itemId, reasonCode: "invalid_or_missing", stats: entry })),
    visibleText: [fallbackFor(audience, "insufficient")], ruleVersion: VERSION_TUPLE.itemPatternVersion,
  };
  const development = valid.filter((entry) => entry.itemScore <= 25 || (entry.itemScore <= 50 && valid.filter((other) => other.itemId !== entry.itemId && other.itemScore >= entry.itemScore + 25).length >= 2));
  const strength = valid.filter((entry) => entry.itemScore >= 75 && valid.some((other) => other.itemId !== entry.itemId && other.itemScore <= entry.itemScore - 50));
  const uneven = Math.max(...valid.map((entry) => entry.itemScore)) - Math.min(...valid.map((entry) => entry.itemScore)) >= 50;
  const selectedDevelopment = (development.length >= 3 ? [] : [...development])
    .sort((left, right) => left.itemScore - right.itemScore || left.itemId.localeCompare(right.itemId))
    .slice(0, 2);
  const selectedStrength = (strength.length >= 3 ? [] : [...strength])
    .sort((left, right) => right.itemScore - left.itemScore || left.itemId.localeCompare(right.itemId))
    .slice(0, 2);
  const selectedIds = new Set([...selectedDevelopment, ...selectedStrength].map((entry) => entry.itemId));
  const compressedIds = new Set([...(development.length >= 3 ? development : []), ...(strength.length >= 3 ? strength : [])].map((entry) => entry.itemId));
  const patternTypes = [...(uneven ? ["UNEVEN"] : []), ...(development.length >= 3 ? ["MULTI-DEVELOPMENT"] : []), ...(strength.length >= 3 ? ["MULTI-STRENGTH"] : []), ...(selectedIds.size ? ["SELECTED-FACETS"] : [])];
  if (!patternTypes.length) patternTypes.push("NO-SIGNAL");
  return {
    dimensionId, audience, ...patternBase(audience, dimensionId, valid.map((entry) => entry.itemScore)), patternIds: patternTypes.map((type) => `PAT-${code}-${dimensionId}-${type}`), validItemIds: valid.map((entry) => entry.itemId), itemSignalStats: stats,
    developmentFragmentIds: selectedDevelopment.map((entry) => `IF-${code}-${entry.itemId}-D`), strengthFragmentIds: selectedStrength.map((entry) => `IF-${code}-${entry.itemId}-S`),
    fallbackIds: [...(patternTypes.includes("NO-SIGNAL") ? [`FB-${code}-NO-SIGNAL`] : []), ...(uneven ? [`FB-${code}-UNEVEN`] : []), ...(development.length >= 3 ? [`FB-${code}-MULTI-DEVELOPMENT`] : []), ...(strength.length >= 3 ? [`FB-${code}-MULTI-STRENGTH`] : [])],
    suppressedItems: stats.filter((entry) => !selectedIds.has(entry.itemId)).map((entry) => ({ itemId: entry.itemId, reasonCode: entry.itemScore === null ? "invalid_or_missing" : compressedIds.has(entry.itemId) ? "multi_compression" : "threshold_not_met", stats: entry })),
    visibleText: [...(development.length >= 3 ? [multiBehaviorText(audience, development, "D")] : selectedDevelopment.map((entry) => fragmentText(audience, entry.itemId, "D"))), ...(strength.length >= 3 ? [multiBehaviorText(audience, strength, "S")] : selectedStrength.map((entry) => fragmentText(audience, entry.itemId, "S"))), ...(patternTypes.includes("NO-SIGNAL") ? [fallbackFor(audience, "noSignal")] : [])],
    ruleVersion: VERSION_TUPLE.itemPatternVersion,
  };
}

function organizationPattern(score: ScoreSnapshot, dimensionId: DimensionId, sourceScores: ScoreSnapshot[]): ItemPatternRecord {
  const ids = DIMENSION_ITEMS[dimensionId];
  const dimensionScore = score.dimensions[dimensionId].value;
  const dimensionValidN = sourceScores.filter((entry) => entry.dimensions[dimensionId].value !== null).length;
  const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const stats: ItemSignalStat[] = ids.map((itemId) => {
    const paired = sourceScores.map((entry) => {
      const itemScore = entry.items[itemId];
      const others = ids.filter((id) => id !== itemId).map((id) => entry.items[id]).filter((value): value is number => typeof value === "number");
      return typeof itemScore === "number" && others.length >= 2 ? { itemScore, difference: itemScore - others.reduce((sum, value) => sum + value, 0) / others.length } : null;
    }).filter((entry): entry is { itemScore: number; difference: number } => entry !== null);
    return { itemId, itemScore: mean(paired.map((entry) => entry.itemScore)), dimensionScore, pairedValidN: paired.length, pairedMeanDifference: mean(paired.map((entry) => entry.difference)), lowResponseRatio: paired.length ? paired.filter((entry) => entry.itemScore <= 25).length / paired.length : null, highResponseRatio: paired.length ? paired.filter((entry) => entry.itemScore >= 75).length / paired.length : null };
  });
  if (dimensionScore === null || dimensionValidN < WORKFORCE_MINIMUM_SAMPLE) return {
    dimensionId, audience: "organization", ...patternBase("organization", dimensionId, []), patternIds: [`PAT-O-${dimensionId}-INSUFFICIENT`], validItemIds: [], itemSignalStats: stats,
    developmentFragmentIds: [], strengthFragmentIds: [], fallbackIds: ["FB-O-INSUFFICIENT"],
    suppressedItems: stats.map((entry) => ({ itemId: entry.itemId, reasonCode: "paired_sample_insufficient", stats: entry })), visibleText: [FALLBACK.insufficientO], ruleVersion: VERSION_TUPLE.itemPatternVersion,
  };
  const development = stats.filter((entry) => (entry.pairedValidN ?? 0) >= WORKFORCE_MINIMUM_SAMPLE && (entry.pairedMeanDifference ?? Infinity) <= -10 && (entry.lowResponseRatio ?? 0) >= 0.3);
  const strength = stats.filter((entry) => (entry.pairedValidN ?? 0) >= WORKFORCE_MINIMUM_SAMPLE && (entry.pairedMeanDifference ?? -Infinity) >= 10 && (entry.highResponseRatio ?? 0) >= 0.3);
  const sorted = (entries: ItemSignalStat[]) => [...entries].sort((left, right) => Math.abs(right.pairedMeanDifference ?? 0) - Math.abs(left.pairedMeanDifference ?? 0) || Math.max(right.lowResponseRatio ?? 0, right.highResponseRatio ?? 0) - Math.max(left.lowResponseRatio ?? 0, left.highResponseRatio ?? 0) || (right.pairedValidN ?? 0) - (left.pairedValidN ?? 0) || left.itemId.localeCompare(right.itemId));
  const selectedDevelopment = development.length >= 3 ? [] : sorted(development).slice(0, 2);
  const selectedStrength = strength.length >= 3 ? [] : sorted(strength).slice(0, 1);
  const selectedIds = new Set([...selectedDevelopment, ...selectedStrength].map((entry) => entry.itemId));
  const candidateIds = new Set([...development, ...strength].map((entry) => entry.itemId));
  const compressedIds = new Set([...(development.length >= 3 ? development : []), ...(strength.length >= 3 ? strength : [])].map((entry) => entry.itemId));
  const patternTypes = [...(development.length >= 3 ? ["MULTI-DEVELOPMENT"] : []), ...(strength.length >= 3 ? ["MULTI-STRENGTH"] : []), ...(selectedIds.size ? ["SELECTED-FACETS"] : [])];
  if (!patternTypes.length) patternTypes.push("NO-SIGNAL");
  return {
    dimensionId, audience: "organization", ...patternBase("organization", dimensionId, stats.filter((entry) => (entry.pairedValidN ?? 0) >= WORKFORCE_MINIMUM_SAMPLE).map((entry) => entry.itemScore).filter((value): value is number => value !== null)), patternIds: patternTypes.map((type) => `PAT-O-${dimensionId}-${type}`), validItemIds: stats.filter((entry) => (entry.pairedValidN ?? 0) >= WORKFORCE_MINIMUM_SAMPLE).map((entry) => entry.itemId), itemSignalStats: stats,
    developmentFragmentIds: selectedDevelopment.map((entry) => `IF-O-${entry.itemId}-D`), strengthFragmentIds: selectedStrength.map((entry) => `IF-O-${entry.itemId}-S`),
    fallbackIds: [...(patternTypes.includes("NO-SIGNAL") ? ["FB-O-NO-SIGNAL"] : []), ...(development.length >= 3 ? ["FB-O-MULTI-DEVELOPMENT"] : []), ...(strength.length >= 3 ? ["FB-O-MULTI-STRENGTH"] : []), ...stats.filter((entry) => (entry.pairedValidN ?? 0) < WORKFORCE_MINIMUM_SAMPLE).map((entry) => `FB-O-ITEM-INSUFFICIENT:${entry.itemId}`)],
    suppressedItems: stats.filter((entry) => !selectedIds.has(entry.itemId)).map((entry) => ({ itemId: entry.itemId, reasonCode: (entry.pairedValidN ?? 0) < WORKFORCE_MINIMUM_SAMPLE ? "paired_sample_insufficient" : compressedIds.has(entry.itemId) ? "multi_compression" : candidateIds.has(entry.itemId) ? "display_limit" : "threshold_not_met", stats: entry })),
    visibleText: [...(dimensionValidN < STANDARD_GROUP_SAMPLE ? ["本维度来自 2—29 份有效作答，样本量较小，只作方向性参考，且不得用于识别或评价个人。"] : []), ...(development.length >= 3 ? [multiBehaviorText("organization", development, "D")] : selectedDevelopment.map((entry) => fragmentText("organization", entry.itemId, "D"))), ...(strength.length >= 3 ? [multiBehaviorText("organization", strength, "S")] : selectedStrength.map((entry) => fragmentText("organization", entry.itemId, "S"))), ...(patternTypes.includes("NO-SIGNAL") ? [FALLBACK.noSignalO] : [])],
    ruleVersion: VERSION_TUPLE.itemPatternVersion,
  };
}

export function assembleDiagnoses(input: { score: ScoreSnapshot; dimensionIds: DimensionId[]; audience: ItemPatternAudience; sourceScores?: ScoreSnapshot[]; itemPatternRecords?: ItemPatternRecord[] }): { itemPatternRecords: ItemPatternRecord[]; diagnoses: AssembledDiagnosis[] } {
  const itemPatternRecords = input.itemPatternRecords ?? input.dimensionIds.map((dimensionId) => input.audience === "organization" ? organizationPattern(input.score, dimensionId, input.sourceScores ?? []) : personalPattern(input.score, dimensionId, input.audience));
  const diagnoses = input.dimensionIds.map((dimensionId) => {
    const pattern = itemPatternRecords.find((entry) => entry.dimensionId === dimensionId)!;
    const band = scoreBand(input.score.dimensions[dimensionId].value);
    const code = codeFor(input.audience);
    const valid = band !== null && !pattern.patternIds.some((id) => id.endsWith("INSUFFICIENT"));
    const coreSummary = valid ? dimensionSummary(dimensionId, band, input.audience) : null;
    const validN = input.sourceScores?.filter((entry) => entry.dimensions[dimensionId].value !== null).length ?? 0;
    return { diagnosisId: valid ? `DX-${code}-${dimensionId}-${band}` : null, dimensionId, audience: input.audience, band, statusId: input.audience === "organization" && validN >= WORKFORCE_MINIMUM_SAMPLE && validN < STANDARD_GROUP_SAMPLE ? "BD-O-DIRECTIONAL" : null, coreSummary, patternIds: pattern.patternIds, fragmentIds: [...pattern.distributionFragmentIds, ...pattern.developmentFragmentIds, ...pattern.strengthFragmentIds], fallbackIds: pattern.fallbackIds, visibleText: [...(coreSummary ? [coreSummary] : []), ...pattern.visibleText, boundaryFor(input.audience)], boundaryText: boundaryFor(input.audience), evidenceIds: pattern.evidenceIds, assemblyVersion: VERSION_TUPLE.diagnosisAssemblyVersion } satisfies AssembledDiagnosis;
  });
  return { itemPatternRecords, diagnoses };
}
