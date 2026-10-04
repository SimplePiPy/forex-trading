#!/usr/bin/env node
// Turn an Outscraper Google Maps export into a ranked call sheet for the Groundie offer.
// Usage: node tools/leads/rank-outscraper.mjs input.csv [output.csv] [--state NC] [--min-reviews 5] [--max-reviews 300]
// Scores businesses most likely to be losing jobs to missed calls: real phone, active reviews but small,
// no booking link, and (bonus) no website. Those are owner-operators who are on the job, not at a desk.
import fs from "node:fs";

function parseCsv(text) {
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

export function scoreBusiness(b) {
  const reviews = Number(b.reviews || 0), rating = Number(b.rating || 0);
  const reasons = [];
  let score = 0;
  if (!b.phone) return { score: -1, reasons: ["no phone"] };
  if (b.business_status && b.business_status !== "OPERATIONAL") return { score: -1, reasons: ["closed"] };
  if (reviews >= 5 && reviews <= 300) { score += 3; reasons.push("active but small"); }
  if (rating >= 4.3) { score += 2; reasons.push("good reputation to protect"); }
  if (!b.booking_appointment_link) { score += 2; reasons.push("no online booking"); }
  if (!b.site) { score += 2; reasons.push("no website, phone is everything"); }
  if (/tree|arbor|stump|land clearing/i.test(`${b.type} ${b.subtypes} ${b.category} ${b.name}`)) { score += 2; reasons.push("tree trade"); }
  if (/roof|concrete|weld|hvac|plumb|electric|excavat|fenc|landscap|paint|pressure wash|gutter/i.test(`${b.type} ${b.subtypes}`)) { score += 1; reasons.push("trade"); }
  if (b.phone && /mobile|wireless/i.test(b["phone.phones_enricher.carrier_type"] || "")) { score += 2; reasons.push("business line is a cell phone"); }
  return { score, reasons };
}

export function rank(rows, { state, minReviews = 0, maxReviews = Infinity } = {}) {
  return rows
    .filter((b) => !state || (b.us_state || b.state || "").toUpperCase().includes(state.toUpperCase()))
    .filter((b) => Number(b.reviews || 0) >= minReviews && Number(b.reviews || 0) <= maxReviews)
    .map((b) => ({ ...b, ...scoreBusiness(b) }))
    .filter((b) => b.score >= 0)
    .sort((a, b) => b.score - a.score || Number(b.reviews) - Number(a.reviews));
}

export function estimateLeak({ reviews = 0, avgTicket = 1200, closeRate = 0.3 }) {
  // Rough: review count tracks call volume. 1 review ~ 8 to 12 inbound calls/yr in home services.
  const callsPerMonth = Math.max(10, Math.round((Number(reviews) * 10) / 12));
  const missed = Math.round(callsPerMonth * 0.62);
  const lostForever = Math.round(missed * 0.85);
  const lostRevenue = Math.round(lostForever * closeRate * avgTicket);
  return { callsPerMonth, missed, lostForever, lostRevenue };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const input = args.find((a) => !a.startsWith("--") && a.endsWith(".csv"));
  if (!input) { console.error("usage: rank-outscraper.mjs input.csv [output.csv] [--state NC] [--min-reviews 5] [--max-reviews 300]"); process.exit(1); }
  const output = args.filter((a) => !a.startsWith("--") && a.endsWith(".csv"))[1] || input.replace(/\.csv$/, ".callsheet.csv");
  const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
  const rows = parseCsv(fs.readFileSync(input, "utf8"));
  const ranked = rank(rows, { state: opt("state"), minReviews: Number(opt("min-reviews", 0)), maxReviews: Number(opt("max-reviews", Infinity)) });
  const cols = ["score", "name", "phone", "city", "us_state", "rating", "reviews", "site", "est_missed_calls_mo", "est_lost_revenue_mo", "reasons", "location_link"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [cols.join(",")];
  for (const b of ranked) {
    const leak = estimateLeak({ reviews: b.reviews });
    lines.push(cols.map((c) => esc(c === "reasons" ? b.reasons.join("; ") : c === "est_missed_calls_mo" ? leak.missed : c === "est_lost_revenue_mo" ? leak.lostRevenue : b[c])).join(","));
  }
  fs.writeFileSync(output, lines.join("\n"));
  console.log(`${ranked.length} prospects ranked -> ${output}`);
  console.log(ranked.slice(0, 10).map((b) => `${String(b.score).padStart(2)}  ${b.name}  ${b.phone}  ${b.city}  ${b.reviews} reviews  [${b.reasons.join(", ")}]`).join("\n"));
}
