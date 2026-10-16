# Sporta Desktop — Ubuntu

**Sporta** as a native Ubuntu desktop app: the sports-media-production product
(Home, Studio, Transform Marketplace, My Pipelines, Runs, Library, Connected
Apps) exactly as the web product ships it. The app is the **product**, never
the ZCode substrate — the window is hard-locked to the product route.

- Built from: `payswapdotorg/Sporta-2.0` (the product repo)
- Product surface: `packages/web` `/sporta` route (W11 product shell + W12 REAL-host seams)
- Data honesty: the same law as the web product — REAL domain code with the
  honestly-labeled browser demo hosts (fixture-labeled data; nothing is faked
  as production-live)

## Install on Ubuntu (for a local agent or human)

### Option A — .deb (recommended)

```bash
# 1. download the release artifact
wget https://github.com/payswapdotorg/Sporta-2.0/releases/download/sporta-desktop-v1.0.0/sporta-desktop_1.0.0_amd64.deb

# 2. verify the checksum (see SHA256SUMS.md on the release)
sha256sum sporta-desktop_1.0.0_amd64.deb

# 3. install
sudo apt install ./sporta-desktop_1.0.0_amd64.deb
# (equivalently: sudo dpkg -i sporta-desktop_1.0.0_amd64.deb)

# 4. launch — from the applications menu ("Sporta") or:
sporta-desktop
```

The .deb installs to `/opt/Sporta/`, registers `Sporta.desktop`
(`StartupWMClass=Sporta`), and puts the launcher binary on `PATH`
(`/usr/bin` wrapper → `/opt/Sporta/sporta-desktop`).

### Option B — AppImage (no root, no install)

```bash
wget https://github.com/payswapdotorg/Sporta-2.0/releases/download/sporta-desktop-v1.0.0/sporta-desktop-1.0.0-x86_64.AppImage
chmod +x sporta-desktop-1.0.0-x86_64.AppImage
./sporta-desktop-1.0.0-x86_64.AppImage
```

### Requirements

- Ubuntu 20.04+ (x86_64), glibc-based
- GTK3 / X11 or Wayland (standard desktop bases; `sudo apt install -y libgtk-3-0`
  if a minimal image lacks it)
- No GPU required (software rendering is supported)

### What to expect on first launch

- The window opens on **Sporta — Home** at the product route.
- Navigation: Home / Studio / Transform Marketplace / My Pipelines / Runs /
  Library / Connected Apps.
- FIXTURE-labeled demo data is shown by default — that is the honest product
  demo state, identical to the web product's browser demo hosts.
- The app never renders the ZCode IDE/workspace surface; external links open
  in the system browser.

## Uninstall

```bash
sudo apt remove sporta-desktop   # or: sudo dpkg -r sporta-desktop
```

## Rebuilding from source

From the repo root:

```bash
bash apps/sporta-desktop/scripts/build-desktop.sh
```

This builds the product web bundle (`packages/web`), stages it, and packages
`.deb` + `AppImage` into `apps/sporta-desktop/release/`. The toolchain
(electron + electron-builder) is installed only inside `apps/sporta-desktop`
on demand — the pnpm workspace and lockfile are untouched (the app dir is
outside the workspace globs by design).

## Versioning

The desktop app has its own version line (`sporta-desktop-v*` tags,
`1.0.0` at launch) decoupled from the repo's `zcode` package version.
