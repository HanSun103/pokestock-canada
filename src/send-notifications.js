import { readFile } from "node:fs/promises";

const outbox = JSON.parse(await readFile(new URL("../data/notification-outbox.json", import.meta.url), "utf8"));
const actionable = new Set(["prepare", "live-now", "sold-out"]);
const events = outbox.events.filter((event) => actionable.has(event.stage));

function stageLabel(stage) {
  return ({ prepare: "Prepare", "live-now": "Live now", "sold-out": "Sold out — restock watch" })[stage] ?? stage;
}

function message(event) {
  const confidence = `Existence ${Math.round(event.confidence.existence * 100)}% · Canada ${Math.round(event.confidence.canada * 100)}% · Timing ${Math.round(event.confidence.timing * 100)}%`;
  return `**${stageLabel(event.stage)}: ${event.productName}**\n${event.reason}\n${confidence}\nEvidence: ${event.evidence.url}`;
}

async function sendDiscord(event) {
  if (!process.env.DISCORD_WEBHOOK_URL) return false;
  const response = await fetch(process.env.DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message(event), allowed_mentions: { parse: [] } }),
  });
  if (!response.ok) throw new Error(`Discord returned ${response.status}`);
  return true;
}

async function sendEmail(event) {
  const { RESEND_API_KEY, ALERT_EMAIL_FROM, ALERT_EMAIL_TO } = process.env;
  if (!RESEND_API_KEY || !ALERT_EMAIL_FROM || !ALERT_EMAIL_TO) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: ALERT_EMAIL_FROM,
      to: ALERT_EMAIL_TO.split(",").map((value) => value.trim()).filter(Boolean),
      subject: `${stageLabel(event.stage)} — ${event.productName}`,
      text: message(event).replaceAll("**", ""),
    }),
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
  return true;
}

if (events.length === 0) {
  console.log("No actionable state changes; no notifications sent.");
} else {
  let deliveries = 0;
  for (const event of events) {
    const [discord, email] = await Promise.all([sendDiscord(event), sendEmail(event)]);
    deliveries += Number(discord) + Number(email);
  }
  if (deliveries === 0) console.log(`${events.length} actionable changes found; notification secrets are not configured.`);
  else console.log(`Sent ${deliveries} notification deliveries for ${events.length} state changes.`);
}
