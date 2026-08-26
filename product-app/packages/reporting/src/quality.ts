import type {
  BehaviorEvidenceSnapshot,
  DevelopmentPathwayStep,
  ObserverOrganizationNoActionReason,
  ProfileNarrative,
  RecommendationSnapshot,
  ReportContentQuality,
  ReportStoryline,
  ReportSnapshot,
  ReportType,
  ScoreSnapshot,
} from "@ai-readiness/contracts";

type LanguageScope = "personal_behavior" | "organization_observation" | "organization_group" | "action" | "general";
export interface ReportLanguageSection {
  id: string;
  scope: LanguageScope;
  text: string;
}
export interface ReportLanguageIssue {
  code: "forbidden_abstract_phrase" | "duplicate_sentence" | "repeated_sentence_opening" | "observation_agency_overreach";
  sectionIds: string[];
}

const FORBIDDEN_LANGUAGE = /更值得先处理|更值得先核对|较少报告|群体较普遍报告|工作重构条件来承接|还不是各处都能做到的日常做法/u;

export function auditReportLanguage(sections: ReportLanguageSection[]): ReportLanguageIssue[] {
  const issues: ReportLanguageIssue[] = [];
  for (const section of sections) {
    if (FORBIDDEN_LANGUAGE.test(section.text))
      issues.push({ code: "forbidden_abstract_phrase", sectionIds: [section.id] });
    if (section.scope === "organization_observation" && /你已经能同时做到|你能够建立|你应制定(?:制度|规则)/u.test(section.text))
      issues.push({ code: "observation_agency_overreach", sectionIds: [section.id] });
  }
  const sentenceOwners = new Map<string, string[]>();
  for (const section of sections) {
    for (const sentence of section.text.split(/[。！？]/u).map((entry) => entry.trim()).filter((entry) => entry.length >= 12))
      sentenceOwners.set(sentence, [...(sentenceOwners.get(sentence) ?? []), section.id]);
  }
  for (const owners of sentenceOwners.values())
    if (owners.length > 1) issues.push({ code: "duplicate_sentence", sectionIds: owners });
  const openingOwners = new Map<string, string[]>();
  for (const section of sections) {
    const opening = section.text.split(/[，。；]/u)[0]?.trim() ?? "";
    if (opening.length >= 4)
      openingOwners.set(opening, [...(openingOwners.get(opening) ?? []), section.id]);
  }
  for (const owners of openingOwners.values())
    if (owners.length > 1) issues.push({ code: "repeated_sentence_opening", sectionIds: owners });
  return issues;
}

export function reportLanguageSections(report: ReportSnapshot): ReportLanguageSection[] {
  const observer = report.reportType === "personal_observer";
  const sections: ReportLanguageSection[] = [];
  if (report.profileNarrative)
    sections.push(...report.profileNarrative.paragraphs.map((entry) => ({ id: `profile:${entry.kind}`, scope: "general" as const, text: entry.text })));
  else
    sections.push(...report.overallProfile.map((text, index) => ({ id: `profile:legacy:${index}`, scope: "general" as const, text })));
  if (report.behaviorEvidence?.length)
    sections.push(...report.behaviorEvidence.map((entry) => ({
      id: `behavior:${entry.dimensionId}`,
      scope: entry.dimensionId.startsWith("B") ? (observer ? "organization_observation" as const : "organization_group" as const) : "personal_behavior" as const,
      text: `${entry.overallMeaning}${entry.concreteBehavior}${entry.impactOrRisk}${entry.boundary}`,
    })));
  else
    sections.push(...report.diagnoses.flatMap((entry) => entry.visibleText.filter((text) => text !== entry.boundaryText).slice(0, 2).map((text, index) => ({
      id: `diagnosis:${entry.dimensionId}:${index}`,
      scope: entry.dimensionId.startsWith("B") ? (observer ? "organization_observation" as const : "organization_group" as const) : "personal_behavior" as const,
      text,
    }))));
  sections.push(...report.recommendations.map((entry) => ({ id: `action:${entry.id}`, scope: "action" as const, text: `${entry.selectionReason ?? entry.rationale}${entry.action}${entry.successSignal}` })));
  sections.push(...(report.developmentPathway ?? []).map((entry) => ({ id: `pathway:${entry.id}`, scope: "general" as const, text: `${entry.description}${entry.outcome}` })));
  return sections;
}

const CHECKS = [
  "no_contradictory_scaling",
  "tie_handling",
  "perspective_boundary",
  "sentence_uniqueness",
  "action_responsibility_and_timing",
  "specific_behavior_coverage",
] as const;

export function auditReportContent(input: {
  reportType: ReportType;
  score: ScoreSnapshot;
  storyline: ReportStoryline;
  profileNarrative: ProfileNarrative;
  observerOrganizationNoActionReason?: ObserverOrganizationNoActionReason;
  evidence: BehaviorEvidenceSnapshot[];
  recommendations: RecommendationSnapshot[];
  pathway: DevelopmentPathwayStep[];
  visibleTexts: string[];
}): ReportContentQuality {
  const errors: string[] = [];
  const governanceBlocked = (input.score.dimensions.B3.value ?? 100) < 45;
  const judgmentBlocked = (input.score.dimensions.A3.value ?? 100) < 45;
  if ((governanceBlocked || judgmentBlocked) && (
    input.recommendations.some((entry) => entry.actionMode === "scale" && (
      entry.dimensionId.startsWith("A") ? judgmentBlocked : governanceBlocked
    )) ||
    input.pathway.some((entry) => entry.mode === "scale" && entry.dimensionIds.some((id) =>
      id.startsWith("A") ? judgmentBlocked : governanceBlocked,
    ))
  )) errors.push("contradictory_scaling_before_prerequisite");

  const mature = input.evidence.filter((entry) => (entry.score ?? -1) >= 70);
  const matureScores = new Set(mature.map((entry) => entry.score));
  if (mature.length > 1 && matureScores.size === 1 && mature.some((entry) => !input.storyline.strengthDimensionIds.includes(entry.dimensionId)))
    errors.push("tied_mature_dimension_omitted");

  if (input.reportType === "personal_observer") {
    if (input.evidence.filter((entry) => entry.dimensionId.startsWith("B")).some((entry) => !entry.boundary.includes("个人观察")))
      errors.push("observer_boundary_missing");
    const organizationActions = input.recommendations.filter((entry) => entry.dimensionId.startsWith("B"));
    const lowOrganizationDimensions = (["B1", "B2", "B3", "B4"] as const)
      .filter((id) => (input.score.dimensions[id].value ?? 100) < 55).length;
    const maximum = lowOrganizationDimensions >= 2 ? 2 : 1;
    if (organizationActions.length > maximum)
      errors.push("observer_action_quota_exceeded");
    if (lowOrganizationDimensions === 0 && organizationActions.some((entry) =>
      entry.requiredFragmentIds.length === 0 || (input.score.dimensions[entry.dimensionId].value ?? 0) < 70,
    )) errors.push("observer_high_support_action_not_lightweight");
    if (organizationActions.some((entry) => entry.leadMode !== "shared"))
      errors.push("observer_action_responsibility_invalid");
    if (organizationActions.length === 0 && !input.observerOrganizationNoActionReason)
      errors.push("observer_no_action_reason_missing");
    if (organizationActions.length > 0 && input.observerOrganizationNoActionReason)
      errors.push("observer_no_action_reason_with_actions");
    if (input.observerOrganizationNoActionReason && (
      !input.observerOrganizationNoActionReason.explanation.trim() ||
      !input.observerOrganizationNoActionReason.watchFor.trim() ||
      input.observerOrganizationNoActionReason.evidenceIds.length === 0
    )) errors.push("observer_no_action_reason_incomplete");
  }

  const profileTexts = input.profileNarrative.paragraphs.map((entry) => entry.text);
  const profileLength = profileTexts.join("").length;
  const expectedRoles = ["integrated_state", "working_chain", "breakpoint_impact", "next_priority"];
  if (input.profileNarrative.paragraphs.length < 3 || input.profileNarrative.paragraphs.length > 4 ||
      expectedRoles.some((role) => !input.profileNarrative.paragraphs.some((entry) => entry.kind === role)))
    errors.push("integrated_profile_structure_invalid");
  if (profileLength < 260 || profileLength > 1200)
    errors.push("integrated_profile_length_invalid");
  if (input.profileNarrative.paragraphs.some((entry) =>
    entry.evidenceIds.length === 0 ||
    (entry.fragmentIds.length === 0 && entry.patternIds.length === 0 && entry.fallbackIds.length === 0),
  ))
    errors.push("integrated_profile_evidence_missing");
  if (!input.profileNarrative.boundaryNotice?.text.trim())
    errors.push("integrated_profile_boundary_missing");
  const profileBehaviorCoverage = input.evidence.some((entry) =>
    [...entry.strengthBehaviors, ...entry.developmentBehaviors].some((behavior) => profileTexts.join("").includes(behavior)),
  );
  const hasSpecificBehaviorEvidence = input.evidence.some((entry) =>
    entry.distributionType !== "insufficient" &&
    [...entry.strengthBehaviors, ...entry.developmentBehaviors].length > 0,
  );
  if (hasSpecificBehaviorEvidence && !profileBehaviorCoverage)
    errors.push("integrated_profile_specific_behavior_missing");

  const normalized = input.visibleTexts
    .flatMap((text) => text.split(/[。！？]/))
    .map((text) => text.trim())
    .filter((text) => text.length >= 12);
  if (new Set(normalized).size !== normalized.length)
    errors.push("repeated_visible_sentence");

  if (input.recommendations.some((entry) => !entry.suggestedWindow.trim() || !entry.successSignal.trim()))
    errors.push("action_timing_or_completion_missing");
  if (input.recommendations.some((entry) => entry.id === "REC-P-A3-01" && (
    !/出处|来源/u.test(entry.action) || !/数字|计算/u.test(entry.action) ||
    !/遗漏|矛盾/u.test(entry.action) || !/敏感|批准/u.test(entry.action) ||
    !/连续.*3|3份/u.test(entry.successSignal)
  ))) errors.push("a3_action_not_executable");
  if (input.evidence.some((entry) => entry.distributionType !== "insufficient" && (!entry.concreteBehavior.trim() || entry.sourceFragmentIds.length === 0)))
    errors.push("specific_behavior_evidence_missing");

  const languageIssues = auditReportLanguage([
    { id: "storyline:headline", scope: "general", text: input.storyline.headline },
    { id: "storyline:formed", scope: "general", text: input.storyline.formedBehaviorSummary },
    ...input.evidence.map((entry) => ({
      id: `behavior:${entry.dimensionId}`,
      scope: entry.dimensionId.startsWith("B")
        ? input.reportType === "personal_observer" ? "organization_observation" as const : "organization_group" as const
        : "personal_behavior" as const,
      text: `${entry.concreteBehavior}${entry.impactOrRisk}`,
    })),
  ]);
  const blockingLanguageIssues = languageIssues.filter((entry) =>
    entry.code === "forbidden_abstract_phrase" || entry.code === "observation_agency_overreach",
  );
  if (blockingLanguageIssues.length) errors.push(`language_gate:${blockingLanguageIssues.map((entry) => entry.code).join("|")}`);

  const capability = input.score.employeeAiCapability.value;
  const readiness = input.score.organizationalAiReadiness.value;
  if (capability !== null && capability < 55 && readiness !== null && readiness >= 70 && /个人.*(?:成熟|已有基础)/u.test(input.storyline.headline))
    errors.push("headline_confuses_support_with_personal_capability");

  if (errors.length) throw new Error(`REPORT_CONTENT_QUALITY_FAILED:${errors.join(",")}`);
  return { status: "passed", checks: [...CHECKS] };
}
