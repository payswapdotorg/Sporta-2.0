/**
 * Sporta Desktop preload — minimal, sandbox-safe context bridge.
 * Exposes only product facts (app name/version/platform) for the renderer's
 * optional desktop badge; no node, no IPC surface beyond this.
 */
"use strict";

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("sportaDesktop", {
  isDesktop: true,
  name: "Sporta",
  version: process.env.npm_package_version || "1.0.0",
  platform: process.platform,
});
