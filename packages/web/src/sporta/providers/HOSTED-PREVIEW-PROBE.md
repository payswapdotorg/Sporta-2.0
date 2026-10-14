# HOSTED-PREVIEW-PROBE — Vercel feasibility record (P11 proposal)

Status: **FEASIBILITY RECORD ONLY. NO deployment is performed or claimed by
this lane.** Deploying to the operator's Vercel account is a cost/surface
decision that belongs to the operator's confirmation (the P10 ADR's
non-goals table, verbatim). Recorded by w10b (P10 Lane W10-B), gate P10-10.

## Control-plane reachability as ACTUALLY observed from this sandbox

Measured 2026-10-14T14:30:12Z from this worker's sandbox (curl, 15s cap):

| Probe | Result |
|---|---|
| `https://vercel.com` | HTTP **200** in 0.095s (DNS 0.0016s, TLS 0.019s) |
| `https://api.vercel.com/v2/user` | HTTP **403** in 0.479s (DNS 0.0020s, TLS 0.319s) |
| `https://vercel.com/api/web/telemetry` | HTTP 404 in 0.209s (endpoint exists and routes) |

Reading (honest, labeled by what it is):

- **The Vercel control plane is REACHABLE from this sandbox**: DNS resolves,
  TLS completes, HTTP answers on both the marketing host and the API host.
- **The API answered 403 to an unauthenticated `/v2/user` call.** No Vercel
  token exists in this worker's environment (no `VERCEL_TOKEN`-class env
  vars; no `~/.vercel`) — 403 is the correct unauthenticated answer, NOT an
  outage. This lane makes **no authentication claim of its own**: the ADR
  records that the TL's station token authenticates as the account owner;
  that is the TL's observation at the station, recorded here as cited, not
  re-measured by this worker.

## The P11 proposal (pending operator confirmation — not started)

1. **Target:** the product web app (`packages/web` — a Vite static build).
2. **The honesty constraint that shapes P11:** the headless composition's
   REAL legs are Node-runtime legs (real child processes, FS content-
   addressed blob stores, the REAL model lane over the sandbox-internal SDK
   configuration). A static host serves the BROWSER surface, which already
   carries its honestly-labeled FIXTURE host (the `browserFixtureHost.ts`
   law: the evidence badge reads FIXTURE; no Node leg is claimed in a
   browser bundle). A hosted preview therefore renders the fixture-grade
   browser route by construction — any REAL-grade hosted surface needs a
   Node server host for the composition, which is a separate surface/cost
   decision.
3. **Decision owner:** the operator (account + spend). If confirmed, the
   deploy lane: operator provisions a scoped Vercel token to the station →
   build + deploy of the static web surface → the deployed URL recorded in
   PROJECT-STATE with its honest evidence grade. Until then: nothing.

## What was NOT done by this lane

- No Vercel CLI run, no deploy, no project creation, no token use.
- No build of the web package for hosting purposes (tsc-only verification,
  the W4C precedent on this 4GB box).
- No claim that the preview is live, staged or imminent.

**No deployment is performed or claimed. The operator's confirmation is the
only path that starts P11.**
