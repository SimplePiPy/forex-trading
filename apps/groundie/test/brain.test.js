import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt, transcriptToMessages, parseModelOutput, LEAD_SCHEMA, textBackOpener, Brain } from "../src/brain.js";
import profile from "../profiles/monkeys-tree-service.json" with { type: "json" };

test("system prompt carries the business facts and never-quote rule", () => {
  const p = buildSystemPrompt(profile);
  assert.match(p, /Monkey's Tree Service/);
  assert.match(p, /never quote a price/i);
  assert.match(p, /storm damage/);
});

test("transcript collapses into alternating turns starting with user", () => {
  const msgs = transcriptToMessages([
    { direction: "out", body: "Hey it's Monkey's" },
    { direction: "in", body: "tree down", media: ["u1", "u2"] },
    { direction: "in", body: "on the fence", media: [] },
  ]);
  assert.equal(msgs[0].role, "user");
  assert.equal(msgs[1].role, "assistant");
  assert.equal(msgs[2].role, "user");
  assert.match(msgs[2].content, /sent 2 photos/);
  assert.match(msgs[2].content, /on the fence/);
});

test("parseModelOutput validates and trims", () => {
  const out = parseModelOutput({ content: [{ type: "text", text: JSON.stringify({ reply: "  ok ", handoff_now: false, lead: { name: null, address: null, job_type: "unknown", urgency: "unknown", summary: "", ready_for_quote: false } }) }] });
  assert.equal(out.reply, "ok");
  assert.throws(() => parseModelOutput({ content: [{ type: "text", text: "{}" }] }));
});

test("schema is strict-compatible", () => {
  assert.equal(LEAD_SCHEMA.additionalProperties, false);
  assert.deepEqual(LEAD_SCHEMA.required.sort(), ["handoff_now", "lead", "reply"]);
});

test("opener is under one SMS segment pair and names the business", () => {
  const o = textBackOpener(profile);
  assert.ok(o.length < 320, o.length);
  assert.match(o, /Monkey's Tree Service/);
});

test("Brain sends structured output request and handles refusal", async () => {
  let captured;
  const fake = { beta: { messages: { create: async (req) => { captured = req; return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ reply: "What's the address?", handoff_now: false, lead: { name: "Dan", address: null, job_type: "removal", urgency: "this_week", summary: "Big oak removal", ready_for_quote: false } }) }] }; } } } };
  const brain = new Brain({ profile, client: fake, effort: "low" });
  const out = await brain.next([{ direction: "in", body: "I'm Dan, need a big oak removed this week" }]);
  assert.equal(captured.model, "claude-opus-5-5");
  assert.equal(captured.output_config.format.type, "json_schema");
  assert.equal(captured.output_config.effort, "low");
  assert.equal(captured.fallbacks, "default");
  assert.deepEqual(captured.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(out.lead.name, "Dan");

  const refusing = { beta: { messages: { create: async () => ({ stop_reason: "refusal", content: [] }) } } };
  const b2 = new Brain({ profile, client: refusing });
  const r = await b2.next([{ direction: "in", body: "x" }]);
  assert.equal(r.handoff_now, true);
});
