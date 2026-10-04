// Central config. Everything comes from env so one deploy serves one business.
// Multi-tenant later: move this into the `businesses` table keyed by Twilio number.
import fs from "node:fs";

function readProfile(path) {
  if (!path) return null;
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

export function loadConfig(env = process.env) {
  const profile = readProfile(env.BUSINESS_PROFILE || "./profiles/monkeys-tree-service.json");
  return {
    port: Number(env.PORT || 3000),
    publicUrl: env.PUBLIC_URL || "",            // https://groundie.example.com (for Twilio signature checks)
    dbPath: env.DB_PATH || "./data/groundie.db",
    twilio: {
      accountSid: env.TWILIO_ACCOUNT_SID || "",
      authToken: env.TWILIO_AUTH_TOKEN || "",
      number: env.TWILIO_NUMBER || "",          // the business line customers call (toll-free recommended, see README)
      validateSignatures: env.TWILIO_VALIDATE !== "false",
    },
    anthropic: {
      model: env.ANTHROPIC_MODEL || "claude-opus-5-5",
      effort: env.ANTHROPIC_EFFORT || "low",   // SMS replies should be fast; raise for complex trades
    },
    owner: {
      cell: env.OWNER_CELL || profile?.owner_cell || "",
      ringSeconds: Number(env.RING_SECONDS || 20),
      dailySummaryHour: Number(env.SUMMARY_HOUR || 19),
    },
    followUp: {
      firstNudgeMinutes: Number(env.NUDGE_1_MIN || 120),
      secondNudgeMinutes: Number(env.NUDGE_2_MIN || 60 * 20),
      quietStartHour: Number(env.QUIET_START || 20),
      quietEndHour: Number(env.QUIET_END || 8),
      timeZone: env.TZ_NAME || profile?.time_zone || "America/New_York",
    },
    profile,
  };
}
