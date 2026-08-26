import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  BUILTIN_RULE_ARTIFACT_ID,
  BUILTIN_RULE_RELEASE_ID,
} from "@ai-readiness/contracts";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { LINEAGE_CONSTRAINT_STATEMENTS, SCHEMA_SQL } from "./schema.js";

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
};
const hash = (value: unknown) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");
const parsed = <T>(value: unknown): T =>
  typeof value === "string" ? (JSON.parse(value) as T) : (value as T);

export interface QueryResult<Row extends object = Record<string, unknown>> {
  rows: Row[];
  rowCount: number;
}
export interface SqlClient {
  query<Row extends object = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<Row>>;
  transaction<T>(
    work: (client: Pick<SqlClient, "query">) => Promise<T>,
  ): Promise<T>;
  close(): Promise<void>;
}

class PGliteClient implements SqlClient {
  constructor(private readonly db: PGlite) {}
  async query<Row extends object>(
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult<Row>> {
    const result = await this.db.query<Row>(sql, params);
    return {
      rows: result.rows,
      rowCount: result.affectedRows ?? result.rows.length,
    };
  }
  async transaction<T>(
    work: (client: Pick<SqlClient, "query">) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (transaction) =>
      work({
        query: async <Row extends object>(
          sql: string,
          params: unknown[] = [],
        ) => {
          const result = await transaction.query<Row>(sql, params);
          return {
            rows: result.rows,
            rowCount: result.affectedRows ?? result.rows.length,
          };
        },
      }),
    );
  }
  async close() {
    await this.db.close();
  }
}

class PostgresClient implements SqlClient {
  constructor(private readonly pool: pg.Pool) {}
  async query<Row extends object>(
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult<Row>> {
    const result = await this.pool.query<Row>(sql, params);
    return { rows: result.rows, rowCount: result.rowCount ?? 0 };
  }
  async transaction<T>(
    work: (client: Pick<SqlClient, "query">) => Promise<T>,
  ): Promise<T> {
    const connection = await this.pool.connect();
    try {
      await connection.query("BEGIN");
      const value = await work({
        query: async <Row extends object>(
          sql: string,
          params: unknown[] = [],
        ) => {
          const result = await connection.query<Row>(sql, params);
          return { rows: result.rows, rowCount: result.rowCount ?? 0 };
        },
      });
      await connection.query("COMMIT");
      return value;
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  }
  async close() {
    await this.pool.end();
  }
}

async function lineageForManifest(
  client: SqlClient,
  manifestHash: unknown,
): Promise<{ releaseId: string; artifactId: string }> {
  if (typeof manifestHash === "string" && manifestHash) {
    const matched = await client.query<{ release_id: string; artifact_id: string }>(
      `SELECT rr.id AS release_id,rra.id AS artifact_id
       FROM rule_releases rr
       JOIN rule_release_artifacts rra ON rra.rule_release_id=rr.id
       WHERE rr.manifest_hash=$1 AND rra.retention_status='retained'
       ORDER BY rra.created_at DESC,rra.id DESC LIMIT 1`,
      [manifestHash],
    );
    if (matched.rows[0])
      return {
        releaseId: matched.rows[0].release_id,
        artifactId: matched.rows[0].artifact_id,
      };
    throw new Error(`IMMUTABLE_LINEAGE_MANIFEST_UNKNOWN:${manifestHash}`);
  }
  return {
    releaseId: "rule-release-v0.7",
    artifactId: "rule-artifact-v0.7",
  };
}

export async function backfillImmutableLineage(
  client: SqlClient,
): Promise<void> {
  const questionnaires = await client.query<{ id: string; snapshot: unknown }>(
    `SELECT id,snapshot FROM questionnaire_releases
     WHERE rule_release_id IS NULL OR rule_release_artifact_id IS NULL`,
  );
  for (const row of questionnaires.rows) {
    const lineage = await lineageForManifest(
      client,
      parsed<any>(row.snapshot)?.ruleManifestHash,
    );
    await client.query(
      `UPDATE questionnaire_releases
       SET rule_release_id=$2,rule_release_artifact_id=$3 WHERE id=$1`,
      [row.id, lineage.releaseId, lineage.artifactId],
    );
  }
  const responses = await client.query<any>(
    `SELECT r.id AS response_id,r.tenant_id,r.campaign_id,r.answers,
     r.background_answers,r.custom_answers,r.privacy_notice_version,r.submitted_at,
     c.target,c.organization_method,q.id AS questionnaire_release_id,
     s.id AS score_id,s.snapshot AS score_snapshot,s.created_at AS score_created_at
     FROM response_submissions r
     JOIN campaigns c ON c.id=r.campaign_id
     JOIN questionnaire_releases q ON q.campaign_id=r.campaign_id
     JOIN score_snapshots s ON s.response_id=r.id
     WHERE s.assessment_input_snapshot_id IS NULL
        OR s.rule_release_id IS NULL
        OR s.rule_release_artifact_id IS NULL`,
  );
  for (const row of responses.rows) {
    const customAnswers = parsed(row.custom_answers ?? {});
    const input = {
      schemaVersion: "assessment_input_v0.1",
      assessmentProfile: `${row.target}:${row.organization_method}`,
      questionnaireReleaseId: row.questionnaire_release_id,
      responseId: row.response_id,
      coreAnswers: parsed(row.answers),
      backgroundAnswers: parsed(row.background_answers ?? {}),
      customAnswerHash: hash(customAnswers),
      privacyNoticeVersion: row.privacy_notice_version ?? null,
    };
    const inputHash = hash(input);
    const inputId = `input-${inputHash.slice(0, 40)}`;
    await client.query(
      `INSERT INTO assessment_input_snapshots
       (id,tenant_id,campaign_id,response_id,assessment_profile,snapshot,content_hash,created_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
       ON CONFLICT (id) DO NOTHING`,
      [
        inputId,
        row.tenant_id,
        row.campaign_id,
        row.response_id,
        input.assessmentProfile,
        JSON.stringify(input),
        inputHash,
        row.submitted_at,
      ],
    );
    const scoreLineage = await lineageForManifest(
      client,
      parsed<any>(row.score_snapshot)?.ruleManifestHash,
    );
    await client.query(
      `UPDATE score_snapshots SET assessment_input_snapshot_id=$2,
       rule_release_id=$3,rule_release_artifact_id=$4 WHERE id=$1`,
      [row.score_id, inputId, scoreLineage.releaseId, scoreLineage.artifactId],
    );
    await client.query(
      `INSERT INTO scoring_runs
       (id,tenant_id,campaign_id,assessment_input_snapshot_id,rule_release_id,
        rule_release_artifact_id,score_snapshot_id,status,input_hash,output_hash,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'succeeded',$8,$9,$10)
       ON CONFLICT (assessment_input_snapshot_id,rule_release_artifact_id,output_hash) DO NOTHING`,
      [
        `scoring-${hash({ scoreId: row.score_id, inputHash }).slice(0, 40)}`,
        row.tenant_id,
        row.campaign_id,
        inputId,
        scoreLineage.releaseId,
        scoreLineage.artifactId,
        row.score_id,
        inputHash,
        hash(parsed(row.score_snapshot)),
        row.score_created_at,
      ],
    );
    const responseReports = await client.query<{ id: string; snapshot: unknown }>(
      `SELECT id,snapshot FROM report_snapshots
       WHERE response_id=$1 AND report_type IN ('immediate_personal','personal_scoped','personal_observer')
       AND (assessment_input_snapshot_id IS NULL OR rule_release_id IS NULL OR rule_release_artifact_id IS NULL)`,
      [row.response_id],
    );
    for (const responseReport of responseReports.rows) {
      const reportLineage = await lineageForManifest(
        client,
        parsed<any>(responseReport.snapshot)?.ruleManifestHash,
      );
      await client.query(
        `UPDATE report_snapshots SET assessment_input_snapshot_id=$2,
         rule_release_id=$3,rule_release_artifact_id=$4 WHERE id=$1`,
        [responseReport.id, inputId, reportLineage.releaseId, reportLineage.artifactId],
      );
    }
  }
  const reports = await client.query<any>(
    `SELECT r.id,r.tenant_id,r.campaign_id,r.response_id,r.report_type,r.snapshot,r.created_at,
     c.target,c.organization_method,q.id AS questionnaire_release_id
     FROM report_snapshots r
     JOIN campaigns c ON c.id=r.campaign_id
     JOIN questionnaire_releases q ON q.campaign_id=r.campaign_id
     WHERE r.assessment_input_snapshot_id IS NULL
        OR r.rule_release_id IS NULL
        OR r.rule_release_artifact_id IS NULL`,
  );
  for (const row of reports.rows) {
    const report = parsed<any>(row.snapshot);
    const scores = await client.query<{ input_hash: string }>(
      `SELECT input_hash FROM score_snapshots
       WHERE tenant_id=$1 AND campaign_id=$2 ORDER BY response_id,id`,
      [row.tenant_id, row.campaign_id],
    );
    const input = {
      schemaVersion: "report_input_v0.1",
      assessmentProfile: `${row.target}:${row.organization_method}`,
      questionnaireReleaseId: row.questionnaire_release_id,
      reportId: row.id,
      reportType: row.report_type,
      responseId: row.response_id ?? null,
      scoreInputHash: report.score?.inputHash ?? null,
      sourceScoreHashes: scores.rows.map((score) => score.input_hash),
      organizationBenchmarkHash: report.organizationBenchmark
        ? hash(report.organizationBenchmark)
        : null,
      retestComparisonHash: report.retestComparison
        ? hash(report.retestComparison)
        : null,
    };
    const inputHash = hash(input);
    const inputId = `report-input-${inputHash.slice(0, 40)}`;
    await client.query(
      `INSERT INTO assessment_input_snapshots
       (id,tenant_id,campaign_id,response_id,assessment_profile,snapshot,content_hash,created_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
       ON CONFLICT (id) DO NOTHING`,
      [
        inputId,
        row.tenant_id,
        row.campaign_id,
        row.response_id ?? null,
        input.assessmentProfile,
        JSON.stringify(input),
        inputHash,
        row.created_at,
      ],
    );
    const reportLineage = await lineageForManifest(
      client,
      report.ruleManifestHash,
    );
    await client.query(
      `UPDATE report_snapshots SET assessment_input_snapshot_id=$2,
       rule_release_id=$3,rule_release_artifact_id=$4 WHERE id=$1`,
      [row.id, inputId, reportLineage.releaseId, reportLineage.artifactId],
    );
    if (
      row.response_id === null &&
      ["organization", "organization_scoped", "manager_self_assessment"].includes(
        row.report_type,
      )
    )
      await client.query(
        `INSERT INTO scoring_runs
         (id,tenant_id,campaign_id,assessment_input_snapshot_id,rule_release_id,
          rule_release_artifact_id,score_snapshot_id,status,input_hash,output_hash,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,NULL,'succeeded',$7,$8,$9)
         ON CONFLICT (assessment_input_snapshot_id,rule_release_artifact_id,output_hash) DO NOTHING`,
        [
          `scoring-${hash({ reportId: row.id, inputHash }).slice(0, 40)}`,
          row.tenant_id,
          row.campaign_id,
          inputId,
          reportLineage.releaseId,
          reportLineage.artifactId,
          inputHash,
          hash(report.score),
          row.created_at,
        ],
      );
  }
}

export async function applyLineageConstraints(client: SqlClient): Promise<void> {
  for (const statement of LINEAGE_CONSTRAINT_STATEMENTS)
    await client.query(statement);
}

export async function createSqlClient(
  databaseUrl = process.env.DATABASE_URL ?? "pglite://./.data/ai-readiness",
): Promise<SqlClient> {
  if (databaseUrl.startsWith("pglite://")) {
    const configured = databaseUrl.slice("pglite://".length);
    const inMemory = configured === ":memory:";
    const path = inMemory ? undefined : resolve(process.cwd(), configured);
    if (path) await mkdir(dirname(path), { recursive: true });
    const db = new PGlite(path);
    await db.exec(SCHEMA_SQL);
    const client = new PGliteClient(db);
    await backfillImmutableLineage(client);
    await applyLineageConstraints(client);
    return client;
  }
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: Number(process.env.DB_POOL_MAX ?? 10),
  });
  const client = new PostgresClient(pool);
  await client.query(SCHEMA_SQL);
  await backfillImmutableLineage(client);
  await applyLineageConstraints(client);
  return client;
}
