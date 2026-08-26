import { createHash } from "node:crypto";
import {
  BUILTIN_RULE_ARTIFACT_ID,
  BUILTIN_RULE_ARTIFACT_PUBLIC_KEY,
  BUILTIN_RULE_ARTIFACT_SIGNATURE,
  BUILTIN_RULE_RELEASE_ID,
  EXECUTABLE_RULE_ARTIFACT,
  EXECUTABLE_RULESET_SHA256,
  HISTORICAL_RULE_ARTIFACT_V02,
  HISTORICAL_RULE_ARTIFACT_V02_HASH,
  HISTORICAL_RULE_ARTIFACT_V02_PUBLIC_KEY,
  HISTORICAL_RULE_ARTIFACT_V02_SIGNATURE,
  HISTORICAL_RULE_ARTIFACT_V03,
  HISTORICAL_RULE_ARTIFACT_V03_HASH,
  HISTORICAL_RULE_ARTIFACT_V03_PUBLIC_KEY,
  HISTORICAL_RULE_ARTIFACT_V03_SIGNATURE,
  HISTORICAL_RULE_ARTIFACT_V04,
  HISTORICAL_RULE_ARTIFACT_V04_HASH,
  HISTORICAL_RULE_ARTIFACT_V04_PUBLIC_KEY,
  HISTORICAL_RULE_ARTIFACT_V04_SIGNATURE,
  HISTORICAL_RULE_ARTIFACT_V05,
  HISTORICAL_RULE_ARTIFACT_V05_HASH,
  HISTORICAL_RULE_ARTIFACT_V05_PUBLIC_KEY,
  HISTORICAL_RULE_ARTIFACT_V05_SIGNATURE,
  HISTORICAL_RULE_ARTIFACT_V06,
  HISTORICAL_RULE_ARTIFACT_V06_HASH,
  HISTORICAL_RULE_ARTIFACT_V06_PUBLIC_KEY,
  HISTORICAL_RULE_ARTIFACT_V06_SIGNATURE,
  HISTORICAL_RULE_ARTIFACT_V07,
  HISTORICAL_RULE_ARTIFACT_V07_HASH,
  HISTORICAL_RULE_ARTIFACT_V07_PUBLIC_KEY,
  HISTORICAL_RULE_ARTIFACT_V07_SIGNATURE,
  HISTORICAL_RULE_ARTIFACT_V08,
  HISTORICAL_RULE_ARTIFACT_V08_HASH,
  HISTORICAL_RULE_ARTIFACT_V08_PUBLIC_KEY,
  HISTORICAL_RULE_ARTIFACT_V08_SIGNATURE,
  HISTORICAL_RULE_ARTIFACT_V09,
  HISTORICAL_RULE_ARTIFACT_V09_HASH,
  HISTORICAL_RULE_ARTIFACT_V09_PUBLIC_KEY,
  HISTORICAL_RULE_ARTIFACT_V09_SIGNATURE,
  HISTORICAL_RULE_ARTIFACT_V091,
  HISTORICAL_RULE_ARTIFACT_V091_HASH,
  HISTORICAL_RULE_ARTIFACT_V091_PUBLIC_KEY,
  HISTORICAL_RULE_ARTIFACT_V091_SIGNATURE,
  HISTORICAL_RULE_ARTIFACT_V092,
  HISTORICAL_RULE_ARTIFACT_V092_HASH,
  HISTORICAL_RULE_ARTIFACT_V092_PUBLIC_KEY,
  HISTORICAL_RULE_ARTIFACT_V092_SIGNATURE,
  VERSION_TUPLE,
} from "@ai-readiness/contracts";

export const SCHEMA_RELEASE = "2026-08-25-v33";

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
};
const ruleArtifactJson = canonicalJson(EXECUTABLE_RULE_ARTIFACT);
const ruleArtifactHash = createHash("sha256")
  .update(ruleArtifactJson)
  .digest("hex");
const sqlJson = (value: unknown) => JSON.stringify(value).replaceAll("'", "''");

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_releases (
  release_id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  external_tenant_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS external_tenant_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS tenants_external_key_idx ON tenants(external_tenant_key) WHERE external_tenant_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS organization_research_profiles (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id), country TEXT NOT NULL DEFAULT 'CN', headquarters_province TEXT NOT NULL,
  industry_raw TEXT NOT NULL, industry_standard_code TEXT NOT NULL, industry_mapping_version TEXT NOT NULL,
  headcount INTEGER NOT NULL CHECK (headcount>0), headcount_band TEXT NOT NULL, ai_stage TEXT NOT NULL, ai_start_duration TEXT NOT NULL,
  questionnaire_language TEXT NOT NULL, primary_work_language TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  external_id TEXT,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','hr_admin','manager','employee')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id)
);
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS account_identities (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  identity_type TEXT NOT NULL CHECK (identity_type IN ('email')),
  identity_hash TEXT NOT NULL UNIQUE,
  encrypted_value TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_identities_account_idx ON account_identities(account_id,identity_type);
CREATE TABLE IF NOT EXISTS organization_memberships (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('owner','hr_admin','manager','employee')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id,tenant_id),
  UNIQUE (tenant_id,user_id)
);
CREATE INDEX IF NOT EXISTS organization_memberships_account_idx ON organization_memberships(account_id,status);
CREATE TABLE IF NOT EXISTS platform_role_assignments (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  role TEXT NOT NULL CHECK (role IN ('platform_admin','research_admin','security_auditor')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id,role)
);
CREATE TABLE IF NOT EXISTS enterprise_applications (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  applicant_name TEXT NOT NULL,
  applicant_role TEXT NOT NULL,
  organization_name TEXT NOT NULL,
  website TEXT,
  expected_headcount_band TEXT NOT NULL,
  use_case TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
  organization_id TEXT REFERENCES tenants(id),
  reviewed_by TEXT REFERENCES accounts(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS enterprise_applications_account_idx ON enterprise_applications(account_id,created_at);
CREATE INDEX IF NOT EXISTS enterprise_applications_status_idx ON enterprise_applications(status,created_at);
CREATE TABLE IF NOT EXISTS personal_research_profiles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  work_city TEXT NOT NULL,
  province TEXT NOT NULL,
  industry_code TEXT NOT NULL,
  company_size_band TEXT NOT NULL,
  job_family TEXT NOT NULL,
  career_stage TEXT NOT NULL,
  people_manager BOOLEAN,
  tenure_band TEXT NOT NULL,
  research_consent BOOLEAN NOT NULL DEFAULT false,
  notice_version TEXT NOT NULL,
  consented_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,user_id)
);
CREATE TABLE IF NOT EXISTS personal_research_consent_records (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  status TEXT NOT NULL CHECK (status IN ('authorized','declined','revoked')),
  notice_version TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS personal_research_consent_account_idx ON personal_research_consent_records(account_id,recorded_at);
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  auth_method TEXT NOT NULL CHECK (auth_method IN ('feishu_oauth','email_otp','development_mock')),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS account_id TEXT REFERENCES accounts(id);
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS workspace_kind TEXT;
ALTER TABLE auth_sessions DROP CONSTRAINT IF EXISTS auth_sessions_workspace_kind_check;
ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_workspace_kind_check CHECK (workspace_kind IS NULL OR workspace_kind IN ('personal','organization','platform'));
ALTER TABLE auth_sessions DROP CONSTRAINT IF EXISTS auth_sessions_auth_method_check;
ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_auth_method_check CHECK (auth_method IN ('feishu_oauth','email_otp','development_mock'));
CREATE TABLE IF NOT EXISTS auth_identities (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  user_id TEXT REFERENCES users(id),
  identity_type TEXT NOT NULL CHECK (identity_type IN ('email')),
  identity_hash TEXT NOT NULL UNIQUE,
  encrypted_value TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE auth_identities DROP CONSTRAINT IF EXISTS auth_identities_identity_hash_key;
CREATE UNIQUE INDEX IF NOT EXISTS auth_identities_tenant_hash_idx ON auth_identities(tenant_id,identity_hash);
CREATE INDEX IF NOT EXISTS auth_identities_user_idx ON auth_identities(user_id,identity_type);
INSERT INTO accounts (id,display_name)
SELECT DISTINCT ON (a.identity_hash)
  'account-' || substring(a.identity_hash from 1 for 24),
  NULLIF(u.display_name,'邮箱用户')
FROM auth_identities a
LEFT JOIN users u ON u.id=a.user_id
WHERE a.identity_type='email'
ORDER BY a.identity_hash,CASE WHEN a.tenant_id='tenant-personal' THEN 1 ELSE 0 END,a.created_at
ON CONFLICT (id) DO NOTHING;
INSERT INTO account_identities (id,account_id,identity_type,identity_hash,encrypted_value,verified_at)
SELECT DISTINCT ON (a.identity_hash)
  'account-identity-' || substring(a.identity_hash from 1 for 20),
  'account-' || substring(a.identity_hash from 1 for 24),
  'email',a.identity_hash,a.encrypted_value,a.verified_at
FROM auth_identities a
WHERE a.identity_type='email'
ORDER BY a.identity_hash,a.verified_at DESC NULLS LAST,a.created_at DESC
ON CONFLICT (identity_hash) DO UPDATE SET encrypted_value=EXCLUDED.encrypted_value,verified_at=EXCLUDED.verified_at,updated_at=now();
INSERT INTO organization_memberships (id,account_id,tenant_id,user_id,role,status)
SELECT
  'membership-' || substring(md5(a.identity_hash || ':' || a.tenant_id) from 1 for 24),
  'account-' || substring(a.identity_hash from 1 for 24),
  a.tenant_id,a.user_id,u.role,'active'
FROM auth_identities a
JOIN users u ON u.id=a.user_id AND u.tenant_id=a.tenant_id
WHERE a.identity_type='email' AND a.tenant_id IS NOT NULL AND a.user_id IS NOT NULL
ON CONFLICT (account_id,tenant_id) DO UPDATE SET user_id=EXCLUDED.user_id,role=EXCLUDED.role,updated_at=now();
UPDATE auth_sessions s SET
  account_id='account-' || substring(a.identity_hash from 1 for 24),
  workspace_kind=CASE WHEN s.tenant_id='tenant-personal' THEN 'personal' ELSE 'organization' END
FROM auth_identities a
WHERE s.account_id IS NULL AND a.tenant_id=s.tenant_id AND a.user_id=s.user_id AND a.identity_type='email';
CREATE TABLE IF NOT EXISTS email_otp_challenges (
  id TEXT PRIMARY KEY,
  identity_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('login','invite')),
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_otp_challenges_lookup_idx ON email_otp_challenges(identity_hash,purpose,expires_at,consumed_at);
CREATE TABLE IF NOT EXISTS email_delivery_logs (
  id TEXT PRIMARY KEY,
  identity_hash TEXT NOT NULL,
  email_type TEXT NOT NULL CHECK (email_type IN ('otp','invite','reminder','report')),
  provider_message_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued','sent','failed')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS email_delivery_logs_lookup_idx ON email_delivery_logs(identity_hash,email_type,created_at);
CREATE TABLE IF NOT EXISTS oauth_login_states (
  nonce_hash TEXT PRIMARY KEY,
  state_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oauth_login_states_expiry_idx ON oauth_login_states(expires_at,consumed_at);
CREATE TABLE IF NOT EXISTS norm_contribution_authorizations (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), status TEXT NOT NULL CHECK (status IN ('authorized','revoked')),
  notice_version TEXT NOT NULL, authorized_by TEXT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS norm_authorization_tenant_idx ON norm_contribution_authorizations(tenant_id,created_at);
CREATE INDEX IF NOT EXISTS auth_sessions_lookup_idx ON auth_sessions(token_hash,expires_at) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS enterprise_subjects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  provider TEXT NOT NULL,
  external_subject_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  department_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  leader_external_id TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,provider,external_subject_id)
);
CREATE TABLE IF NOT EXISTS organization_units (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  external_department_id TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_external_department_id TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,external_department_id)
);
CREATE TABLE IF NOT EXISTS person_context_mappings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  external_subject_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('feishu','hris','admin_upload')),
  raw_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  job_family TEXT NOT NULL,
  career_stage TEXT NOT NULL,
  people_manager BOOLEAN,
  tenure_band TEXT NOT NULL,
  province TEXT NOT NULL,
  employment_type TEXT NOT NULL,
  in_target_population BOOLEAN NOT NULL DEFAULT true,
  classification_version TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,external_subject_id)
);
CREATE INDEX IF NOT EXISTS person_context_mapping_tenant_idx ON person_context_mappings(tenant_id,in_target_population);
CREATE TABLE IF NOT EXISTS directory_sync_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  provider TEXT NOT NULL,
  scope_ref TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','succeeded','failed')),
  subject_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  target TEXT NOT NULL CHECK (target IN ('personal','organization','combined')),
  organization_method TEXT NOT NULL CHECK (organization_method IN ('workforce_survey','single_manager_self_assessment')),
  assessment_profile_id TEXT NOT NULL,
  questionnaire_package_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('anonymous','identified')),
  status TEXT NOT NULL CHECK (status IN ('draft','scheduled','active','closed','cancelled','archived')),
  starts_at TIMESTAMPTZ NOT NULL,
  closes_at TIMESTAMPTZ NOT NULL,
  background_item_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  invited_count INTEGER NOT NULL DEFAULT 0,
  baseline_campaign_id TEXT REFERENCES campaigns(id),
  designated_assessor_external_id TEXT,
  versions JSONB NOT NULL,
  snapshot_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS baseline_campaign_id TEXT REFERENCES campaigns(id);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS designated_assessor_external_id TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS custom_items JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS assessment_profile_id TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS questionnaire_package_id TEXT;
UPDATE campaigns SET assessment_profile_id=CASE
  WHEN target='personal' THEN 'personal_iv_v0.1'
  WHEN target='organization' AND organization_method='single_manager_self_assessment' THEN 'organization_o_manager_v0.1'
  WHEN target='organization' THEN 'organization_o_workforce_v0.1'
  ELSE 'combined_iov_v0.1'
END WHERE assessment_profile_id IS NULL;
UPDATE campaigns SET questionnaire_package_id=CASE
  WHEN target='personal' THEN 'personal_iv_v0.1'
  WHEN target='organization' THEN 'organization_o_v0.1'
  ELSE 'combined_iov_v0.1'
END WHERE questionnaire_package_id IS NULL;
ALTER TABLE campaigns ALTER COLUMN assessment_profile_id SET NOT NULL;
ALTER TABLE campaigns ALTER COLUMN questionnaire_package_id SET NOT NULL;
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_status_check CHECK (status IN ('draft','scheduled','active','closed','cancelled','archived'));
CREATE INDEX IF NOT EXISTS campaigns_tenant_status_idx ON campaigns(tenant_id, status);
CREATE TABLE IF NOT EXISTS rule_releases (
  id TEXT PRIMARY KEY,
  manifest_hash TEXT NOT NULL UNIQUE,
  versions JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('design_review','released','retired')),
  source_hashes JSONB NOT NULL DEFAULT '[]'::jsonb,
  reviewed_by TEXT NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rule_release_artifacts (
  id TEXT PRIMARY KEY,
  rule_release_id TEXT NOT NULL REFERENCES rule_releases(id),
  artifact JSONB NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  signature_algorithm TEXT NOT NULL,
  signature TEXT NOT NULL,
  verification_key TEXT,
  signed_by TEXT NOT NULL,
  retention_status TEXT NOT NULL CHECK (retention_status IN ('retained','retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE rule_release_artifacts ADD COLUMN IF NOT EXISTS verification_key TEXT;
ALTER TABLE rule_release_artifacts DROP CONSTRAINT IF EXISTS rule_release_artifacts_verification_key_check;
ALTER TABLE rule_release_artifacts ADD CONSTRAINT rule_release_artifacts_verification_key_check
CHECK (signature_algorithm<>'ed25519_v1' OR verification_key IS NOT NULL);
INSERT INTO rule_releases
  (id,manifest_hash,versions,status,source_hashes,reviewed_by,reviewed_at)
VALUES
  ('rule-release-v0.2','${HISTORICAL_RULE_ARTIFACT_V02.manifestHash}','${sqlJson(HISTORICAL_RULE_ARTIFACT_V02.versions)}'::jsonb,'released','["builtin-source-release"]'::jsonb,'product-rule-release-v0.2','2026-08-11T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;
INSERT INTO rule_release_artifacts
  (id,rule_release_id,artifact,content_hash,signature_algorithm,signature,verification_key,signed_by,retention_status)
VALUES
  ('rule-artifact-v0.2','rule-release-v0.2','${sqlJson(HISTORICAL_RULE_ARTIFACT_V02)}'::jsonb,'${HISTORICAL_RULE_ARTIFACT_V02_HASH}','ed25519_v1','${HISTORICAL_RULE_ARTIFACT_V02_SIGNATURE}','${HISTORICAL_RULE_ARTIFACT_V02_PUBLIC_KEY.replaceAll("'", "''")}','product-rule-release-v0.2','retained')
ON CONFLICT (id) DO NOTHING;
INSERT INTO rule_releases
  (id,manifest_hash,versions,status,source_hashes,reviewed_by,reviewed_at)
VALUES
  ('rule-release-v0.4','${HISTORICAL_RULE_ARTIFACT_V04.manifestHash}','${sqlJson(HISTORICAL_RULE_ARTIFACT_V04.versions)}'::jsonb,'released','["builtin-source-release"]'::jsonb,'product-rule-release-v0.4','2026-08-13T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;
INSERT INTO rule_release_artifacts
  (id,rule_release_id,artifact,content_hash,signature_algorithm,signature,verification_key,signed_by,retention_status)
VALUES
  ('rule-artifact-v0.4','rule-release-v0.4','${sqlJson(HISTORICAL_RULE_ARTIFACT_V04)}'::jsonb,'${HISTORICAL_RULE_ARTIFACT_V04_HASH}','ed25519_v1','${HISTORICAL_RULE_ARTIFACT_V04_SIGNATURE}','${HISTORICAL_RULE_ARTIFACT_V04_PUBLIC_KEY.replaceAll("'", "''")}','product-rule-release-v0.4','retained')
ON CONFLICT (id) DO NOTHING;
INSERT INTO rule_releases
  (id,manifest_hash,versions,status,source_hashes,reviewed_by,reviewed_at)
VALUES
  ('rule-release-v0.3','${HISTORICAL_RULE_ARTIFACT_V03.manifestHash}','${sqlJson(HISTORICAL_RULE_ARTIFACT_V03.versions)}'::jsonb,'released','["builtin-source-release"]'::jsonb,'product-rule-release-v0.3','2026-08-11T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;
INSERT INTO rule_release_artifacts
  (id,rule_release_id,artifact,content_hash,signature_algorithm,signature,verification_key,signed_by,retention_status)
VALUES
  ('rule-artifact-v0.3','rule-release-v0.3','${sqlJson(HISTORICAL_RULE_ARTIFACT_V03)}'::jsonb,'${HISTORICAL_RULE_ARTIFACT_V03_HASH}','ed25519_v1','${HISTORICAL_RULE_ARTIFACT_V03_SIGNATURE}','${HISTORICAL_RULE_ARTIFACT_V03_PUBLIC_KEY.replaceAll("'", "''")}','product-rule-release-v0.3','retained')
ON CONFLICT (id) DO NOTHING;
INSERT INTO rule_releases
  (id,manifest_hash,versions,status,source_hashes,reviewed_by,reviewed_at)
VALUES
  ('rule-release-v0.5','${HISTORICAL_RULE_ARTIFACT_V05.manifestHash}','${sqlJson(HISTORICAL_RULE_ARTIFACT_V05.versions)}'::jsonb,'released','["builtin-source-release"]'::jsonb,'product-rule-release-v0.5','2026-08-15T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;
INSERT INTO rule_release_artifacts
  (id,rule_release_id,artifact,content_hash,signature_algorithm,signature,verification_key,signed_by,retention_status)
VALUES
  ('rule-artifact-v0.5','rule-release-v0.5','${sqlJson(HISTORICAL_RULE_ARTIFACT_V05)}'::jsonb,'${HISTORICAL_RULE_ARTIFACT_V05_HASH}','ed25519_v1','${HISTORICAL_RULE_ARTIFACT_V05_SIGNATURE}','${HISTORICAL_RULE_ARTIFACT_V05_PUBLIC_KEY.replaceAll("'", "''")}','product-rule-release-v0.5','retained')
ON CONFLICT (id) DO NOTHING;
INSERT INTO rule_releases
  (id,manifest_hash,versions,status,source_hashes,reviewed_by,reviewed_at)
VALUES
  ('rule-release-v0.6','${HISTORICAL_RULE_ARTIFACT_V06.manifestHash}','${sqlJson(HISTORICAL_RULE_ARTIFACT_V06.versions)}'::jsonb,'released','["builtin-source-release"]'::jsonb,'product-rule-release-v0.6','2026-08-15T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;
INSERT INTO rule_release_artifacts
  (id,rule_release_id,artifact,content_hash,signature_algorithm,signature,verification_key,signed_by,retention_status)
VALUES
  ('rule-artifact-v0.6','rule-release-v0.6','${sqlJson(HISTORICAL_RULE_ARTIFACT_V06)}'::jsonb,'${HISTORICAL_RULE_ARTIFACT_V06_HASH}','ed25519_v1','${HISTORICAL_RULE_ARTIFACT_V06_SIGNATURE}','${HISTORICAL_RULE_ARTIFACT_V06_PUBLIC_KEY.replaceAll("'", "''")}','product-rule-release-v0.6','retained')
ON CONFLICT (id) DO NOTHING;
INSERT INTO rule_releases
  (id,manifest_hash,versions,status,source_hashes,reviewed_by,reviewed_at)
VALUES
  ('rule-release-v0.7','${HISTORICAL_RULE_ARTIFACT_V07.manifestHash}','${sqlJson(HISTORICAL_RULE_ARTIFACT_V07.versions)}'::jsonb,'released','["builtin-source-release"]'::jsonb,'product-rule-release-v0.7','2026-08-16T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;
INSERT INTO rule_release_artifacts
  (id,rule_release_id,artifact,content_hash,signature_algorithm,signature,verification_key,signed_by,retention_status)
VALUES
  ('rule-artifact-v0.7','rule-release-v0.7','${sqlJson(HISTORICAL_RULE_ARTIFACT_V07)}'::jsonb,'${HISTORICAL_RULE_ARTIFACT_V07_HASH}','ed25519_v1','${HISTORICAL_RULE_ARTIFACT_V07_SIGNATURE}','${HISTORICAL_RULE_ARTIFACT_V07_PUBLIC_KEY.replaceAll("'", "''")}','product-rule-release-v0.7','retained')
ON CONFLICT (id) DO NOTHING;
INSERT INTO rule_releases
  (id,manifest_hash,versions,status,source_hashes,reviewed_by,reviewed_at)
VALUES
  ('rule-release-v0.8','${HISTORICAL_RULE_ARTIFACT_V08.manifestHash}','${sqlJson(HISTORICAL_RULE_ARTIFACT_V08.versions)}'::jsonb,'released','["builtin-source-release"]'::jsonb,'product-rule-release-v0.8','2026-08-17T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;
INSERT INTO rule_release_artifacts
  (id,rule_release_id,artifact,content_hash,signature_algorithm,signature,verification_key,signed_by,retention_status)
VALUES
  ('rule-artifact-v0.8','rule-release-v0.8','${sqlJson(HISTORICAL_RULE_ARTIFACT_V08)}'::jsonb,'${HISTORICAL_RULE_ARTIFACT_V08_HASH}','ed25519_v1','${HISTORICAL_RULE_ARTIFACT_V08_SIGNATURE}','${HISTORICAL_RULE_ARTIFACT_V08_PUBLIC_KEY.replaceAll("'", "''")}','product-rule-release-v0.8','retained')
ON CONFLICT (id) DO NOTHING;
INSERT INTO rule_releases
  (id,manifest_hash,versions,status,source_hashes,reviewed_by,reviewed_at)
VALUES
  ('rule-release-v0.9','${HISTORICAL_RULE_ARTIFACT_V09.manifestHash}','${sqlJson(HISTORICAL_RULE_ARTIFACT_V09.versions)}'::jsonb,'released','["builtin-source-release"]'::jsonb,'product-rule-release-v0.9','2026-08-17T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;
INSERT INTO rule_release_artifacts
  (id,rule_release_id,artifact,content_hash,signature_algorithm,signature,verification_key,signed_by,retention_status)
VALUES
  ('rule-artifact-v0.9','rule-release-v0.9','${sqlJson(HISTORICAL_RULE_ARTIFACT_V09)}'::jsonb,'${HISTORICAL_RULE_ARTIFACT_V09_HASH}','ed25519_v1','${HISTORICAL_RULE_ARTIFACT_V09_SIGNATURE}','${HISTORICAL_RULE_ARTIFACT_V09_PUBLIC_KEY.replaceAll("'", "''")}','product-rule-release-v0.9','retained')
ON CONFLICT (id) DO NOTHING;
INSERT INTO rule_releases
  (id,manifest_hash,versions,status,source_hashes,reviewed_by,reviewed_at)
VALUES
  ('rule-release-v0.9.1','${HISTORICAL_RULE_ARTIFACT_V091.manifestHash}','${sqlJson(HISTORICAL_RULE_ARTIFACT_V091.versions)}'::jsonb,'released','["builtin-source-release"]'::jsonb,'product-rule-release-v0.9.1','2026-08-18T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;
INSERT INTO rule_release_artifacts
  (id,rule_release_id,artifact,content_hash,signature_algorithm,signature,verification_key,signed_by,retention_status)
VALUES
  ('rule-artifact-v0.9.1','rule-release-v0.9.1','${sqlJson(HISTORICAL_RULE_ARTIFACT_V091)}'::jsonb,'${HISTORICAL_RULE_ARTIFACT_V091_HASH}','ed25519_v1','${HISTORICAL_RULE_ARTIFACT_V091_SIGNATURE}','${HISTORICAL_RULE_ARTIFACT_V091_PUBLIC_KEY.replaceAll("'", "''")}','product-rule-release-v0.9.1','retained')
ON CONFLICT (id) DO NOTHING;
INSERT INTO rule_releases
  (id,manifest_hash,versions,status,source_hashes,reviewed_by,reviewed_at)
VALUES
  ('rule-release-v0.9.2','${HISTORICAL_RULE_ARTIFACT_V092.manifestHash}','${sqlJson(HISTORICAL_RULE_ARTIFACT_V092.versions)}'::jsonb,'released','["builtin-source-release"]'::jsonb,'product-rule-release-v0.9.2','2026-08-18T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;
INSERT INTO rule_release_artifacts
  (id,rule_release_id,artifact,content_hash,signature_algorithm,signature,verification_key,signed_by,retention_status)
VALUES
  ('rule-artifact-v0.9.2','rule-release-v0.9.2','${sqlJson(HISTORICAL_RULE_ARTIFACT_V092)}'::jsonb,'${HISTORICAL_RULE_ARTIFACT_V092_HASH}','ed25519_v1','${HISTORICAL_RULE_ARTIFACT_V092_SIGNATURE}','${HISTORICAL_RULE_ARTIFACT_V092_PUBLIC_KEY.replaceAll("'", "''")}','product-rule-release-v0.9.2','retained')
ON CONFLICT (id) DO NOTHING;
INSERT INTO rule_releases
  (id,manifest_hash,versions,status,source_hashes,reviewed_by,reviewed_at)
VALUES
  ('${BUILTIN_RULE_RELEASE_ID}','${EXECUTABLE_RULESET_SHA256}','${sqlJson(VERSION_TUPLE)}'::jsonb,'released','["builtin-source-release"]'::jsonb,'product-rule-release-v0.9.3','2026-08-25T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;
INSERT INTO rule_release_artifacts
  (id,rule_release_id,artifact,content_hash,signature_algorithm,signature,verification_key,signed_by,retention_status)
VALUES
  ('${BUILTIN_RULE_ARTIFACT_ID}','${BUILTIN_RULE_RELEASE_ID}','${sqlJson(EXECUTABLE_RULE_ARTIFACT)}'::jsonb,'${ruleArtifactHash}','ed25519_v1','${BUILTIN_RULE_ARTIFACT_SIGNATURE}','${BUILTIN_RULE_ARTIFACT_PUBLIC_KEY.replaceAll("'", "''")}','product-rule-release-v0.9.3','retained')
ON CONFLICT (id) DO NOTHING;
UPDATE rule_release_artifacts SET
  signature_algorithm='ed25519_v1',
  signature='${HISTORICAL_RULE_ARTIFACT_V02_SIGNATURE}',
  verification_key='${HISTORICAL_RULE_ARTIFACT_V02_PUBLIC_KEY.replaceAll("'", "''")}'
WHERE id='rule-artifact-v0.2';
UPDATE rule_release_artifacts SET
  signature_algorithm='ed25519_v1',
  signature='${HISTORICAL_RULE_ARTIFACT_V03_SIGNATURE}',
  verification_key='${HISTORICAL_RULE_ARTIFACT_V03_PUBLIC_KEY.replaceAll("'", "''")}'
WHERE id='rule-artifact-v0.3';
UPDATE rule_release_artifacts SET
  signature_algorithm='ed25519_v1',
  signature='${HISTORICAL_RULE_ARTIFACT_V04_SIGNATURE}',
  verification_key='${HISTORICAL_RULE_ARTIFACT_V04_PUBLIC_KEY.replaceAll("'", "''")}'
WHERE id='rule-artifact-v0.4';
UPDATE rule_release_artifacts SET
  signature_algorithm='ed25519_v1',
  signature='${HISTORICAL_RULE_ARTIFACT_V05_SIGNATURE}',
  verification_key='${HISTORICAL_RULE_ARTIFACT_V05_PUBLIC_KEY.replaceAll("'", "''")}'
WHERE id='rule-artifact-v0.5';
UPDATE rule_release_artifacts SET
  signature_algorithm='ed25519_v1',
  signature='${HISTORICAL_RULE_ARTIFACT_V06_SIGNATURE}',
  verification_key='${HISTORICAL_RULE_ARTIFACT_V06_PUBLIC_KEY.replaceAll("'", "''")}'
WHERE id='rule-artifact-v0.6';
UPDATE rule_release_artifacts SET
  signature_algorithm='ed25519_v1',
  signature='${HISTORICAL_RULE_ARTIFACT_V07_SIGNATURE}',
  verification_key='${HISTORICAL_RULE_ARTIFACT_V07_PUBLIC_KEY.replaceAll("'", "''")}'
WHERE id='rule-artifact-v0.7';
UPDATE rule_release_artifacts SET
  signature_algorithm='ed25519_v1',
  signature='${HISTORICAL_RULE_ARTIFACT_V08_SIGNATURE}',
  verification_key='${HISTORICAL_RULE_ARTIFACT_V08_PUBLIC_KEY.replaceAll("'", "''")}'
WHERE id='rule-artifact-v0.8';
UPDATE rule_release_artifacts SET
  signature_algorithm='ed25519_v1',
  signature='${HISTORICAL_RULE_ARTIFACT_V09_SIGNATURE}',
  verification_key='${HISTORICAL_RULE_ARTIFACT_V09_PUBLIC_KEY.replaceAll("'", "''")}'
WHERE id='rule-artifact-v0.9';
UPDATE rule_release_artifacts SET
  signature_algorithm='ed25519_v1',
  signature='${HISTORICAL_RULE_ARTIFACT_V091_SIGNATURE}',
  verification_key='${HISTORICAL_RULE_ARTIFACT_V091_PUBLIC_KEY.replaceAll("'", "''")}'
WHERE id='rule-artifact-v0.9.1';
UPDATE rule_release_artifacts SET
  signature_algorithm='ed25519_v1',
  signature='${HISTORICAL_RULE_ARTIFACT_V092_SIGNATURE}',
  verification_key='${HISTORICAL_RULE_ARTIFACT_V092_PUBLIC_KEY.replaceAll("'", "''")}'
WHERE id='rule-artifact-v0.9.2';
UPDATE rule_release_artifacts SET
  signature_algorithm='ed25519_v1',
  signature='${BUILTIN_RULE_ARTIFACT_SIGNATURE}',
  verification_key='${BUILTIN_RULE_ARTIFACT_PUBLIC_KEY.replaceAll("'", "''")}'
WHERE id='${BUILTIN_RULE_ARTIFACT_ID}';
CREATE TABLE IF NOT EXISTS questionnaire_releases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  campaign_id TEXT NOT NULL UNIQUE REFERENCES campaigns(id),
  snapshot JSONB NOT NULL,
  content_hash TEXT NOT NULL,
  rule_release_id TEXT REFERENCES rule_releases(id),
  rule_release_artifact_id TEXT REFERENCES rule_release_artifacts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE questionnaire_releases ADD COLUMN IF NOT EXISTS rule_release_id TEXT REFERENCES rule_releases(id);
ALTER TABLE questionnaire_releases ADD COLUMN IF NOT EXISTS rule_release_artifact_id TEXT REFERENCES rule_release_artifacts(id);
CREATE TABLE IF NOT EXISTS campaign_schedule_amendments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  previous_closes_at TIMESTAMPTZ NOT NULL,
  new_closes_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id,sequence)
);
CREATE TABLE IF NOT EXISTS campaign_scope_members (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  external_subject_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('feishu_directory','email_invite','designated_assessor')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id,external_subject_id)
);
ALTER TABLE campaign_scope_members DROP CONSTRAINT IF EXISTS campaign_scope_members_source_check;
ALTER TABLE campaign_scope_members ADD CONSTRAINT campaign_scope_members_source_check CHECK (source IN ('feishu_directory','email_invite','designated_assessor'));
CREATE INDEX IF NOT EXISTS campaign_scope_members_tenant_idx ON campaign_scope_members(tenant_id,campaign_id);
CREATE TABLE IF NOT EXISTS campaign_sampling_frame_snapshots (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), campaign_id TEXT NOT NULL UNIQUE REFERENCES campaigns(id),
  snapshot JSONB NOT NULL, schema_version TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS research_context_snapshots (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), campaign_id TEXT NOT NULL UNIQUE REFERENCES campaigns(id),
  snapshot JSONB NOT NULL, schema_version TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS campaign_person_context_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  cohort_key TEXT NOT NULL,
  context JSONB NOT NULL,
  member_count INTEGER NOT NULL CHECK (member_count>=0),
  protection_status TEXT NOT NULL CHECK (protection_status IN ('included','suppressed')),
  coarsening_level INTEGER NOT NULL,
  classification_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id,cohort_key)
);
CREATE INDEX IF NOT EXISTS campaign_person_context_snapshot_idx ON campaign_person_context_snapshots(tenant_id,campaign_id,protection_status);
CREATE TABLE IF NOT EXISTS norm_eligibility_assessments (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), campaign_id TEXT NOT NULL UNIQUE REFERENCES campaigns(id),
  psychometric_eligible BOOLEAN NOT NULL, norm_candidate BOOLEAN NOT NULL, subgroup_eligible BOOLEAN NOT NULL,
  reason_codes JSONB NOT NULL, assessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  provider TEXT NOT NULL,
  external_subject_id TEXT NOT NULL,
  identity_hash TEXT,
  token_fingerprint TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id,provider,external_subject_id)
);
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS identity_hash TEXT;
CREATE INDEX IF NOT EXISTS invitations_email_identity_idx ON invitations(tenant_id,campaign_id,provider,identity_hash);
CREATE TABLE IF NOT EXISTS completion_receipts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  invitation_id TEXT NOT NULL UNIQUE REFERENCES invitations(id),
  receipt_hash TEXT NOT NULL UNIQUE,
  queued_batch TEXT NOT NULL,
  eligible_after TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','processed')),
  processed_batch TEXT
);
CREATE INDEX IF NOT EXISTS completion_receipts_due_idx
ON completion_receipts(status,eligible_after,queued_batch);
CREATE TABLE IF NOT EXISTS notification_jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  invitation_id TEXT REFERENCES invitations(id),
  notification_type TEXT NOT NULL CHECK (notification_type IN ('invite','reminder','deadline','report')),
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','sent','failed')),
  provider_message_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS response_submissions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  participant_ref TEXT,
  answers JSONB NOT NULL,
  background_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  custom_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_hash TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL,
  privacy_notice_version TEXT,
  consented_at TIMESTAMPTZ,
  UNIQUE (campaign_id, response_hash)
);
ALTER TABLE response_submissions ADD COLUMN IF NOT EXISTS background_answers JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE response_submissions ADD COLUMN IF NOT EXISTS custom_answers JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE response_submissions ADD COLUMN IF NOT EXISTS privacy_notice_version TEXT;
ALTER TABLE response_submissions ADD COLUMN IF NOT EXISTS consented_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS responses_campaign_idx ON response_submissions(tenant_id, campaign_id);
CREATE TABLE IF NOT EXISTS personal_research_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  response_id TEXT NOT NULL UNIQUE REFERENCES response_submissions(id),
  profile_snapshot JSONB NOT NULL,
  research_eligible BOOLEAN NOT NULL DEFAULT false,
  eligibility_reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  schema_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS response_drafts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  subject_ref_hash TEXT NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  background_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  custom_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  client_revision INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id,subject_ref_hash)
);
CREATE INDEX IF NOT EXISTS response_drafts_tenant_campaign_idx ON response_drafts(tenant_id,campaign_id);
ALTER TABLE response_drafts ADD COLUMN IF NOT EXISTS custom_answers JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE IF NOT EXISTS assessment_input_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  response_id TEXT REFERENCES response_submissions(id),
  assessment_profile TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id,response_id,content_hash)
);
CREATE INDEX IF NOT EXISTS assessment_input_lookup_idx ON assessment_input_snapshots(tenant_id,campaign_id,response_id,created_at);
CREATE TABLE IF NOT EXISTS score_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  response_id TEXT NOT NULL REFERENCES response_submissions(id),
  assessment_input_snapshot_id TEXT REFERENCES assessment_input_snapshots(id),
  rule_release_id TEXT REFERENCES rule_releases(id),
  rule_release_artifact_id TEXT REFERENCES rule_release_artifacts(id),
  snapshot JSONB NOT NULL,
  input_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (response_id, input_hash)
);
ALTER TABLE score_snapshots ADD COLUMN IF NOT EXISTS assessment_input_snapshot_id TEXT REFERENCES assessment_input_snapshots(id);
ALTER TABLE score_snapshots ADD COLUMN IF NOT EXISTS rule_release_id TEXT REFERENCES rule_releases(id);
ALTER TABLE score_snapshots ADD COLUMN IF NOT EXISTS rule_release_artifact_id TEXT REFERENCES rule_release_artifacts(id);
CREATE TABLE IF NOT EXISTS scoring_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  assessment_input_snapshot_id TEXT NOT NULL REFERENCES assessment_input_snapshots(id),
  rule_release_id TEXT NOT NULL REFERENCES rule_releases(id),
  rule_release_artifact_id TEXT NOT NULL REFERENCES rule_release_artifacts(id),
  score_snapshot_id TEXT REFERENCES score_snapshots(id),
  status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed')),
  input_hash TEXT NOT NULL,
  output_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assessment_input_snapshot_id,rule_release_artifact_id,output_hash)
);
CREATE TABLE IF NOT EXISTS report_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  response_id TEXT,
  assessment_input_snapshot_id TEXT REFERENCES assessment_input_snapshots(id),
  rule_release_id TEXT REFERENCES rule_releases(id),
  rule_release_artifact_id TEXT REFERENCES rule_release_artifacts(id),
  report_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','published')),
  snapshot JSONB NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  supersedes_snapshot_id TEXT,
  UNIQUE (campaign_id, response_id, report_type, content_hash)
);
ALTER TABLE report_snapshots ADD COLUMN IF NOT EXISTS assessment_input_snapshot_id TEXT REFERENCES assessment_input_snapshots(id);
ALTER TABLE report_snapshots ADD COLUMN IF NOT EXISTS rule_release_id TEXT REFERENCES rule_releases(id);
ALTER TABLE report_snapshots ADD COLUMN IF NOT EXISTS rule_release_artifact_id TEXT REFERENCES rule_release_artifacts(id);
CREATE INDEX IF NOT EXISTS reports_access_idx ON report_snapshots(tenant_id, campaign_id, report_type, status);
CREATE TABLE IF NOT EXISTS report_artifacts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  report_snapshot_id TEXT NOT NULL REFERENCES report_snapshots(id),
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('pdf')),
  storage_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size>0),
  mime_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (report_snapshot_id,artifact_type,content_hash)
);
CREATE INDEX IF NOT EXISTS report_artifacts_lookup_idx ON report_artifacts(tenant_id,report_snapshot_id,artifact_type,created_at);
CREATE TABLE IF NOT EXISTS report_publications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  report_snapshot_id TEXT NOT NULL REFERENCES report_snapshots(id),
  audience TEXT NOT NULL CHECK (audience IN ('employee','manager','organization')),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('reviewed','published','superseded')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  published_by TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  superseded_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  UNIQUE (report_snapshot_id, audience)
);
ALTER TABLE report_publications ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';
ALTER TABLE report_publications ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE report_publications ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE report_publications ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;
ALTER TABLE report_publications DROP CONSTRAINT IF EXISTS report_publications_reviewed_by_fkey;
ALTER TABLE report_publications DROP CONSTRAINT IF EXISTS report_publications_published_by_fkey;
ALTER TABLE report_publications DROP CONSTRAINT IF EXISTS report_publications_status_check;
ALTER TABLE report_publications ADD CONSTRAINT report_publications_status_check CHECK (status IN ('reviewed','published','superseded'));
CREATE TABLE IF NOT EXISTS report_access_grants (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  report_snapshot_id TEXT NOT NULL REFERENCES report_snapshots(id),
  grantee_user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ,
  pdf_allowed BOOLEAN NOT NULL DEFAULT false,
  revoked_at TIMESTAMPTZ,
  granted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE report_access_grants ADD COLUMN IF NOT EXISTS operations JSONB NOT NULL DEFAULT '["view"]'::jsonb;
ALTER TABLE report_access_grants ADD COLUMN IF NOT EXISTS granted_by TEXT;
ALTER TABLE report_access_grants ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS report_retrieval_tokens (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  report_snapshot_id TEXT NOT NULL REFERENCES report_snapshots(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS individual_report_grants (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  grantee_user_id TEXT NOT NULL REFERENCES users(id),
  operations JSONB NOT NULL DEFAULT '["view"]'::jsonb,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  granted_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS individual_report_grants_lookup_idx
ON individual_report_grants(tenant_id,campaign_id,grantee_user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS response_subject_links (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  response_id TEXT NOT NULL REFERENCES response_submissions(id),
  subject_ref_hash TEXT NOT NULL,
  department_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  link_type TEXT NOT NULL CHECK (link_type IN ('identified','anonymous_self_service')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id,subject_ref_hash)
);
ALTER TABLE response_subject_links ADD COLUMN IF NOT EXISTS department_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE TABLE IF NOT EXISTS action_plan_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  source_report_id TEXT NOT NULL,
  recommendation_id TEXT NOT NULL,
  dimension_id TEXT NOT NULL,
  title TEXT NOT NULL,
  owner TEXT NOT NULL,
  starts_at DATE NOT NULL,
  due_at DATE NOT NULL,
  success_metric TEXT NOT NULL,
  resources TEXT NOT NULL,
  milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  retest_at DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned','active','completed','cancelled')),
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  latest_update TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS source_report_id TEXT NOT NULL DEFAULT '';
ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS dimension_id TEXT NOT NULL DEFAULT 'A1';
ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS resources TEXT NOT NULL DEFAULT '待确认';
ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS milestones JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS evidence_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS evidence_references JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS risk_conditions JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS retest_at DATE;
ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100);
ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS latest_update TEXT;
ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS action_plan_source_recommendation_idx
ON action_plan_items(tenant_id,source_report_id,recommendation_id);
CREATE TABLE IF NOT EXISTS action_check_ins (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  action_plan_item_id TEXT NOT NULL REFERENCES action_plan_items(id) ON DELETE CASCADE,
  progress_percent INTEGER NOT NULL CHECK (progress_percent BETWEEN 0 AND 100),
  note TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS action_check_ins_item_idx ON action_check_ins(tenant_id,action_plan_item_id,created_at);
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS data_deletion_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  requested_by TEXT,
  requester_kind TEXT NOT NULL CHECK (requester_kind IN ('authenticated_subject','anonymous_report_holder')),
  status TEXT NOT NULL CHECK (status IN ('queued','processing','completed','failed')),
  reason TEXT NOT NULL,
  subject_scope_hash TEXT NOT NULL,
  subject_count INTEGER NOT NULL CHECK (subject_count>0),
  status_token_hash TEXT UNIQUE,
  result JSONB,
  error_code TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS data_deletion_requests_subject_idx
ON data_deletion_requests(tenant_id,requested_by,requested_at DESC);
INSERT INTO schema_releases (release_id) VALUES ('${SCHEMA_RELEASE}') ON CONFLICT (release_id) DO NOTHING;
`;

// Applied only after the TypeScript migration has reconstructed lineage for
// pre-v15 rows. Keeping this separate prevents SET NOT NULL from blocking the
// deterministic backfill while still enforcing strong references at runtime.
export const LINEAGE_CONSTRAINT_STATEMENTS = [
  "ALTER TABLE questionnaire_releases ALTER COLUMN rule_release_id SET NOT NULL",
  "ALTER TABLE questionnaire_releases ALTER COLUMN rule_release_artifact_id SET NOT NULL",
  "ALTER TABLE score_snapshots ALTER COLUMN assessment_input_snapshot_id SET NOT NULL",
  "ALTER TABLE score_snapshots ALTER COLUMN rule_release_id SET NOT NULL",
  "ALTER TABLE score_snapshots ALTER COLUMN rule_release_artifact_id SET NOT NULL",
  "ALTER TABLE report_snapshots ALTER COLUMN assessment_input_snapshot_id SET NOT NULL",
  "ALTER TABLE report_snapshots ALTER COLUMN rule_release_id SET NOT NULL",
  "ALTER TABLE report_snapshots ALTER COLUMN rule_release_artifact_id SET NOT NULL",
] as const;
