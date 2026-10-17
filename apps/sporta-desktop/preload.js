/**
 * Sporta Desktop preload — sandbox-safe context bridges.
 *
 * Two surfaces, both contextIsolation-only (no node in the renderer):
 *   1. `sportaDesktop` — product facts (app name/version/platform) for
 *      the optional desktop badge.
 *   2. `sportaDesktopPorts` (W14) — the REAL composition bridge: every
 *      function is an ipcRenderer.invoke forward into the Electron main
 *      process, where the headless REAL Sporta composition (the W12-D
 *      product composition + the W10A studio composition) runs. Typed
 *      on the web side by `desktopScreenBridge.ts`; values are the
 *      frozen plain-JSON screen-port shapes; thrown typed refusals
 *      propagate as Error messages (surfaced verbatim by the screens).
 */
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sportaDesktop", {
  isDesktop: true,
  name: "Sporta",
  version: process.env.npm_package_version || "1.1.0",
  platform: process.platform,
});

/** The W14 composition channels (main.js COMPOSITION_HANDLERS mirror). */
const BASE = "sporta-desktop";
contextBridge.exposeInMainWorld("sportaDesktopPorts", {
  facts: () => ipcRenderer.invoke(`${BASE}:facts`),
  runsList: () => ipcRenderer.invoke(`${BASE}:runs:list`),
  runsRead: (runManifestId) => ipcRenderer.invoke(`${BASE}:runs:read`, runManifestId),
  libraryList: () => ipcRenderer.invoke(`${BASE}:library:list`),
  libraryRead: (artifactId) => ipcRenderer.invoke(`${BASE}:library:read`, artifactId),
  pipelinesList: (creator) => ipcRenderer.invoke(`${BASE}:pipelines:list`, creator),
  pipelinesStatus: (pipelineId, version) =>
    ipcRenderer.invoke(`${BASE}:pipelines:status`, pipelineId, version),
  appsList: () => ipcRenderer.invoke(`${BASE}:apps:list`),
  appsAudit: (attachmentId) => ipcRenderer.invoke(`${BASE}:apps:audit`, attachmentId),
  appsRevoke: (attachmentId) => ipcRenderer.invoke(`${BASE}:apps:revoke`, attachmentId),
  studioValidate: (draft) => ipcRenderer.invoke(`${BASE}:studio:validate`, draft),
  studioListings: () => ipcRenderer.invoke(`${BASE}:studio:listings`),
  studioReview: (pipelineId, version) =>
    ipcRenderer.invoke(`${BASE}:studio:review`, pipelineId, version),
  studioDisclosure: (listingId) => ipcRenderer.invoke(`${BASE}:studio:disclosure`, listingId),
  studioPreview: (pipelineId, version) =>
    ipcRenderer.invoke(`${BASE}:studio:preview`, pipelineId, version),
  studioApps: () => ipcRenderer.invoke(`${BASE}:studio:apps`),
  studioLaunch: (listingId) => ipcRenderer.invoke(`${BASE}:studio:launch`, listingId),
});
