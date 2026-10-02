// The conversation brain. One function turns a transcript + business profile into
// the next SMS and a structured lead update, using Claude structured outputs.
import Anthropic from "@anthropic-ai/sdk";

export const JOB_TYPES = ["removal", "trim_prune", "storm_emergency", "land_clearing", "stump", "rescue", "other", "unknown"];
export const URGENCIES = ["emergency", "this_week", "this_month", "flexible", "unknown"];

export const LEAD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "lead", "handoff_now"],
  properties: {
    reply: { type: "string", description: "The SMS to send back. Under 300 characters. One question at a time." },
    handoff_now: { type: "boolean", description: "True if the owner should call this person right now (emergency, angry, asking for a human, or ready to book)." },
    lead: {
      type: "object",
      additionalProperties: false,
      required: ["name", "address", "job_type", "urgency", "summary", "ready_for_quote"],
      properties: {
        name: { type: ["string", "null"] },
        address: { type: ["string", "null"], description: "Street address or cross streets if given." },
        job_type: { type: "string", enum: JOB_TYPES },
        urgency: { type: "string", enum: URGENCIES },
        summary: { type: "string", description: "One or two lines the owner can quote from: what, where, how big, access, hazards." },
        ready_for_quote: { type: "boolean", description: "True once we have address + what the job is + at least one photo or a clear size description." },
      },
    },
  },
};

export function buildSystemPrompt(profile) {
  const owner = profile.owner_first_name || "the owner";
  return `You are the groundman for ${profile.name}, texting a customer who just called and did not get an answer because the crew was on a job.

Your job in this text thread:
1. Make them feel heard fast. Apologize once, briefly, for missing the call.
2. Find out what they need, where the job is, and how urgent it is. One question per message.
3. Ask for a photo or two of the tree and the area around it (house, lines, fence, access for a truck). Photos let ${owner} quote without a site visit.
4. Once you have an address, the job, and either photos or a clear description, tell them ${owner} will text a quote back, and give the honest window from the quote policy.
5. If it is an emergency (tree on a house, on a car, on power lines, blocking a road), get the address first and say ${owner} is being paged right now. Set handoff_now true. Tell them to call 911 and the power company if lines are involved.
6. If they ask for something we do not do, say so plainly and, if you can, point them in a reasonable direction.
7. If they ask for a human, or get frustrated, stop asking questions, say ${owner} will call, set handoff_now true.

Business facts (only say what is here, never invent prices, dates, or availability):
- Service area: ${profile.service_area}
- Services: ${profile.services.join("; ")}
- Not offered: ${(profile.not_offered || []).join("; ") || "none listed"}
- Hours: ${profile.hours}
- Quote policy: ${profile.quote_policy}
- Deposit policy: ${profile.deposit_policy}
${profile.booking_link ? `- Booking link: ${profile.booking_link}` : ""}

Voice: ${profile.voice}
Rules: never quote a price. Never promise a time. Texts under 300 characters. No emojis unless the customer uses them first. Do not say you are an AI unless directly asked; if asked, say yes, you are the automated assistant and ${owner} reads every message.
Always return the structured lead with your best current understanding. The summary field is for ${owner}, written like a crew note.`;
}

export function transcriptToMessages(transcript) {
  // Collapse into alternating user/assistant turns. Inbound photos are described, not fetched.
  const msgs = [];
  for (const m of transcript) {
    const role = m.direction === "in" ? "user" : "assistant";
    let text = m.body || "";
    if (m.direction === "in" && m.media?.length) text += `\n[customer sent ${m.media.length} photo${m.media.length > 1 ? "s" : ""}]`;
    if (!text.trim()) text = m.direction === "in" ? "[empty message]" : "[sent text-back]";
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content += "\n" + text;
    else msgs.push({ role, content: text });
  }
  if (!msgs.length || msgs[0].role !== "user") {
    msgs.unshift({ role: "user", content: "[customer called and the call was not answered]" });
  }
  return msgs;
}

export function parseModelOutput(response) {
  const block = response.content?.find((b) => b.type === "text");
  if (!block) throw new Error("no text block in model response");
  const out = JSON.parse(block.text);
  if (typeof out.reply !== "string" || !out.lead) throw new Error("model output missing fields");
  out.reply = out.reply.trim().slice(0, 320);
  return out;
}

export function textBackOpener(profile, { emergencyHint = false } = {}) {
  const owner = profile.owner_first_name || "we";
  if (emergencyHint) return `This is ${profile.name}. Sorry we missed you, ${owner} is up a tree. If this is an emergency reply EMERGENCY and your address and we'll page him now. Otherwise, what's going on with the tree?`;
  return `Hey, it's ${profile.name}. Sorry we missed your call, the crew's on a job. What's going on with your tree? Text me the address and a photo if you can and ${owner} will get you a quote.`;
}

export class Brain {
  constructor({ profile, model = "claude-opus-5-5", effort = "low", client = null }) {
    this.profile = profile;
    this.model = model;
    this.effort = effort;
    this.client = client || new Anthropic();
    this.system = buildSystemPrompt(profile);
  }

  async next(transcript) {
    const messages = transcriptToMessages(transcript);
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: [{ type: "text", text: this.system, cache_control: { type: "ephemeral" } }],
      messages,
      output_config: { effort: this.effort, format: { type: "json_schema", schema: LEAD_SCHEMA } },
    });
    if (response.stop_reason === "refusal") {
      return { reply: `Thanks for the details. ${this.profile.owner_first_name || "The owner"} will call you shortly.`, handoff_now: true,
        lead: { name: null, address: null, job_type: "unknown", urgency: "unknown", summary: "Model declined; needs human.", ready_for_quote: false } };
    }
    return parseModelOutput(response);
  }
}
