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
