// .github/scripts/discord-announce.js
// Posts a new Yazanaki Client version to Discord: one embed with each change
// as a heading (a one-line description) with its type underneath in small
// text and its details as a bullet list, the Yazanaki banner, the version in
// the footer, and a Download button that links straight to the installer .exe.
//
//   node discord-announce.js <changelog.json> <download-url>       posts it
//   node discord-announce.js <changelog.json> <download-url> --dry prints the message
//   node discord-announce.js <changelog.json> --markdown            prints the
//       changes as Markdown, for the GitHub release notes
//
// The webhook link comes only from the DISCORD_WEBHOOK_URL environment
// variable (a repository secret) and is never printed.
// changelog.json is written by the client's `npm run release`:
//   { version, date, summary, changes: [{ type, title, points: [] }] }
// (older files have { type, text } changes: text becomes the title).

const fs = require('fs');

const TYPES = {
  cosmetics: 'Cosmetics',
  mods: 'Mods',
  yazanaki: 'Yazanaki Mod',
  performance: 'Performance',
  launcher: 'Launcher',
};
const GOLD = 0xf2c14e;
const ASSETS = 'https://raw.githubusercontent.com/Yazanaki/YZNKI-Client-Releases/main/assets';
const ICON = `${ASSETS}/discord-icon.png`;     // the black Yazanaki emblem
const BANNER = `${ASSETS}/discord-banner.png`; // the YAZANAKI lettering
const DESCRIPTION_MAX = 4096;                  // Discord's embed description limit

// One line of plain text: no line breaks, no pings, no stray list or
// heading markers at the start.
function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim()
    .replace(/@(everyone|here)/g, '@\u200b$1')
    .replace(/^([#>-]|\d+\.)\s*/, '');
}

// The changes in the order the changelog lists them, cleaned. Pure.
function changes(notes) {
  return (notes && Array.isArray(notes.changes) ? notes.changes : []).map((c) => ({
    label: TYPES[c && c.type] || TYPES.launcher,
    title: clean(c && (c.title || c.text)),
    points: (Array.isArray(c && c.points) ? c.points : []).map(clean).filter(Boolean),
  })).filter((c) => c.title);
}

// One change as Discord Markdown: heading, type in small text, bullets.
function section(c) {
  return [`### ${c.title}`, `-# ${c.label}`, ...c.points.map((p) => `- ${p}`)].join('\n');
}

// The embed text: the summary, then every change. When it would be too long
// for Discord, the last changes are left out and counted. Pure.
function description(notes, max = DESCRIPTION_MAX) {
  const summary = clean(notes.summary);
  const parts = changes(notes).map(section);
  const build = (n) => {
    const shown = [summary, ...parts.slice(0, n)].filter(Boolean);
    if (n < parts.length) shown.push(`*…and ${parts.length - n} more on the release page.*`);
    return shown.join('\n\n');
  };
  let n = parts.length;
  while (n > 0 && build(n).length > max) n--;
  return build(n).slice(0, max);
}

// The webhook message. With `button` false (a webhook that refuses
// components) the download link goes into the embed instead. Pure.
function message(notes, downloadUrl, { button = true } = {}) {
  const version = notes.version;
  const link = `\n\n**[Download the installer](${downloadUrl})**`;
  const msg = {
    username: 'Yazanaki Client',
    avatar_url: ICON,
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `Yazanaki Client ${version}`,
      url: downloadUrl,
      description: button ? description(notes) : `${description(notes, DESCRIPTION_MAX - link.length)}${link}`,
      color: GOLD,
      thumbnail: { url: ICON },
      image: { url: BANNER },
      footer: { text: `Version ${version}`, icon_url: ICON },
      timestamp: new Date().toISOString(),
    }],
  };
  if (button) {
    msg.components = [{
      type: 1,
      components: [{ type: 2, style: 5, label: `Download Yazanaki Client`, url: downloadUrl }],
    }];
  }
  return msg;
}

// The changes as Markdown, for the GitHub release page. Pure.
function markdown(notes) {
  return changes(notes)
    .map((c) => [`### ${c.title}`, `*${c.label}*`, ...(c.points.length ? [''] : []), ...c.points.map((p) => `- ${p}`)].join('\n'))
    .join('\n\n');
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

module.exports = { TYPES, changes, description, message, markdown };
