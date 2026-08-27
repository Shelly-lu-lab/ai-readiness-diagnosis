import { describe, expect, it } from "vitest";
import { validateProductionConfig } from "./config.js";

describe("production configuration gate", () => {
  it("does nothing outside production", () =>
    expect(() => validateProductionConfig({ NODE_ENV: "test" })).not.toThrow());
  it("rejects missing and unsafe production configuration", () => {
    expect(() => validateProductionConfig({ NODE_ENV: "production" })).toThrow(
      "MISSING_PRODUCTION_CONFIG",
    );
    expect(() =>
      validateProductionConfig({
        NODE_ENV: "production",
        DATABASE_URL: "pglite://local",
        REDIS_URL: "redis://cache:6379",
        SESSION_SECRET: "x".repeat(32),
        DATA_LINK_SECRET: "z".repeat(32),
        INVITE_SECRET: "i".repeat(32),
        INTERNAL_WORKER_SECRET: "y".repeat(32),
        WEB_ORIGIN: "https://app.example",
        FEISHU_APP_ID: "a",
        FEISHU_APP_SECRET: "s",
        FEISHU_REDIRECT_URI: "https://api.example/callback",
        FEISHU_BOOTSTRAP_OWNER_OPEN_IDS: "ou_initial_owner",
        OBJECT_STORAGE_ENDPOINT: "https://storage.example",
        OBJECT_STORAGE_BUCKET: "reports",
        OBJECT_STORAGE_ACCESS_KEY: "key",
        OBJECT_STORAGE_SECRET_KEY: "secret",
      }),
    ).toThrow("PRODUCTION_DATABASE_MUST_BE_POSTGRESQL");
  });
  it("accepts a complete HTTPS, PostgreSQL and object-storage configuration", () =>
    expect(() =>
      validateProductionConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://db/app",
        REDIS_URL: "redis://cache:6379",
        SESSION_SECRET: "x".repeat(32),
        DATA_LINK_SECRET: "z".repeat(32),
        INVITE_SECRET: "i".repeat(32),
        INTERNAL_WORKER_SECRET: "y".repeat(32),
        WEB_ORIGIN: "https://app.example",
        FEISHU_APP_ID: "a",
        FEISHU_APP_SECRET: "s",
        FEISHU_REDIRECT_URI: "https://api.example/callback",
        FEISHU_BOOTSTRAP_OWNER_OPEN_IDS: "ou_initial_owner",
        OBJECT_STORAGE_ENDPOINT: "https://storage.example",
        OBJECT_STORAGE_BUCKET: "reports",
        OBJECT_STORAGE_ACCESS_KEY: "key",
        OBJECT_STORAGE_SECRET_KEY: "secret",
      }),
    ).not.toThrow());
  it("accepts production email OTP mode without Feishu credentials", () =>
    expect(() =>
      validateProductionConfig({
        NODE_ENV: "production",
        AUTH_MODE: "email_otp",
        DATABASE_URL: "postgresql://db/app",
        REDIS_URL: "redis://cache:6379",
        SESSION_SECRET: "x".repeat(32),
        DATA_LINK_SECRET: "z".repeat(32),
        INVITE_SECRET: "i".repeat(32),
        INTERNAL_WORKER_SECRET: "y".repeat(32),
        WEB_ORIGIN: "https://app.example",
        EMAIL_PROVIDER: "transactional",
        EMAIL_API_KEY: "provider-key",
        EMAIL_API_URL: "https://mail.example/send",
        EMAIL_FROM: "no-reply@app.example",
        OBJECT_STORAGE_ENDPOINT: "https://storage.example",
        OBJECT_STORAGE_BUCKET: "reports",
        OBJECT_STORAGE_ACCESS_KEY: "key",
        OBJECT_STORAGE_SECRET_KEY: "secret",
      }),
    ).not.toThrow());
  it("allows explicit ephemeral artifact storage for a public MVP", () =>
    expect(() =>
      validateProductionConfig({
        NODE_ENV: "production",
        AUTH_MODE: "email_otp",
        DATABASE_URL: "postgresql://db/app",
        REDIS_URL: "redis://cache:6379",
        SESSION_SECRET: "s".repeat(32),
        DATA_LINK_SECRET: "d".repeat(32),
        INVITE_SECRET: "i".repeat(32),
        INTERNAL_WORKER_SECRET: "w".repeat(32),
        WEB_ORIGIN: "https://app.example",
        EMAIL_PROVIDER: "brevo",
        BREVO_API_KEY: "xkeysib-valid",
        EMAIL_FROM: "AI 组织转型诊断 <sender@example.com>",
        ALLOW_EPHEMERAL_ARTIFACT_STORAGE: "true",
      }),
    ).not.toThrow());
  it("accepts a named Resend sender and requires its API key", () => {
    const complete = {
      NODE_ENV: "production",
      AUTH_MODE: "email_otp",
      DATABASE_URL: "postgresql://db/app",
      REDIS_URL: "redis://cache:6379",
      SESSION_SECRET: "s".repeat(32),
      DATA_LINK_SECRET: "d".repeat(32),
      INVITE_SECRET: "i".repeat(32),
      INTERNAL_WORKER_SECRET: "w".repeat(32),
      WEB_ORIGIN: "https://app.example",
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "AI 组织转型诊断 <survey@app.example>",
      OBJECT_STORAGE_ENDPOINT: "https://storage.example",
      OBJECT_STORAGE_BUCKET: "reports",
      OBJECT_STORAGE_ACCESS_KEY: "key",
      OBJECT_STORAGE_SECRET_KEY: "secret",
    };
    expect(() => validateProductionConfig(complete)).toThrow(
      "EMAIL_RESEND_CONFIGURATION_INCOMPLETE",
    );
    expect(() =>
      validateProductionConfig({ ...complete, RESEND_API_KEY: "re_valid" }),
    ).not.toThrow();
  });
  it("accepts a verified Brevo sender and requires its API key", () => {
    const complete = {
      NODE_ENV: "production",
      AUTH_MODE: "email_otp",
      DATABASE_URL: "postgresql://db/app",
      REDIS_URL: "redis://cache:6379",
      SESSION_SECRET: "s".repeat(32),
      DATA_LINK_SECRET: "d".repeat(32),
      INVITE_SECRET: "i".repeat(32),
      INTERNAL_WORKER_SECRET: "w".repeat(32),
      WEB_ORIGIN: "https://app.example",
      EMAIL_PROVIDER: "brevo",
      EMAIL_FROM: "AI 组织转型诊断 <sender@example.com>",
      OBJECT_STORAGE_ENDPOINT: "https://storage.example",
      OBJECT_STORAGE_BUCKET: "reports",
      OBJECT_STORAGE_ACCESS_KEY: "key",
      OBJECT_STORAGE_SECRET_KEY: "secret",
    };
    expect(() => validateProductionConfig(complete)).toThrow(
      "EMAIL_BREVO_CONFIGURATION_INCOMPLETE",
    );
    expect(() =>
      validateProductionConfig({ ...complete, BREVO_API_KEY: "xkeysib-valid" }),
    ).not.toThrow();
  });
  it("rejects the console email provider in production email mode", () => {
    expect(() =>
      validateProductionConfig({
        NODE_ENV: "production",
        AUTH_MODE: "email_otp",
        DATABASE_URL: "postgresql://db/app",
        REDIS_URL: "redis://cache:6379",
        SESSION_SECRET: "s".repeat(32),
        DATA_LINK_SECRET: "d".repeat(32),
        INVITE_SECRET: "i".repeat(32),
        INTERNAL_WORKER_SECRET: "w".repeat(32),
        WEB_ORIGIN: "https://app.example",
        EMAIL_PROVIDER: "console",
        EMAIL_FROM: "sender@example.com",
        OBJECT_STORAGE_ENDPOINT: "https://storage.example",
        OBJECT_STORAGE_BUCKET: "reports",
        OBJECT_STORAGE_ACCESS_KEY: "key",
        OBJECT_STORAGE_SECRET_KEY: "secret",
      }),
    ).toThrow("EMAIL_CONSOLE_NOT_ALLOWED_IN_PRODUCTION");
  });
  it("accepts SMTP email mode only with mailbox credentials", () => {
    const complete = {
      NODE_ENV: "production",
      AUTH_MODE: "email_otp",
      DATABASE_URL: "postgresql://db/app",
      REDIS_URL: "redis://cache:6379",
      SESSION_SECRET: "s".repeat(32),
      DATA_LINK_SECRET: "d".repeat(32),
      INVITE_SECRET: "i".repeat(32),
      INTERNAL_WORKER_SECRET: "w".repeat(32),
      WEB_ORIGIN: "https://app.example",
      EMAIL_PROVIDER: "smtp",
      EMAIL_FROM: "AI 组织转型诊断 <ai.readiness.survey@gmail.com>",
      OBJECT_STORAGE_ENDPOINT: "https://storage.example",
      OBJECT_STORAGE_BUCKET: "reports",
      OBJECT_STORAGE_ACCESS_KEY: "key",
      OBJECT_STORAGE_SECRET_KEY: "secret",
    };
    expect(() => validateProductionConfig(complete)).toThrow(
      "EMAIL_SMTP_CONFIGURATION_INCOMPLETE",
    );
    expect(() => validateProductionConfig({
      ...complete,
      SMTP_USER: "ai.readiness.survey@gmail.com",
      SMTP_PASS: "application-password",
    })).not.toThrow();
  });
  it("rejects reusing the session secret as the worker secret", () => {
    const sharedSecret = "s".repeat(32);
    expect(() =>
      validateProductionConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://db/app",
        REDIS_URL: "redis://cache:6379",
        SESSION_SECRET: sharedSecret,
        DATA_LINK_SECRET: "z".repeat(32),
        INVITE_SECRET: "i".repeat(32),
        INTERNAL_WORKER_SECRET: sharedSecret,
        WEB_ORIGIN: "https://app.example",
        FEISHU_APP_ID: "a",
        FEISHU_APP_SECRET: "s",
        FEISHU_REDIRECT_URI: "https://api.example/callback",
        FEISHU_BOOTSTRAP_OWNER_OPEN_IDS: "ou_initial_owner",
        OBJECT_STORAGE_ENDPOINT: "https://storage.example",
        OBJECT_STORAGE_BUCKET: "reports",
        OBJECT_STORAGE_ACCESS_KEY: "key",
        OBJECT_STORAGE_SECRET_KEY: "secret",
      }),
    ).toThrow("PRODUCTION_SECRETS_MUST_DIFFER");
  });
  it("rejects missing, short or reused data-link and invite secrets", () => {
    const complete = {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://db/app",
      REDIS_URL: "redis://cache:6379",
      SESSION_SECRET: "s".repeat(32),
      DATA_LINK_SECRET: "d".repeat(32),
      INVITE_SECRET: "i".repeat(32),
      INTERNAL_WORKER_SECRET: "w".repeat(32),
      WEB_ORIGIN: "https://app.example",
      FEISHU_APP_ID: "a",
      FEISHU_APP_SECRET: "f",
      FEISHU_REDIRECT_URI: "https://api.example/callback",
      FEISHU_BOOTSTRAP_OWNER_OPEN_IDS: "ou_initial_owner",
      OBJECT_STORAGE_ENDPOINT: "https://storage.example",
      OBJECT_STORAGE_BUCKET: "reports",
      OBJECT_STORAGE_ACCESS_KEY: "key",
      OBJECT_STORAGE_SECRET_KEY: "secret",
    };
    expect(() =>
      validateProductionConfig({ ...complete, DATA_LINK_SECRET: "short" }),
    ).toThrow("DATA_LINK_SECRET_TOO_SHORT");
    expect(() =>
      validateProductionConfig({
        ...complete,
        INVITE_SECRET: complete.SESSION_SECRET,
      }),
    ).toThrow("PRODUCTION_SECRETS_MUST_DIFFER");
  });
});
