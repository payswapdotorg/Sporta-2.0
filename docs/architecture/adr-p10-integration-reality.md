# Accepted Architecture Change — P10 Integration Reality Wave

**Status:** ACCEPTED FOR IMPLEMENTATION — post-P9 deferred-scope realization  
**Date:** 2026-10-14  
**Baseline:** Sporta 2.0 P9-complete release SHA `92ef338` (P0–P8 baseline `1be9b6f` + P9 design `ab76ee1` + freeze `bee069b` + lanes `a4715db`/`b97503d`/`81ae034` + audit records)  
**Trigger:** Operator directive 2026-10-14 — "continue with the rest of the roadmap". The roadmap authority (`docs/roadmap/sporta-roadmap.md` + `docs/PROJECT-STATE.md`) declares P0–P9 complete; the formal "rest" is the P9 audit's deferred-and-typed list. P10 realizes the exercisable subset and documents the operator-credential-gated remainder.

## Decision

Realize the deferred scopes that this environment can exercise honestly, in three code-real lanes:

1. **Studio mount (the W9C "TL seam").** Implement `TransformStudioHostPort` over the real seams (`@sporta/transforms` validation, `@sporta/marketplace` listing/review/disclosure/admission, `@sporta/app-environments` attachments) and mount the Transform Studio surface into the product web app's surface wiring. The studio stops being a build-verified-only surface and becomes a mounted, composed, host-driven surface.

2. **Live-feed ingress at the REAL-local grade.** A frozen `LiveSourcePort` in `sporta-transforms`: a real local HTTP streaming source (real server, real frames, real client with bounded back-pressure) feeding transform runs. Live-session runs pin their `TransformRunManifest` with live-source evidence. **Honest label law:** the real lane is "real-local-live" — a real streaming source over real localhost HTTP — and never claims production CDN/ingress reality.

3. **Real model provider lane.** A real adapter implementing the existing `TransformModelPort` over the sandbox's model service (z-ai-web-dev-sdk chat completions, reachable and resolvable at v0.0.18 from this environment). Real calls, real recorded latency, `evidenceGrade: "real"`, typed refusals on service unavailability (the provider rule: outage is a typed refusal, never a semantic failure). **Honest label law:** "real sandbox model service" — the adapter labels its provider truthfully and never claims a public commercial provider.

## Non-goals and the operator-key gate

The following deferred scopes stay **typed-future** and are NOT claimed by P10. Each is blocked on operator-provisioned credentials, documented in the work orders, and implemented as typed ports with explicit refusals — never as silent stubs or fake evidence:

| Deferred scope | Blocker | P10 action |
|---|---|---|
| Real payment provider settlement | No payment-provider credentials exist in the station vault | `SettlementPort` stays fixture-settled; the work orders record the operator key request |
| Hugging Face weight hosting | No HF token exists in the station vault | Pinned dependency weights stay digest-referenced; HF hosting stays typed-future |
| Production live-source/CDN ingress | No production source credentials/contract | The real-local-live lane is the exercisable grade; production ingress stays typed |
| Hosted deployment (Vercel/Neon/R2 preview target) | Feasibility PROBED and recorded (the Vercel control plane is reachable and the station token authenticates as the account owner); deploying to the operator's account is a cost/surface decision that belongs to the operator | Proposed as P11 pending operator confirmation; NOT silently started |

## Product rules (delta on the P9 rules)

13. **Real lanes are labeled by what they are.** A real lane's evidence grade names the actual service exercised ("real-local-live", "real sandbox model service"). No real lane inflates its grade; no fixture lane borrows the word real.
14. **Outage is typed refusal.** A real adapter's service becoming unreachable produces a typed refusal carrying the failure class. It never fabricates output, never silently downgrades to fixture, and never corrupts the run manifest. Falling back to a fixture lane is an explicit caller policy recorded in the run evidence, not an adapter behavior.
15. **The mount is composition, not duplication.** The studio mount implements the existing type-only host port over the existing package seams. It creates no second marketplace authority, no second admission ladder, no second evidence vocabulary.
16. **Live is bounded.** A live-source run declares frame bounds and back-pressure behavior up front; overflow is a typed refusal with the partial evidence retained. A live run never blocks unboundedly and never drops frames silently.

## Authority map (delta)

| Concern | Authority |
|---|---|
| Live source port + real local streaming adapter | `sporta-transforms` (port frozen in contract; adapter package-local, node built-ins only) |
| Real model provider adapter | `packages/web/src/sporta/providers` (host layer — the frozen `sporta-transforms` package stays external-dep-free; the adapter implements `TransformModelPort` and is injected by host composition) |
| Studio host port composition + mount | `packages/web/src/sporta` composition/boot wiring (the W9C-documented TL seam) |
| Payment settlement, HF hosting, production ingress, hosted preview | Typed-future ports/proposals; operator-credential-gated |

## End-to-end flows (delta)

### Live launch (real-local grade)

```text
approved listing -> launch disclosure -> admission (existing 7-step ladder)
 -> LiveSourcePort session (real local HTTP stream, bounded)
 -> transform run (deterministic + optional real-model nodes)
 -> TransformRunManifest pinned with live-session evidence + honest grades
```

### Mounted studio

```text
web app surface wiring -> studio composition (TransformStudioHostPort)
 -> real seams: validateGraph / listings / review / disclosure / admission / attachments
 -> studio renders real state with evidence grades surfaced verbatim
```

## Acceptance

P10 is complete when the dedicated acceptance matrix (`docs/testing/p10-acceptance.md`) passes on a TL-verified integration SHA, under the same laws as P9: all gates evidenced by named passing tests, every REAL/fixture claim honestly labeled, deferred scopes typed and never silent.
