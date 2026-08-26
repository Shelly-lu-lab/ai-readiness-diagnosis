import { transitionCampaignWithReport } from "@ai-readiness/application";
import type { ProductJob } from "@ai-readiness/contracts";
import type { ProductRepository } from "@ai-readiness/database";
import { verifyFrozenReportSnapshot } from "@ai-readiness/reporting";

interface ProcessorDependencies {
  repository: ProductRepository;
  internalApiUrl: string;
  workerSecret: string;
  request?: typeof fetch;
}

async function internalCall(
  dependencies: ProcessorDependencies,
  path: string,
  body: object,
) {
  const response = await (dependencies.request ?? fetch)(
    new URL(path, dependencies.internalApiUrl),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-worker-secret": dependencies.workerSecret,
      },
      body: JSON.stringify(body),
    },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      `INTERNAL_API_${response.status}:${(result as any).code ?? "UNKNOWN"}`,
    );
  return result;
}

export function createProductJobProcessor(dependencies: ProcessorDependencies) {
  return async (job: ProductJob) => {
    switch (job.name) {
      case "activate-due-campaigns": {
        const due = await dependencies.repository.listDueScheduledCampaigns(
          job.data.now ? new Date(job.data.now) : new Date(),
        );
        const activated: string[] = [];
        for (const campaign of due) {
          const result = await transitionCampaignWithReport({
            repository: dependencies.repository,
            tenantId: campaign.tenantId,
            campaignId: campaign.id,
            status: "active",
            actorId: "system-worker",
            organizationLabel:
              (await dependencies.repository.tenantName(campaign.tenantId)) ??
              "组织",
          });
          if (result) activated.push(campaign.id);
        }
        return { status: "completed", activated };
      }
      case "close-due-campaigns": {
        const due = await dependencies.repository.listDueActiveCampaigns(
          job.data.now ? new Date(job.data.now) : new Date(),
        );
        const closed: Array<{ campaignId: string; reportId: string | null }> =
          [];
        for (const campaign of due) {
          const result = await transitionCampaignWithReport({
            repository: dependencies.repository,
            tenantId: campaign.tenantId,
            campaignId: campaign.id,
            status: "closed",
            actorId: "system-worker",
            organizationLabel:
              (await dependencies.repository.tenantName(campaign.tenantId)) ??
              "组织",
          });
          if (result)
            closed.push({
              campaignId: campaign.id,
              reportId: result.organizationReport?.id ?? null,
            });
          if (result?.organizationReport)
            await internalCall(
              dependencies,
              `/internal/reports/${result.organizationReport.id}/render-pdf`,
              { tenantId: campaign.tenantId },
            );
        }
        return { status: "completed", closed };
      }
      case "process-completion-receipts":
        return {
          status: "completed",
          ...(await dependencies.repository.processDueCompletionReceipts(
            job.data.now ? new Date(job.data.now) : new Date(),
          )),
        };
      case "render-pdf":
        return internalCall(
          dependencies,
          `/internal/reports/${job.data.reportId}/render-pdf`,
          { tenantId: job.data.tenantId },
        );
      case "send-notification":
        return internalCall(
          dependencies,
          "/internal/feishu/messages",
          job.data,
        );
      case "replay-report": {
        const report = await dependencies.repository.getReport(
          job.data.tenantId,
          job.data.reportId,
        );
        if (!report) throw new Error("REPORT_NOT_FOUND");
        await dependencies.repository.assertReportReplayLineage(
          job.data.tenantId,
          report.id,
        );
        if (!verifyFrozenReportSnapshot(report))
          throw new Error(`REPORT_REPLAY_CONTENT_HASH_MISMATCH:${report.contentHash}`);
        return {
          status: "verified",
          reportId: report.id,
          contentHash: report.contentHash,
        };
      }
      case "delete-subject-data": {
        await dependencies.repository.setDataDeletionRequestStatus(
          job.data.tenantId,
          job.data.requestId,
          "processing",
        );
        try {
          const storageKeys =
            await dependencies.repository.subjectArtifactStorageKeys(
              job.data.tenantId,
              job.data.subjectRefHashes,
            );
          if (storageKeys.length)
            await internalCall(dependencies, "/internal/artifacts/delete", {
              keys: storageKeys,
            });
          const databaseResult = await dependencies.repository.deleteSubjectData(
            job.data.tenantId,
            job.data.subjectRefHashes,
            job.data.requestedBy,
            job.data.reason,
          );
          const result = {
            ...databaseResult,
            artifactCount: storageKeys.length,
            manifest: [
              {
                system: "object_storage" as const,
                status: "deleted" as const,
                affectedCount: storageKeys.length,
                note: "已删除与个人报告关联的PDF对象；0表示当时没有已归档PDF。",
              },
              {
                system: "database" as const,
                status: "deleted" as const,
                affectedCount:
                  databaseResult.responseCount +
                  databaseResult.reportCount +
                  databaseResult.draftCount,
                note: "已删除关联答卷、分数、个人报告、取回凭证和未提交草稿。",
              },
              {
                system: "audit_log" as const,
                status: "retained" as const,
                affectedCount: 1,
                note: "保留不含题目答案和报告正文的删除处理审计，以证明请求已执行。",
              },
            ],
          };
          await dependencies.repository.setDataDeletionRequestStatus(
            job.data.tenantId,
            job.data.requestId,
            "completed",
            result,
          );
          return result;
        } catch (error) {
          await dependencies.repository.setDataDeletionRequestStatus(
            job.data.tenantId,
            job.data.requestId,
            "failed",
            null,
            error instanceof Error
              ? error.message.split(":")[0]
              : "DATA_DELETION_FAILED",
          );
          throw error;
        }
      }
    }
  };
}
