import type { AssessmentTarget, DimensionId } from "@ai-readiness/contracts";

export interface QuestionnaireItem {
  id: string;
  dimensionId: DimensionId | "C";
  text: string;
  unavailableLabel: string;
}

export interface BackgroundQuestionnaireItem {
  id: "BG01" | "BG02" | "BG03";
  text: string;
  options: Array<{ value: string; label: string }>;
}

export const BACKGROUND_ITEMS: BackgroundQuestionnaireItem[] = [
  {
    id: "BG01",
    text: "过去 30 天，你在工作中有多少天使用过 AI？",
    options: [
      "0 天",
      "1—2 天",
      "3—5 天",
      "6—10 天",
      "11 天及以上",
      "记不清楚",
    ].map((label, index) => ({ value: String(index + 1), label })),
  },
  {
    id: "BG02",
    text: "你的日常工作中，有多少任务适合使用 AI？",
    options: [
      "几乎没有合适的任务",
      "只有少量、偶尔出现的任务",
      "有一些比较明确的任务",
      "有多个经常发生的任务",
      "大部分核心工作流程中都有合适的任务",
      "不了解或无法判断",
    ].map((label, index) => ({ value: String(index + 1), label })),
  },
  {
    id: "BG03",
    text: "目前获得公司批准的 AI 工具和使用权限，能在多大程度上满足你的工作需要？",
    options: [
      "完全不能满足",
      "只能满足少量需要",
      "能满足基本需要",
      "能满足大部分需要",
      "基本能够充分满足",
      "不了解或没有相关需要",
    ].map((label, index) => ({ value: String(index + 1), label })),
  },
];

export function backgroundItemsForIds(
  ids: string[],
): BackgroundQuestionnaireItem[] {
  const enabled = new Set(ids);
  return BACKGROUND_ITEMS.filter((item) => enabled.has(item.id));
}

const item = (
  id: string,
  dimensionId: DimensionId | "C",
  text: string,
  unavailableLabel: string,
): QuestionnaireItem => ({ id, dimensionId, text, unavailableLabel });

export const QUESTIONNAIRE_ITEMS: QuestionnaireItem[] = [
  item(
    "I01",
    "A1",
    "过去 3 个月，在使用 AI 开始一项工作前，我会先向 AI 说明要完成的目标、必要背景和结果要求。",
    "过去3个月没有相关任务，或无法判断",
  ),
  item(
    "I02",
    "A1",
    "过去 3 个月，面对一项新任务时，我会先判断它是否适合使用 AI，以及适合使用哪类 AI 工具。",
    "过去3个月没有相关任务，或无法判断",
  ),
  item(
    "I03",
    "A1",
    "过去 3 个月，在用 AI 处理复杂任务时，我会先拆分任务，再通过多轮提问逐步改进结果。",
    "过去3个月没有相关任务，或无法判断",
  ),
  item(
    "I04",
    "A1",
    "过去 3 个月，遇到新的 AI 工具或功能时，我通常能在较少依赖他人帮助的情况下学会并用于工作。",
    "过去3个月没有相关机会，或无法判断",
  ),
  item(
    "I05",
    "A2",
    "过去 3 个月，我使用 AI 做过信息分析、解决问题或辅助决策，而不只是生成文字或图片。",
    "过去3个月没有相关任务，或无法判断",
  ),
  item(
    "I06",
    "A2",
    "过去 3 个月，我让 AI 连续完成过两个或以上相互关联的工作步骤。",
    "过去3个月没有相关任务，或无法判断",
  ),
  item(
    "I07",
    "A2",
    "过去 3 个月，我在一项工作中组合使用过多个 AI 工具、智能体或不同的数据源。",
    "过去3个月没有相关任务，或无法判断",
  ),
  item(
    "I08",
    "A2",
    "过去 3 个月，我曾使用 AI 重新设计一套完整工作流程，而不只是加快其中某一个步骤。",
    "过去3个月没有相关任务，或无法判断",
  ),
  item(
    "I09",
    "A3",
    "过去 3 个月，在采用 AI 生成的结果前，我会根据工作目标进行判断和修改，并对最终结果负责。",
    "过去3个月没有相关任务，或无法判断",
  ),
  item(
    "I10",
    "A3",
    "过去 3 个月，当 AI 输出涉及重要事实或数据时，我会在使用前核查其中的关键信息。",
    "过去3个月没有相关任务，或无法判断",
  ),
  item(
    "I11",
    "A3",
    "过去 3 个月，在开始一项 AI 辅助工作前，我会明确哪些步骤可以交给 AI，哪些必须由人判断。",
    "过去3个月没有相关任务，或无法判断",
  ),
  item(
    "I12",
    "A3",
    "过去 3 个月，当 AI 结果可能带来较大影响或存在明显疑问时，我会暂停使用并请相关人员复核。",
    "过去3个月没有相关任务，或无法判断",
  ),
  item(
    "I13",
    "A4",
    "过去 3 个月，我尝试过新的 AI 工作方法，并比较过它与原有方法的效果。",
    "过去3个月没有相关机会，或无法判断",
  ),
  item(
    "I14",
    "A4",
    "过去 3 个月，我向同事分享过可复用的 AI 方法、工具或失败经验。",
    "过去3个月没有相关机会，或无法判断",
  ),
  item(
    "I15",
    "A4",
    "过去 3 个月，我把自己有效的 AI 做法整理成提示词、模板或操作步骤，供以后重复使用。",
    "过去3个月没有相关机会，或无法判断",
  ),
  item(
    "I16",
    "A4",
    "过去 3 个月，AI 让我完成了过去做不到的新工作，或显著增加了我从事高价值工作的时间。",
    "过去3个月没有相关任务，或无法判断",
  ),
  item(
    "O01",
    "B1",
    "过去 3 个月，我从领导层获得的关于 AI 方向、优先事项和具体期望的信息是清楚且一致的。",
    "不了解或无法判断",
  ),
  item(
    "O02",
    "B1",
    "过去 3 个月，我看到公司在实际工作中鼓励员工了解、尝试并合理使用 AI。",
    "不了解或无法判断",
  ),
  item(
    "O03",
    "B1",
    "过去 3 个月，在我的团队中，员工可以提出用 AI 改进现有工作方式的建议，而不必担心因为提出不同做法受到负面评价。",
    "不了解或无法判断",
  ),
  item(
    "O04",
    "B1",
    "过去 3 个月，当 AI 尝试没有达到预期时，团队通常会复盘原因，并允许调整后再试。",
    "不了解或无法判断",
  ),
  item(
    "O05",
    "B2",
    "过去 3 个月，我的直接经理在实际工作中示范过如何使用 AI。",
    "没有直接经理或无法判断",
  ),
  item(
    "O06",
    "B2",
    "过去 3 个月，我的直接经理为 AI 尝试提供过必要的时间、工具或其他支持。",
    "没有直接经理或无法判断",
  ),
  item(
    "O07",
    "B2",
    "过去 3 个月，我的直接经理明确说明过 AI 辅助工作的质量要求。",
    "没有直接经理或无法判断",
  ),
  item(
    "O08",
    "B2",
    "过去 3 个月，我的直接经理支持团队用 AI 重新设计完成工作的方式，而不只追求短期产出。",
    "没有直接经理或无法判断",
  ),
  item(
    "O09",
    "B3",
    "我知道公司允许和禁止使用 AI 处理哪些数据或工作，并能找到相关规定。",
    "不了解或无法判断",
  ),
  item(
    "O10",
    "B3",
    "在 AI 参与的重要工作中，我知道哪些结果必须由人确认，以及出现问题时应找谁处理。",
    "不了解或无法判断",
  ),
  item(
    "O11",
    "B3",
    "团队已经把常用的 AI 工作流程整理成可查阅的操作说明，并明确其中需要人工确认的环节。",
    "不了解或无法判断",
  ),
  item(
    "O12",
    "B3",
    "过去 3 个月，团队记录并复盘过 AI 出现的错误或失效情况，并据此调整过做法。",
    "不了解或无法判断",
  ),
  item(
    "O13",
    "B4",
    "过去 3 个月，公司或团队结合我的岗位和实际任务，提供过 AI 学习、练习或辅导支持。",
    "不了解或无法判断",
  ),
  item(
    "O14",
    "B4",
    "过去 3 个月，我与经理讨论工作目标或工作反馈时，AI 能力提升或工作方式改进被纳入了讨论。",
    "没有相关讨论或无法判断",
  ),
  item(
    "O15",
    "B4",
    "过去 3 个月，即使 AI 尝试没有立即带来业务结果，只要过程符合要求，员工改进工作方式的努力仍会得到认可。",
    "不了解或无法判断",
  ),
  item(
    "O16",
    "B4",
    "过去 3 个月，团队把 AI 实践中的有效做法和失败经验整理成案例、模板或操作方法，供其他同事参考和复用。",
    "不了解或无法判断",
  ),
  item(
    "V01",
    "C",
    "过去 3 个月，与不使用 AI 时相比，AI 帮助我提出了更多有价值的新想法或解决方案。",
    "过去3个月没有使用AI，或无法判断",
  ),
  item(
    "V02",
    "C",
    "过去 3 个月，AI 帮助我完成了以前因知识、技能或时间限制而难以完成的工作。",
    "过去3个月没有使用AI，或无法判断",
  ),
  item(
    "V03",
    "C",
    "过去 3 个月，AI 使我的首轮交付结果更接近工作要求。",
    "过去3个月没有使用AI，或无法判断",
  ),
  item(
    "V04",
    "C",
    "过去 3 个月，AI 帮助我在相同时间内完成了更多符合要求的工作。",
    "过去3个月没有使用AI，或无法判断",
  ),
  item(
    "V05",
    "C",
    "过去 3 个月，AI 减少了我与他人在信息整理、沟通或协作中的重复工作。",
    "过去3个月没有使用AI，或无法判断",
  ),
  item(
    "V06",
    "C",
    "过去 3 个月，AI 帮助我更清楚地掌握工作进展，并及时发现需要调整的问题。",
    "过去3个月没有使用AI，或无法判断",
  ),
  item(
    "V07",
    "C",
    "过去 3 个月，我通过使用 AI 获得了对当前岗位或未来发展有帮助的新能力。",
    "过去3个月没有使用AI，或无法判断",
  ),
  item(
    "V08",
    "C",
    "过去 3 个月，AI 减少了重复性工作，使我能够把更多时间投入判断、创意或解决复杂问题。",
    "过去3个月没有使用AI，或无法判断",
  ),
  item(
    "V09",
    "C",
    "过去 3 个月，AI 改善了我的工作体验，并让我更愿意继续留在当前组织。",
    "过去3个月没有使用AI，或无法判断",
  ),
  item(
    "V10",
    "C",
    "过去 3 个月，AI 已经实际改善了我或团队的工作流程或决策质量。",
    "过去3个月没有使用AI，或无法判断",
  ),
];

export const DIMENSION_ITEMS: Record<DimensionId, string[]> = {
  A1: ["I01", "I02", "I03", "I04"],
  A2: ["I05", "I06", "I07", "I08"],
  A3: ["I09", "I10", "I11", "I12"],
  A4: ["I13", "I14", "I15", "I16"],
  B1: ["O01", "O02", "O03", "O04"],
  B2: ["O05", "O06", "O07", "O08"],
  B3: ["O09", "O10", "O11", "O12"],
  B4: ["O13", "O14", "O15", "O16"],
};

export const ADMINISTRATION_ORDER = [
  "I01",
  "O01",
  "I05",
  "O05",
  "I09",
  "O09",
  "I13",
  "O13",
  "I02",
  "O02",
  "I06",
  "O06",
  "I10",
  "O10",
  "I14",
  "O14",
  "I03",
  "O03",
  "I07",
  "O07",
  "I11",
  "O11",
  "I15",
  "O15",
  "I04",
  "O04",
  "I08",
  "O08",
  "I12",
  "O12",
  "I16",
  "O16",
  "V01",
  "V02",
  "V03",
  "V04",
  "V05",
  "V06",
  "V07",
  "V08",
  "V09",
  "V10",
];

export function itemIdsForTarget(target: AssessmentTarget): string[] {
  if (target === "personal")
    return ADMINISTRATION_ORDER.filter(
      (id) => id.startsWith("I") || id.startsWith("V"),
    );
  if (target === "organization")
    return ADMINISTRATION_ORDER.filter((id) => id.startsWith("O"));
  return ADMINISTRATION_ORDER;
}

export function questionnaireForTarget(
  target: AssessmentTarget,
): QuestionnaireItem[] {
  const byId = new Map(QUESTIONNAIRE_ITEMS.map((entry) => [entry.id, entry]));
  return itemIdsForTarget(target)
    .map((id) => byId.get(id))
    .filter((entry): entry is QuestionnaireItem => Boolean(entry));
}
