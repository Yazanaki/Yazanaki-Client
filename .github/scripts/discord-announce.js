// .github/scripts/discord-announce.js
// Posts a new Yazanaki Client version to Discord: one embed with every change
// as its own bullet under its type, the version in the footer, and a
// Download button that links straight to the installer .exe.
//
//   node discord-announce.js <changelog.json> <download-url>       posts it
//   node discord-announce.js <changelog.json> <download-url> --dry prints the message
//   node discord-announce.js <changelog.json> --markdown            prints the
//       changes as Markdown, for the GitHub release notes
//
// The webhook link comes only from the DISCORD_WEBHOOK_URL environment
// variable (a repository secret) and is never printed.
// changelog.json is written by the client's `npm run release`:
//   { version, date, summary, changes: [{ type, text }] }

const fs = require('fs');

const TYPES = [
  { type: 'cosmetics', label: 'Cosmetics', emoji: '🎨' },
  { type: 'mods', label: 'Mods', emoji: '🧩' },
  { type: 'yazanaki', label: 'Yazanaki Mod', emoji: '⚔️' },
  { type: 'performance', label: 'Performance', emoji: '⚡' },
  { type: 'launcher', label: 'Launcher', emoji: '🚀' },
];
const GOLD = 0xf2c14e;
const ICON = 'https://raw.githubusercontent.com/Yazanaki/YZNKI-Client-Releases/main/assets/emblem.png';
const DESCRIPTION_MAX = 4096; // Discord's embed description limit

// Discord markdown that would break a bullet or ping people is neutralised.
function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().replace(/@(everyone|here)/g, '@​$1');
}

// Changes grouped by type, in TYPES order; unknown types go under Launcher.
function groups(notes) {
  const known = new Set(TYPES.map((t) => t.type));
  const changes = (notes && Array.isArray(notes.changes) ? notes.changes : [])
    .map((c) => ({ type: known.has(c && c.type) ? c.type : 'launcher', text: clean(c && c.text) }))
    .filter((c) => c.text);
  return TYPES.map((t) => ({ ...t, items: changes.filter((c) => c.type === t.type).map((c) => c.text) }))
    .filter((g) => g.items.length);
}

function description(notes) {
  const parts = [];
  if (clean(notes.summary)) parts.push(clean(notes.summary));
  for (const g of groups(notes)) parts.push(`**${g.emoji} ${g.label}**\n${g.items.map((t) => `• ${t}`).join('\n')}`);
  let text = parts.join('\n\n');
  if (text.length > DESCRIPTION_MAX) text = `${text.slice(0, DESCRIPTION_MAX - 1)}…`;
  return text;
}

// The webhook message. With `button` false (a webhook that refuses
// components) the download link goes into the embed instead. Pure.
function message(notes, downloadUrl, { button = true } = {}) {
  const version = notes.version;
  let desc = description(notes);
  if (!button) {
    const link = `\n\n**[⬇️ Download the installer](${downloadUrl})**`;
    desc = `${desc.slice(0, DESCRIPTION_MAX - link.length)}${link}`;
  }
  const msg = {
    username: 'Yazanaki Client',
    avatar_url: ICON,
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `Yazanaki Client ${version}`,
      url: downloadUrl,
      description: desc,
      color: GOLD,
      thumbnail: { url: ICON },
      footer: { text: `Version ${version}`, icon_url: ICON },
      timestamp: new Date().toISOString(),
    }],
  };
  if (button) {
    msg.components = [{
      type: 1,
      components: [{ type: 2, style: 5, label: 'Download installer', emoji: { name: '⬇️' }, url: downloadUrl }],
    }];
  }
  return msg;
}

// The changes as Markdown, for the GitHub release page. Pure.
function markdown(notes) {
  return groups(notes).map((g) => `**${g.emoji} ${g.label}**\n${g.items.map((t) => `- ${t}`).join('\n')}`).join('\n\n');
}

async function post(webhook, body, withComponents) {
  const url = `${webhook}?wait=true${withComponents ? '&with_components=true' : ''}`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, text: res.ok ? '' : await res.text() };
}

async function main() {
  const [file, second, flag] = process.argv.slice(2);
  const notes = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(notes.version || '')) throw new Error(`${file} has no valid version`);
  if (second === '--markdown') return void process.stdout.write(`${markdown(notes)}\n`);
  if (!/^https:\/\//.test(second || '')) throw new Error('Pass the installer download URL');
  if (flag === '--dry') return void console.log(JSON.stringify(message(notes, second), null, 2));

  const webhook = (process.env.DISCORD_WEBHOOK_URL || '').trim();
  if (!/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(webhook)) {
    throw new Error('DISCORD_WEBHOOK_URL is not set (or not a Discord webhook link). Add it under Settings > Secrets and variables > Actions, then re-run this job.');
  }
  let r = await post(webhook, message(notes, second), true);
  if (!r.ok && r.status === 400) {
    // Some webhooks refuse buttons: post again with the link in the embed.
    console.log(`Discord refused the button (${r.text.slice(0, 200)}). Posting with a download link instead.`);
    r = await post(webhook, message(notes, second, { button: false }), false);
  }
  if (!r.ok) throw new Error(`Discord answered ${r.status}: ${r.text.slice(0, 300)}`);
  console.log(`Posted ${notes.version} to Discord.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`::error::${err.message}`);
    process.exit(1);
  });
}

module.exports = { TYPES, groups, description, message, markdown };
