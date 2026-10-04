// Twilio wrapper + compliance helpers. Everything here is unit-testable without Twilio.
import twilio from "twilio";

export const STOP_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);
export const HELP_WORDS = new Set(["help", "info"]);

export function classifyInbound(body = "") {
  const w = body.trim().toLowerCase();
  if (STOP_WORDS.has(w)) return "stop";
  if (HELP_WORDS.has(w)) return "help";
  if (/\bemergency\b/i.test(body)) return "emergency";
  return "message";
}

export function isMissedOutcome(dialStatus = "") {
  // Twilio <Dial> action DialCallStatus values
  return ["no-answer", "busy", "failed", "canceled"].includes(dialStatus);
}

export function hourIn(timeZone, date = new Date()) {
  return Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone }).format(date));
}

export function inQuietHours({ quietStartHour, quietEndHour, timeZone }, date = new Date()) {
  const h = hourIn(timeZone, date) % 24;
  return quietStartHour > quietEndHour ? h >= quietStartHour || h < quietEndHour : h >= quietStartHour && h < quietEndHour;
}

export function voiceTwiml({ ownerCell, ringSeconds, statusUrl, businessName }) {
  const vr = new twilio.twiml.VoiceResponse();
  if (ownerCell) {
    vr.dial({ timeout: ringSeconds, action: statusUrl, method: "POST", answerOnBridge: true }, ownerCell);
  } else {
    vr.redirect({ method: "POST" }, statusUrl);
  }
  return vr.toString();
}

export function missedTwiml({ businessName }) {
  const vr = new twilio.twiml.VoiceResponse();
  vr.say({ voice: "Polly.Matthew" }, `Thanks for calling ${businessName}. The crew is on a job and can't pick up. We're texting you right now so you don't have to wait on hold.`);
  vr.hangup();
  return vr.toString();
}

export function emptyMessagingTwiml() {
  return new twilio.twiml.MessagingResponse().toString();
}

export function makeSender({ accountSid, authToken, number }, client = null) {
  const tw = client || (accountSid && authToken ? twilio(accountSid, authToken) : null);
  return async function send(to, body) {
    if (!tw) {
      console.log(`[dry-run sms] -> ${to}: ${body}`);
      return { sid: "dryrun", to, body };
    }
    return tw.messages.create({ from: number, to, body });
  };
}

export function validateTwilioSignature({ authToken, publicUrl, validateSignatures }, req) {
  if (!validateSignatures || !publicUrl || !authToken) return true;
  const url = publicUrl.replace(/\/$/, "") + req.originalUrl;
  return twilio.validateRequest(authToken, req.get("X-Twilio-Signature") || "", url, req.body || {});
}
