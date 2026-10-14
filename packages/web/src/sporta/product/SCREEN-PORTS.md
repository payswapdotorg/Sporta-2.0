# SCREEN-PORTS.md — the W11 screen → existing-port map (TL Wave 0 freeze)

The state-owner law (work orders, Wave 0 item 3): workers implement screens
that read/write through the EXISTING ports below. Inventing a parallel state
owner for any of these domains is a lane violation. If a seam is missing,
record it in NEXT DEPENDENCIES — the TL serializes it.

| Screen (SportaScreenId) | Reads / writes through | Existing module |
|---|---|---|
| home | work/intent state + recent runs + outputs needing attention: `SportaHostPort.readState` (the existing host port); run/manifest reads via the studio composition's seam | `packages/web/src/sporta/hostPorts.ts` + `studioComposition.ts` |
| studio | `TransformStudioHostPort` (validateGraph / listings / review / disclosure / admission / attachments / sample preview) — the W10-composed seam | `packages/web/src/sporta/studio/studioPorts.ts` + `studioComposition.ts` |
| marketplace | listing/review/disclosure reads: the marketplace read services (through the studio composition or the `@sporta/marketplace` contract directly) | `@sporta/marketplace/contract` |
| my-pipelines | the creator-side listing/review states (drafts/submitted/approved/suspended) — the same marketplace records filtered by creator | `@sporta/marketplace/contract` |
| runs | run manifests + per-step evidence + typed refusals: `TransformRunManifest` records + the run service reads | `@sporta/transforms/contract` |
| library | artifact revisions + lineage: the artifact fabric reads through the existing ports | `@sporta/artifacts/contract` |
| connected-apps | attachments + grants + audit + revocation: the app-environment reads | `@sporta/app-environments/contract` |

Evidence grades (UI-15) flow VERBATIM from these seams into each screen's
`SportaScreenEvidenceGrade` reporting — never inflated, fixture labeled.

## Browser harness (Wave 0 item 4 — the TL decision)

Playwright is the approved browser harness (the smallest maintainable choice:
the station already runs Playwright chromium; the workers add tests under
`packages/web/test/sporta-product-ui/**` with `@playwright/test` as a WEB
dev-dependency — TL-serialized in the Wave 0 freeze commit; the lockfile
change is the TL's, workers never touch manifests).

The E2E entry: the tests boot the web dev server (or a static preview) and
drive the real /sporta route at 1440x900 and 390x844 (UI-16/UI-17). The
harness bootstrap (a passing smoke test proving the route loads through the
real entrypoint) is part of the freeze evidence.

## Visual acceptance review (Wave 0 item 5)

The reviewer protocol: the TL captures desktop + mobile screenshots at the
integration SHA, attaches them to the review record
(`docs/implementation/w11-review-evidence.md` at integration time), and the
operator/product owner inspects them — CI green alone never satisfies
UI-17.
