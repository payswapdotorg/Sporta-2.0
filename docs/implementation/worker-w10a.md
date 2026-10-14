# Worker W10A Implementation Report

Worker: w10a (Wave 10, Worker A lane — P9+ Studio composition seam)

Status: WAVE 10 WORKER A IMPLEMENTED (branch wave10/worker-a, commits 2ceac43 spec → implementation commit (this wave's code + tests) → this report as the branch HEAD rider).

Scope: mounting the Transform Studio into the product host — the ONE seam W9C intentionally left unwired (its README said so verbatim). After this wave a user opening the product host SEES the studio: pipeline-graph building with typed validation, marketplace listings + review status, the launch disclosure, attached apps with permission/data-scope disclosure, and pipeline selection for feed launch through the fail-closed admission. Zero edits to any sporta-* package, zero frozen-contract edits, zero manifest/lockfile edits.

## WORK ITEMS

- W10A-1 — `createStudioHostComposition` (studioComposition.ts + its seed module studioSeeds.ts): the HEADLESS REAL seam implementation of `TransformStudioHostPort` (`evidence: "real"`):
  - `validateGraph(draft)` — maps the studio draft (nodes/edges) 1:1 onto `TransformNode`/edge fields through `studioSeeds.studioDraftManifest`; the composition adds ONLY the declared envelopes the manifest requires (draft identity + a REAL sha-256 draft digest, safe sandbox posture `process/denied/no-host-secrets`, bounded resources, fail-closed error behavior, the operator `SPORTA_HOST_POLICY`); calls the REAL `validateTransformPipelineManifest` and returns its typed result VERBATIM (per-violation records; valid → node/edge counts). Never stringly errors.
  - `listListings()` / `readReviewStatus()` / `readLaunchDisclosure()` — REAL `@sporta/marketplace` read paths: listings are seeded through the REAL SubmissionService (draft → submit → clean automated gates) → ReviewService (3-role human approval) → ListingService (PUBLISHED; a second listing seeded then honestly SUSPENDED through the real suspension law); reads go through the real store ports and project through `marketplaceViews.ts` (publisher, approved version, terms/price, rights prerequisites, outputs, limitations, evidence grade). Typed errors (unknown listing / unresolvable manifest) PROPAGATE — a disconnected read is never reported successful.
  - `selectForLaunch(listingId)` — the REAL `FeedLaunchAdmissionService.selectForLaunch` fail-closed admission; the typed result surfaces VERBATIM (admitted pins the entitlement's approved digest; every refusal carries its frozen reason + detail). The operator rights snapshot is the host's wiring-time declaration (the `UsageDeclaredEditorHistory` precedent — labeled; the GATE stays real): absent config ⇒ admission runs WITHOUT a snapshot and refuses typed `rights-prerequisites-unsatisfied` (P9-14) — never softened.
  - `readSamplePreview(pipelineId, version)` — the sample-preview seam: a REAL `TransformRunService` run of the seeded trim pipeline over the declared sample feed — REAL deterministic-filter CHILD PROCESS (real spawn on real pipes, real temp dir, empty env), REAL content-addressed FS blob writes (through a pure hash-format bridge: the transforms `sha256:<hex>` form over the W4-C FS store's bare-hex sharding; both hashes are real sha-256 over the same bytes and the run service's fail-closed drift check still compares real values), REAL artifact revisions + WorkGraph reconciliation, pinning the APPROVED release digest; projected through `samplePreview.ts` (grade "measured": carry-forward re-verified in-process, 3 kept byte-exact / 2 dropped). Unknown pipeline/version ⇒ honest null.
  - `listAppAttachments()` — REAL `@sporta/app-environments` reads through the real `ApplicationEnvironmentService` (real descriptor validation + catalog-stability + scoped-grant construction; attachments seeded through the real `consentToAttach` → `grantLearningConsent` → `revokeAttachment` paths), projected through `appAttachmentViews.ts`: granted vs NOT-granted classes side by side, the separate learning consent (scope + retention), data scope, network posture, licensing, revocation state.
  - `dispose()` — awaits seeding so dispose never outruns it; no composition-owned long-lived resource (the sample-run child process is scoped to its call and cleans its own temp dir).
  - Seeding is async and fail-honest: every port call awaits the seeding promise; a seeding failure surfaces as a typed rejection on the port, never a faked success.
- W10A-2 — the product-host mount:
  - `SportaPanel.tsx` — mounts the "Transform Studio" section rendering `TransformStudio.tsx` through the INJECTED studio port (new required `studio` prop; the panel's existing render law: it renders whatever the host reports, evidence badge included). The stage trace and both existing write paths stay intact — the studio is additive surface, not a replacement.
  - `composition.ts` — the W4C-3 composition root constructs and exposes `studioHost` (additive field on `SportaHostComposition`) via `createOperatorStudioHostComposition(config.blobRoot)` (the operator-defaults convenience); dispose tears the studio down alongside the runtime. `boot/boot.ts` — the W7C-2 local boot exposes the same additive `studioHost` over its durable blob root.
  - `studioBrowserFixture.ts` — the honestly-labeled FIXTURE studio host for the browser route (the `browserFixtureHost.ts` law): imports ONLY types (erased at build; no Node dependency enters the bundle); realistic static snapshots (2 listings incl. one honestly SUSPENDED, a 3-role review, the full disclosure with dependencies + the fixed legal notice, a fixture sample preview, 2 app attachments incl. one honestly revoked); a small pure FIXTURE graph-check mirroring the violation-kind vocabulary (labeled — never the authority); the write path returns honestly-typed FIXTURE admission results (suspended ⇒ typed `suspended` refusal; published ⇒ admits its FIXTURE digest) — all labeled by the evidence badge the UI renders from `host.evidence`.
  - `main.tsx` — the /sporta browser route injects the studio fixture host alongside the existing fixture host (see DEVIATIONS for why the route edit lives here and not boot.ts).
  - `sportaPanel.css` — additive tail only: the studio mount wrapper + the nested-studio sizing reset.
- W10A-3 — REAL tests (below) + the SPEC-first README append (commit 2ceac43, BEFORE implementation) closing the seam section.

## CHANGED FILES

All inside the owned boundary `packages/web/` (src/sporta/**, test/, main.tsx) + this report. ZERO edits to any `packages/sporta-*` source, zero frozen-contract edits, zero manifest/lockfile edits.

- packages/web/src/sporta/studioComposition.ts (NEW, 365 lines)
- packages/web/src/sporta/studioSeeds.ts (NEW, 178 lines — see DEVIATIONS 1)
- packages/web/src/sporta/studioBrowserFixture.ts (NEW, 280 lines)
- packages/web/test/studioComposition.test.ts (NEW, 411 lines)
- packages/web/src/sporta/composition.ts (M, additive `studioHost` field + wiring; import-block compaction is formatting-only — see DEVIATIONS 3; 395 lines)
- packages/web/src/sporta/boot/boot.ts (M, additive `studioHost` surface + dispose ordering; 301 lines)
- packages/web/src/sporta/SportaPanel.tsx (M, the studio section + injected port; 233 lines)
- packages/web/src/main.tsx (M, 2 effective lines: the studio-fixture import + the injected prop — see DEVIATIONS 2)
- packages/web/src/sporta/sportaPanel.css (M, additive tail only)
- packages/web/src/sporta/studio/README.md (M, the SPEC-first Wave-10 section; spec commit 2ceac43 + the studioSeeds refinement)
- NOT committed (gitignored by law): packages/web/node_modules/@sporta/{transforms,marketplace,app-environments} — the 3 NEW transitional symlinks (the W4-C bridge law; see NEXT DEPENDENCIES).

## TESTS

Runner: `pnpm exec tsx --test` (node:test + node:assert/strict — the project law; no new framework, no browser harness claimed). 8 new tests, all passing, deterministic (pinned clock), real temp dirs with clean teardown.

- packages/web/test/studioComposition.test.ts (8):
  1. valid draft round-trip: 2 nodes + 1 edge through the REAL validator ⇒ `{valid: true, nodeCount: 2, edgeCount: 1}`; `evidence === "real"`.
  2. invalid draft VERBATIM: duplicate-node / unknown-node / unpinned-component (moving tag `"latest"` AND malformed digest) / type-mismatch — each asserted against the REAL validator's own detail strings; no stringly errors.
  3. marketplace reads: both seeded listings; the PUBLISHED one carries publisher/version/free-offer/price-line/grade-FIXTURE/rights/outputs/limitations; the suspended one stays honestly SUSPENDED; review status (approved, roles `product+rights+security`, policy version, automated checks present); unknown pipeline ⇒ honest null; disclosure digest byte-equality with the listing; dependencies (`json-event-stream-trim`); the fixed legal notice; unknown-listing disclosure REJECTS typed (`/no listing list:unknown/`).
  4. launch admission: admitted case (byte-equality listing → disclosure → admission; entitlement id); typed refusals VERBATIM — suspended listing (with an entitlement ON RECORD: P9-10 suspension blocks new runs), no-rights composition (`rights-prerequisites-unsatisfied`, detail carries the frozen `never "safe because it looks different"` wording), unknown listing (`listing-not-published`).
  5. app attachments: 3 states — observe-only (not-granted `control`; `grantsMutation === false`; learning NOT granted), observe+control (learning consent granted with its own scope+retention; full 2-capability catalog), revoked (`permissionSummary` begins `revoked (was: observe)`); data-scope and network lines through the pure view-model.
  6. sample preview REAL run: grade "measured"; semantic evidence `3 kept byte-exact, 2 dropped`; 1 output revision; ≥1 REAL content-addressed blob file on the REAL FS; memoized idempotence (second call deep-equal); honest null for the suspended pipeline + unknown version.
  7. composition-root mount: `createSportaHost` (real spawn stand-in + real localhost HTTP arena, the sportaHost.test.ts evidence class) exposes `studioHost` with REAL evidence; the W4C host surface is intact (openIntent → readState REAL); the studio lists + admits through the operator-declared rights.
  8. browser fixture host: evidence "fixture"; typed suspended/unknown refusals + fixture admission; typed fixture graph checks; revoked attachment stays revoked; the disclosure carries the fixed legal notice.

## REAL EVIDENCE (commands and numbers measured on THIS sandbox, base 92ef338)

- Architecture: `node scripts/architecture/architecture-check.mjs check` → `architecture: OK / violations: 0 / baseline: 0 / new: 0` (exit 0).
- Surface: `node scripts/architecture/sporta-surface-check.mjs` → `OK — frozen surfaces intact, growth is additive-only` (identical per-module counts to base — my wave adds ZERO sporta-side names; all changes live in packages/web).
- Typecheck: `pnpm exec tsc -b packages/web` → exit 0, no output (the studio files compile inside the web program through the symlinks).
- New tests: `pnpm exec tsx --test packages/web/test/studioComposition.test.ts` → 8 pass / 0 fail. REAL legs printed by the tests themselves: the sample-preview run is a REAL deterministic-filter child process with in-process carry-forward re-verification (`3 kept byte-exact, 2 dropped`), ≥1 real content-addressed blob file on the real FS (temp-dir, stat-verified via file counting, clean teardown), grade `measured`; the admitted digest is byte-equal across listing → disclosure → admission (`sha256:4df0d623d54f…` at the pinned seed clock).
- Web tests: `pnpm exec tsx --test packages/web/test/*.test.ts` → 11 pass / 0 fail (3 baseline + 8 new).
- FULL battery: `pnpm exec tsx --test packages/sporta-*/test/*.test.ts packages/web/test/*.test.ts` → **860 pass / 0 fail / 0 skipped** (base on this sandbox: 849 sporta-side + 3 web-side; my wave adds 8 — see DEVIATIONS 4 for the 850-vs-849 baseline note).
- Lint: `pnpm run lint` → **0 errors, 70 warnings** — identical to the base baseline (my files add zero; two transient unused-import warnings in the new test were found and removed before commit).
- Build: `pnpm --filter @zcode/web build` → **exit 137 ×3 attempts (bare, --max-old-space-size=3328, --max-old-space-size=3600 + tuned GC), each Killed by the kernel OOM after `7752 modules transformed`** (base measured the SAME failure on this sandbox at 7741 modules — exit 137 ×2; the wave-4 worker documented the identical cgroup limit and the TL accepted it as the ADR-anticipated sandbox limit). The +11 module delta proves the studio surfaces (TransformStudio + 4 tabs + the fixture host + the panel mount) enter the browser bundle graph and pass the transform phase; the full render-phase build is PENDING-station. The BUILD-VERIFIED law is therefore satisfied the honest way: **typed build-verified via `tsc -b packages/web` (exit 0)** — never browser-tested; no browser harness exists in this repo and none is claimed (the SportaPanel evidence class, verbatim).

## FIXTURE EVIDENCE (labeled)

- The in-memory marketplace/app-environment/work stores behind the REAL services (the packages' own labeled FIXTURE adapters — same honesty split as composition.ts's in-memory work/organization/preference/session stores).
- The seed CONTENT (studioSeeds.ts): the sample pipeline manifest (its trim node's digest IS the REAL `json-event-stream-trim` component digest, so the sample run executes the real component), the sample feed bytes, the tag-board descriptor, the reviewers/publishers — the hostSeeds.ts precedent (fixture data carried by REAL legs).
- The fixture model adapter in the run service (never invoked — the seeded pipeline is purely deterministic; labeled in code).
- The `StudioFixtureProbe` at app-attach seed time (real `consentToAttach` probe seam, fixture target — the REAL app-action lane is owned and evidenced by the app-environments battery + the P9-23 vertical slice; the studio owns no app-action path and its `invoke` is an honest typed failure).
- The browser fixture studio host (static snapshots, labeled IN the UI via the evidence badge; its admission/graph results are typed FIXTURE results, never claimed real).
- The scripted Arena role + the stand-in CLI executable in the composition-root test (the sportaHost.test.ts fixture class, unchanged).

## CONTRACT CHANGES (surface, verified by sporta-surface-check)

- ZERO. No `packages/sporta-*` file was touched; the per-module frozen/additive counts are identical to base. The frozen `TransformStudioHostPort` surface (studioPorts.ts) is implemented, not changed.
- `@zcode/web` additive-only: NEW public names `createStudioHostComposition`, `createOperatorStudioHostComposition`, `StudioHostCompositionConfig`, `StudioHostComposition` (studioComposition.ts), the studioSeeds exports, and `createStudioBrowserFixtureHost` (studioBrowserFixture.ts); `SportaHostComposition`/`SportaLocalBoot` gain the additive `studioHost` field; `SportaPanel` gains the `studio` prop. No existing name changed.

## RIGHTS-PROVENANCE

- The fail-closed admission law (P9-14) is preserved END-TO-END through the studio: the operator rights snapshot is a wiring-time DECLARATION (the UsageDeclaredEditorHistory precedent — the host declares the operator's context; the GATE is the real `rightsPrerequisitesSatisfied`), and an absent declaration refuses typed — the studio never infers rights safety from appearance, never softens a denial, and surfaces the frozen refusal detail verbatim.
- Digest lineage: the sample run pins the APPROVED release digest (byte-equality decision → listing → entitlement → run, asserted in the tests); the draft manifest carries a REAL sha-256 of the draft content as an identity — explicitly labeled UNREVIEWED-DRAFT, never presented as a reviewed release.
- The launch disclosure carries the fixed legal notice (similarity is never clearance) and the pinned dependencies — projected from the reviewed manifest, never hidden.
- `SPORTA_HOST_POLICY` propagates through the seeded manifests/descriptors (PolicySet propagation law); drafted nodes get the safe sandbox envelope (process / network denied / no host secrets / bounded resources).
- App attachments display granted vs NOT-granted classes side by side (capability-class independence, lock 30) and the separate learning consent (lock 31) — observation never implies mutation; attaching alone never learns.

## PERFORMANCE

- studioComposition.test.ts: 8 tests, ~95ms total wall (including ONE real child process ~45ms with real FS writes + real artifact/WorkGraph reconciliation in the sample-preview test).
- Full battery: 860 tests in ~39.6s (base 849 in ~37.8s — the +8 tests account for the delta).
- tsc -b packages/web: clean (a few seconds; unchanged class). Lint: 581–669ms on 3021 files.
- Studio composition construction is synchronous; seeding is async and awaited lazily by the first port call (the browser route pays nothing — it uses the static fixture host).

## SECURITY

- Surface law (studioPorts.ts) held: read-only studio state + EXACTLY the launch-selection write path (disclosure → confirm → admission). The composition adds no other mutation path; the studio never imports provider internals (it drives the @sporta services through their public ports only — no second runtime).
- Fail-closed everywhere: typed admission refusals verbatim; unknown-listing disclosure rejects typed; unknown sample-preview returns null; seeding failures surface as port rejections, never faked successes.
- The sample-run child process runs with the deterministic adapter's sandbox posture (empty env, temp-dir cwd, declared timeout kill) — no host secrets, no network.
- Browser-bundle purity verified: studioComposition.ts/studioSeeds.ts are imported ONLY by the headless composition/boot (never by a React file); studioBrowserFixture.ts has exactly ONE `import type` (erased at build) — no Node dependency enters the bundle (grep-verified import graph; the +11-module build-graph delta contains only the render surfaces).
- No credentials, no secrets in seeds/fixtures; the push uses the pre-configured token remote (token never echoed, never committed; remote URLs redacted in all output).

## RISKS

- The vite build remains unmeasurable on this 4 GB cgroup sandbox (OOM at the render phase — identical at base); CI/TL station covers the full build. The typed build (`tsc -b`) is the local gate (the W4C precedent).
- The three new transitional symlinks hide the web→studio-package edges from the lockfile until the TL registers them (NEXT DEPENDENCIES) — same drift-mitigation as W4C: `tsc -b packages/web` typechecks the symlinked sources inside the web program.
- The studio composition shares the host's blob root (content-addressed, no collisions by construction); a future wave that gives the studio durable stores should re-visit the shared-root choice.
- The browser fixture graph-check duplicates (a labeled subset of) the validator's violation vocabulary for demo interactivity — clearly labeled as FIXTURE and never the authority; drift between it and the real validator's kinds is cosmetic (demo-only) but worth revisiting if the vocabulary grows.

## BLOCKERS

- None for this lane. (Carried, pre-existing, outside this lane: the vendored apps/zcode-cli remains unbuildable in this sandbox — not needed here; the studio sample run uses its own real child process. The vite build OOM is recorded under REAL EVIDENCE / RISKS, not a blocker for the seam itself.)

## DEVIATIONS

1. **studioSeeds.ts (NEW file beyond the packet's file list).** The packet's scope law lists `studioComposition.ts` + `studioBrowserFixture.ts` as the NEW files; the file-size law (< 400 lines per src file) made a single-file composition impossible without contorting the code (the one-file version measured 442+ lines). Resolution: the repo's own composition precedent — `composition.ts` + `hostSeeds.ts` — so the seeds live in `studioSeeds.ts` (178 lines; studioComposition.ts is 365). Purely additive, inside my lane root (`packages/web/src/sporta/`); the SPEC README was amended accordingly in the implementation commit.
2. **main.tsx edited (2 effective lines).** The packet said the browser route wiring belongs in `browserFixtureHost.ts` or `boot/boot.ts`; but `boot.ts` is HEADLESS-only by its own header ("this module NEVER enters the browser bundle") and the browser route's actual mount point is `main.tsx` (where W4C-3 wired the fixture host). The edit is the studio-fixture import + the injected `studio` prop on the existing `SportaPanel` render call — the same class of narrow route wiring the packet intended.
3. **composition.ts import-block compaction (formatting-only).** The base file was 397 lines; ANY additive wiring would cross 400. The hostSeeds/@sporta-work/@sporta-organizations import blocks were joined onto fewer lines (identical names, identical semantics — pure formatting) so the file lands at 395 lines WITH the studio wiring. No behavior change; called out because the packet said "additive" (the additions are additive; the compaction is format-only).
4. **Baseline battery count.** The packet's baseline says "battery 850/850"; THIS sandbox measures **849** sporta-side at base 92ef338 (101 test files, 0 skipped, 0 fail — re-measured twice). My additive total is **860/860** (849 + 11 web-side, of which 8 are mine). The 1-test delta vs the TL's number is a measurement/platform difference, not a missing test — flagged for the TL's re-run.
5. The studio composition constructs its own marketplace/app-env world rather than sharing the host composition's stores — intentional (the studio surface owns its seam state; the host loop's work/organization stores stay untouched by studio reads), mirroring how W9C's vertical slice built its own world.

## NEXT DEPENDENCIES (the definitive registration replacing the 3 new transitional symlinks)

In `packages/web/package.json` "dependencies", add (TL-only; then `pnpm install` at the workspace root regenerates pnpm-lock.yaml, and the 3 gitignored symlinks under `packages/web/node_modules/@sporta` can be deleted):

  "@sporta/app-environments": "workspace:*",
  "@sporta/marketplace": "workspace:*",
  "@sporta/transforms": "workspace:*"

Optional follow-ups for the TL: a browser test harness for the studio tabs (none exists; none claimed); surfacing the studio's sample-run lineage (WorkGraph refs) in a future UX wave; a durable marketplace/app-env store adapter when the product-side stores land.

DELIVERY: branch wave10/worker-a @ <implementation-commit-sha> (spec commit 2ceac43 precedes it; this report is the branch HEAD rider)

Gate table (real, measured on this sandbox, final pre-commit run):

| Gate | Command | Result |
|---|---|---|
| Architecture | node scripts/architecture/architecture-check.mjs check | OK — violations 0, baseline 0, new 0 |
| Surface | node scripts/architecture/sporta-surface-check.mjs | OK — frozen surfaces intact, additive-only (zero sporta-side changes this wave) |
| Typecheck | pnpm exec tsc -b packages/web | exit 0, no output |
| Tests (studio, NEW) | pnpm exec tsx --test packages/web/test/studioComposition.test.ts | 8 pass / 0 fail |
| Tests (web) | pnpm exec tsx --test packages/web/test/*.test.ts | 11 pass / 0 fail (3 baseline + 8 new) |
| Tests (full battery) | pnpm exec tsx --test packages/sporta-*/test/*.test.ts packages/web/test/*.test.ts | 860 pass / 0 fail / 0 skipped (base 849+3 on this sandbox; TL baseline said 850 — see DEVIATIONS 4) |
| Lint | pnpm run lint | 0 errors, 70 warnings (baseline identical) |
| Web build | pnpm --filter @zcode/web build | exit 137 ×3 (kernel OOM at render phase after 7752 modules — identical failure at BASE on this sandbox; W4C precedent) — typed build-verified via tsc -b; full build PENDING-station |
