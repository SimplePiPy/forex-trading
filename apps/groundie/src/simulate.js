// Talk to the brain from your terminal, no Twilio needed. Needs ANTHROPIC_API_KEY.
//   npm run simulate
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { loadConfig } from "./config.js";
import { Brain, textBackOpener } from "./brain.js";

const config = loadConfig();
const brain = new Brain({ profile: config.profile, model: config.anthropic.model, effort: config.anthropic.effort });
const transcript = [];
const opener = textBackOpener(config.profile);
transcript.push({ direction: "out", body: opener });
console.log(`\n[${config.profile.name}] ${opener}\n(type as the customer; "photo" attaches a fake photo; ctrl-c to quit)\n`);
const rl = readline.createInterface({ input: stdin, output: stdout });
for (;;) {
  const line = await rl.question("customer> ");
  const media = /\bphoto\b/i.test(line) ? ["https://example.com/photo.jpg"] : [];
  transcript.push({ direction: "in", body: line, media });
  const out = await brain.next(transcript);
  transcript.push({ direction: "out", body: out.reply });
  console.log(`\n[${config.profile.name}] ${out.reply}`);
  console.log(`   lead: ${JSON.stringify(out.lead)} handoff=${out.handoff_now}\n`);
}
