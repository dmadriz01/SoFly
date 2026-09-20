// Only invite links from these apps are accepted, so a host can't send attendees to an
// arbitrary (e.g. phishing) site. Keep in sync with the check constraint in
// supabase/migrations/003_chat_links.sql.
const PLATFORMS = [
  { host: "chat.whatsapp.com", label: "WhatsApp" },
  { host: "groupme.com", label: "GroupMe" },
  { host: "discord.gg", label: "Discord" },
  { host: "discord.com", label: "Discord" },
  { host: "t.me", label: "Telegram" },
  { host: "telegram.me", label: "Telegram" },
  { host: "signal.group", label: "Signal" },
  { host: "join.slack.com", label: "Slack" },
  { host: "m.me", label: "Messenger" },
];

export const CHAT_APPS_HINT = "WhatsApp, GroupMe, Discord, Telegram, Signal, Slack or Messenger";

export type ParsedChatUrl = { url: string; label: string } | { error: string };

export function parseChatUrl(raw: string): ParsedChatUrl {
  let value = raw.trim();
  if (value.length > 500) return { error: "That link is too long." };
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = `https://${value}`;

  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return { error: "That doesn't look like a link." };
  }
  if (u.protocol !== "https:" || u.username || u.password) {
    return { error: "Use a link that starts with https://" };
  }

  const host = u.hostname.toLowerCase();
  const platform = PLATFORMS.find((p) => host === p.host || host.endsWith(`.${p.host}`));
  if (!platform) return { error: `Use an invite link from ${CHAT_APPS_HINT}.` };

  return { url: u.href, label: platform.label };
}

export function chatLabel(url: string) {
  const parsed = parseChatUrl(url);
  return "label" in parsed ? parsed.label : "group";
}
