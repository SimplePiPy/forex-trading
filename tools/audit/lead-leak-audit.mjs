#!/usr/bin/env node
// Generate the one-page "Lead Leak Audit" you hand a contractor after test-calling them.
// Usage: node tools/audit/lead-leak-audit.mjs --name "Caudle's Tree" --calls 5 --answered 2 --form-reply-min 0 --avg-ticket 1500 --reviews 48 [--out audit.md]
import fs from "node:fs";

export function buildAudit({ name, calls, answered, formReplyMin, avgTicket = 1200, reviews = 0, closeRate = 0.3, yourName = "Philip", yourBiz = "Monkey's Tree Service" }) {
  const missedPct = calls ? Math.round(((calls - answered) / calls) * 100) : 62;
  const callsPerMonth = Math.max(10, Math.round((Number(reviews) * 10) / 12));
  const missedMo = Math.round(callsPerMonth * (missedPct / 100));
  const gone = Math.round(missedMo * 0.85);
  const lost = Math.round(gone * closeRate * avgTicket);
  const formLine = formReplyMin == null ? "No web form found, so every lead is a phone call." :
    formReplyMin === 0 ? "I filled out your web form. No reply yet." :
    `I filled out your web form. Reply came back in ${formReplyMin} minutes. (Leads contacted inside 5 minutes are 21x more likely to convert.)`;
  return `# Lead Leak Audit: ${name}
_${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}. Done by ${yourName}, ${yourBiz}. Took me 20 minutes. Keep it either way._

## What I did
I called your business line ${calls} times over two days at normal customer hours and timed what happened.

## What I found
- **${answered} of ${calls} calls answered.** ${missedPct}% went to voicemail or rang out.
- ${formLine}
- Google shows ${reviews} reviews. In home services that usually means roughly **${callsPerMonth} inbound calls a month**.

## What it costs
| | |
|---|---|
| Calls per month (estimate) | ${callsPerMonth} |
| Missed at your ${missedPct}% rate | ${missedMo} |
| Callers who never call back (industry: 85%) | ${gone} |
| Close rate on a returned lead | ${Math.round(closeRate * 100)}% |
| Average ticket | $${avgTicket.toLocaleString()} |
| **Jobs leaking out the back door** | **about $${lost.toLocaleString()} a month** |

That is not a sales number. It is your reviews times the industry's missed-call rate. Swap in your real numbers and it moves, but it does not go to zero.

## The fix I use on my own line
I climb for a living and cannot answer the phone 60 feet up. So when a call rings out on my line, the caller gets a text within seconds that says sorry, we're on a job, what's going on with the tree, send me the address and a photo. The text thread asks the right questions, flags emergencies, and I get a quote-ready note on the ground. Most of my quotes now go out before I'm back in the truck.

I set this up for other tree companies. Setup takes a day, you keep your number, and you can turn it off any time.

**$197 a month. First month free for the first five companies that let me film the install.**

Text or DM me the word GROUNDIE and I'll send you a two-minute video of it working on my line.

${yourName} · ${yourBiz}
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  const get = (k, d) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : d; };
  const md = buildAudit({
    name: get("name", "Your Tree Company"), calls: Number(get("calls", 5)), answered: Number(get("answered", 2)),
    formReplyMin: a.includes("--form-reply-min") ? Number(get("form-reply-min")) : null,
    avgTicket: Number(get("avg-ticket", 1200)), reviews: Number(get("reviews", 40)),
    yourName: get("your-name", "Philip"), yourBiz: get("your-biz", "Monkey's Tree Service"),
  });
  const out = get("out");
  if (out) { fs.writeFileSync(out, md); console.log(`wrote ${out}`); } else console.log(md);
}
