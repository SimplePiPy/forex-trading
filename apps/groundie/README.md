# Groundie

The AI groundman that answers your phone while you're up the tree.

When a customer calls your business line and nobody picks up, Groundie texts them back in seconds, finds out what the job is, gets the address and photos, and hands you a quote-ready lead card. Emergencies page you immediately. Everything else waits until you're on the ground.

Built for tree services first. Works for any trade where the owner can't answer the phone: roofing, concrete, welding, HVAC, plumbing.

## Why this beats the $297/month tools

| | GoHighLevel resellers | Podium | NextPhone / SalesCaptain | Groundie |
|---|---|---|---|---|
| Missed-call text-back | Template only | Template + inbox | AI receptionist | AI conversation that qualifies the job |
| Asks for photos of the tree and access | No | No | No | Yes, by default |
| Emergency detection and owner page | No | No | Partial | Yes (keyword + model judgment) |
| Quote-ready crew note for the owner | No | No | No | Yes |
| Price to the contractor | $297 to $497/mo | $399 to $999/mo | $159 to $199/mo | $197/mo (your price, your margin) |
| Your cost to run it | | | | ~$3 to $8/mo per client (Twilio + Claude) |

## How it works

```
customer calls business line (Twilio toll-free)
   -> rings owner's cell for 20s            POST /voice
   -> no answer: short voice message        POST /voice/status
   -> SMS text-back within seconds
customer replies / sends photos             POST /sms
   -> Claude (structured output) writes the reply + updates the lead card
   -> quote_ready or emergency -> owner gets an SMS with the crew note + link
stale leads get one nudge at 2h, one next day (never 8pm to 8am)
owner gets a daily summary at 7pm           GET /leads (board)
```

## Launch in a day

1. **Twilio**: create an account, buy a **toll-free** number, submit toll-free verification (3 to 5 business days). You can send 2,000 segments a day while it is in review, so you launch today. Do not start with a local 10DLC number; campaign vetting runs 10 to 15 days right now. From September 15, 2026 the verification form requires a privacy policy URL and a terms URL, so put a one-page policy on any site you own.
2. **Deploy** (Railway, Render or Fly, one Node 22 service, one persistent volume for `data/`):
   ```bash
   cd apps/groundie && npm install && cp .env.example .env   # fill it in
   npm start
   ```
3. **Point Twilio at it**: number settings, Voice "A call comes in" = `https://<PUBLIC_URL>/voice` (POST), Messaging "A message comes in" = `https://<PUBLIC_URL>/sms` (POST).
4. **Route the business line**: either publish the Twilio number as the business number, or set conditional call forwarding on the owner's cell so unanswered calls forward to the Twilio number (carrier `*004*<number>#` on most GSM carriers, or ask the carrier). Forwarding is the zero-friction option for a client who will not change their number.
5. **Profile**: copy `profiles/monkeys-tree-service.json`, edit for the client, set `BUSINESS_PROFILE`.
6. **Test**: `npm run simulate` talks to the brain in your terminal with no Twilio. Then call the number from your own phone and let it ring out.

## Operating costs per client

- Twilio toll-free number: $2.15/mo. SMS: $0.0079 per segment each way. A busy tree company at 60 missed calls a month and 8 texts each is about $8.
- Claude Opus 5.5 at low effort, with server-side refusal fallbacks on so a declined request is retried on another model instead of leaving the customer hanging: about 1,500 input tokens and 150 output tokens a turn, roughly a cent a turn with the cached system prompt. $3 to $5 a month per client. Set `ANTHROPIC_MODEL=claude-sonnet-5-5` to halve that if margins matter more than tone.
- Hosting: $5 to $10 a month total for all clients on one box.

## Multi-client

Today one process serves one business (one profile, one Twilio number). To run 20 clients, run 20 small services with different env, or add a `businesses` table keyed by the Twilio `To` number and look up the profile per request. The second is a one-afternoon change; the first is zero changes.

## Compliance

- STOP, UNSUBSCRIBE, CANCEL, END, QUIT opt out. HELP returns an info message. START re-subscribes.
- Text-back is a reply to a customer-initiated call, so it is sent immediately. Nudges respect quiet hours.
- Twilio request signatures are validated when `PUBLIC_URL` and `TWILIO_AUTH_TOKEN` are set. Set `TWILIO_VALIDATE=false` only for local testing.

## End-to-end simulation

Boots the real server on a local port and plays Twilio against it: signed voice and SMS webhooks for a missed call that becomes a quote-ready lead, an emergency, a double call, an answered call, STOP/HELP/START, a forged webhook, a model outage, follow-up nudges and the leads board. It prints every conversation, the texts Philip's phone would get, and a pass/fail table.

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run e2e      # live: real Claude writes every reply
npm run e2e -- --scripted                     # no key: a rule-based stand-in plays the model
npm run e2e -- --report e2e-report.md         # also save the report
```

Live mode also prints a cost profile (latency, input, cache-read and output tokens). Outbound texts are captured, never sent, so it costs only the Claude calls.

## Tests

```bash
npm test
```
Covers compliance keywords, quiet hours, TwiML, transcript shaping, structured output parsing, refusal fallback, the full missed-call to quote-ready flow, emergency handoff, opt-out, follow-ups and the leads board. No network needed.
