# The 21-day plan: October 2 to October 23, 2026

Day numbers in parentheses are your speedrun days. Times are Eastern.

## Week 1 (Days 19 to 25): build it on camera, sell the Sprint

**Thu Oct 2 (Day 19)**
- Twilio account. Buy a toll-free number. Submit toll-free verification tonight (needs a privacy policy URL; a Google Doc published to web or a page on your site is fine). You can text 2,000 segments a day while it is pending. Do not buy a local number; 10DLC vetting is 10 to 15 days right now.
- Anthropic API key (console.anthropic.com). Deploy `apps/groundie` to Railway (free tier is fine). Fill `.env`. Point the Twilio number at `/voice` and `/sms`.
- Film it: "Day 19. I miss calls because I'm in a tree. Tonight I'm building a groundie that answers them." Slot B. This is post 1 of the series.

**Fri Oct 3 (Day 20)**
- Set conditional call forwarding on your cell to the Twilio number. Call yourself from the crew's phone, let it ring out, get the text. That clip is slot A tomorrow.
- Run `npm run simulate` and tune the profile JSON until it sounds like you. Change `voice` until the texts read like a crew member.
- Set up the comment-to-DM keyword GROUNDIE in Instagram (native automation or ManyChat). Reply: "Here's the 2-minute video. What trade are you?" Link to the demo clip.
- Export the Outscraper sheet (Monkey's Tree Service, shared with you in 2023) to CSV. Already done: the ranked top 250 are in the Google Sheet "Groundie call sheet - Roanoke (Oct 2026)" in your Drive. Top 25 are your audit list. The list is light on tree companies, so expect plumbers, lawn care, painters and deck builders in the first five.

**Sat Oct 4 (Day 21) - Sprint opens**
- Post the Sprint open at 12:30. Everyone who DMed CLIMB gets a personal voice note today. Five seats. Price $1,500. Deadline: close Friday Oct 10 or when 5 fill.
- Start the audits: call the top 10 on the list twice today at customer hours. Log answered/unanswered. Note who has a web form; fill it in with your real info.

**Sun Oct 5 (Day 22) - Sunday review**
- The Routine drafts your week's 21 hooks at 3:49pm and notifies you (push and email). Review, film the 7 talking heads.
- Turn on Instagram to Facebook auto-share for Reels in Accounts Center (see `04_CONTENT_ENGINE.md`). From now, every post lands on the monetized Page.
- Finish the second round of audit calls. Generate audits: `node tools/audit/lead-leak-audit.mjs --name "..." --calls 4 --answered 1 --reviews 42 --avg-ticket 1500 --out audit.md`.

**Mon Oct 6 to Wed Oct 8 (Days 23 to 25)**
- Deliver 10 audits by DM and text, one a day minimum on camera ("I called 10 contractors in Roanoke. 7 didn't answer."). That post is the whole offer.
- Offer to the 10: $197/month, setup fee waived, first month paid up front, I film the install. First five only.
- Target by Wed: 2 Groundie yeses, 1 Sprint seat.

## Week 2 (Days 26 to 32): install, deliver, repeat

- Install Groundie for each yes in one sitting: copy the profile JSON, their Twilio number (buy it under your account, toll-free, submit verification same day), forward their cell, test call. 90 minutes each. Film the owner's face when the first text-back hits their phone.
- Sprint client(s) start Monday Oct 13: two calls, DMs daily, build their profile, keyword, first 30 posts. Use your own Playbook Part 2 as the curriculum. The deliverable at Day 14 is their first 7 posts live and the keyword automation firing.
- Content: slot B all week is Groundie + Sprint proof. "First client's phone, first missed call, first text-back, first quote-ready lead." The counter stays.
- Audits: 10 more from the list. Ask every yes for one referral to another tree company. Climbers know climbers.
- Targets by Fri Oct 17: 4 Groundie clients, 1 to 2 Sprint seats. Cash collected: $788 + $1,500 to $3,000.

## Week 3 (Days 33 to 40): proof and pipeline

- Groundie: collect the numbers from each client's board (`/leads`): calls caught, quote-ready leads, one job won. One client testimonial clip each. These become the sales page.
- Put a one-page Groundie site up (Carrd or a single HTML page): the demo video, three testimonials, the audit table, "$197/month, no contract", a Stripe payment link. Now DMs can close without you.
- Open the Climb waitlist hard: "Day 40. The Climb opens Day 45. 10 spots." Every Sprint client is a Climb candidate at a credit.
- Audits continue at 5 a week forever. This is the sales motion. Thirty minutes a day.
- Targets by Thu Oct 23: 5 Groundie clients live ($985/mo recurring), 2 Sprint seats sold ($3,000), Facebook up 50%+ from cross-posting volume. Collected in the window: $2,000 to $4,500.

## What you do every single day (90 minutes total, outside the tree)

| When | Minutes | What |
|---|---|---|
| 6:30am | 15 | Post slot A. Reply to every comment from overnight. |
| 12:30pm | 20 | Post slot B. Two audit calls from the truck. |
| 7:00pm | 15 | Post slot C. Check Groundie boards. Send one audit. |
| 7:30pm | 30 | DMs: CLIMB and GROUNDIE keyword replies, voice notes to warm leads. |
| Sunday | 90 | Review the Routine's draft, film 7 talking heads, update the Playbook scoreboard. |

## Scaling past $2k: the next 60 days

- **Day 45 (Oct 28): Climb opens.** 10 seats at $3,700. Offer a 3-pay plan. Four seats is $14,800. This is your first $10k month on its own.
- **Groundie to 25 clients by Day 90.** Five audits a week at a 30% close is 1.5 clients a week. Referrals double it. 25 clients is $4,925 a month recurring on roughly $150 of costs.
- **Hand off installs.** By client 10, write the install as a checklist and pay a groundie (a real one) $50 an install.
- **The Kit** ($47 on Gumroad, Day 30+): the hooks, shot list, Sunday review sheet, CapCut templates. Everyone who comments the keyword but does not buy the Sprint gets offered the Kit. Low ceiling, zero effort after week one.
- **Groundie self-serve** (month 3+): Stripe checkout, a form that writes the profile JSON, Twilio number auto-provisioned. Then it sells from the content without a call. That is the $10k-month floor.

## What kills this

- Breaking the posting streak to "focus on sales". The posts are the sales.
- Spending a week making Groundie perfect before the first install. Install it for yourself on Day 19, for a stranger on Day 24.
- Discounting the Sprint. Five seats at $1,500 with you in their DMs is underpriced already.
- Reviving the forex bot in this repo. It is dead and binary options are banned for retail. Leave it.
