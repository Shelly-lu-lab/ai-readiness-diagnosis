import { createHash, randomUUID } from "node:crypto";
import {
  EXECUTABLE_RULESET_SHA256,
  VERSION_TUPLE,
  WORKFORCE_MINIMUM_SAMPLE,
  type CampaignStatus,
  type QuestionnaireRelease,
  type ReportSnapshot,
} from "@ai-readiness/contracts";
import type { ProductRepository } from "@ai-readiness/database";
import {
  aggregateScoreSnapshots,
  backgroundItemsForIds,
  questionnaireForTarget,
} from "@ai-readiness/domain";
import {
  buildOrganizationBenchmark,
  buildReportSnapshot,
  buildRetestComparison,
} from "@ai-readiness/reporting";

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
};

export function questionnaireReleaseContentHash(
  release: Pick<
    QuestionnaireRelease,
    | "items"
    | "backgroundItems"
    | "customItems"
    | "scale"
    | "versions"
    | "ruleManifestHash"
  >,
) {
  return createHash("sha256")
    .update(
      canonicalJson({
        items: release.items,
        backgroundItems: release.backgroundItems,
        customItems: release.customItems,
        scale: release.scale,
        versions: release.versions,
        ruleManifestHash: release.ruleManifestHash,
      }),
    )
    .digest("hex");
}

export async function transitionCampaignWithReport(input: {
  repository: ProductRepository;
  tenantId: string;
  campaignId: string;
  status: CampaignStatus;
  actorId: string;
  organizationLabel: string;
  now?: Date;
}): Promise<{
  campaign: NonNullable<Awaited<ReturnType<ProductRepository["getCampaign"]>>>;
  organizationReport: ReportSnapshot | null;
} | null> {
  const current = await input.repository.getCampaign(
    input.tenantId,
    input.campaignId,
  );
  if (!current) return null;
  const effectiveStatus: CampaignStatus =
    input.status === "active" &&
    current.status === "draft" &&
    (input.now ?? new Date()).getTime() < new Date(current.startsAt).getTime()
      ? "scheduled"
      : input.status;
  if (current.status === effectiveStatus)
    return {
      campaign: current,
      organizationReport:
        effectiveStatus === "closed"
          ? await input.repository.latestOrganizationReportForCampaign(
              input.tenantId,
              input.campaignId,
            )
          : null,
    };
  if (["scheduled", "active"].includes(effectiveStatus) && current.status === "draft") {
    const draft = current;
    const existing = await input.repository.getQuestionnaireRelease(
      input.tenantId,
      input.campaignId,
    );
    if (!existing) {
      const content = {
        items: questionnaireForTarget(draft.target),
        backgroundItems: backgroundItemsForIds(draft.backgroundItemIds),
        customItems: draft.customItems,
        scale: [
          { value: 1 as const, label: "完全不符合" },
          { value: 2 as const, label: "较少符合" },
          { value: 3 as const, label: "部分符合" },
          { value: 4 as const, label: "大部分符合" },
          { value: 5 as const, label: "完全符合" },
        ],
        versions: VERSION_TUPLE,
        ruleManifestHash: EXECUTABLE_RULESET_SHA256,
      };
      const release: QuestionnaireRelease = {
        id: randomUUID(),
        tenantId: input.tenantId,
        campaignId: input.campaignId,
        ...content,
        contentHash: questionnaireReleaseContentHash(content),
        createdAt: new Date().toISOString(),
      };
      await input.repository.saveQuestionnaireRelease(release);
    }
  }
  let campaign;
  try {
    campaign = await input.repository.transitionCampaign(
      input.tenantId,
      input.campaignId,
      effectiveStatus,
      input.actorId,
    );
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== "CAMPAIGN_TRANSITION_RACE"
    )
      throw error;
    const latest = await input.repository.getCampaign(
      input.tenantId,
      input.campaignId,
    );
    if (!latest || latest.status !== effectiveStatus) throw error;
    return {
      campaign: latest,
      organizationReport:
        effectiveStatus === "closed"
          ? await input.repository.latestOrganizationReportForCampaign(
              input.tenantId,
              input.campaignId,
            )
          : null,
    };
  }
  if (!campaign) return null;
  let organizationReport: ReportSnapshot | null = null;
  if (
    effectiveStatus === "closed" &&
    campaign.target !== "personal" &&
    campaign.assessmentProfileId !== "personal_iov_observer_v0.1"
  ) {
    const scoreRecords = await input.repository.responseScoreRecords(
      input.tenantId,
      campaign.id,
    );
    const scores = scoreRecords.map((record) => record.score);
    const minimum =
      campaign.organizationMethod === "single_manager_self_assessment" ? 1 : WORKFORCE_MINIMUM_SAMPLE;
    if (scores.length >= minimum) {
      const departmentLabels = await input.repository.departmentLabels(
        input.tenantId,
      );
      const departmentGroups = Object.entries(
        scoreRecords.reduce<Record<string, typeof scores>>((groups, record) => {
          for (const departmentId of record.departmentIds)
            (groups[departmentId] ??= []).push(record.score);
          return groups;
        }, {}),
      ).map(([departmentId, departmentScores]) => ({
        departmentId,
        label: departmentLabels[departmentId] ?? "未命名部门",
        scores: departmentScores,
      }));
      const organizationBenchmark =
        scores.length >= WORKFORCE_MINIMUM_SAMPLE
          ? buildOrganizationBenchmark(scores, departmentGroups)
          : null;
      const baselineReport = campaign.baselineCampaignId
        ? await input.repository.latestOrganizationReportForCampaign(
            input.tenantId,
            campaign.baselineCampaignId,
          )
        : null;
      const aggregateScore = aggregateScoreSnapshots(scores);
      organizationReport = buildReportSnapshot({
        tenantId: input.tenantId,
        campaignId: campaign.id,
        reportType:
          campaign.organizationMethod === "single_manager_self_assessment"
            ? "manager_self_assessment"
            : campaign.target === "organization"
              ? "organization_scoped"
              : "organization",
        subjectLabel:
          campaign.organizationMethod === "single_manager_self_assessment"
            ? "管理者组织自评"
            : input.organizationLabel,
        sampleSize: scores.length,
        score: aggregateScore,
        sourceScores: scores,
        sourceBackgroundAnswers: scoreRecords.map(
          (record) => record.backgroundAnswers,
        ),
        organizationBenchmark,
        retestComparison:
          campaign.baselineCampaignId && baselineReport
            ? buildRetestComparison({
                baselineCampaignId: campaign.baselineCampaignId,
                baselineReport,
                currentScore: aggregateScore,
                currentSampleSize: scores.length,
              })
            : null,
        status: "draft",
      });
      await input.repository.saveReport(organizationReport);
    }
  }
  return { campaign, organizationReport };
}
