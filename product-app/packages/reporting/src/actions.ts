import type {
  DimensionId,
  ActionRuleAudit,
  ItemPatternRecord,
  RecommendationSnapshot,
  ScoreSnapshot,
  EvidenceReference,
} from "@ai-readiness/contracts";
import { WORKFORCE_MINIMUM_SAMPLE } from "@ai-readiness/contracts";
import { scoreBand } from "@ai-readiness/domain";

type Audience = "personal" | "organization" | "manager";
type Card = Omit<RecommendationSnapshot, "priority" | "priorityScore" | "triggerFacts" | "requiredFragmentIds"> & {
  trigger: (context: TriggerContext) => TriggerResult | null;
};
type TriggerResult = { facts: string[]; fragments?: string[]; bonus?: number };
type TriggerContext = {
  audience: Audience;
  score: ScoreSnapshot;
  patterns: ItemPatternRecord[];
  backgroundAnswers?: Record<string, string>;
  sourceBackgroundAnswers?: Array<Record<string, string>>;
  bottomDimensions: Set<DimensionId>;
};

const MIN_PRIORITY_ACTIONS = 3;

const evidenceStrengthB = new Set([
  "REC-P-A1-01", "REC-P-A4-01", "REC-P-B1-03", "REC-P-B2-04", "REC-P-B4-03",
  "REC-O-A1-03", "REC-O-A3-04", "REC-O-A4-02", "REC-O-B1-03", "REC-O-B2-04",
  "REC-O-B3-04", "REC-O-B4-01",
]);
const evidenceStrengthD = new Set(["REC-P-B1-01", "REC-O-B1-01"]);

export const EVIDENCE_REGISTRY: Record<string, EvidenceReference> = {
  "E-MICROSOFT-WTI-001": {
    id: "E-MICROSOFT-WTI-001", title: "2026 Work Trend Index（来源研究）", sourceType: "source_research",
    url: "https://www.microsoft.com/en-us/worklab/work-trend-index/agents-human-agency-and-the-opportunity-for-every-organization",
    supports: "AI工作构念、经理支持、工作重构、学习系统与影响表达。",
    boundary: "支持实践方向和相关性线索，不证明本项目建议会导致分数或绩效改善。",
  },
  "E-NIST-RMF-PLAYBOOK-001": {
    id: "E-NIST-RMF-PLAYBOOK-001", title: "NIST AI RMF Playbook", sourceType: "official_framework",
    url: "https://airc.nist.gov/airmf-resources/playbook/",
    supports: "治理、人工监督、文档、持续监测与事件管理。",
    boundary: "权威治理指引，不是组织发展干预效果试验。",
  },
  "E-EDMONDSON-1999": {
    id: "E-EDMONDSON-1999", title: "Psychological Safety and Learning Behavior in Work Teams", sourceType: "empirical_research",
    url: "https://doi.org/10.2307/2666999", supports: "心理安全与团队学习行为。",
    boundary: "经典团队研究，不直接证明某一AI管理做法的效果。",
  },
  "E-TEAM-REFLEX-2021": {
    id: "E-TEAM-REFLEX-2021", title: "Team Reflexivity Interventions", sourceType: "evidence_synthesis",
    url: "https://doi.org/10.1037/spy0000251", supports: "结构化团队复盘与行为改进。",
    boundary: "AI工作场景属于间接迁移，具体建议仍需试点验证。",
  },
  "E-NASEM-HPL2-2018": {
    id: "E-NASEM-HPL2-2018", title: "How People Learn II", sourceType: "evidence_synthesis",
    url: "https://nap.nationalacademies.org/resource/24783/How%20People%20Learn%202.pdf",
    supports: "真实情境练习、反馈、迁移和学习环境。",
    boundary: "高质量综合报告，但不针对本AI问卷和企业场景。",
  },
  "E-GOLLWITZER-SHEERAN-2006": {
    id: "E-GOLLWITZER-SHEERAN-2006", title: "Implementation Intentions and Goal Achievement", sourceType: "evidence_synthesis",
    url: "https://doi.org/10.1016/S0065-2601(06)38002-1", supports: "把笼统目标转化为具体执行计划。",
    boundary: "迁移到企业AI工作后，不能直接承诺同等干预效果。",
  },
  "E-ILO-GENAI-WORK-2026": {
    id: "E-ILO-GENAI-WORK-2026", title: "The impact of GenAI on jobs, productivity and work organization", sourceType: "evidence_synthesis",
    url: "https://doi.org/10.54394/00034628", supports: "生产率证据边界、工作组织、自主性与不平等风险。",
    boundary: "结论异质且快速变化，不支持固定ROI承诺。",
  },
  "E-OECD-HCAI-WORK-2025": {
    id: "E-OECD-HCAI-WORK-2025", title: "Human-centred AI in the world of work", sourceType: "professional_guidance",
    url: "https://www.oecd.org/content/dam/oecd/en/publications/reports/2025/12/compendium-of-best-practices-for-the-human-centered-adoption-of-safe-secure-and-trustworthy-ai-in-the-world-of-work_90541127/INMX2843.pdf",
    supports: "人本导向采用、员工能力发展和监督。",
    boundary: "实践汇编和政策方向，不是统一干预效应估计。",
  },
  "E-COSMIN-MEASUREMENT-001": {
    id: "E-COSMIN-MEASUREMENT-001", title: "COSMIN Manual for Outcome Measurement Instruments", sourceType: "professional_guidance",
    url: "https://www.cosmin.nl/wp-content/uploads/COSMIN-manual-V2_final.pdf",
    supports: "多题维度、题项分布和解释边界的测量学审查。",
    boundary: "只支持解释方法，不证明本问卷的五类分布阈值或心理测量效度。",
  },
  "E-AAPOR-001": {
    id: "E-AAPOR-001", title: "AAPOR Best Practices for Survey Research", sourceType: "professional_guidance",
    url: "https://aapor.org/standards-and-ethics/best-practices/", supports: "补充调研、透明性、质性追问和隐私边界。",
    boundary: "支持调研流程，不支持具体AI干预效果。",
  },
};

function evidenceForFamily(family: string): string[] {
  if (/governance|quality|decision|escalation|access|controlled_scaling|process_documentation/.test(family))
    return ["E-NIST-RMF-PLAYBOOK-001", "E-MICROSOFT-WTI-001"];
  if (/incident/.test(family))
    return ["E-NIST-RMF-PLAYBOOK-001", "E-TEAM-REFLEX-2021"];
  if (/psychological|safe_feedback|responsible_experiment/.test(family))
    return ["E-EDMONDSON-1999", "E-NIST-RMF-PLAYBOOK-001"];
  if (/learning|peer|knowledge/.test(family))
    return ["E-NASEM-HPL2-2018", "E-MICROSOFT-WTI-001"];
  if (/value_measurement/.test(family))
    return ["E-ILO-GENAI-WORK-2026", "E-MICROSOFT-WTI-001"];
  if (/qualitative/.test(family)) return ["E-AAPOR-001"];
  if (/experiment|task_definition|development_goal|adoption_practice/.test(family))
    return ["E-GOLLWITZER-SHEERAN-2006", "E-MICROSOFT-WTI-001"];
  if (/resource_enablement|manager_enablement/.test(family))
    return ["E-OECD-HCAI-WORK-2025", "E-MICROSOFT-WTI-001"];
  return ["E-MICROSOFT-WTI-001"];
}

function meta(input: {
  id: string;
  dimensionId: DimensionId;
  title: string;
  action: string;
  successSignal: string;
  suggestedLead: string;
  suggestedWindow: string;
  actionFamily: string;
  leadMode: "individual" | "shared" | "organization";
  evidenceIds?: string[];
  safety?: boolean;
  scaling?: boolean;
  measurement?: boolean;
  trigger: Card["trigger"];
}): Card {
  return {
    ...input,
    rationale: "该建议由当前分数、题项信号和已提供的背景条件按固定规则触发。",
    evidenceIds: input.evidenceIds ?? evidenceForFamily(input.actionFamily),
    evidenceStrength: evidenceStrengthB.has(input.id) ? "B" : evidenceStrengthD.has(input.id) ? "D" : "C",
    sourceStatus: "draft",
    releaseEligible: false,
    isSafetyPrerequisite: input.safety ?? false,
    isScalingAction: input.scaling ?? false,
    isMeasurementAction: input.measurement ?? false,
  };
}

const bandTrigger = (dimensionId: DimensionId): Card["trigger"] => (context) => {
  const band = scoreBand(context.score.dimensions[dimensionId].value);
  return band === "S1" || band === "S2" || context.bottomDimensions.has(dimensionId)
    ? { facts: [`${dimensionId}处于${band}`, ...(context.bottomDimensions.has(dimensionId) ? ["属于当前最低的两个维度"] : [])] }
    : null;
};
const fragmentTrigger = (dimensionId: DimensionId, itemIds: string[], extra?: (context: TriggerContext) => boolean): Card["trigger"] => (context) => {
  if (extra && !extra(context)) return null;
  const prefix = context.audience === "organization" ? "O" : context.audience === "manager" ? "M" : "P";
  const available = new Set(context.patterns.find((entry) => entry.dimensionId === dimensionId)?.developmentFragmentIds ?? []);
  const fragments = itemIds.map((itemId) => `IF-${prefix}-${itemId}-D`).filter((id) => available.has(id));
  return fragments.length ? { facts: [`${itemIds.join("/")}出现发展信号`], fragments, bonus: 1 } : null;
};
const classificationTrigger = (id: string): Card["trigger"] => (context) =>
  context.score.classificationId === id ? { facts: [`双轴定位为${id}`], bonus: 3 } : null;
const impactLag = (context: TriggerContext) => {
  const impact = context.score.realizedAiImpact.value;
  const capability = context.score.employeeAiCapability.value;
  const readiness = context.score.organizationalAiReadiness.value;
  return impact !== null && ((capability !== null && capability - impact >= 10) || (readiness !== null && readiness - impact >= 10));
};
const dimensionAtLeast = (context: TriggerContext, id: DimensionId, value: number) =>
  (context.score.dimensions[id].value ?? -Infinity) >= value;

const p = (dimensionId: DimensionId, n: number, data: Omit<Parameters<typeof meta>[0], "id" | "dimensionId" | "leadMode">) =>
  meta({ ...data, id: `REC-P-${dimensionId}-0${n}`, dimensionId, leadMode: data.suggestedLead === "你" ? "individual" : "shared" });
const o = (dimensionId: DimensionId, n: number, data: Omit<Parameters<typeof meta>[0], "id" | "dimensionId" | "leadMode">) =>
  meta({ ...data, id: `REC-O-${dimensionId}-0${n}`, dimensionId, leadMode: "organization" });

const CARDS: Card[] = [
  p("A1", 1, { title: "写清任务目标和验收标准", action: "选一个每周都会做、结果可检查的任务，在使用 AI 前写下目标、必要背景、限制和验收标准。", successSignal: "同一份任务说明连续使用3次，每次都能说清是否达标。", suggestedLead: "你", suggestedWindow: "1周", actionFamily: "task_definition", trigger: bandTrigger("A1") }),
  p("A1", 2, { title: "先判断任务是否适合使用AI", action: "用价值、可检查性、数据风险、人工判断要求四个问题，判断5个真实任务是否适合使用AI。", successSignal: "完成5个真实任务的适用性记录，包含至少1个不应使用判断。", suggestedLead: "你", suggestedWindow: "1—2周", actionFamily: "scenario_selection", safety: true, trigger: fragmentTrigger("A1", ["I02"]) }),
  p("A1", 3, { title: "拆解一项复杂任务", action: "将一项复杂任务拆成输入、分析、产出、检查四类步骤，明确每一步的人机分工。", successSignal: "形成1张步骤卡并完整跑通2次。", suggestedLead: "你", suggestedWindow: "2周", actionFamily: "workflow_design", trigger: fragmentTrigger("A1", ["I03"]) }),
  p("A1", 4, { title: "在低风险任务中练习新功能", action: "对一个新功能设定小范围学习任务：先看示例，再在低风险任务中练习，最后请同事或专家反馈。", successSignal: "独立完成1个真实小任务并根据反馈修改1次。", suggestedLead: "你", suggestedWindow: "2—3周", actionFamily: "learning_practice", trigger: fragmentTrigger("A1", ["I04"]) }),

  p("A2", 1, { title: "把单步使用扩展成小流程", action: "把一个已在使用 AI 的单步任务扩展为两个相连步骤，并在中间保留人工检查。", successSignal: "连续运行3次，记录时间、返工和错误。", suggestedLead: "你", suggestedWindow: "2周", actionFamily: "workflow_pilot", trigger: bandTrigger("A2") }),
  p("A2", 2, { title: "在已有核查方法下连接工具", action: "只在已有核查方法的前提下，尝试把两个工具或数据源串联起来，并明确哪些数据不能传递。", successSignal: "形成1份数据与人工检查记录，无越界数据。", suggestedLead: "你", suggestedWindow: "2—3周", actionFamily: "tool_orchestration", safety: true, scaling: true, trigger: fragmentTrigger("A2", ["I07"], (c) => dimensionAtLeast(c, "A3", 55)) }),
  p("A2", 3, { title: "重画一个现有工作流", action: "重新画一遍现有工作流，删除不必要交接、调整人机分工并保留质量门。", successSignal: "新旧流程都有时间、返工和质量比较。", suggestedLead: "你与经理", suggestedWindow: "3—6周", actionFamily: "workflow_redesign", scaling: true, measurement: true, trigger: fragmentTrigger("A2", ["I08"], (c) => (c.score.dimensions.A3.value ?? 0) >= 45) }),
  p("A2", 4, { title: "比较成熟用法的真实价值", action: "对一个成熟用法设置两周基线和两周新方法比较，同时记录时间、质量、返工和异常。", successSignal: "产出可复核的前后比较，并停止没有价值的做法。", suggestedLead: "你", suggestedWindow: "4周", actionFamily: "value_measurement", measurement: true, trigger: (c) => dimensionAtLeast(c, "A2", 55) && impactLag(c) ? { facts: ["A2不低于55且已实现AI影响相对滞后"], bonus: 3 } : null }),

  p("A3", 1, { title: "拿一份真实AI结果做四步检查", action: "选一份本周会真正使用的AI结果，依次做四步：打开原始出处核对关键说法；用计算器或原数据重算数字；从收件人角度找遗漏、矛盾和说不通的地方；最后检查格式、敏感信息和是否需要人工批准。把发现的问题、修改内容和最终是否采用记在同一条记录里。", successSignal: "连续检查3份真实结果；每份都留下出处、数字复算、遗漏或矛盾、敏感信息与批准要求的检查记录，并写明最终采用、修改或停用。", suggestedLead: "你", suggestedWindow: "1周", actionFamily: "quality_gate", safety: true, trigger: bandTrigger("A3") }),
  p("A3", 2, { title: "标清人机分工", action: "在任务开始前标出AI执行、人来决定和必须人工确认的步骤。", successSignal: "完成1张人机分工卡，并在2次任务中使用。", suggestedLead: "你", suggestedWindow: "1—2周", actionFamily: "decision_rights", safety: true, trigger: fragmentTrigger("A3", ["I11"]) }),
  p("A3", 3, { title: "预先写明停止和升级条件", action: "事先写明无法核对关键事实、涉及敏感数据、影响重要权益三类停止条件，触发时转人工复核。", successSignal: "形成可查找的停止与升级条件。", suggestedLead: "你与经理", suggestedWindow: "1—2周", actionFamily: "escalation", safety: true, trigger: fragmentTrigger("A3", ["I12"]) }),
  p("A3", 4, { title: "复盘一次AI失效", action: "记录一次 AI 失效的任务、输入、错误、发现方式、处理和预防方法。", successSignal: "完成1次非追责复盘并更新清单或流程。", suggestedLead: "你与团队", suggestedWindow: "1—2周", actionFamily: "incident_learning", safety: true, trigger: (c) => scoreBand(c.score.dimensions.A3.value) === "S1" && scoreBand(c.score.dimensions.B3.value) === "S1" ? { facts: ["A3与B3均处于S1"] } : null }),

  p("A4", 1, { title: "建立每周小试验节奏", action: "每周选一个小做法尝试，开始前写明预期改善，结束后记录保留、修改或停止。", successSignal: "完成4次小试验，每次都有结论。", suggestedLead: "你", suggestedWindow: "4周", actionFamily: "experiment_cycle", trigger: bandTrigger("A4") }),
  p("A4", 2, { title: "分享真实用法和失败点", action: "向同事分享一次真实 AI 使用，同时说明哪里有用、哪里需要人工检查、哪里失败。", successSignal: "获得至少1条反馈并修改做法。", suggestedLead: "你", suggestedWindow: "1—2周", actionFamily: "peer_learning", trigger: fragmentTrigger("A4", ["I14"]) }),
  p("A4", 3, { title: "把有效做法整理成模板", action: "把一个有效做法整理为适用场景、所需输入、操作步骤、人工检查、已知限制五段式模板。", successSignal: "至少1名同事按模板成功复用并反馈。", suggestedLead: "你", suggestedWindow: "2周", actionFamily: "knowledge_reuse", trigger: fragmentTrigger("A4", ["I15"]) }),
  p("A4", 4, { title: "记录一个AI做法的价值", action: "为一个 AI 做法记录使用次数、时间、返工、质量与高价值工作时间，四周后决定是否保留。", successSignal: "有一份可复核的价值记录，并做出保留、调整或停止决定。", suggestedLead: "你", suggestedWindow: "4周", actionFamily: "value_measurement", measurement: true, trigger: (c) => fragmentTrigger("A4", ["I16"])(c) ?? (impactLag(c) ? { facts: ["已实现AI影响相对滞后"], bonus: 3 } : null) }),

  p("B1", 1, { title: "把不清楚的问题说具体", action: "把组织不清楚改写成一个具体问题：在哪个任务中、拿不准什么、希望谁确认什么。", successSignal: "获得一个明确答复、责任角色或后续处理路径。", suggestedLead: "你与经理", suggestedWindow: "1周", actionFamily: "direction_clarity", trigger: bandTrigger("B1") }),
  p("B1", 2, { title: "提出一个可撤回的小试验", action: "提出一个低风险、可撤回的小试验，事先说明范围、检查方式、停止条件和复盘时间。", successSignal: "得到明确结论，试验后有复盘。", suggestedLead: "你与经理", suggestedWindow: "2—4周", actionFamily: "responsible_experiment", safety: true, trigger: fragmentTrigger("B1", ["O03", "O04"]) }),
  p("B1", 3, { title: "通过安全渠道反馈试验问题", action: "通过组织已有渠道反馈试验未达预期的条件，聚焦事实、风险和改进，不评价个人。", successSignal: "失败记录促成一项规则、清单或方法更新。", suggestedLead: "你与团队", suggestedWindow: "1—2周", actionFamily: "incident_learning", trigger: fragmentTrigger("B1", ["O04"]) }),
  p("B1", 4, { title: "使用保密反馈渠道", action: "使用匿名调研、HR或已建立的反馈渠道，提供可核对的情境与改进建议。", successSignal: "反馈被记录并有处理状态，不对员工产生报复风险。", suggestedLead: "你", suggestedWindow: "根据渠道", actionFamily: "safe_feedback", safety: true, trigger: fragmentTrigger("B1", ["O03"]) }),

  p("B2", 1, { title: "和经理确认质量标准", action: "选一个正在使用 AI 的任务，请经理明确什么算可交付、哪些项必须人工检查。", successSignal: "形成一份双方可复述的质量标准。", suggestedLead: "你与经理", suggestedWindow: "1周", actionFamily: "quality_gate", safety: true, trigger: fragmentTrigger("B2", ["O07"]) }),
  p("B2", 2, { title: "提出有边界的资源申请", action: "提出一个有时间上限、工具和复盘安排的小试验，不笼统申请更多支持。", successSignal: "试验有明确范围、时间和回看点。", suggestedLead: "你与经理", suggestedWindow: "2—4周", actionFamily: "resource_enablement", trigger: fragmentTrigger("B2", ["O06"]) }),
  p("B2", 3, { title: "与经理共同画流程", action: "与经理一起选一个团队高频流程，标出AI可执行步骤、人工决策点和不应自动化的环节。", successSignal: "完成1份共同流程卡和1次运行复盘。", suggestedLead: "你与经理", suggestedWindow: "3—6周", actionFamily: "workflow_redesign", scaling: true, trigger: fragmentTrigger("B2", ["O08"]) }),
  p("B2", 4, { title: "和经理做固定短复盘", action: "和经理约定固定短复盘，只回看任务结果、AI问题、人工接手点和下一次调整。", successSignal: "完成2次复盘并至少调整1项做法。", suggestedLead: "你与经理", suggestedWindow: "4周", actionFamily: "manager_coaching", trigger: (c) => ["S2", "S3"].includes(scoreBand(c.score.dimensions.B2.value) ?? "") ? { facts: ["B2处于S2或S3"] } : null }),

  p("B3", 1, { title: "找到有效规则和咨询入口", action: "在处理真实工作前，找到组织对可用工具、数据、禁用场景和审批的有效规则；找不到时暂不扩大使用。", successSignal: "能指向有效规则和咨询入口。", suggestedLead: "你", suggestedWindow: "1周", actionFamily: "governance_baseline", safety: true, trigger: fragmentTrigger("B3", ["O09"]) }),
  p("B3", 2, { title: "用五项信息咨询规则", action: "用任务、数据、工具、预期输出、人工复核五项信息向指定角色咨询。", successSignal: "获得可执行的允许、调整或禁止结论。", suggestedLead: "你与治理联系人", suggestedWindow: "1周", actionFamily: "governance_consult", safety: true, trigger: fragmentTrigger("B3", ["O10"]) }),
  p("B3", 3, { title: "为常用流程写操作说明", action: "将一个常用 AI 流程写成操作说明，标明输入、输出、人工确认、异常处理和版本。", successSignal: "他人能按说明执行，且知道哪里必须停下检查。", suggestedLead: "你与团队", suggestedWindow: "2周", actionFamily: "process_documentation", trigger: fragmentTrigger("B3", ["O11"]) }),
  p("B3", 4, { title: "用正式渠道报告异常", action: "发现错误、越界或异常时使用正式渠道上报并保留必要记录，先停止可能扩大影响的步骤。", successSignal: "事件有编号、处理责任和后续改进。", suggestedLead: "你与治理联系人", suggestedWindow: "立即", actionFamily: "incident_response", safety: true, trigger: fragmentTrigger("B3", ["O12"]) }),

  p("B4", 1, { title: "围绕真实任务学习", action: "选一个岗位真实任务，只学与该任务直接相关的工具、方法和风险。", successSignal: "学习后完成1次真实任务并获得反馈。", suggestedLead: "你", suggestedWindow: "2—4周", actionFamily: "learning_practice", trigger: fragmentTrigger("B4", ["O13"]) }),
  p("B4", 2, { title: "设定可观察的发展目标", action: "和经理约定一个可观察的 AI 工作发展目标，例如建立一份可复用流程，而不是要求使用次数。", successSignal: "目标包含任务、行为、质量和回看时间。", suggestedLead: "你与经理", suggestedWindow: "4—6周", actionFamily: "development_goal", trigger: fragmentTrigger("B4", ["O14"]) }),
  p("B4", 3, { title: "和同事做交叉演示", action: "与一名同事互相演示同一任务的AI做法，互相检查目标、步骤、人工复核和失败情况。", successSignal: "完成2次交叉演示并各自更新方法。", suggestedLead: "你与同事", suggestedWindow: "2—4周", actionFamily: "peer_learning", trigger: fragmentTrigger("B4", ["O16"]) }),
  p("B4", 4, { title: "向案例库提交可复用经验", action: "向组织案例库提交一个经验条目，写明适用条件、不适用条件、人工检查和已知问题。", successSignal: "条目经审核后被他人实际试用1次。", suggestedLead: "你", suggestedWindow: "2周", actionFamily: "knowledge_reuse", trigger: fragmentTrigger("B4", ["O16"]) }),
];

const organizationCopy: Record<DimensionId, Array<[string, string, string, string, string, string]>> = {
  A1: [
    ["按岗位盘点真实任务", "按岗位收集高频、耗时、结果可检查的任务，同时标注数据风险和必须由人判断的环节。", "每个目标岗位形成已审核的场景清单，包含不适用场景。", "业务负责人", "2—4周", "scenario_selection"],
    ["提供统一任务说明模板", "为试点场景提供目标、背景、输入、限制、质量标准和人工决策点的统一模板。", "至少3个场景使用模板并根据运行结果修订。", "业务运营", "2—4周", "task_definition"],
    ["用真实任务开展短周期工作坊", "用员工自己的真实任务练习适用性判断、任务拆解和验收标准。", "参与者均完成1个实际任务产出并获得反馈。", "HR与业务经理", "3—6周", "learning_practice"],
    ["复盘可迁移的任务设计做法", "对高分部门的任务设计做质性复盘，只提炼可迁移模板和条件，不做部门排名。", "产出2—3个经其他部门试用的方法。", "HR / 业务运营", "4—6周", "knowledge_reuse"],
  ],
  A2: [
    ["试运行两步AI小流程", "选择1—3个高频、低风险、有明确基线的工作流，运行两步AI加中间人工检查的小流程。", "每个流程至少运行3次，有基线、质量、返工和异常记录。", "业务负责人", "4—6周", "workflow_pilot"],
    ["使用统一流程画布", "统一记录输入、AI步骤、人工步骤、质量门、数据流向和异常升级。", "试点流程均有版本化画布和审核记录。", "流程负责人", "3—6周", "process_documentation"],
    ["为智能体扩展设置三道门", "将扩展分成小样本运行、并行人工对照、有边界上线，每道门设置停止条件。", "每个扩展都有通过、调整或停止结论和证据。", "产品/技术与治理负责人", "6—12周", "controlled_scaling"],
    ["清理缺少价值证据的流程", "保留有质量或时间证据的做法，调整只看使用次数的做法，停止高风险且无价值证据的做法。", "每个流程都有保留、调整或停止决定。", "业务负责人", "4—8周", "value_measurement"],
  ],
  A3: [
    ["定义最小质量清单", "为高频AI任务定义覆盖关键事实、数据、逻辑、格式和合规的最小质量清单。", "试点任务均使用清单并记录检出问题。", "质量/业务负责人", "2—4周", "quality_gate"],
    ["建立决策权与升级矩阵", "明确AI可执行、人必须决定、需要双人复核和必须升级的环节。", "每个流程都有可查找的决策权和升级矩阵。", "AI治理与业务负责人", "3—6周", "decision_rights"],
    ["建立高影响任务样本审查", "按预先定义频率抽查AI输出、人工修改、最终结果和异常。", "审查能发现具体问题并触发流程改进。", "质量/风险负责人", "4—8周", "quality_audit"],
    ["建立非追责失效复盘", "固定记录AI失效的任务、影响、发现、处置、根因、改进和追踪。", "每次重要失效都导致规则、清单或流程更新。", "AI治理与团队经理", "2—4周", "incident_learning"],
  ],
  A4: [
    ["建立每月小试验节奏", "每个试验都要有假设、范围、风险边界、成功指标和保留、调整或停止结论。", "每个试验都有结论和追踪。", "业务负责人", "4—8周", "experiment_cycle"],
    ["分享失败和不适用场景", "案例分享必须包含失败或不适用场景，先讨论学到了什么和如何降低风险。", "分享中同时存在成功、失败和停止案例。", "团队经理", "4周", "psychological_safety"],
    ["建立带审核的复用库", "条目包含场景、输入、步骤、人工检查、已知限制、版本和负责角色。", "条目经他人成功复用后才标记已验证复用。", "AI推进/业务运营", "4—8周", "knowledge_reuse"],
    ["为复用做法设置价值记录", "记录使用、时间、质量、返工、异常和高价值工作变化。", "无价值证据或风险超标的条目被降级或停用。", "业务运营", "4—8周", "value_measurement"],
  ],
  B1: [
    ["形成一页式AI方向", "说明为什么做、优先哪些工作、不做什么、如何判断价值与风险，并由领导者使用一致表述。", "目标员工能找到并准确复述优先方向和边界。", "高管赞助人", "2—4周", "direction_clarity"],
    ["发布负责任试验约定", "明确允许范围、必须控制、停止条件、复盘方式和非惩罚边界。", "员工知道何时可试、何时停、哪里报告问题。", "业务与AI治理负责人", "3—6周", "responsible_experiment"],
    ["演练如何处理真实失败", "让管理者用真实失败案例演示询问事实、保护上报者、控制风险和追踪改进。", "管理者在演练和实际复盘中展示统一行为。", "HR与高管赞助人", "4—8周", "psychological_safety"],
    ["对低分群体做保密访谈", "识别具体沉默情境、管理行为和流程障碍，不公开排名或要求员工证明结果。", "形成按主题聚合的改进清单，不暴露个人。", "HR", "4—6周", "qualitative_validation"],
  ],
  B2: [
    ["给经理一份可直接使用的管理包", "提供场景选择、质量标准、人机分工、试验边界、失效复盘和求助路径。", "经理能用包内工具完成1个真实流程试点。", "HR与AI治理负责人", "4—6周", "manager_enablement"],
    ["为试点经理提供明确资源", "明确可支配时间、合规工具、数据与专家支持，并设置到期回看。", "时间、工具和求助需求均有明确来源。", "业务负责人", "4—8周", "resource_enablement"],
    ["共同定义交付质量", "启动试验前由经理与员工共同定义交付质量、人工检查项和不允许的捷径。", "试点均有质量标准且双方能一致复述。", "业务经理", "2—4周", "quality_gate"],
    ["围绕真实流程做经理陪跑", "一起画现流程、改人机分工、跑小样本、看错误和数据、决定是否继续。", "每个参与经理完成1个已复盘流程。", "业务负责人 / 流程改进角色", "6—10周", "manager_coaching"],
  ],
  B3: [
    ["发布一页式AI使用规则", "说明可用工具、数据、禁用场景、人工复核、审批与咨询入口。", "员工能在2分钟内找到并回答基础场景问题。", "AI治理负责人", "2—4周", "governance_baseline"],
    ["建立风险分级决策矩阵", "明确谁提案、谁复核、谁决定、谁处理异常。", "试点场景均能对应决策权和升级路径。", "AI治理与业务负责人", "3—6周", "decision_rights"],
    ["保留版本化流程文档", "常态AI流程保留输入输出、人机交接、质量门、数据、异常和变更记录。", "常态流程均有有效版本，过期版本不再运行。", "流程负责人", "4—8周", "process_documentation"],
    ["建立AI事件台账", "记录事件和近失事件，并将发现、响应、根因、改进追踪到关闭。", "事件有发现、响应、根因、改进和关闭记录。", "AI治理/风险负责人", "3—6周", "incident_response"],
  ],
  B4: [
    ["建立岗位任务学习路径", "按岗位连接任务、AI做法、人工判断、练习和反馈，用真实产出和复盘验收。", "目标岗位都有真实任务练习与反馈。", "HR / L&D与业务负责人", "6—12周", "learning_path"],
    ["把AI工作改进纳入目标反馈", "评价问题定义、质量与风险控制、复盘和价值，不评价使用次数。", "试点目标同时包含行为、质量、风险和回看机制。", "HR / 业务负责人", "6—10周", "development_goal"],
    ["认可负责任的工作重构", "只认可遵守边界、报告问题、有证据复盘和能说明停止理由的行为。", "认可案例同时包含成功、失败、风险发现和停止决定。", "HR与业务负责人", "4—8周", "recognition"],
    ["建立经验复用闭环", "建立提交、审核、试用、反馈、更新或停用链路，并设置负责角色和复审日期。", "条目有实际复用记录，过期或无效条目能被停用。", "AI推进/业务运营", "6—10周", "knowledge_reuse"],
  ],
};

const orgTriggers: Record<DimensionId, Card["trigger"][]> = {
  A1: [bandTrigger("A1"), fragmentTrigger("A1", ["I01", "I03"]), classificationTrigger("UNCLAIMED_CAPACITY"), (c) => dimensionAtLeast(c, "A1", 70) ? { facts: ["A1不低于70，适合核查可迁移做法"] } : null],
  A2: [bandTrigger("A2"), fragmentTrigger("A2", ["I08"]), (c) => dimensionAtLeast(c, "A2", 55) && dimensionAtLeast(c, "B3", 55) ? { facts: ["A2与B3均不低于55"], bonus: 2 } : null, (c) => impactLag(c) ? { facts: ["已实现AI影响相对滞后"], bonus: 3 } : null],
  A3: [bandTrigger("A3"), fragmentTrigger("A3", ["I11", "I12"]), fragmentTrigger("A3", ["I10"]), (c) => fragmentTrigger("A3", ["I12"])(c)],
  A4: [bandTrigger("A4"), fragmentTrigger("A4", ["I14"]), fragmentTrigger("A4", ["I15"]), (c) => fragmentTrigger("A4", ["I16"])(c) ?? (impactLag(c) ? { facts: ["已实现AI影响相对滞后"], bonus: 3 } : null)],
  B1: [bandTrigger("B1"), fragmentTrigger("B1", ["O03", "O04"]), fragmentTrigger("B1", ["O04"]), fragmentTrigger("B1", ["O03"])],
  B2: [bandTrigger("B2"), fragmentTrigger("B2", ["O06"]), fragmentTrigger("B2", ["O07"]), (c) => fragmentTrigger("B2", ["O08"])(c) ?? classificationTrigger("BLOCKED_AGENCY")(c)],
  B3: [bandTrigger("B3"), fragmentTrigger("B3", ["O10"]), fragmentTrigger("B3", ["O11"]), fragmentTrigger("B3", ["O12"])],
  B4: [bandTrigger("B4"), fragmentTrigger("B4", ["O14"]), fragmentTrigger("B4", ["O15"]), fragmentTrigger("B4", ["O16"])],
};

for (const dimensionId of Object.keys(organizationCopy) as DimensionId[]) {
  organizationCopy[dimensionId].forEach(([title, action, successSignal, suggestedLead, suggestedWindow, actionFamily], index) => {
    const id = `REC-O-${dimensionId}-0${index + 1}`;
    CARDS.push(o(dimensionId, index + 1, {
      title, action, successSignal, suggestedLead, suggestedWindow, actionFamily,
      safety: ["A3", "B3"].includes(dimensionId) || id === "REC-O-B1-02",
      scaling: id === "REC-O-A2-03" || id === "REC-O-B2-04",
      measurement: id === "REC-O-A2-04" || id === "REC-O-A4-04",
      trigger: orgTriggers[dimensionId][index]!,
    }));
  });
}

const CONTEXT_RULE_IDS = [
  "REC-P-CTX-ACCESS",
  "REC-P-CTX-OPPORTUNITY",
  "REC-P-CTX-FREQUENCY",
  "REC-O-CTX-ACCESS",
  "REC-O-CTX-OPPORTUNITY",
  "REC-O-CTX-FREQUENCY",
] as const;

export const ACTION_LIBRARY_RELEASE = {
  version: "v0.2",
  status: "internal_pilot",
  expertReviewed: false,
  externalReleaseEligible: false,
  boundary:
    "建议已完成确定性规则和证据边界绑定，但仍需业务与方法专家审核后才能对外标记为正式发布。",
} as const;

export function auditActionLibrary() {
  const personal = CARDS.filter((card) => card.id.startsWith("REC-P-"));
  const organization = CARDS.filter((card) => card.id.startsWith("REC-O-"));
  const ids = [...CARDS.map((card) => card.id), ...CONTEXT_RULE_IDS];
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  const evidenceIds = [...new Set(CARDS.flatMap((card) => card.evidenceIds))];
  const missingEvidenceIds = evidenceIds.filter((id) => !EVIDENCE_REGISTRY[id]);
  const invalidEvidenceIds = Object.values(EVIDENCE_REGISTRY)
    .filter(
      (evidence) =>
        !evidence.url.startsWith("https://") ||
        !evidence.title.trim() ||
        !evidence.supports.trim() ||
        !evidence.boundary.trim(),
    )
    .map((evidence) => evidence.id);
  const emptyContentIds = CARDS.filter((card) =>
    [
      card.title,
      card.action,
      card.successSignal,
      card.suggestedLead,
      card.suggestedWindow,
      card.actionFamily,
    ].some((value) => !value.trim()),
  ).map((card) => card.id);
  const forbiddenVisibleLanguage = /Microsoft|微软|(^|\s)OD($|\s)|较少报告|普遍报告/i;
  const forbiddenLanguageIds = CARDS.filter((card) =>
    [
      card.title,
      card.rationale,
      card.action,
      card.successSignal,
      card.suggestedLead,
    ].some((value) => forbiddenVisibleLanguage.test(value)),
  ).map((card) => card.id);
  const draftOnlyIds = CARDS.filter(
    (card) => card.sourceStatus === "draft" && !card.releaseEligible,
  ).map((card) => card.id);
  const valid =
    personal.length === 32 &&
    organization.length === 32 &&
    CONTEXT_RULE_IDS.length === 6 &&
    duplicateIds.length === 0 &&
    missingEvidenceIds.length === 0 &&
    invalidEvidenceIds.length === 0 &&
    emptyContentIds.length === 0 &&
    forbiddenLanguageIds.length === 0 &&
    draftOnlyIds.length === 64;
  return {
    valid,
    release: ACTION_LIBRARY_RELEASE,
    counts: {
      personal: personal.length,
      organization: organization.length,
      context: CONTEXT_RULE_IDS.length,
      evidence: Object.keys(EVIDENCE_REGISTRY).length,
    },
    ids: {
      personal: personal.map((card) => card.id),
      organization: organization.map((card) => card.id),
      context: [...CONTEXT_RULE_IDS],
    },
    duplicateIds,
    missingEvidenceIds,
    invalidEvidenceIds,
    emptyContentIds,
    forbiddenLanguageIds,
    draftOnlyCount: draftOnlyIds.length,
  };
}

export const ACTION_LIBRARY_AUDIT = auditActionLibrary();
if (!ACTION_LIBRARY_AUDIT.valid)
  throw new Error(
    `ACTION_LIBRARY_INTEGRITY_FAILED:${JSON.stringify(ACTION_LIBRARY_AUDIT)}`,
  );

function contextCards(context: TriggerContext): Card[] {
  if (context.audience === "manager") return [];
  const organization = context.audience === "organization";
  const prefix = organization ? "O" : "P";
  const answers = organization ? context.sourceBackgroundAnswers ?? [] : [context.backgroundAnswers ?? {}];
  const lowRatio = (id: string) => {
    const valid = answers.map((entry) => entry[id]).filter((value): value is string => Boolean(value) && value !== "6");
    return valid.length >= (organization ? WORKFORCE_MINIMUM_SAMPLE : 1) ? valid.filter((value) => value === "1" || value === "2").length / valid.length : null;
  };
  const eligible = (id: string) => {
    const ratio = lowRatio(id);
    return ratio !== null && ratio >= (organization ? 0.3 : 1) ? ratio : null;
  };
  const result: Card[] = [];
  const add = (kind: "ACCESS" | "OPPORTUNITY" | "FREQUENCY", dimensionId: DimensionId, title: string, action: string, success: string, lead: string, window: string, family: string, facts: string[]) => {
    result.push(meta({ id: `REC-${prefix}-CTX-${kind}`, dimensionId, title, action, successSignal: success, suggestedLead: lead, suggestedWindow: window, actionFamily: family, leadMode: organization ? "organization" : "shared", safety: kind === "ACCESS", trigger: () => ({ facts, bonus: 2 }) }));
  };
  const access = eligible("BG03");
  if (access !== null) add("ACCESS", "B3", "处理工具或权限缺口", organization ? "按岗位核对已批准工具、权限、数据接入和真实任务需求，分清权限缺口、工具不适配还是规则不清。" : "不要使用未批准工具绕过限制；用具体任务、所需数据和预期价值向经理或工具管理角色说明缺口。", organization ? "高频需求形成允许、替代或拒绝及理由的台账。" : "获得允许、替代方案或不实施的明确结论。", organization ? "IT / AI平台与业务负责人" : "你与经理", organization ? "4—8周" : "1—2周", "access_enablement", [`BG03低选项比例${(access * 100).toFixed(1)}%`]);
  const opportunity = eligible("BG02");
  if (opportunity !== null) add("OPPORTUNITY", "A1", "先确认是否存在合适场景", organization ? "检查目标岗位是确实缺少合适场景，还是场景尚未被识别；允许当前不宜使用的岗位或任务。" : "不为使用AI而使用AI；与经理一起检查是否有低风险辅助任务，如没有，把精力用于相关知识和治理要求。", organization ? "场景清单包含可用与不宜使用的理由。" : "找到1个合理场景，或明确当前不需强行应用。", organization ? "业务负责人" : "你与经理", organization ? "3—6周" : "1—2周", "scenario_selection", [`BG02低选项比例${(opportunity * 100).toFixed(1)}%`]);
  const frequency = eligible("BG01");
  const bg02Adequate = lowRatio("BG02") !== null && (lowRatio("BG02") ?? 1) < 0.3;
  const bg03Adequate = lowRatio("BG03") !== null && (lowRatio("BG03") ?? 1) < 0.3;
  if (frequency !== null && bg02Adequate && bg03Adequate) add("FREQUENCY", "A2", "用真实任务形成稳定练习", organization ? "用真实任务练习和经理陪跑提高有价值的采用，不以登录天数或使用次数作为绩效目标。" : "为一个每周出现的任务设定何时、做什么、如何检查的计划，连续执行四周。", organization ? "采用与任务质量、时间或学习结果一起被记录。" : "完成预定练习并记录价值与问题，不只记录次数。", organization ? "业务经理与HR" : "你", "4周", "adoption_practice", [`BG01低选项比例${(frequency * 100).toFixed(1)}%，且BG02/BG03基本充足`]);
  return result;
}

function managerCards(context: TriggerContext): Card[] {
  const ranked = (["B1", "B2", "B3", "B4"] as DimensionId[])
    .filter((id) => context.score.dimensions[id].value !== null)
    .sort((a, b) => (context.score.dimensions[a].value ?? 101) - (context.score.dimensions[b].value ?? 101) || a.localeCompare(b));
  return ranked.flatMap((dimensionId, index) => {
    const band = scoreBand(context.score.dimensions[dimensionId].value);
    if (band !== "S1" && band !== "S2" && index >= 3) return [];
    return [meta({
      id: `REC-M-${dimensionId}-01`, dimensionId,
      title: `先核查${dimensionId}相关观察`,
      action: "选择3—5名相关员工做简短访谈，并核对1个真实工作流程；证据一致后再决定是否试点。",
      successSignal: "完成访谈与流程核对，记录支持、不支持和尚不确定的证据。",
      suggestedLead: "指定管理者 / HR", suggestedWindow: "1—2周", actionFamily: "qualitative_validation",
      leadMode: "shared", safety: dimensionId === "B3", trigger: () => ({ facts: [`管理者自评${dimensionId}处于${band}`] }),
    })];
  });
}

function priorityScore(card: Card, trigger: TriggerResult, context: TriggerContext): number {
  const band = scoreBand(context.score.dimensions[card.dimensionId].value);
  return (band === "S1" ? 4 : band === "S2" ? 3 : context.bottomDimensions.has(card.dimensionId) ? 1 : 0)
    + (trigger.bonus ?? 0) + (card.isSafetyPrerequisite ? 3 : 0) + 2
    + (card.evidenceStrength === "B" ? 2 : card.evidenceStrength === "C" ? 1 : 0);
}

export function buildActionPlan(input: {
  audience: Audience;
  score: ScoreSnapshot;
  itemPatternRecords: ItemPatternRecord[];
  backgroundAnswers?: Record<string, string>;
  sourceBackgroundAnswers?: Array<Record<string, string>>;
  systemPlanOverride?: RecommendationSnapshot[];
  recommendationsOverride?: RecommendationSnapshot[];
  actionRuleAuditOverride?: ActionRuleAudit[];
}): { systemPlan: RecommendationSnapshot[]; recommendations: RecommendationSnapshot[]; actionRuleAudit: ActionRuleAudit[] } {
  if (input.systemPlanOverride && input.recommendationsOverride)
    return { systemPlan: input.systemPlanOverride, recommendations: input.recommendationsOverride, actionRuleAudit: input.actionRuleAuditOverride ?? [] };
  const dimensions = (Object.keys(input.score.dimensions) as DimensionId[])
    .filter((id) => input.score.dimensions[id].value !== null)
    .sort((a, b) => (input.score.dimensions[a].value ?? 101) - (input.score.dimensions[b].value ?? 101) || a.localeCompare(b));
  const context: TriggerContext = { ...input, patterns: input.itemPatternRecords, bottomDimensions: new Set(dimensions.slice(0, 2)) };
  const library = input.audience === "manager" ? managerCards(context) : [...CARDS.filter((card) => card.id.startsWith(`REC-${input.audience === "personal" ? "P" : "O"}-`)), ...contextCards(context)];
  const audit = new Map<string, ActionRuleAudit>();
  const qualified = library.flatMap((card) => {
    const result = card.trigger(context);
    if (!result) {
      audit.set(card.id, { recommendationId: card.id, status: "suppressed", reasonCodes: ["trigger_not_met"], triggerFacts: [] });
      return [];
    }
    if (card.isScalingAction && (scoreBand(input.score.dimensions.A3.value) === "S1" || scoreBand(input.score.dimensions.B3.value) === "S1")) {
      audit.set(card.id, { recommendationId: card.id, status: "suppressed", reasonCodes: ["scaling_prerequisite_blocked"], triggerFacts: result.facts });
      return [];
    }
    const { trigger: _trigger, ...snapshotFields } = card;
    audit.set(card.id, { recommendationId: card.id, status: "qualified", reasonCodes: [], triggerFacts: result.facts });
    return [{ ...snapshotFields, priority: 0, priorityScore: priorityScore(card, result, context), triggerFacts: result.facts, requiredFragmentIds: result.fragments ?? [] } satisfies RecommendationSnapshot];
  }).sort((a, b) => b.priorityScore - a.priorityScore || Number(b.isSafetyPrerequisite) - Number(a.isSafetyPrerequisite) || (input.score.dimensions[a.dimensionId].value ?? 101) - (input.score.dimensions[b.dimensionId].value ?? 101) || b.evidenceStrength.localeCompare(a.evidenceStrength) || a.suggestedWindow.localeCompare(b.suggestedWindow) || a.id.localeCompare(b.id));
  const contextTriggered = qualified.some((entry) => entry.id.includes("-CTX-"));
  const s1Count = dimensions.filter((id) => scoreBand(input.score.dimensions[id].value) === "S1").length;
  let limit = contextTriggered || s1Count >= 2 ? 4 : 3;
  if (limit === 4 && qualified.some((entry) => entry.isScalingAction) && qualified.some((entry) => entry.isSafetyPrerequisite) && qualified.some((entry) => entry.isMeasurementAction)) limit = 5;
  const selected: RecommendationSnapshot[] = [];
  for (const candidate of qualified) {
    if (selected.length >= limit) {
      audit.set(candidate.id, { ...audit.get(candidate.id)!, status: "qualified", reasonCodes: ["priority_display_limit"] });
      continue;
    }
    if (selected.some((entry) => entry.actionFamily === candidate.actionFamily)) {
      audit.set(candidate.id, { ...audit.get(candidate.id)!, status: "qualified", reasonCodes: ["duplicate_action_family"] });
      continue;
    }
    if (input.audience === "personal" && candidate.leadMode === "individual" && selected.filter((entry) => entry.leadMode === "individual").length >= 3) {
      audit.set(candidate.id, { ...audit.get(candidate.id)!, status: "qualified", reasonCodes: ["individual_action_limit"] });
      continue;
    }
    if (input.audience === "organization" && selected.filter((entry) => entry.dimensionId === candidate.dimensionId).length >= 2) {
      audit.set(candidate.id, { ...audit.get(candidate.id)!, status: "qualified", reasonCodes: ["same_dimension_limit"] });
      continue;
    }
    selected.push(candidate);
    audit.set(candidate.id, { ...audit.get(candidate.id)!, status: "selected", reasonCodes: [] });
  }
  if (selected.length < MIN_PRIORITY_ACTIONS) {
    for (const candidate of qualified) {
      if (selected.length >= Math.min(MIN_PRIORITY_ACTIONS, qualified.length)) break;
      if (selected.some((entry) => entry.id === candidate.id)) continue;
      selected.push(candidate);
      audit.set(candidate.id, {
        ...audit.get(candidate.id)!,
        status: "selected",
        reasonCodes: [],
      });
    }
  }
  const withPriority = (items: RecommendationSnapshot[]) => items.map((entry, index) => ({ ...entry, priority: index + 1 }));
  return {
    systemPlan: withPriority(qualified),
    recommendations: withPriority(selected),
    actionRuleAudit: [...audit.values()].sort((a, b) => a.recommendationId.localeCompare(b.recommendationId)),
  };
}
