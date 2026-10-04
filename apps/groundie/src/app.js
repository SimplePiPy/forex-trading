// Express app factory. Dependencies are injected so tests run without Twilio or Claude.
import express from "express";
import {
  upsertLead, getLeadByPhone, getLead, updateLead, addMessage, getTranscript,
  recordCall, listLeads, staleLeads, todayStats,
} from "./db.js";
import {
  classifyInbound, isMissedOutcome, inQuietHours, voiceTwiml, missedTwiml,
  emptyMessagingTwiml, validateTwilioSignature,
} from "./sms.js";
import { textBackOpener } from "./brain.js";

export function createApp({ config, db, brain, send, log = console }) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  const profile = config.profile;

  function guard(req, res, next) {
    if (!validateTwilioSignature({ ...config.twilio, publicUrl: config.publicUrl }, req)) {
      return res.status(403).send("bad signature");
    }
    next();
  }

  async function notifyOwner(text) {
    if (!config.owner.cell) return log.warn("OWNER_CELL not set; owner alert not sent:", text);
    await send(config.owner.cell, text);
  }

  // Step 1: the business line rings the owner's cell. If nobody picks up, Twilio hits /voice/status.
  app.post("/voice", guard, (req, res) => {
    const statusUrl = `${config.publicUrl || ""}/voice/status`;
    res.type("text/xml").send(voiceTwiml({ ownerCell: config.owner.cell, ringSeconds: config.owner.ringSeconds, statusUrl, businessName: profile.name }));
  });

  // Step 2: missed call -> play a short message, then text back within seconds.
  app.post("/voice/status", guard, async (req, res) => {
    const from = req.body.From;
    const outcome = req.body.DialCallStatus || "no-owner";
    recordCall(db, req.body.CallSid || `local-${Date.now()}`, from, outcome);
    if (isMissedOutcome(outcome) || outcome === "no-owner") {
      res.type("text/xml").send(missedTwiml({ businessName: profile.name }));
      try { await textBack(from); } catch (e) { log.error("text-back failed", e); }
    } else {
      res.type("text/xml").send("<Response/>");
    }
  });

  async function textBack(phone) {
    if (!phone || phone === config.owner.cell) return;
    let lead = getLeadByPhone(db, phone) || upsertLead(db, phone);
    if (lead.status === "opted_out") return;
    const recentlyTexted = lead.last_outbound_at && (Date.now() - Date.parse(lead.last_outbound_at + "Z")) < 10 * 60 * 1000;
    if (recentlyTexted) return; // they called twice in 10 minutes; don't double text
    const body = textBackOpener(profile);
    await send(phone, body);
    addMessage(db, lead.id, "out", body);
    updateLead(db, lead.id, { status: "texting" });
  }

  // Step 3: every customer reply goes through Claude, which answers and updates the lead card.
  app.post("/sms", guard, async (req, res) => {
    res.type("text/xml").send(emptyMessagingTwiml()); // reply async via REST so Claude latency never times out Twilio
    const from = req.body.From;
    const body = req.body.Body || "";
    const media = [];
    for (let i = 0; i < Number(req.body.NumMedia || 0); i++) media.push(req.body[`MediaUrl${i}`]);
    try {
      await handleInbound(from, body, media);
    } catch (e) {
      log.error("inbound handling failed", e);
      await send(from, `Got it. ${profile.owner_first_name || "The owner"} will text you back shortly.`);
    }
  });

  async function handleInbound(from, body, media) {
    let lead = getLeadByPhone(db, from) || upsertLead(db, from, { source: "inbound_text" });
    const kind = classifyInbound(body);
    addMessage(db, lead.id, "in", body, media);
    if (media.length) lead = updateLead(db, lead.id, { photos: [...lead.photos, ...media] });

    if (kind === "stop") {
      updateLead(db, lead.id, { status: "opted_out" });
      return send(from, `You're unsubscribed from ${profile.name} texts. Reply START to opt back in.`);
    }
    if (kind === "help") {
      return send(from, `${profile.name}. This line texts you back when we miss your call. Reply STOP to opt out.`);
    }
    if (lead.status === "opted_out") {
      if (/^start$/i.test(body.trim())) { updateLead(db, lead.id, { status: "texting" }); return send(from, `You're back on. What can we help with?`); }
      return;
    }

    const out = await brain.next(getTranscript(db, lead.id));
    await send(from, out.reply);
    addMessage(db, lead.id, "out", out.reply);

    const patch = {
      name: out.lead.name || undefined,
      address: out.lead.address || undefined,
      job_type: out.lead.job_type,
      urgency: out.lead.urgency,
      summary: out.lead.summary,
    };
    const emergency = kind === "emergency" || out.lead.urgency === "emergency";
    if (out.handoff_now || emergency) patch.status = "handoff";
    else if (out.lead.ready_for_quote) patch.status = "quote_ready";
    else patch.status = "texting";
    lead = updateLead(db, lead.id, patch);

    if ((lead.status === "handoff" || lead.status === "quote_ready") && !lead.owner_notified) {
      const label = lead.status === "handoff" ? (emergency ? "EMERGENCY - call now" : "Wants a call") : "Quote-ready lead";
      await notifyOwner(`${label}: ${lead.name || "Unknown"} ${lead.phone}\n${lead.address || "no address yet"}\n${lead.summary}\nPhotos: ${lead.photos.length}${config.publicUrl ? `\n${config.publicUrl}/leads/${lead.id}` : ""}`);
      updateLead(db, lead.id, { owner_notified: 1 });
    }
  }

  // Follow-ups: a lead that went quiet gets one nudge after 2h and one the next day, never in quiet hours.
  async function runFollowUps(now = new Date()) {
    if (inQuietHours(config.followUp, now)) return 0;
    let sent = 0;
    const first = staleLeads(db, config.followUp.firstNudgeMinutes, 1);
    const second = staleLeads(db, config.followUp.secondNudgeMinutes, 2).filter((l) => l.nudges_sent === 1);
    for (const lead of [...first, ...second]) {
      const body = lead.nudges_sent === 0
        ? `Still here if you need us. A photo of the tree and the address is all ${profile.owner_first_name || "we"} needs to get you a number.`
        : `Last check from ${profile.name}. If you've already got it handled, no worries at all. If not, we'd love to help.`;
      await send(lead.phone, body);
      addMessage(db, lead.id, "out", body);
      updateLead(db, lead.id, { nudges_sent: lead.nudges_sent + 1 });
      sent++;
    }
    return sent;
  }

  async function sendDailySummary() {
    const s = todayStats(db);
    await notifyOwner(`${profile.name} today: ${s.calls} calls hit the line, ${s.textedBack} texted back, ${s.replied} replied, ${s.quoteReady} ready to quote.${config.publicUrl ? ` ${config.publicUrl}/leads` : ""}`);
  }

  // Owner views. Plain JSON plus a bare-bones HTML board.
  app.get("/leads", (req, res) => {
    const leads = listLeads(db, { status: req.query.status });
    if (req.accepts("html") && !req.query.json) {
      const rows = leads.map((l) => `<tr><td>${l.status}</td><td><a href="/leads/${l.id}">${l.name || "?"}</a></td><td>${l.phone}</td><td>${l.job_type}/${l.urgency}</td><td>${l.address || ""}</td><td>${l.photos.length}</td><td>${(l.summary || "").replace(/</g, "&lt;")}</td></tr>`).join("");
      return res.send(`<!doctype html><meta name=viewport content="width=device-width"><title>${profile.name} leads</title><style>body{font:15px system-ui;margin:16px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left;vertical-align:top}</style><h2>${profile.name} - leads</h2><table><tr><th>Status</th><th>Name</th><th>Phone</th><th>Job</th><th>Address</th><th>Photos</th><th>Crew note</th></tr>${rows}</table>`);
    }
    res.json(leads);
  });
  app.get("/leads/:id", (req, res) => {
    const lead = getLead(db, Number(req.params.id));
    if (!lead) return res.status(404).json({ error: "not found" });
    res.json({ ...lead, transcript: getTranscript(db, lead.id) });
  });
  app.get("/health", (req, res) => res.json({ ok: true, business: profile.name }));

  return Object.assign(app, { textBack, handleInbound, runFollowUps, sendDailySummary });
}
