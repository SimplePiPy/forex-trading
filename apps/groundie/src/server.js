import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { Brain } from "./brain.js";
import { makeSender, hourIn } from "./sms.js";
import { createApp } from "./app.js";

const config = loadConfig();
if (!config.profile) throw new Error("BUSINESS_PROFILE json not found");
const db = openDb(config.dbPath);
const brain = new Brain({ profile: config.profile, model: config.anthropic.model, effort: config.anthropic.effort });
const send = makeSender(config.twilio);
const app = createApp({ config, db, brain, send });

setInterval(() => app.runFollowUps().catch((e) => console.error(e)), 10 * 60 * 1000);
let lastSummaryDay = "";
setInterval(() => {
  const now = new Date();
  const day = now.toDateString();
  if (hourIn(config.followUp.timeZone, now) === config.owner.dailySummaryHour && lastSummaryDay !== day) {
    lastSummaryDay = day;
    app.sendDailySummary().catch((e) => console.error(e));
  }
}, 60 * 1000);

app.listen(config.port, () => console.log(`groundie for ${config.profile.name} on :${config.port} (model ${config.anthropic.model})`));
