// .github/scripts/discord-announce.js
// Posts a new Yazanaki Client version to Discord: one embed with each change
// as a heading (a one-line description) with its type underneath in small
// text and its details as a bullet list, the Yazanaki banner, the version in
// the footer, and a Download button that links straight to the installer .exe.
//
//   node discord-announce.js <changelog.json> <download-url>       posts it
//   node discord-announce.js <changelog.json> <download-url> --dry prints the message
//   DISCORD_PING=false leaves out the role ping (reposts).
//   node discord-announce.js <changelog.json> --markdown            prints the
//       changes as Markdown, for the GitHub release notes
//
// The webhook link comes only from the DISCORD_WEBHOOK_URL environment
// variable (a repository secret) and is never printed.
// changelog.json is written by the client's `npm run release`:
//   { version, date, summary, changes: [{ type, title, points: [] }],
//     previous: [same shape, newest first] }  (versions released together with it)
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
const ICON = `${ASSETS}/discord-emblem-gold.png`; // the gold Yazanaki emblem, transparent
const BANNER = `${ASSETS}/discord-banner.png`; // the YAZANAKI lettering
// The role pinged with each announcement (DISCORD_PING_ROLE overrides it,
// "none" turns the ping off).
const PING_ROLE = '1575361740584001547';
const DESCRIPTION_MAX = 4096;                  // Discord's embed description limit
const TOTAL_MAX = 6000;                        // all embeds of one message together
const MAX_EMBEDS = 10;                         // embeds per message

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

// Every version this release covers, oldest first: the skipped versions in
// `previous` (released together with this one), then this one. Pure.
function versions(notes) {
  const previous = Array.isArray(notes.previous) ? notes.previous.filter((n) => n && n.version) : [];
  return [...previous.slice(0, MAX_EMBEDS - 1).reverse(), notes];
}

// The webhook message: one embed per version (oldest first, the banner under
// the newest), one role ping and one Download button for all of them. With
// `button` false (a webhook that refuses components) the download link goes
// into the newest embed instead. Pure.
function message(notes, downloadUrl, { button = true, role = null } = {}) {
  const all = versions(notes);
  const link = `\n\n**[Download the installer](${downloadUrl})**`;
  // Discord allows 6000 characters over all embeds of a message.
  const each = Math.min(DESCRIPTION_MAX, Math.floor(TOTAL_MAX / all.length) - 120);
  const now = new Date().toISOString();
  const embeds = all.map((n, i) => {
    const newest = i === all.length - 1;
    const withLink = newest && !button;
    return {
      title: `Yazanaki Client ${n.version}`,
      // Only the newest links: embeds sharing a link get merged by Discord.
      ...(newest ? { url: downloadUrl } : {}),
      description: withLink ? `${description(n, each - link.length)}${link}` : description(n, each),
      color: GOLD,
      thumbnail: { url: ICON },
      ...(newest ? { image: { url: BANNER } } : {}),
      footer: { text: `Version ${n.version}`, icon_url: ICON },
      timestamp: now,
    };
  });
  const msg = {
    username: 'Yazanaki Client',
    avatar_url: ICON,
    ...(role ? { content: `<@&${role}>` } : {}),
    allowed_mentions: { parse: [], roles: role ? [role] : [] },
    embeds,
  };
  if (button) {
    msg.components = [{
      type: 1,
      components: [{ type: 2, style: 5, label: 'Download Yazanaki Client', url: downloadUrl }],
    }];
  }
  return msg;
}

// The changes as Markdown, for the GitHub release page; versions released
// together with this one follow under their own heading. Pure.
function sectionsMarkdown(notes) {
  return changes(notes)
    .map((c) => [`### ${c.title}`, `*${c.label}*`, ...(c.points.length ? [''] : []), ...c.points.map((p) => `- ${p}`)].join('\n'))
    .join('\n\n');
}

function markdown(notes) {
  const previous = versions(notes).slice(0, -1).reverse();
  if (!previous.length) return sectionsMarkdown(notes);
  return [`## ${notes.version}`, sectionsMarkdown(notes),
    ...previous.flatMap((n) => [`## ${n.version}`, sectionsMarkdown(n)])].join('\n\n');
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
  const roleSetting = (process.env.DISCORD_PING_ROLE || PING_ROLE).trim();
  const role = process.env.DISCORD_PING === 'false' || !/^\d+$/.test(roleSetting) ? null : roleSetting;
  if (flag === '--dry') return void console.log(JSON.stringify(message(notes, second, { role }), null, 2));

  const webhook = (process.env.DISCORD_WEBHOOK_URL || '').trim();
  if (!/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(webhook)) {
    throw new Error('DISCORD_WEBHOOK_URL is not set (or not a Discord webhook link). Add it under Settings > Secrets and variables > Actions, then re-run this job.');
  }
  let r = await post(webhook, message(notes, second, { role }), true);
  if (!r.ok && r.status === 400) {
    // Some webhooks refuse buttons: post again with the link in the embed.
    console.log(`Discord refused the button (${r.text.slice(0, 200)}). Posting with a download link instead.`);
    r = await post(webhook, message(notes, second, { button: false, role }), false);
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

module.exports = { TYPES, changes, description, versions, message, markdown };
