import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  createSqlClient,
  ProductRepository,
  SCHEMA_RELEASE,
  SCHEMA_SQL,
} from "@ai-readiness/database";
import { buildApp } from "./app.js";
import type { FeishuClient } from "@ai-readiness/feishu";

describe("production bootstrap", () => {
  const originalEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    WEB_ORIGIN: process.env.WEB_ORIGIN,
    SESSION_SECRET: process.env.SESSION_SECRET,
    FEISHU_BOOTSTRAP_OWNER_OPEN_IDS:
      process.env.FEISHU_BOOTSTRAP_OWNER_OPEN_IDS,
  };
  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("upgrades a legacy v0.1 rule artifact without inventing an Ed25519 key", async () => {
    const legacy = new PGlite();
    try {
      await legacy.exec(`
        CREATE TABLE rule_releases (
          id TEXT PRIMARY KEY, manifest_hash TEXT NOT NULL UNIQUE,
          versions JSONB NOT NULL, status TEXT NOT NULL,
          source_hashes JSONB NOT NULL DEFAULT '[]'::jsonb,
          reviewed_by TEXT NOT NULL, reviewed_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE TABLE rule_release_artifacts (
          id TEXT PRIMARY KEY,
          rule_release_id TEXT NOT NULL REFERENCES rule_releases(id),
          artifact JSONB NOT NULL, content_hash TEXT NOT NULL UNIQUE,
          signature_algorithm TEXT NOT NULL, signature TEXT NOT NULL,
          verification_key TEXT, signed_by TEXT NOT NULL,
          retention_status TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        INSERT INTO rule_releases
          (id,manifest_hash,versions,status,reviewed_by,reviewed_at)
        VALUES
          ('rule-release-v0.1','legacy-manifest','{}'::jsonb,'retired','legacy','2026-08-01T00:00:00Z');
        INSERT INTO rule_release_artifacts
          (id,rule_release_id,artifact,content_hash,signature_algorithm,signature,verification_key,signed_by,retention_status)
        VALUES
          ('rule-artifact-v0.1','rule-release-v0.1','{}'::jsonb,'legacy-content','sha256_content_attestation_v1','legacy-signature',NULL,'legacy','retained');
      `);
      await expect(legacy.exec(SCHEMA_SQL)).resolves.toBeDefined();
      const v01 = await legacy.query<{
        signature_algorithm: string;
        verification_key: string | null;
      }>(
        "SELECT signature_algorithm,verification_key FROM rule_release_artifacts WHERE id='rule-artifact-v0.1'",
      );
      expect(v01.rows[0]).toEqual({
        signature_algorithm: "sha256_content_attestation_v1",
        verification_key: null,
      });
      const ed25519 = await legacy.query<{ missing: string }>(
        `SELECT count(*)::text AS missing FROM rule_release_artifacts
         WHERE signature_algorithm='ed25519_v1' AND verification_key IS NULL`,
      );
      expect(ed25519.rows[0]?.missing).toBe("0");
    } finally {
      await legacy.close();
    }
  });

  it("creates only the public personal service tenant and no demo owner", async () => {
    process.env.NODE_ENV = "production";
    const db = await createSqlClient("pglite://:memory:");
    const app = await buildApp(db, {
      artifactStore: {
        put: async () => undefined,
        get: async () => Buffer.alloc(0),
        delete: async () => undefined,
      },
      jobQueue: null,
      feishu: null,
    });
    try {
      const ready = await app.inject({ method: "GET", url: "/ready" });
      expect(ready.statusCode).toBe(200);
      expect(ready.json().schemaRelease).toBe(SCHEMA_RELEASE);
      const tenants = await db.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM tenants",
      );
      const users = await db.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM users",
      );
      expect(tenants.rows[0]?.count).toBe("1");
      expect(users.rows[0]?.count).toBe("0");
      const retainedRuleArtifacts = await db.query<{ id: string }>(
        `SELECT id FROM rule_release_artifacts
         WHERE id IN ('rule-artifact-v0.6','rule-artifact-v0.7','rule-artifact-v0.8','rule-artifact-v0.9')
         AND retention_status='retained' ORDER BY id`,
      );
      expect(retainedRuleArtifacts.rows.map((row) => row.id)).toEqual([
        "rule-artifact-v0.6",
        "rule-artifact-v0.7",
        "rule-artifact-v0.8",
        "rule-artifact-v0.9",
      ]);
      expect(
        (
          await db.query<{ count: string }>(
            "SELECT count(*)::text AS count FROM tenants WHERE id='tenant-personal'",
          )
        ).rows[0]?.count,
      ).toBe("1");
      const repository = new ProductRepository(db);
      const identity = {
        tenantKey: "tenant-production-test",
        tenantName: "生产测试企业",
        openId: "ou_initial_owner",
        name: "初始管理员",
      };
      await expect(
        repository.upsertExternalIdentity(identity, {
          allowTenantBootstrap: false,
        }),
      ).rejects.toThrow("TENANT_BOOTSTRAP_NOT_AUTHORIZED");
      expect(
        (
          await db.query<{ count: string }>(
            "SELECT count(*)::text AS count FROM tenants",
          )
        ).rows[0]?.count,
      ).toBe("1");
      await expect(
        repository.upsertExternalIdentity(identity, {
          allowTenantBootstrap: true,
        }),
      ).resolves.toMatchObject({ role: "owner" });
    } finally {
      await app.close();
      await db.close();
    }
  });

  it("binds Feishu OAuth to one browser, consumes state once and blocks cross-site mutations", async () => {
    process.env.NODE_ENV = "production";
    process.env.WEB_ORIGIN = "https://app.example";
    process.env.SESSION_SECRET = "production-test-secret-at-least-32-characters";
    process.env.FEISHU_BOOTSTRAP_OWNER_OPEN_IDS = "ou_owner";
    const db = await createSqlClient("pglite://:memory:");
    const feishu = {
      authorizationUrl: (state: string) =>
        `https://open.feishu.cn/oauth?state=${encodeURIComponent(state)}`,
      exchangeCode: async () => ({
        identity: {
          tenantKey: "tenant-oauth-test",
          tenantName: "OAuth测试企业",
          openId: "ou_owner",
          name: "初始管理员",
        },
      }),
    } as unknown as FeishuClient;
    const app = await buildApp(db, {
      artifactStore: {
        put: async () => undefined,
        get: async () => Buffer.alloc(0),
        delete: async () => undefined,
      },
      jobQueue: null,
      feishu,
    });
    try {
      const start = await app.inject({
        method: "GET",
        url: "/api/auth/feishu/start?returnTo=%2Freports",
      });
      expect(start.statusCode).toBe(302);
      const state = new URL(start.headers.location!).searchParams.get("state")!;
      const bindingCookie = String(start.headers["set-cookie"])
        .split(";")[0];

      const missingBinding = await app.inject({
        method: "GET",
        url: `/api/auth/feishu/callback?code=code-1&state=${encodeURIComponent(state)}`,
      });
      expect(missingBinding.statusCode).toBe(401);
      expect(missingBinding.json().code).toBe("OAUTH_STATE_BROWSER_MISMATCH");

      const callback = await app.inject({
        method: "GET",
        url: `/api/auth/feishu/callback?code=code-1&state=${encodeURIComponent(state)}`,
        headers: { cookie: bindingCookie },
      });
      expect(callback.statusCode).toBe(302);
      expect(callback.headers.location).toBe("https://app.example/reports");
      expect(String(callback.headers["set-cookie"])).toContain(
        "__Host-ai_readiness_session=",
      );

      const replay = await app.inject({
        method: "GET",
        url: `/api/auth/feishu/callback?code=code-2&state=${encodeURIComponent(state)}`,
        headers: { cookie: bindingCookie },
      });
      expect(replay.statusCode).toBe(401);
      expect(replay.json().code).toBe("OAUTH_STATE_ALREADY_USED");

      const crossSite = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { origin: "https://attacker.example" },
      });
      expect(crossSite.statusCode).toBe(403);
      expect(crossSite.json().code).toBe("CROSS_SITE_REQUEST_BLOCKED");
    } finally {
      await app.close();
      await db.close();
    }
  });
});
