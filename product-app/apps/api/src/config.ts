const requiredProductionKeys = [
  "DATABASE_URL",
  "REDIS_URL",
  "SESSION_SECRET",
  "DATA_LINK_SECRET",
  "INVITE_SECRET",
  "WEB_ORIGIN",
  "INTERNAL_WORKER_SECRET",
] as const;

const feishuProductionKeys = [
  "FEISHU_APP_ID",
  "FEISHU_APP_SECRET",
  "FEISHU_REDIRECT_URI",
  "FEISHU_BOOTSTRAP_OWNER_OPEN_IDS",
] as const;
const emailProductionKeys = [
  "EMAIL_PROVIDER",
  "EMAIL_FROM",
] as const;

export function validateProductionConfig(environment: NodeJS.ProcessEnv): void {
  if (environment.NODE_ENV !== "production") return;
  const authMode = environment.AUTH_MODE ?? "feishu_oauth";
  if (!(["email_otp", "feishu_oauth"] as string[]).includes(authMode))
    throw new Error("AUTH_MODE_INVALID");
  const authKeys = authMode === "email_otp" ? emailProductionKeys : feishuProductionKeys;
  const missing = [...requiredProductionKeys, ...authKeys].filter(
    (key) => !environment[key],
  );
  if (missing.length)
    throw new Error(`MISSING_PRODUCTION_CONFIG:${missing.join(",")}`);
  const ephemeralArtifactStorage =
    environment.ALLOW_EPHEMERAL_ARTIFACT_STORAGE === "true";
  const objectStorageKeys = [
    "OBJECT_STORAGE_ENDPOINT",
    "OBJECT_STORAGE_BUCKET",
    "OBJECT_STORAGE_ACCESS_KEY",
    "OBJECT_STORAGE_SECRET_KEY",
  ] as const;
  const missingObjectStorage = objectStorageKeys.filter(
    (key) => !environment[key],
  );
  if (missingObjectStorage.length && !ephemeralArtifactStorage)
    throw new Error(
      `MISSING_PRODUCTION_CONFIG:${missingObjectStorage.join(",")}`,
    );
  if ((environment.SESSION_SECRET?.length ?? 0) < 32)
    throw new Error("SESSION_SECRET_TOO_SHORT");
  if ((environment.INTERNAL_WORKER_SECRET?.length ?? 0) < 32)
    throw new Error("INTERNAL_WORKER_SECRET_TOO_SHORT");
  if ((environment.DATA_LINK_SECRET?.length ?? 0) < 32)
    throw new Error("DATA_LINK_SECRET_TOO_SHORT");
  if ((environment.INVITE_SECRET?.length ?? 0) < 32)
    throw new Error("INVITE_SECRET_TOO_SHORT");
  const secrets = [
    environment.SESSION_SECRET,
    environment.INTERNAL_WORKER_SECRET,
    environment.DATA_LINK_SECRET,
    environment.INVITE_SECRET,
  ];
  if (new Set(secrets).size !== secrets.length)
    throw new Error("PRODUCTION_SECRETS_MUST_DIFFER");
  if (environment.DATABASE_URL?.startsWith("pglite://"))
    throw new Error("PRODUCTION_DATABASE_MUST_BE_POSTGRESQL");
  if (!environment.DATABASE_URL?.startsWith("postgres"))
    throw new Error("PRODUCTION_DATABASE_MUST_BE_POSTGRESQL");
  if (!environment.REDIS_URL?.startsWith("redis"))
    throw new Error("PRODUCTION_REDIS_URL_INVALID");
  if (!environment.WEB_ORIGIN?.startsWith("https://"))
    throw new Error("PRODUCTION_WEB_ORIGIN_MUST_USE_HTTPS");
  if (authMode === "feishu_oauth") {
    if (!environment.FEISHU_REDIRECT_URI?.startsWith("https://"))
      throw new Error("FEISHU_REDIRECT_URI_MUST_USE_HTTPS");
    if (
      !environment.FEISHU_BOOTSTRAP_OWNER_OPEN_IDS?.split(/[,，;；\s]+/).some(
        (value) => value.startsWith("ou_") && value.length > 3,
      )
    )
      throw new Error("FEISHU_BOOTSTRAP_OWNER_OPEN_IDS_INVALID");
  } else if (environment.EMAIL_PROVIDER === "console") {
    throw new Error("EMAIL_CONSOLE_NOT_ALLOWED_IN_PRODUCTION");
  } else if (!/(?:^|<)[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$/.test(environment.EMAIL_FROM ?? "")) {
    throw new Error("EMAIL_FROM_INVALID");
  } else if (
    environment.EMAIL_PROVIDER === "resend" &&
    !environment.RESEND_API_KEY
  ) {
    throw new Error("EMAIL_RESEND_CONFIGURATION_INCOMPLETE");
  } else if (
    environment.EMAIL_PROVIDER === "brevo" &&
    !environment.BREVO_API_KEY
  ) {
    throw new Error("EMAIL_BREVO_CONFIGURATION_INCOMPLETE");
  } else if (
    environment.EMAIL_PROVIDER === "smtp" &&
    (!environment.SMTP_USER || !environment.SMTP_PASS)
  ) {
    throw new Error("EMAIL_SMTP_CONFIGURATION_INCOMPLETE");
  } else if (
    ["api", "transactional"].includes(environment.EMAIL_PROVIDER ?? "") &&
    (!environment.EMAIL_API_KEY || !environment.EMAIL_API_URL)
  ) {
    throw new Error("EMAIL_API_CONFIGURATION_INCOMPLETE");
  }
  if (
    !ephemeralArtifactStorage &&
    !environment.OBJECT_STORAGE_ENDPOINT?.startsWith("https://")
  )
    throw new Error("OBJECT_STORAGE_ENDPOINT_MUST_USE_HTTPS");
}
