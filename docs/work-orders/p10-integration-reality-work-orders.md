# P10 Work Orders — Integration Reality Wave

Baseline: `92ef338` (P9-complete). ADR: `docs/architecture/adr-p10-integration-reality.md`.
Cadence: TL freezes the contract surface (Wave 0) → workers deliver on lanes → TL verifies every gate at the integration station (re-measured, never trusted) → serial merge A→B→C → acceptance audit.

The standing laws apply verbatim: SPEC-first (the SPEC section of each packet is the worker's first commit); additive-only (frozen surfaces grow, never shrink); honest evidence (every REAL/fixture claim labeled by what it actually is); 400-line file cap; domain/app/adapters layer law; workers own ONLY their listed roots; shared seams go through the TL.

---

## Lane W10-A — Live-feed ingress at the real-local grade (owner: worker A)

**Roots owned:** `packages/sporta-transforms/**` ONLY.

**Scope:**
1. Freeze additions (contract.ts, TL-seeded in Wave 0; worker extends tests): `LiveSourceDescriptor`, `LiveSourcePort`, `LiveFrame`, `LiveIngressRefusal`, `LiveSessionEvidence` — minimal, typed, fail-closed.
2. `RealLocalHttpLiveSourceAdapter` in `src/adapters/` (node built-ins ONLY — `node:http`; no external deps ever in this package): a REAL streaming server (chunked text frames at a declared cadence) + REAL client consumption with a bounded frame queue.
3. Back-pressure law (ADR rule 16): bounded queue; overflow → typed `LiveIngressRefusal` retaining partial evidence; no unbounded blocking; no silent frame drops.
4. Run integration: a transform run may declare a live source; the produced `TransformRunManifest` pins live-session evidence (`LiveSessionEvidence`) with grade `real-local-live` — never "production".
5. Honest cancellation: abort closes the server, finalizes the session record with the close reason.

**Tests (named, real):** real server+client frame flow; bounded-queue overflow refusal; cancellation; manifest pinning with live evidence; evidence-grade label assertions.

**Out of scope:** production CDN/streaming protocols (SRT/RTP/WebRTC); marketplace changes; web changes.

---

## Lane W10-B — Real model provider lane + typed-future documentation (owner: worker B)

**Roots owned:** `packages/web/src/sporta/providers/**` (new root) + its `package.json`/tsconfig wiring ONLY.

**Scope:**
1. `SandboxModelAdapter` implementing `TransformModelPort` (`@sporta/transforms/contract`) over `z-ai-web-dev-sdk` (add as a dependency of the WEB package only — the frozen transforms package stays external-dep-free):
   - `providerId: "zai:glm-sandbox"`, `evidenceGrade: "real"`, label `real sandbox model service`.
   - Real chat-completion invocation; real recorded latency; cost honestly `null` unless the service reports one.
   - Typed refusals (existing `TransformModelRefusalKind` set or an additive kind if the contract defines one): service unreachable, timeout, malformed response, content refusal. Outage NEVER fabricates output and NEVER silently becomes fixture (ADR rule 14).
   - Deps injection: the SDK client is injected (constructor deps), tests may inject a recording client for the refusal lanes; at least ONE test makes a REAL network invocation through the real SDK and is labeled as such.
2. Typed-future documentation files (in the lane root): `PAYMENT-TYPED-FUTURE.md` — the operator key request for a real payment provider (the `SettlementPort` seam exists; fixture settlement stays until keys exist); `HF-TYPED-FUTURE.md` — the operator token request for Hugging Face weight hosting. Both documents state the exact port each would implement and that no implementation is claimed.
3. The Vercel feasibility record: `HOSTED-PREVIEW-PROBE.md` recording the probed control-plane reachability and the P11 proposal (deploy belongs to the operator's confirmation; no deployment is performed).

**Tests:** port conformance (matches the fixture adapter's behavioral contract); real-invocation test (network, labeled real); each typed-refusal lane; latency recorded; provider id/grade label assertions.

**Out of scope:** transforms package edits; marketplace edits; studio composition (lane C).

---

## Lane W10-C — Studio mount + host composition (owner: worker C)

**Roots owned:** `packages/web/src/sporta/studio/**` + `packages/web/src/sporta/composition-studio.ts` (new) + the minimal boot/surface wiring points needed to mount the studio (each such edit listed in the delivery report) ONLY.

**Scope:**
1. Implement `TransformStudioHostPort` (the W9C type-only seam) over the REAL seams in a new composition module:
   - `validateGraph` → `@sporta/transforms` `validateTransformPipelineManifest` (+ the declared-envelope completion documented in the studio README);
   - `listListings` / `readReviewStatus` / `readLaunchDisclosure` → `@sporta/marketplace` read services;
   - `selectForLaunch` → the marketplace admission service (typed result surfaced VERBATIM — no second ladder);
   - `listAppAttachments` → `@sporta/app-environments` reads projected through `appAttachmentViews.ts`.
2. Mount the studio: wire `TransformStudio.tsx` into the web app's surface/route structure (the mount point follows the existing boot/surface pattern; the surface law of the app is respected — no second authority).
3. Evidence-grade surfacing: the composition carries real vs fixture grades from the seams verbatim into the studio's host-reported grades (ADR rule 15).
4. The composition may construct a REAL in-memory wiring for dev/demo (registry, listings, a real validated draft graph) — everything through the real package constructors, no mock vocabulary.

**Tests:** composition conformance over real seams (a draft graph really validates; a listing really reads back; admission refusals surface typed); mount wiring compiles under the web tsconfig (`tsc -b packages/web`) and the studio surface renders through the host port (a host-port-level test is acceptable where no browser harness exists — NO browser claim is made beyond build verification, same honesty law as W9C).

**Out of scope:** providers (lane B); transforms (lane A); any marketplace/app-environments package edit.

---

## Operator key requests (recorded, not blocking P10 code lanes)

- Real payment provider: operator provisions provider credentials → a future lane implements `SettlementPort` for real settlement.
- Hugging Face: operator provisions an HF token → a future lane hosts pinned weights on HF per the storage doctrine.
- Hosted preview (P11 proposal): operator confirms deploying to their Vercel account (feasibility probed and recorded by lane B).


---

## W11 follow-up — Sporta-native product UI (separate workstream)

P10-C proves the Studio host composition and mount seam. It does **not** prove that the full user-facing application is product-native or visually complete. The user-facing product UI work is assigned by docs/work-orders/sporta-native-ui-work-orders.md and is gated by docs/testing/sporta-native-ui-acceptance.md. It must use the current main/W10 integration base, not the older pre-W10 P9 branch.
