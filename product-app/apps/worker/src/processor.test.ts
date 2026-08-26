import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transitionCampaignWithReport } from "@ai-readiness/application";
import {
  backfillImmutableLineage,
  applyLineageConstraints,
  createSqlClient,
  ProductRepository,
  type SqlClient,
} from "@ai-readiness/database";
import { itemIdsForTarget, scoreAnswers } from "@ai-readiness/domain";
import { buildReportSnapshot } from "@ai-readiness/reporting";
import {
  BUILTIN_RULE_ARTIFACT_ID,
  HISTORICAL_RULE_ARTIFACT_V06,
  HISTORICAL_RULE_ARTIFACT_V07,
  HISTORICAL_RULE_ARTIFACT_V08,
  HISTORICAL_RULE_ARTIFACT_V09,
  HISTORICAL_RULE_ARTIFACT_V091,
  HISTORICAL_RULE_ARTIFACT_V092,
} from "@ai-readiness/contracts";
import { createProductJobProcessor } from "./processor.js";

let db: SqlClient;
let repository: ProductRepository;

beforeEach(async () => {
  db = await createSqlClient("pglite://:memory:");
  repository = new ProductRepository(db);
  await repository.seedDevelopmentTenant();
});
afterEach(async () => db.close());

async function activateCampaign(campaignId: string) {
  const campaign = await repository.getCampaign("tenant-demo", campaignId);
  if (!campaign) throw new Error("TEST_CAMPAIGN_NOT_FOUND");
  await transitionCampaignWithReport({
    repository,
    tenantId: "tenant-demo",
    campaignId,
    status: "active",
    actorId: "user-hr-demo",
    organizationLabel: "示例公司",
    now: new Date(new Date(campaign.startsAt).getTime() + 1_000),
  });
}

describe("product worker processor", () => {
  it.each([
    ["v0.6", HISTORICAL_RULE_ARTIFACT_V06, "rule-release-v0.6", "rule-artifact-v0.6"],
    ["v0.7", HISTORICAL_RULE_ARTIFACT_V07, "rule-release-v0.7", "rule-artifact-v0.7"],
    ["v0.8", HISTORICAL_RULE_ARTIFACT_V08, "rule-release-v0.8", "rule-artifact-v0.8"],
    ["v0.9", HISTORICAL_RULE_ARTIFACT_V09, "rule-release-v0.9", "rule-artifact-v0.9"],
    ["v0.9.1", HISTORICAL_RULE_ARTIFACT_V091, "rule-release-v0.9.1", "rule-artifact-v0.9.1"],
    ["v0.9.2", HISTORICAL_RULE_ARTIFACT_V092, "rule-release-v0.9.2", "rule-artifact-v0.9.2"],
  ] as const)("backfills historical %s snapshots with their retained artifact", async (_version, artifact, releaseId, artifactId) => {
    const campaign = await repository.createCampaign("tenant-demo", {
      name: `${_version} 历史版本回填`,
      target: "personal",
      organizationMethod: "workforce_survey",
      mode: "identified",
      startsAt: "2026-01-01T00:00:00.000Z",
      closesAt: "2026-12-31T00:00:00.000Z",
    });
    await activateCampaign(campaign.id);
    await db.query(
      "ALTER TABLE questionnaire_releases ALTER COLUMN rule_release_id DROP NOT NULL",
    );
    await db.query(
      "ALTER TABLE questionnaire_releases ALTER COLUMN rule_release_artifact_id DROP NOT NULL",
    );
    await db.query(
      `UPDATE questionnaire_releases
       SET snapshot=jsonb_set(snapshot,'{ruleManifestHash}',to_jsonb($2::text)),
       rule_release_id=NULL,rule_release_artifact_id=NULL WHERE campaign_id=$1`,
      [campaign.id, artifact.manifestHash],
    );

    await backfillImmutableLineage(db);

    const lineage = await db.query<{
      rule_release_id: string;
      rule_release_artifact_id: string;
    }>(
      `SELECT rule_release_id,rule_release_artifact_id
       FROM questionnaire_releases WHERE campaign_id=$1`,
      [campaign.id],
    );
    expect(lineage.rows[0]).toEqual({
      rule_release_id: releaseId,
      rule_release_artifact_id: artifactId,
    });
  });

  it("rejects an unknown frozen manifest instead of silently binding it to the current artifact", async () => {
    const campaign = await repository.createCampaign("tenant-demo", {
      name: "未知历史版本",
      target: "personal",
      organizationMethod: "workforce_survey",
      mode: "identified",
      startsAt: "2026-01-01T00:00:00.000Z",
      closesAt: "2026-12-31T00:00:00.000Z",
    });
    await activateCampaign(campaign.id);
    await db.query(
      "ALTER TABLE questionnaire_releases ALTER COLUMN rule_release_id DROP NOT NULL",
    );
    await db.query(
      "ALTER TABLE questionnaire_releases ALTER COLUMN rule_release_artifact_id DROP NOT NULL",
    );
    await db.query(
      `UPDATE questionnaire_releases
       SET snapshot=jsonb_set(snapshot,'{ruleManifestHash}',to_jsonb($2::text)),
       rule_release_id=NULL,rule_release_artifact_id=NULL WHERE campaign_id=$1`,
      [campaign.id, "unknown-manifest-for-regression"],
    );

    await expect(backfillImmutableLineage(db)).rejects.toThrow(
      "IMMUTABLE_LINEAGE_MANIFEST_UNKNOWN:unknown-manifest-for-regression",
    );
  });

  it("publishes a future campaign as scheduled and activates it when due", async () => {
    const campaign = await repository.createCampaign("tenant-demo", {
      name: "未来排期活动",
      target: "personal",
      organizationMethod: "workforce_survey",
      mode: "identified",
      startsAt: "2026-04-02T00:00:00.000Z",
      closesAt: "2026-04-10T00:00:00.000Z",
    });
    const published = await transitionCampaignWithReport({
      repository,
      tenantId: "tenant-demo",
      campaignId: campaign.id,
      status: "active",
      actorId: "user-hr-demo",
      organizationLabel: "示例公司",
      now: new Date("2026-04-01T00:00:00.000Z"),
    });
    expect(published?.campaign.status).toBe("scheduled");
    expect(
      await repository.getQuestionnaireRelease("tenant-demo", campaign.id),
    ).not.toBeNull();

    const processor = createProductJobProcessor({
      repository,
      internalApiUrl: "http://internal.test",
      workerSecret: "w".repeat(32),
    });
    await expect(
      processor({
        name: "activate-due-campaigns",
        data: { now: "2026-04-02T00:00:00.000Z" },
      }),
    ).resolves.toEqual({ status: "completed", activated: [campaign.id] });
    expect(
      (await repository.getCampaign("tenant-demo", campaign.id))?.status,
    ).toBe("active");
  });

  it("automatically closes due campaigns through the same application service", async () => {
    const campaign = await repository.createCampaign("tenant-demo", {
      name: "已到期活动",
      target: "personal",
      organizationMethod: "workforce_survey",
      mode: "identified",
      startsAt: "2026-01-01T00:00:00.000Z",
      closesAt: "2026-01-02T00:00:00.000Z",
    });
    await activateCampaign(campaign.id);
    const processor = createProductJobProcessor({
      repository,
      internalApiUrl: "http://internal.test",
      workerSecret: "w".repeat(32),
    });
    const result = await processor({
      name: "close-due-campaigns",
      data: { now: "2026-01-03T00:00:00.000Z" },
    });
    expect(result).toMatchObject({
      status: "completed",
      closed: [{ campaignId: campaign.id, reportId: null }],
    });
    expect(
      (await repository.getCampaign("tenant-demo", campaign.id))?.status,
    ).toBe("closed");
  });

  it("processes anonymous completion receipts only after a randomized batch delay", async () => {
    const campaign = await repository.createCampaign("tenant-demo", {
      name: "匿名完成回执",
      target: "personal",
      organizationMethod: "workforce_survey",
      mode: "anonymous",
      startsAt: "2026-01-01T00:00:00.000Z",
      closesAt: "2026-12-31T00:00:00.000Z",
    });
    await activateCampaign(campaign.id);
    await repository.recordInvitationDelivery({
      tenantId: "tenant-demo",
      campaignId: campaign.id,
      externalSubjectId: "ou_anonymous_receipt",
      tokenFingerprint: "receipt-token-fingerprint",
      expiresAt: "2027-03-31T00:00:00.000Z",
      messageId: "om_receipt",
    });
    await repository.queueAnonymousCompletionReceipt(
      "tenant-demo",
      campaign.id,
      "ou_anonymous_receipt",
      new Date("2026-02-01T10:02:03.000Z"),
    );
    const processor = createProductJobProcessor({
      repository,
      internalApiUrl: "http://internal.test",
      workerSecret: "w".repeat(32),
    });
    await expect(
      processor({
        name: "process-completion-receipts",
        data: { now: "2026-02-01T10:10:00.000Z" },
      }),
    ).resolves.toMatchObject({ status: "completed", processed: 0 });
    expect(
      (
        await db.query<any>(
          "SELECT completed FROM invitations WHERE campaign_id=$1",
          [campaign.id],
        )
      ).rows[0].completed,
    ).toBe(false);
    await expect(
      processor({
        name: "process-completion-receipts",
        data: { now: "2026-02-01T11:00:00.000Z" },
      }),
    ).resolves.toMatchObject({ status: "completed", processed: 1 });
    const completed = await db.query<any>(
      `SELECT i.completed,cr.status,cr.processed_batch
       FROM invitations i JOIN completion_receipts cr ON cr.invitation_id=i.id
       WHERE i.campaign_id=$1`,
      [campaign.id],
    );
    expect(completed.rows[0]).toEqual({
      completed: true,
      status: "processed",
      processed_batch: "2026-02-01T11:00:00.000Z",
    });
    await expect(
      processor({
        name: "process-completion-receipts",
        data: { now: "2026-02-01T12:00:00.000Z" },
      }),
    ).resolves.toMatchObject({ status: "completed", processed: 0 });
    const receiptColumns = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name='completion_receipts'`,
    );
    expect(receiptColumns.rows.map((row) => row.column_name)).not.toEqual(
      expect.arrayContaining([
        "response_id",
        "submitted_at",
        "request_id",
        "trace_id",
        "job_id",
      ]),
    );
  });

  it("creates and archives a due one-person organization report", async () => {
    const campaign = await repository.createCampaign("tenant-demo", {
      name: "管理者单人组织自评",
      target: "organization",
      organizationMethod: "single_manager_self_assessment",
      mode: "identified",
      designatedAssessorExternalId: "dev-hr",
      startsAt: "2026-01-01T00:00:00.000Z",
      closesAt: "2026-01-02T00:00:00.000Z",
    });
    await activateCampaign(campaign.id);
    const answers = Object.fromEntries(
      itemIdsForTarget("organization").map((id) => [id, 4 as const]),
    );
    const score = scoreAnswers(answers, new Date("2026-01-02T00:00:00.000Z"));
    await repository.saveSubmission(
      {
        id: "response-manager-close-test",
        tenantId: "tenant-demo",
        campaignId: campaign.id,
        participantRef: null,
        answers,
        backgroundAnswers: {},
        customAnswers: {},
        submittedAt: "2026-01-02T00:00:00.000Z",
        responseHash: "response-manager-close-hash",
      },
      score,
      null,
      { subjectRefHash: "subject-manager-close-hash" },
    );
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ reportId: "generated", byteSize: 123 }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    const processor = createProductJobProcessor({
      repository,
      internalApiUrl: "http://internal.test",
      workerSecret: "w".repeat(32),
      request,
    });
    const result = await processor({
      name: "close-due-campaigns",
      data: { now: "2026-01-03T00:00:00.000Z" },
    });
    expect(result).toMatchObject({
      status: "completed",
      closed: [{ campaignId: campaign.id }],
    });
    expect((result as any).closed[0].reportId).toBeTruthy();
    expect(String(request.mock.calls[0]?.[0])).toContain(
      `/internal/reports/${(result as any).closed[0].reportId}/render-pdf`,
    );
  });

  it("creates only one report when manual and automatic close race", async () => {
    const campaign = await repository.createCampaign("tenant-demo", {
      name: "并发关卷",
      target: "organization",
      organizationMethod: "single_manager_self_assessment",
      mode: "identified",
      designatedAssessorExternalId: "dev-hr",
      startsAt: "2026-01-01T00:00:00.000Z",
      closesAt: "2026-12-31T00:00:00.000Z",
    });
    await activateCampaign(campaign.id);
    const answers = Object.fromEntries(
      itemIdsForTarget("organization").map((id) => [id, 4 as const]),
    );
    const score = scoreAnswers(answers, new Date("2026-02-01T00:00:00.000Z"));
    await repository.saveSubmission(
      {
        id: "response-concurrent-close",
        tenantId: "tenant-demo",
        campaignId: campaign.id,
        participantRef: null,
        answers,
      backgroundAnswers: {},
      customAnswers: {},
        submittedAt: score.createdAt,
        responseHash: "response-concurrent-close-hash",
      },
      score,
      null,
    );
    const close = () =>
      transitionCampaignWithReport({
        repository,
        tenantId: "tenant-demo",
        campaignId: campaign.id,
        status: "closed",
        actorId: "user-hr-demo",
        organizationLabel: "示例公司",
      });
    const results = await Promise.all([close(), close()]);
    expect(results.every((result) => result?.campaign.status === "closed")).toBe(
      true,
    );
    const reports = await db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM report_snapshots WHERE campaign_id=$1 AND report_type='manager_self_assessment'",
      [campaign.id],
    );
    const transitions = await db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM audit_events WHERE object_id=$1 AND action='campaign.closed'",
      [campaign.id],
    );
    expect(reports.rows[0]?.count).toBe("1");
    expect(transitions.rows[0]?.count).toBe("1");
  });

  it("replays an immutable report and deletes all linked subject data", async () => {
    const campaign = await repository.createCampaign("tenant-demo", {
      name: "数据主体删除",
      target: "personal",
      organizationMethod: "workforce_survey",
      mode: "identified",
      startsAt: "2026-01-01T00:00:00.000Z",
      closesAt: "2026-12-31T00:00:00.000Z",
    });
    const answers = Object.fromEntries(
      itemIdsForTarget("personal").map((id) => [id, 4 as const]),
    );
    const score = scoreAnswers(answers, new Date("2026-02-01T00:00:00.000Z"));
    const responseId = "response-delete-test";
    await activateCampaign(campaign.id);
    const report = buildReportSnapshot({
      tenantId: "tenant-demo",
      campaignId: campaign.id,
      responseId,
      reportType: "personal_scoped",
      subjectLabel: "本人",
      score,
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
    });
    await repository.saveSubmission(
      {
        id: responseId,
        tenantId: "tenant-demo",
        campaignId: campaign.id,
        participantRef: null,
        answers,
      backgroundAnswers: {},
      customAnswers: {},
        submittedAt: "2026-02-01T00:00:00.000Z",
        responseHash: "response-hash-delete-test",
      },
      score,
      report,
      { subjectRefHash: "subject-hash-delete-test" },
    );
    // Simulate upgrading a v14 database whose historical score/report rows
    // predate immutable rule and input lineage, then prove the v15 backfill.
    for (const statement of [
      "ALTER TABLE report_snapshots ALTER COLUMN assessment_input_snapshot_id DROP NOT NULL",
      "ALTER TABLE report_snapshots ALTER COLUMN rule_release_id DROP NOT NULL",
      "ALTER TABLE report_snapshots ALTER COLUMN rule_release_artifact_id DROP NOT NULL",
      "ALTER TABLE score_snapshots ALTER COLUMN assessment_input_snapshot_id DROP NOT NULL",
      "ALTER TABLE score_snapshots ALTER COLUMN rule_release_id DROP NOT NULL",
      "ALTER TABLE score_snapshots ALTER COLUMN rule_release_artifact_id DROP NOT NULL",
    ])
      await db.query(statement);
    await db.query(
      `UPDATE report_snapshots SET assessment_input_snapshot_id=NULL,
       rule_release_id=NULL,rule_release_artifact_id=NULL WHERE id=$1`,
      [report.id],
    );
    await db.query(
      `UPDATE score_snapshots SET assessment_input_snapshot_id=NULL,
       rule_release_id=NULL,rule_release_artifact_id=NULL WHERE response_id=$1`,
      [responseId],
    );
    await db.query("DELETE FROM scoring_runs WHERE campaign_id=$1", [campaign.id]);
    await db.query("DELETE FROM assessment_input_snapshots WHERE campaign_id=$1", [
      campaign.id,
    ]);
    await backfillImmutableLineage(db);
    await applyLineageConstraints(db);
    const migrated = await db.query<any>(
      `SELECT r.assessment_input_snapshot_id,r.rule_release_artifact_id,
       s.assessment_input_snapshot_id AS score_input_id,
       (SELECT count(*)::int FROM scoring_runs sr WHERE sr.campaign_id=r.campaign_id) AS run_count
       FROM report_snapshots r JOIN score_snapshots s ON s.response_id=r.response_id
       WHERE r.id=$1`,
      [report.id],
    );
    expect(migrated.rows[0]).toMatchObject({
      assessment_input_snapshot_id: migrated.rows[0].score_input_id,
      rule_release_artifact_id: BUILTIN_RULE_ARTIFACT_ID,
      run_count: 1,
    });
    await repository.createDataDeletionRequest({
      id: "deletion-request-test",
      tenantId: "tenant-demo",
      requestedBy: "user-hr-demo",
      requesterKind: "authenticated_subject",
      reason: "员工依法申请删除",
      subjectRefHashes: ["subject-hash-delete-test"],
    });
    const processor = createProductJobProcessor({
      repository,
      internalApiUrl: "http://internal.test",
      workerSecret: "w".repeat(32),
    });
    await expect(
      processor({
        name: "replay-report",
        data: { tenantId: "tenant-demo", reportId: report.id },
      }),
    ).resolves.toMatchObject({
      status: "verified",
      contentHash: report.contentHash,
    });
    const originalArtifact = await db.query<any>(
      `SELECT artifact,signature FROM rule_release_artifacts WHERE id='${BUILTIN_RULE_ARTIFACT_ID}'`,
    );
    await db.query(
      `UPDATE rule_release_artifacts
       SET artifact=artifact || '{"tampered":true}'::jsonb
       WHERE id='${BUILTIN_RULE_ARTIFACT_ID}'`,
    );
    await expect(
      processor({
        name: "replay-report",
        data: { tenantId: "tenant-demo", reportId: report.id },
      }),
    ).rejects.toThrow("REPORT_REPLAY_RULE_ARTIFACT_HASH_MISMATCH");
    await db.query(
      `UPDATE rule_release_artifacts SET artifact=$1::jsonb WHERE id='${BUILTIN_RULE_ARTIFACT_ID}'`,
      [JSON.stringify(originalArtifact.rows[0].artifact)],
    );
    await db.query(
      `UPDATE rule_release_artifacts SET signature='invalid' WHERE id='${BUILTIN_RULE_ARTIFACT_ID}'`,
    );
    await expect(
      processor({
        name: "replay-report",
        data: { tenantId: "tenant-demo", reportId: report.id },
      }),
    ).rejects.toThrow("REPORT_REPLAY_RULE_ARTIFACT_SIGNATURE_INVALID");
    await db.query(
      `UPDATE rule_release_artifacts SET signature=$1 WHERE id='${BUILTIN_RULE_ARTIFACT_ID}'`,
      [originalArtifact.rows[0].signature],
    );
    const originalReport = await db.query<any>(
      "SELECT snapshot FROM report_snapshots WHERE id=$1",
      [report.id],
    );
    await db.query(
      `UPDATE report_snapshots
       SET snapshot=jsonb_set(snapshot,'{headline}','"tampered"'::jsonb)
       WHERE id=$1`,
      [report.id],
    );
    await expect(
      processor({
        name: "replay-report",
        data: { tenantId: "tenant-demo", reportId: report.id },
      }),
    ).rejects.toThrow("REPORT_REPLAY_CONTENT_HASH_MISMATCH");
    await db.query("UPDATE report_snapshots SET snapshot=$2::jsonb WHERE id=$1", [
      report.id,
      JSON.stringify(originalReport.rows[0].snapshot),
    ]);
    await expect(
      processor({
        name: "delete-subject-data",
        data: {
          requestId: "deletion-request-test",
          tenantId: "tenant-demo",
          subjectRefHashes: ["subject-hash-delete-test"],
          requestedBy: "user-hr-demo",
          reason: "员工依法申请删除",
        },
      }),
    ).resolves.toMatchObject({
      responseCount: 1,
      reportCount: 1,
      artifactCount: 0,
      manifest: [
        { system: "object_storage", status: "deleted", affectedCount: 0 },
        { system: "database", status: "deleted", affectedCount: 2 },
        { system: "audit_log", status: "retained", affectedCount: 1 },
      ],
    });
    expect(
      await repository.dataDeletionRequest(
        "tenant-demo",
        "deletion-request-test",
      ),
    ).toMatchObject({
      status: "completed",
      result: {
        responseCount: 1,
        reportCount: 1,
        draftCount: 0,
        artifactCount: 0,
      },
    });
    expect(await repository.getReport("tenant-demo", report.id)).toBeNull();
  });

  it("calls protected internal adapters for retried PDF jobs", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ reportId: "report-1", byteSize: 123 }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    const processor = createProductJobProcessor({
      repository,
      internalApiUrl: "http://internal.test",
      workerSecret: "w".repeat(32),
      request,
    });
    await expect(
      processor({
        name: "render-pdf",
        data: { tenantId: "tenant-demo", reportId: "report-1" },
      }),
    ).resolves.toMatchObject({ reportId: "report-1", byteSize: 123 });
    expect(request.mock.calls[0]?.[1]?.headers).toMatchObject({
      "x-worker-secret": "w".repeat(32),
    });
  });

  it("tracks queued notification retries and their final provider result", async () => {
    const campaign = await repository.createCampaign("tenant-demo", {
      name: "通知重试",
      target: "personal",
      mode: "identified",
      startsAt: "2026-01-01T00:00:00.000Z",
      closesAt: "2026-12-31T00:00:00.000Z",
    });
    const recorded = await repository.recordInvitationDelivery({
      tenantId: "tenant-demo",
      campaignId: campaign.id,
      externalSubjectId: "ou_retry",
      tokenFingerprint: "retry-fingerprint",
      expiresAt: "2026-12-31T00:00:00.000Z",
      errorCode: "FEISHU_TEMPORARY_ERROR",
    });
    expect(
      await repository.markNotificationQueued(
        "tenant-demo",
        recorded.notificationId,
      ),
    ).toBe(true);
    expect(
      await repository.notificationJob("tenant-demo", recorded.notificationId),
    ).toMatchObject({ status: "queued", attemptCount: 1 });
    await repository.completeNotificationAttempt(
      "tenant-demo",
      recorded.notificationId,
      { errorCode: "FEISHU_RATE_LIMITED" },
    );
    await repository.markNotificationQueued(
      "tenant-demo",
      recorded.notificationId,
    );
    await repository.completeNotificationAttempt(
      "tenant-demo",
      recorded.notificationId,
      { messageId: "om_retry_success" },
    );
    expect(
      await repository.notificationJob("tenant-demo", recorded.notificationId),
    ).toEqual({
      status: "sent",
      attemptCount: 3,
      messageId: "om_retry_success",
      errorCode: null,
    });

    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ messageId: "om_retry_success" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    const processor = createProductJobProcessor({
      repository,
      internalApiUrl: "http://internal.test",
      workerSecret: "w".repeat(32),
      request,
    });
    await processor({
      name: "send-notification",
      data: {
        tenantId: "tenant-demo",
        notificationId: recorded.notificationId,
        openId: "ou_retry",
        card: { schema: "2.0" },
      },
    });
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toMatchObject({
      tenantId: "tenant-demo",
      notificationId: recorded.notificationId,
      openId: "ou_retry",
    });
  });

  it("replays organization reports with their frozen benchmark intact", async () => {
    const campaign = await repository.createCampaign("tenant-demo", {
      name: "组织报告重放",
      target: "combined",
      organizationMethod: "workforce_survey",
      mode: "anonymous",
      startsAt: "2026-01-01T00:00:00.000Z",
      closesAt: "2026-12-31T00:00:00.000Z",
    });
    await activateCampaign(campaign.id);
    const answers = Object.fromEntries(
      itemIdsForTarget("combined").map((id) => [id, 4 as const]),
    );
    for (let index = 0; index < 7; index += 1) {
      const score = scoreAnswers(
        answers,
        new Date(`2026-02-0${index + 1}T00:00:00.000Z`),
      );
      await repository.saveSubmission(
        {
          id: `response-org-replay-${index}`,
          tenantId: "tenant-demo",
          campaignId: campaign.id,
          participantRef: null,
          answers,
        backgroundAnswers: {},
        customAnswers: {},
          submittedAt: score.createdAt,
          responseHash: `response-org-replay-hash-${index}`,
        },
        score,
        null,
        { subjectRefHash: `subject-org-replay-${index}` },
      );
    }
    const closed = await transitionCampaignWithReport({
      repository,
      tenantId: "tenant-demo",
      campaignId: campaign.id,
      status: "closed",
      actorId: "user-hr-demo",
      organizationLabel: "示例公司",
    });
    expect(closed?.organizationReport?.organizationBenchmark?.sampleSize).toBe(
      7,
    );
    const processor = createProductJobProcessor({
      repository,
      internalApiUrl: "http://internal.test",
      workerSecret: "w".repeat(32),
    });
    await expect(
      processor({
        name: "replay-report",
        data: {
          tenantId: "tenant-demo",
          reportId: closed!.organizationReport!.id,
        },
      }),
    ).resolves.toMatchObject({
      status: "verified",
      contentHash: closed!.organizationReport!.contentHash,
    });
  });
});
