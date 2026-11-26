# Publishing a new version (maintainers)

There are two release tracks, moved separately:

- **In-client updates** (the **Restart to update** button): installed clients
  read [`updater/latest.yml`](../updater/latest.yml) on `main`.
- **The installer download**: the release marked *Latest*, which the download
  link above points at.

The client's `npm run release` (run automatically for each new version on its
`main` by `npm run release:watch`) pushes a branch `release-<version>` with
`Yazanaki-Client-Setup-<version>.exe` and `latest.yml` in
`installer/`. The *Stage release* workflow then creates release `v<version>`
with them (not marked Latest), deletes the branch and promotes the version to
the track in the `AUTO_PROMOTE` repository variable (Settings > Secrets and
variables > Actions > Variables): `both` when it is not set, or
`updater`, `installer`, `none`. With `both`, every new version becomes the
download and the in-client update at once, and the previous release is deleted.

To move a track by hand: Actions > **Promote** > Run workflow, enter the
version (empty for the newest release) and pick the track. Promoting the
installer marks that release Latest. Installed clients never downgrade, so
promoting an older version to `updater` only holds newer ones back.

Each promote then deletes older releases (and their tags). Only the version
in `updater/latest.yml`, the Latest release and the newest release are kept,
so with `AUTO_PROMOTE` at `both` (the default) the releases page shows just
one. With `updater`, the Latest release stays behind and is kept too.

Every release also lists *Source code (zip/tar.gz)*. GitHub adds those to
every release and they can't be turned off. Here they only contain this
repository (this README, the terms and the workflows), not the client's code.

Clients older than 0.3.5 don't read `updater/latest.yml` yet and follow the
Latest release, so promote 0.3.5 to `installer` (or `both`) once to bring them
onto the new updater.

## Discord announcements

After a new version is staged and promoted, *Stage release* posts it to the
Yazanaki Discord (the *Announce* workflow): one embed with the release's
summary, then each change as a heading (a one-line description) with its type
(Cosmetics, Mods, Yazanaki Mod, Performance or Launcher) underneath in small
text and its details as bullets, the Yazanaki banner at the bottom, the
version in the footer and a **Download Yazanaki Client** button. The button
links straight to the `.exe`: `releases/latest/download/Yazanaki-Client-Setup.exe`.
Each release has one installer, `Yazanaki-Client-Setup.exe` (Stage release
renames it and points `latest.yml` at it), so the button on older posts always gives out the newest
installer. (When the version is not the Latest release, the button links to
that version's own `.exe` instead.) The same changes go on the release page
under *What changed*.

The changes come from `installer/changelog.json`, which the client's
`npm run release` writes from its `src/main/changelog.js`. Stage release
keeps them as `changelog/<version>.json` on `main`. A re-push of a version
that is already released is not announced again.

Each new release pings the update role (`PING_ROLE` in
`.github/scripts/discord-announce.js`, or the `DISCORD_PING_ROLE` repository
variable; `none` turns it off). The role must allow being mentioned by
everyone, or the ping shows but notifies nobody.

To post a version again (after a layout change, or when the secret was
missing): Actions > **Announce** > Run workflow, enter the version (empty for
the newest). It only pings the role when you tick *Ping the update role*.
Delete the old post in Discord yourself if you want.

**One-time setup:** Settings > Secrets and variables > Actions > New
repository secret, name `DISCORD_WEBHOOK_URL`, value the channel's webhook
link (Discord: channel settings > Integrations > Webhooks > Copy Webhook URL).
The link stays in the secret and never goes into this repository.

The gold emblem (`assets/discord-emblem-gold.png`, transparent) is the webhook's picture and the
embed's thumbnail; `assets/discord-banner.png` is the banner. If Discord
refuses the button (some webhooks can't send them), the post goes out again
with a **Download the installer** link inside the embed instead.
