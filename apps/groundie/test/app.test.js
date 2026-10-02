import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb, getLeadByPhone, listLeads } from "../src/db.js";
import { createApp } from "../src/app.js";
import profile from "../profiles/monkeys-tree-service.json" with { type: "json" };

function harness(brainScript) {
  const sent = [];
  const send = async (to, body) => { sent.push({ to, body }); return { sid: "x" }; };
  let i = 0;
  const brain = { calls: 0, next: async () => { brain.calls++; return brainScript[Math.min(i++, brainScript.length - 1)]; } };
  const config = {
    publicUrl: "https://g.test", profile,
    twilio: { validateSignatures: false, accountSid: "", authToken: "", number: "+18885550000" },
    owner: { cell: "+17045550001", ringSeconds: 20, dailySummaryHour: 19 },
    followUp: { firstNudgeMinutes: 120, secondNudgeMinutes: 1200, quietStartHour: 20, quietEndHour: 8, timeZone: "UTC" },
  };
  const db = openDb(":memory:");
  const app = createApp({ config, db, brain, send, log: { warn() {}, error() {} } });
  return { app, db, sent, brain };
}

const lead = (over = {}) => ({ name: null, address: null, job_type: "unknown", urgency: "unknown", summary: "", ready_for_quote: false, ...over });

test("missed call creates lead and texts back once", async () => {
  const { app, db, sent } = harness([]);
  await app.textBack("+19195550123");
  await app.textBack("+19195550123"); // second call within 10 minutes: no double text
  assert.equal(sent.length, 1);
  assert.match(sent[0].body, /Sorry we missed your call/);
  assert.equal(getLeadByPhone(db, "+19195550123").status, "texting");
});

test("conversation reaches quote_ready and pages the owner once", async () => {
  const { app, db, sent } = harness([
    { reply: "What's the address?", handoff_now: false, lead: lead({ job_type: "removal", summary: "Oak removal" }) },
    { reply: "Got it, Philip will text a quote.", handoff_now: false, lead: lead({ name: "Dan", address: "12 Oak St", job_type: "removal", urgency: "this_week", summary: "Large oak over garage, truck access ok", ready_for_quote: true }) },
    { reply: "Thanks!", handoff_now: false, lead: lead({ name: "Dan", address: "12 Oak St", job_type: "removal", ready_for_quote: true }) },
  ]);
  await app.textBack("+19195550124");
  await app.handleInbound("+19195550124", "big oak over my garage", []);
  await app.handleInbound("+19195550124", "12 Oak St, here's a pic", ["https://api.twilio.com/m/1.jpg"]);
  await app.handleInbound("+19195550124", "thanks", []);
  const l = getLeadByPhone(db, "+19195550124");
  assert.equal(l.status, "quote_ready");
  assert.equal(l.photos.length, 1);
  const ownerAlerts = sent.filter((s) => s.to === "+17045550001");
  assert.equal(ownerAlerts.length, 1);
  assert.match(ownerAlerts[0].body, /Quote-ready lead: Dan/);
  assert.match(ownerAlerts[0].body, /https:\/\/g.test\/leads\/1/);
});

test("EMERGENCY keyword forces handoff and owner page", async () => {
  const { app, db, sent } = harness([{ reply: "Paging Philip now.", handoff_now: true, lead: lead({ urgency: "emergency", address: "5 Pine Rd", summary: "Tree on house" }) }]);
  await app.handleInbound("+19195550125", "EMERGENCY tree on my house 5 Pine Rd", []);
  assert.equal(getLeadByPhone(db, "+19195550125").status, "handoff");
  assert.match(sent.find((s) => s.to === "+17045550001").body, /EMERGENCY - call now/);
});

test("STOP opts out, START opts back in, and brain is never called for STOP", async () => {
  const { app, db, sent, brain } = harness([]);
  await app.textBack("+19195550126");
  await app.handleInbound("+19195550126", "STOP", []);
  assert.equal(getLeadByPhone(db, "+19195550126").status, "opted_out");
  assert.match(sent.at(-1).body, /unsubscribed/);
  await app.textBack("+19195550126");
  assert.equal(sent.filter((s) => s.to === "+19195550126").length, 2); // opener + unsubscribe confirmation only
  await app.handleInbound("+19195550126", "START", []);
  assert.equal(getLeadByPhone(db, "+19195550126").status, "texting");
  assert.equal(brain.calls, 0);
});

test("follow-ups nudge stale leads outside quiet hours only", async () => {
  const { app, db, sent } = harness([]);
  await app.textBack("+19195550127");
  db.prepare("UPDATE leads SET last_outbound_at = datetime('now', '-3 hours')").run();
  assert.equal(await app.runFollowUps(new Date("2026-10-02T23:30:00Z")), 0); // quiet
  assert.equal(await app.runFollowUps(new Date("2026-10-02T15:00:00Z")), 1);
  assert.equal(getLeadByPhone(db, "+19195550127").nudges_sent, 1);
  assert.equal(await app.runFollowUps(new Date("2026-10-02T15:10:00Z")), 0); // not stale again yet
});

test("leads board renders html and json", async () => {
  const { app } = harness([]);
  await app.textBack("+19195550128");
  const server = app.listen(0);
  const port = server.address().port;
  const html = await (await fetch(`http://127.0.0.1:${port}/leads`, { headers: { accept: "text/html" } })).text();
  assert.match(html, /\+19195550128/);
  const json = await (await fetch(`http://127.0.0.1:${port}/leads?json=1`, { headers: { accept: "application/json" } })).json();
  assert.equal(json.length, 1);
  server.close();
});
