# P10 Acceptance Matrix — Integration Reality Wave

P10 is complete only when every gate below is evidenced by a named passing test on a TL-verified integration SHA (TL re-measures; reported numbers never count). REAL/fixture claims are honestly labeled; deferred scopes are typed and never silent.

## Live-feed ingress (real-local grade) — lane W10-A

- **P10-01** Typed live-source surface: `LiveSourceDescriptor`/`LiveSourcePort`/`LiveFrame`/`LiveIngressRefusal`/`LiveSessionEvidence` are frozen contract names; invalid descriptors fail closed (named test).
- **P10-02** REAL local streaming: a real `node:http` server streams frames at the declared cadence; a real client consumes them; the test asserts real frame content and cadence bounds (labeled real-local).
- **P10-03** Back-pressure law: bounded queue overflow produces a typed `LiveIngressRefusal` retaining partial evidence; no unbounded growth; no silent drops (named test).
- **P10-04** Cancellation honesty: abort closes the source and finalizes the session record with the close reason (named test).
- **P10-05** Live-run pinning: a transform run over a live source pins a `TransformRunManifest` with `LiveSessionEvidence` graded `real-local-live`; the grade never inflates (named test asserting the exact grade string).

## Real model provider — lane W10-B

- **P10-06** Port conformance: `SandboxModelAdapter` satisfies the `TransformModelPort` behavioral contract (the same conformance the fixture adapter proves).
- **P10-07** REAL invocation: at least one test makes a real network model call through the real SDK client; output + latency recorded; the test is labeled real and the grade asserted `real`.
- **P10-08** Outage law: service unavailability/timeout/malformed response each produce typed refusals; no fabricated output; no silent fixture downgrade (named per-refusal tests).
- **P10-09** Honest labels: `providerId`/`evidenceGrade` asserted exactly (`zai:glm-sandbox`, `real`); cost `null` unless service-reported.
- **P10-10** Typed-future documentation exists for payment provider + HF hosting + hosted-preview probe, each stating its seam and that no implementation is claimed.

## Studio mount — lane W10-C

- **P10-11** Composition conformance: the studio composition implements `TransformStudioHostPort` over the real seams — a draft graph REALLY validates through `@sporta/transforms`; listings/review/disclosure read back through `@sporta/marketplace` (named test with real package constructions).
- **P10-12** Admission verbatim: `selectForLaunch` typed refusals surface verbatim through the composition (no second ladder; named refusal test).
- **P10-13** Attachments: app-environment attachments project through the real reads + `appAttachmentViews.ts` (named test).
- **P10-14** Mount: the studio surface is wired into the web app's surface structure and compiles under `tsc -b packages/web`; the honesty law holds (no browser-runtime claim beyond build verification unless a real browser harness exists).

## Cross-lane integration

- **P10-15** Evidence-grade vocabulary: every new surface (live evidence, model evidence, studio host grades) uses the shared honest-grade vocabulary; no grade inflation anywhere (spot-check tests across lanes).
- **P10-16** Vertical slice (real-local + real-model): one test composes a live source through admission into a transform run that includes a REAL model-node invocation (lane B adapter injected through the port), the manifest pinning BOTH real evidence grades. If the sandbox model service is unavailable at audit time, the slice degrades to the deterministic-node variant WITH the typed refusal recorded — never silently.

## Global invariants

- **P10-17** Six gates on the integration SHA: architecture 0/0/0; frozen surfaces intact (growth additive-only); scoped `tsc -b` clean; full battery 0-fail (count recorded); lint 0 errors (warnings ≤ baseline); 400-line cap in sporta package sources.
- **P10-18** No external dependency enters any frozen `sporta-*` package (the SDK lives ONLY in the web host package; named dependency assertion or arch-check evidence).
