/**
 * Sporta Desktop — the Sporta product as a native Ubuntu desktop app.
 *
 * LAWS (the operator directive this app exists to satisfy):
 *   1. The app IS the product: it mounts the Sporta product UI (the
 *      packages/web `/sporta` route — Home, Studio workbench, Marketplace,
 *      Runs, Library, Connected Apps) exactly as the web product ships it.
 *   2. The app is NEVER ZCode: the ZCode substrate surface (workspace IDE,
 *      auth, share pages) lives at other routes of the same SPA and is
 *      hard-blocked here — the window can only ever render `/sporta`.
 *   3. The product UI is a client-side bundle: REAL domain code runs in the
 *      renderer with the honestly-labeled browser demo hosts (fixture-labeled
 *      data — the same honesty law as the web product; nothing is faked as
 *      production-live).
 *
 * MECHANICS: Electron main starts a loopback-only static file server over the
 * staged `renderer/` bundle (packaged under resources/), then opens one
 * window at `http://127.0.0.1:<port>/sporta`. No remote origins are loaded,
 * ever; external links open in the system browser.
 */
"use strict";

const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

// Robustness: chromium shared-memory fallback (also correct on real desktops —
// a no-op there; prevents the GPU-process death loop in low-/dev/shm
// environments such as containers and CI runners).
app.commandLine.appendSwitch("disable-dev-shm-usage");

/** The only route this app may render (the product route from sportaRoute.ts). */
const PRODUCT_ROUTE = "/sporta";
const PRODUCT_ROUTE_CN = "/cn/sporta";
/** Sporta brand constants (product theme tokens — theme.css). */
const SPORTA_BG = "#0c1210";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
};

/** Renderer bundle root: `renderer/` next to this file in dev, under resources/ when packaged. */
function resolveRendererRoot() {
  const candidates = [
    path.join(__dirname, "renderer"),
    path.join(process.resourcesPath, "renderer"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "index.html"))) return candidate;
  }
  throw new Error(
    "Sporta Desktop: staged product bundle not found (run scripts/build-desktop.sh to stage packages/web dist into renderer/).",
  );
}

/**
 * Loopback static server. PRODUCT-ONLY:
 *   - `/` redirects to the product route;
 *   - the product route serves the SPA shell (index.html);
 *   - static assets resolve under the bundle root;
 *   - anything else is a 404 — NEVER a SPA fallback, so no other route of
 *     the bundle (the ZCode surface) can be entered accidentally.
 */
function createProductServer(root) {
  const server = http.createServer((req, res) => {
    try {
      const requestUrl = new URL(req.url, "http://127.0.0.1");
      let pathname = decodeURIComponent(requestUrl.pathname);
      if (pathname === "/") {
        res.writeHead(302, { Location: PRODUCT_ROUTE });
        res.end();
        return;
      }
      if (pathname === PRODUCT_ROUTE || pathname === PRODUCT_ROUTE_CN) {
        pathname = "/index.html";
      }
      const relative = path.posix.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
      const file = path.join(root, relative);
      if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found (Sporta Desktop serves the product route only).");
        return;
      }
      const contentType = MIME_TYPES[path.extname(file).toLowerCase()];
      res.writeHead(200, {
        "Content-Type": contentType || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      fs.createReadStream(file).pipe(res);
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Sporta Desktop server error: ${error && error.message}`);
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

/** The product-only navigation guard (LAW 2). Nothing but the product route may render. */
function isProductPath(pathname) {
  return pathname === PRODUCT_ROUTE || pathname === PRODUCT_ROUTE_CN;
}

function installProductOnlyGuard(win, origin) {
  win.webContents.on("will-navigate", (event, target) => {
    const targetUrl = new URL(target);
    if (targetUrl.origin !== origin) {
      event.preventDefault();
      void shell.openExternal(target);
      return;
    }
    if (!isProductPath(targetUrl.pathname)) {
      // Internal, non-product: block and keep the window on the product route.
      event.preventDefault();
      win.webContents.loadURL(`${origin}${PRODUCT_ROUTE}`);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
}

function createProductWindow(origin) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 480,
    minHeight: 640,
    backgroundColor: SPORTA_BG,
    title: "Sporta",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  win.removeMenu();
  win.once("ready-to-show", () => win.show());
  installProductOnlyGuard(win, origin);
  void win.loadURL(`${origin}${PRODUCT_ROUTE}`);
  return win;
}

/**
 * W14 — the REAL composition behind the desktop window.
 *
 * The headless REAL Sporta composition (the W12-D product composition +
 * the W10A studio composition, demo seeds through REAL lifecycles) runs
 * HERE in the Electron main process (Node). The renderer reaches it ONLY
 * through the preload IPC bridge (`sportaDesktopPorts`), typed by
 * packages/web `desktopScreenBridge.ts`. A composition boot failure
 * degrades honestly: every channel rejects, the renderer's bridge probe
 * fails, and the mount falls back to the labeled browser fixture hosts —
 * never a fake half-real state.
 */
const COMPOSITION_CHANNEL_BASE = "sporta-desktop";
const COMPOSITION_HANDLERS = {
  facts: (c) => c.facts,
  "runs:list": (c) => c.runs.listRuns(),
  "runs:read": (c, runManifestId) => c.runs.readRun(runManifestId),
  "library:list": (c) => c.library.listArtifacts(),
  "library:read": (c, artifactId) => c.library.readArtifact(artifactId),
  "pipelines:list": (c, creator) => c.myPipelines.listCreatorRecords(creator),
  "pipelines:status": (c, pipelineId, version) =>
    c.myPipelines.readCreatorVersionStatus(pipelineId, version),
  "apps:list": (c) => c.connectedApps.listAttachments(),
  "apps:audit": (c, attachmentId) => c.connectedApps.readAuditTrail(attachmentId),
  "apps:revoke": (c, attachmentId) => c.connectedApps.revoke(attachmentId),
  "studio:validate": (c, draft) => c.studio.validateGraph(draft),
  "studio:listings": (c) => c.studio.listListings(),
  "studio:review": (c, pipelineId, version) => c.studio.readReviewStatus(pipelineId, version),
  "studio:disclosure": (c, listingId) => c.studio.readLaunchDisclosure(listingId),
  "studio:preview": (c, pipelineId, version) => c.studio.readSamplePreview(pipelineId, version),
  "studio:apps": (c) => c.studio.listAppAttachments(),
  "studio:launch": (c, listingId) => c.studio.selectForLaunch(listingId),
};

/**
 * The node wrapper for the REAL child-process legs (the deterministic
 * trim runs spawn an isolated child on real pipes with an EMPTY env).
 * The packaged app has no `node` on PATH — but the Electron binary IS
 * node with `ELECTRON_RUN_AS_NODE=1`. The wrapper is an absolute-path
 * /bin/sh script (no PATH needed): set the flag, exec the binary. The
 * child laws are unchanged: real pipes, real exit codes, empty env.
 */
function ensureNodeWrapper() {
  const wrapper = path.join(app.getPath("userData"), "node-wrapper.sh");
  fs.writeFileSync(
    wrapper,
    `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${process.execPath}" "$@"\n`,
    { mode: 0o755 },
  );
  return wrapper;
}

let compositionPromise = null;
function bootComposition() {
  if (compositionPromise) return compositionPromise;
  const nodeExecutable = ensureNodeWrapper();
  const { createSportaDesktopComposition } = require("./composition/composition.cjs");
  compositionPromise = createSportaDesktopComposition({
    blobRoot: path.join(app.getPath("userData"), "sporta-store"),
    nodeExecutable,
  });
  // Observed here so an unused composition never surfaces as an
  // unhandled rejection; per-channel awaits re-throw it honestly.
  compositionPromise.catch((error) => {
    console.error("[sporta-desktop] composition boot failed:", error && error.message);
  });
  return compositionPromise;
}

function installCompositionChannels() {
  for (const [name, call] of Object.entries(COMPOSITION_HANDLERS)) {
    ipcMain.handle(`${COMPOSITION_CHANNEL_BASE}:${name}`, async (_event, ...args) => {
      const composition = await bootComposition();
      return call(composition, ...args);
    });
  }
}

async function main() {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }
  app.on("second-instance", () => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  Menu.setApplicationMenu(null);
  installCompositionChannels();
  await app.whenReady();

  const rendererRoot = resolveRendererRoot();
  const server = await createProductServer(rendererRoot);
  const origin = `http://127.0.0.1:${server.address().port}`;
  createProductWindow(origin);

  // Best-effort honest teardown: dispose the composition (the studio
  // safe-stop) when the app quits. Fire-and-forget with an observation
  // catch — quit must never hang on the store roots (the FS blob store
  // holds no handles; the studio dispose never outruns its seeding).
  app.on("before-quit", () => {
    if (compositionPromise) {
      compositionPromise
        .then((composition) => composition.dispose())
        .catch((error) => {
          console.error("[sporta-desktop] composition dispose failed:", error && error.message);
        });
    }
  });

  app.on("window-all-closed", () => {
    server.close();
    app.quit();
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createProductWindow(origin);
  });
}

void main();
