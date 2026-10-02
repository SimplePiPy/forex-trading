# Outreach: the audit is the pitch

Generic AI cold email gets under 1% replies in 2026. You are not doing that. You are a tree guy calling tree guys with a number they have never seen about their own business.

## The lead list you already own

The Outscraper export "Monkey's Tree Service" (shared to your Drive in 2023) is a Google Maps scrape of 1,730 businesses around Roanoke, Lynchburg, Salem, Moneta and Danville, Virginia: deck builders, real estate, property developers, plumbers, lawn care, painters, and a minority of tree companies, with phones, review counts, websites, booking links and carrier type. I ran the ranker on it on October 2, 2026: 1,652 usable rows, 243 strong prospects (score 9 or higher), 19 near-perfect ones. The top 250 are in the Google Sheet [Groundie call sheet - Roanoke (Oct 2026)](https://docs.google.com/spreadsheets/d/1PI3BLMakJ4G1H1BHODnWI0AWNNszbMGgRsznv-08NVM/edit) in your Drive. Tree companies are a minority on this list, so the first five Groundie clients can be any trade whose business line is a cell phone: plumbers, lawn care, painters, deck builders. To re-run it:

```bash
node tools/leads/rank-outscraper.mjs ~/Downloads/outscraper.csv --state VA --min-reviews 5 --max-reviews 300
```

It writes a call sheet ranked by who is most likely bleeding calls: real phone, 5 to 300 reviews (active but no front desk), no booking link, no website, and a cell-phone carrier type on the business line. It also estimates missed calls and lost revenue per company so you open with their number, not yours.

Refresh it: a new Outscraper pull for "tree service" within 60 miles of Roanoke is a few dollars and gives you 2026 data with the tree companies this list is light on. Add roofing and concrete on the second pull.

## The Lead Leak Audit (20 minutes per company)

1. Call the business line twice on day one, twice on day two, at 10am and 2pm. Count answers. Note whether voicemail was full or generic.
2. If they have a web form, fill it in with your real name and "need a quote on a large oak removal". Time the reply.
3. Pull their review count from Maps.
4. Generate the page:
   ```bash
   node tools/audit/lead-leak-audit.mjs --name "Big Oak Tree Pros" --calls 4 --answered 1 --form-reply-min 0 --reviews 42 --avg-ticket 1500 --out big-oak.md
   ```
5. Paste it into a text or DM. Screenshot it for content with the name blurred.

The audit says what you did, what you found, what it costs them, and the fix you use on your own line. It asks for one thing: text GROUNDIE for the two-minute video.

## Scripts

**Opening text (after the audit calls, before sending the page):**
"Hey, this is Philip with Monkey's Tree Service in Roanoke. Not a customer, I climb too. I called your line a few times this week for a project I'm doing and most went to voicemail. I wrote up what that's probably costing you, no charge. Want me to send it?"

**Sending the audit:**
"Here it is. Keep it either way. If you want the thing I use on my own line, text me GROUNDIE and I'll send a 2-minute video of it working."

**After they watch:**
"Want it on your line this week? $197 a month, setup's free for the first five guys who let me film the install, no contract. I need your cell, your service area, and 30 minutes Thursday."

**Follow-up, day 3, if silent:**
"No pressure. One question: how many calls went to voicemail yesterday?"

**Follow-up, day 7, last one:**
"Closing the free-setup spots Friday. If it's not for you, totally fine. Who's the best tree guy you know that's always up a tree?"

## Warm channels before cold ones

- Every tree company you have contract-climbed for. Your SWOT lists "partnering with multiple other tree companies" as an existing relationship. Those are your first five.
- Your Instagram DMs: anyone who has commented on a work post and has a trade in their bio.
- Local Facebook groups for arborists and tree work (you are already active). Post the "I called 10 tree companies" result, not an offer.
- Equipment dealers and the stump-grinding partner. Ask them who is always slammed.

## Volume

Five audits a week. That is ten calls a day from the truck and one page generated at night. At a 30% close that is 1.5 clients a week, and referrals from installed clients push it toward 3. Twenty-five clients by Day 90 is the base of the $10k month.

## Rules

- Never pitch on the first touch. The audit is the first touch.
- Never say AI in the first message. Say "the thing I use on my own line".
- Record every yes, no, and reason in one Google Sheet. Review it Sunday with the content numbers.
- Treat a "no" as a content idea. "The tree guy who told me customers don't text" is a slot B post.
