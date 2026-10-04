// End-to-end simulation of a Groundie line. Boots the real Express app on a local port with a real
// SQLite file, then plays Twilio: signed voice and SMS webhooks for every scenario a client's line sees.
//
//   npm run e2e                 live: uses ANTHROPIC_API_KEY, real Claude writes every reply
//   npm run e2e -- --scripted   no key needed: a rule-based stand-in plays the model's part
//
// Everything except the model and the outbound SMS carrier is the production code path: webhook
// signature checks, TwiML, the Brain request builder and parser, the database, owner alerts,
// follow-ups and the leads board. Outbound texts are captured instead of sent.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import twilio from "twilio";
import Anthropic from "@anthropic-ai/sdk";
import { openDb, getLeadByPhone, getTranscript } from "./db.js";
import { createApp } from "./app.js";
import { Brain, LEAD_SCHEMA } from "./brain.js";

const args = process.argv.slice(2);
const LIVE = !!process.env.ANTHROPIC_API_KEY && !args.includes("--scripted");
const reportPath = (() => { const i = args.indexOf("--report"); return i >= 0 ? args[i + 1] : null; })();
const profile = JSON.parse(fs.readFileSync(new URL("../profiles/monkeys-tree-service.json", import.meta.url), "utf8"));

const AUTH = "e2e-auth-token";
const LINE = "+18885550100";
const OWNER = "+15405550199";

// ---------- model layer: live Claude or the scripted stand-in, both behind the real Brain ----------
const modelCalls = [];
function standIn(req) {
  const userText = req.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
  const photos = [...userText.matchAll(/\[customer sent (\d+) photo/g)].reduce((n, m) => n + Number(m[1]), 0);
  const name = (userText.match(/\b(?:I'?m|this is|it's)\s+([A-Z][a-z]+)/) || [])[1] || null;
  const address = (userText.match(/\b\d{1,5}\s+[A-Z][\w ]*?\s(?:St|Rd|Ave|Dr|Ln|Way|Ct|Blvd)\b(?:\s+[NS][EW])?(?:,\s*[A-Z][a-z]+)?/) || [])[0] || null;
  const emergency = /emergenc|on (?:my|the) (?:house|roof|car)|wires? (?:are )?down|power line/i.test(userText);
  const job = emergency || /storm|came down/i.test(userText) ? "storm_emergency"
    : /remov|gone|take (?:it )?down|cut (?:it )?down/i.test(userText) ? "removal"
    : /trim|prune/i.test(userText) ? "trim_prune" : "unknown";
  let reply, ready = false, handoff = false;
  if (emergency) { handoff = true; reply = address ? `Got it. Paging Philip right now about ${address}. Stay clear of the tree. If any lines are down, call 911 and Appalachian Power first.` : "Paging Philip now. What's the address? If any lines are down, call 911 and Appalachian Power first."; }
  else if (!address) reply = `${name ? `Thanks ${name}. ` : ""}What's the address where the tree is?`;
  else if (!photos) reply = "Perfect. Can you text a photo or two of the tree and what's around it? House, lines, fence, and whether a truck can get close.";
  else { ready = true; reply = "That's everything Philip needs. He'll text you a number from the photos within a few hours."; }
  const summary = [job.replace("_", " "), address && `at ${address}`, photos && `${photos} photo(s)`, /garage/i.test(userText) && "leaning toward garage", /driveway|truck can/i.test(userText) && "truck access ok"].filter(Boolean).join(", ");
  return { reply, handoff_now: handoff, lead: { name, address, job_type: job, urgency: emergency ? "emergency" : "this_week", summary, ready_for_quote: ready } };
}
function makeClient() {
  if (LIVE) {
    const real = new Anthropic();
    return { beta: { messages: { create: async (req) => {
      const t = Date.now();
      const res = await real.beta.messages.create(req);
      modelCalls.push({ req, ms: Date.now() - t, model: res.model, stop: res.stop_reason, usage: res.usage });
      return res;
    } } } };
  }
  return { beta: { messages: { create: async (req) => {
    modelCalls.push({ req, ms: 0, model: "scripted stand-in", stop: "end_turn", usage: null });
    return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(standIn(req)) }] };
  } } } };
}

// Validate every model output against the same JSON schema the API enforces.
function schemaErrors(value, schema, at = "$") {
  const errs = [];
  const types = [].concat(schema.type);
  const actual = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  if (!types.includes(actual)) return [`${at}: expected ${types.join("|")}, got ${actual}`];
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${at}: ${JSON.stringify(value)} not in enum`);
  if (actual === "object") {
    for (const k of schema.required || []) if (!(k in value)) errs.push(`${at}.${k}: missing`);
    if (schema.additionalProperties === false) for (const k of Object.keys(value)) if (!schema.properties[k]) errs.push(`${at}.${k}: not allowed`);
    for (const [k, sub] of Object.entries(schema.properties || {})) if (k in value) errs.push(...schemaErrors(value[k], sub, `${at}.${k}`));
  }
  return errs;
}

const realBrain = new Brain({ profile, model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5", effort: process.env.ANTHROPIC_EFFORT || "low", client: makeClient() });
const outputs = [];
let failNext = false;
const brain = { next: async (t) => {
  if (failNext) { failNext = false; throw new Error("simulated Anthropic outage (529 overloaded)"); }
  const out = await realBrain.next(t);
  outputs.push(out);
  return out;
} };

// ---------- the line: real app, temp database, captured outbound texts ----------
const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "groundie-e2e-")), "groundie.db");
const db = openDb(dbFile);
const sent = [];
const send = async (to, body) => { sent.push({ to, body, at: Date.now() }); return { sid: `SM${sent.length}` }; };
const config = {
  publicUrl: "", profile,
  twilio: { accountSid: "ACe2e", authToken: AUTH, number: LINE, validateSignatures: true },
  owner: { cell: OWNER, ringSeconds: 20, dailySummaryHour: 19 },
  followUp: { firstNudgeMinutes: 120, secondNudgeMinutes: 1200, quietStartHour: 20, quietEndHour: 8, timeZone: "America/New_York" },
};
const quiet = { warn() {}, error() {}, log() {} };
const app = createApp({ config, db, brain, send, log: quiet });
const server = app.listen(0);
await new Promise((r) => server.once("listening", r));
config.publicUrl = `http://127.0.0.1:${server.address().port}`;

let callSeq = 0;
async function twilioPost(route, params, { badSignature = false } = {}) {
  const url = config.publicUrl + route;
  const full = { AccountSid: "ACe2e", To: LINE, ...params };
  const sig = badSignature ? "not-a-real-signature" : twilio.getExpectedTwilioSignature(AUTH, url, full);
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": sig }, body: new URLSearchParams(full) });
  return { status: res.status, body: await res.text() };
}
async function waitFor(pred, ms = LIVE ? 60000 : 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (pred()) return true; await new Promise((r) => setTimeout(r, 25)); }
  return false;
}
const toPhone = (p) => sent.filter((s) => s.to === p);
const ownerAlerts = () => sent.filter((s) => s.to === OWNER);

async function missedCall(from, status = "no-answer") {
  const sid = `CA${++callSeq}`;
  const ring = await twilioPost("/voice", { From: from, CallSid: sid, CallStatus: "ringing" });
  const before = toPhone(from).length;
  const done = await twilioPost("/voice/status", { From: from, CallSid: sid, DialCallStatus: status });
  if (status !== "completed") await waitFor(() => toPhone(from).length > before, 3000);
  return { ring, done };
}
async function text(from, body, media = []) {
  const before = toPhone(from).length;
  const params = { From: from, Body: body, MessageSid: `SM-in-${Math.random().toString(36).slice(2, 8)}`, NumMedia: String(media.length) };
  media.forEach((u, i) => { params[`MediaUrl${i}`] = u; params[`MediaContentType${i}`] = "image/jpeg"; });
  const res = await twilioPost("/sms", params);
  await waitFor(() => toPhone(from).length > before);
  return res;
}

// ---------- scenarios ----------
const results = [];
const check = (scenario, name, ok, detail = "") => results.push({ scenario, name, ok: !!ok, detail });
const transcripts = [];
function keepTranscript(title, phone) {
  const lead = getLeadByPhone(db, phone);
  transcripts.push({ title, phone, lead, msgs: lead ? getTranscript(db, lead.id) : [], alerts: ownerAlerts().filter((a) => a.body.includes(phone)) });
}

// A. A missed call becomes a quote-ready lead
{
  const S = "A. Missed call to quote-ready lead", c = "+15405550101";
  const { ring, done } = await missedCall(c);
  check(S, "Call rings the owner's cell for 20 seconds", /<Dial[^>]*timeout="20"/.test(ring.body) && ring.body.includes(OWNER), ring.body.slice(0, 160));
  check(S, "Unanswered call plays the crew-is-on-a-job message", /texting you right now/.test(done.body));
  check(S, "Caller gets a text-back", toPhone(c).length === 1, toPhone(c)[0]?.body);
  await text(c, "Hey it's Dana. Got a big oak leaning toward the garage, want it gone before winter");
  await text(c, "2207 Grandin Rd SW, Roanoke");
  await text(c, "here's a couple pics, truck can get in the driveway", ["https://api.twilio.com/2010-04-01/Accounts/ACe2e/Messages/MM1/Media/ME1", "https://api.twilio.com/2010-04-01/Accounts/ACe2e/Messages/MM1/Media/ME2"]);
  await waitFor(() => ownerAlerts().some((a) => a.body.includes(c)), LIVE ? 60000 : 2000);
  const lead = getLeadByPhone(db, c);
  check(S, "Every customer text got exactly one reply", toPhone(c).length === 4, `${toPhone(c).length} texts to customer`);
  check(S, "Both photos stored on the lead", lead.photos.length === 2);
  check(S, "Address captured", /grandin/i.test(lead.address || ""), lead.address);
  check(S, "Lead is marked quote-ready", lead.status === "quote_ready", lead.status);
  check(S, "Owner alerted exactly once with the crew note", ownerAlerts().filter((a) => a.body.includes(c)).length === 1, ownerAlerts().find((a) => a.body.includes(c))?.body.split("\n")[0]);
  keepTranscript(S, c);
}
// B. Emergency by text
{
  const S = "B. Emergency text pages the owner", c = "+15405550102";
  await text(c, "EMERGENCY tree came down on my roof at 14 Peters Creek Rd NW, wires are down in the yard");
  await waitFor(() => ownerAlerts().some((a) => a.body.includes(c)));
  const lead = getLeadByPhone(db, c);
  check(S, "Lead flagged for handoff", lead.status === "handoff", lead.status);
  const alert = ownerAlerts().find((a) => a.body.includes(c));
  check(S, "Owner alert says EMERGENCY - call now", alert && alert.body.startsWith("EMERGENCY - call now"), alert?.body.split("\n")[0]);
  check(S, "Reply mentions 911 or the power company", /911|power/i.test(toPhone(c).at(-1)?.body || ""), toPhone(c).at(-1)?.body);
  keepTranscript(S, c);
}
// C. Same person calls twice in a row
{
  const S = "C. Double call is texted once", c = "+15405550103";
  await missedCall(c); await missedCall(c, "busy");
  check(S, "Two missed calls, one text-back", toPhone(c).length === 1, `${toPhone(c).length} texts`);
}
// D. Owner picks up
{
  const S = "D. Answered call stays quiet", c = "+15405550104";
  const { done } = await missedCall(c, "completed");
  await new Promise((r) => setTimeout(r, 200));
  check(S, "No text when the owner answered", toPhone(c).length === 0 && done.body.includes("<Response"));
}
// E. STOP / HELP / START
{
  const S = "E. Opt-out compliance", c = "+15405550105";
  await missedCall(c);
  const callsBefore = modelCalls.length;
  await text(c, "HELP");
  check(S, "HELP returns the info message", /Reply STOP to opt out/.test(toPhone(c).at(-1)?.body || ""));
  await text(c, "STOP");
  check(S, "STOP confirms the opt-out", /unsubscribed/.test(toPhone(c).at(-1)?.body || ""));
  const n = toPhone(c).length;
  await missedCall(c);
  await new Promise((r) => setTimeout(r, 200));
  check(S, "Opted-out caller is not texted again", toPhone(c).length === n);
  await text(c, "START");
  check(S, "START re-subscribes", getLeadByPhone(db, c).status === "texting");
  check(S, "Keywords never reach the model", modelCalls.length === callsBefore);
}
// F. Forged webhook
{
  const S = "F. Forged webhook is rejected", c = "+15405550106";
  const r = await twilioPost("/sms", { From: c, Body: "free money click here", NumMedia: "0" }, { badSignature: true });
  check(S, "Bad Twilio signature returns 403", r.status === 403, `HTTP ${r.status}`);
  check(S, "Nothing stored or sent", !getLeadByPhone(db, c) && toPhone(c).length === 0);
}
// G. Model outage
{
  const S = "G. Model outage fallback", c = "+15405550107";
  await missedCall(c);
  failNext = true;
  await text(c, "need a quote on two pines");
  check(S, "Customer still gets a reply", /will text you back shortly/.test(toPhone(c).at(-1)?.body || ""), toPhone(c).at(-1)?.body);
}
// H. Follow-up nudge for a caller who never replied
{
  const S = "H. Follow-up nudge", c = "+15405550103";
  db.prepare("UPDATE leads SET last_outbound_at = datetime('now', '-3 hours') WHERE phone = ?").run(c);
  const quietRun = await app.runFollowUps(new Date("2026-10-05T02:30:00Z")); // 10:30pm Eastern
  check(S, "No nudges during quiet hours", quietRun === 0);
  const before = toPhone(c).length;
  await app.runFollowUps(new Date("2026-10-05T15:00:00Z")); // 11am Eastern
  check(S, "Silent caller gets one nudge at 11am", toPhone(c).length === before + 1, toPhone(c).at(-1)?.body);
}
// I. Owner's leads board
{
  const S = "I. Leads board";
  const html = await (await fetch(config.publicUrl + "/leads", { headers: { accept: "text/html" } })).text();
  check(S, "Board lists the quote-ready lead", html.includes("+15405550101") && html.includes("quote_ready"));
  const id = getLeadByPhone(db, "+15405550101").id;
  const j = await (await fetch(`${config.publicUrl}/leads/${id}`)).json();
  check(S, "Lead detail returns the full transcript", j.transcript?.length >= 7, `${j.transcript?.length} messages`);
}
// Model output contract, across every reply the model wrote
{
  const S = "J. Model output contract";
  const bad = outputs.flatMap((o) => schemaErrors(o, LEAD_SCHEMA));
  check(S, "Every model output matches the lead schema", bad.length === 0, bad.slice(0, 3).join("; "));
  check(S, "Every reply fits in two SMS segments", outputs.every((o) => o.reply.length > 0 && o.reply.length <= 320), `${outputs.length} replies`);
  const r = modelCalls[0]?.req;
  check(S, "Request uses structured outputs, low effort, cached system prompt", r && r.output_config?.format?.type === "json_schema" && r.system?.[0]?.cache_control?.type === "ephemeral", r && `${r.model}, effort ${r.output_config.effort}`);
  check(S, "Refusal fallbacks enabled", r && r.fallbacks === "default" && r.betas?.includes("server-side-fallback-2026-07-01"));
}
server.close();

// ---------- report ----------
const pass = results.filter((r) => r.ok).length;
const lines = [];
lines.push(`# Groundie end-to-end simulation`, ``, `Run: ${new Date().toISOString()}`, `Model: ${LIVE ? `live Claude (${realBrain.model}, effort ${realBrain.effort})` : "scripted stand-in (no ANTHROPIC_API_KEY). Every other layer is production code."}`, `Result: **${pass} of ${results.length} checks passed**`, ``);
lines.push(`| Scenario | Check | Result | Detail |`, `|---|---|---|---|`);
for (const r of results) lines.push(`| ${r.scenario} | ${r.name} | ${r.ok ? "PASS" : "FAIL"} | ${String(r.detail || "").replace(/\|/g, "/").replace(/\n/g, " ").slice(0, 140)} |`);
lines.push(``);
for (const t of transcripts) {
  lines.push(`## ${t.title}`, ``, "```");
  for (const m of t.msgs) lines.push(`${m.direction === "in" ? "CUSTOMER" : "GROUNDIE"}: ${m.body}${m.media?.length ? `  [${m.media.length} photo${m.media.length > 1 ? "s" : ""}]` : ""}`);
  for (const a of t.alerts) lines.push(``, `TO PHILIP'S PHONE:`, ...a.body.split("\n").map((l) => `  ${l}`));
  lines.push("```", ``, `Lead card: status ${t.lead.status}, ${t.lead.job_type}/${t.lead.urgency}, ${t.lead.address || "no address"}, ${t.lead.photos.length} photos. Crew note: ${t.lead.summary}`, ``);
}
if (LIVE) {
  const u = modelCalls.filter((c) => c.usage);
  const sum = (k) => u.reduce((n, c) => n + (c.usage[k] || 0), 0);
  lines.push(`## Model cost profile`, ``, `| Calls | Avg latency | Input tokens | Cache reads | Output tokens |`, `|---|---|---|---|---|`,
    `| ${u.length} | ${Math.round(u.reduce((n, c) => n + c.ms, 0) / Math.max(1, u.length))} ms | ${sum("input_tokens")} | ${sum("cache_read_input_tokens")} | ${sum("output_tokens")} |`, ``);
}
const report = lines.join("\n");
console.log(report);
if (reportPath) fs.writeFileSync(reportPath, report);
fs.rmSync(path.dirname(dbFile), { recursive: true, force: true });
process.exit(pass === results.length ? 0 : 1);
