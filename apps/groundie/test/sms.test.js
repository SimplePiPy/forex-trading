import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyInbound, isMissedOutcome, inQuietHours, voiceTwiml, missedTwiml } from "../src/sms.js";

test("STOP/HELP/EMERGENCY classification", () => {
  assert.equal(classifyInbound("STOP"), "stop");
  assert.equal(classifyInbound(" unsubscribe "), "stop");
  assert.equal(classifyInbound("Help"), "help");
  assert.equal(classifyInbound("EMERGENCY tree on my house 123 Oak St"), "emergency");
  assert.equal(classifyInbound("can you trim my oak"), "message");
});

test("missed call outcomes", () => {
  for (const s of ["no-answer", "busy", "failed", "canceled"]) assert.ok(isMissedOutcome(s));
  assert.equal(isMissedOutcome("completed"), false);
});

test("quiet hours wrap midnight", () => {
  const cfg = { quietStartHour: 20, quietEndHour: 8, timeZone: "UTC" };
  assert.equal(inQuietHours(cfg, new Date("2026-10-02T23:00:00Z")), true);
  assert.equal(inQuietHours(cfg, new Date("2026-10-02T03:00:00Z")), true);
  assert.equal(inQuietHours(cfg, new Date("2026-10-02T12:00:00Z")), false);
});

test("voice TwiML dials owner then falls to status", () => {
  const xml = voiceTwiml({ ownerCell: "+17045550000", ringSeconds: 20, statusUrl: "https://x.test/voice/status", businessName: "Monkey's" });
  assert.match(xml, /<Dial[^>]*timeout="20"[^>]*action="https:\/\/x.test\/voice\/status"/);
  assert.match(xml, /\+17045550000/);
  const noOwner = voiceTwiml({ ownerCell: "", ringSeconds: 20, statusUrl: "https://x.test/voice/status" });
  assert.match(noOwner, /<Redirect/);
  assert.match(missedTwiml({ businessName: "Monkey's Tree Service" }), /texting you right now/);
});
