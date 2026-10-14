# HF-TYPED-FUTURE — operator token request: Hugging Face weight hosting

Status: **TYPED-FUTURE — operator-credential-gated. NO implementation exists or
is claimed by this document.** Recorded by w10b (P10 Lane W10-B) per the ADR's
non-goals table and acceptance gate P10-10.

## The operator token request

**Ask:** the operator provisions a Hugging Face token (read scope for the
pinned repos suffices) into the station vault for Sporta's weight-hosting
lane. Until the token exists, pinned dependency weights stay
digest-referenced exactly as they are today; no HF fetch, mirror or hosting
claim is made.

## The exact port/storage doctrine a real host would follow (already frozen)

The pinning surface is frozen in `@sporta/transforms/contract`
(`TransformPinnedDependency`):

```ts
interface TransformPinnedDependency {
  kind: "code" | "model" | "runtime" | "dependency";
  name: string;
  digest: string;            // the identity — sha256-pinned, never a moving tag
  license: string;
  storageRef: string;        // where BYTES live (GitHub/HF/blob seam) — never the authority
}
```

The storage doctrine a future HF lane must hold:

1. **The digest is the identity; the host is just bytes.** HF (or GitHub, or
   the artifact fabric) may serve the bytes of a pinned component, but
   resolution authority stays the digest: a fetched artifact whose hash does
   not match the pin is a typed resolution failure, never a silent accept.
   (`TransformPinnedDependency.storageRef`'s own contract comment: "Where
   bytes are stored …; never the authority.")
2. **Never a moving tag.** The validator already fail-closes on moving tags
   and malformed digests (`graphValidation.ts` — "moving tag" violations);
   an HF lane resolves `huggingface://<repo>@<digest>`-style refs only by
   digest-pinned revision, never `main`/`latest`.
3. **Resolution goes through the frozen seam.** Components resolve through
   `TransformComponentResolverPort` (domain/ports.ts) — an HF-backed store
   would be an ADAPTER behind that port (the
   `DeterministicComponentStore` precedent), injected by host composition.
   No second resolution authority is created.
4. **License/provenance surface verbatim.** The pinned `license` field and
   the marketplace disclosure's dependency list carry HF-hosted components
   exactly as any other pinned component — no special vocabulary.

## Placement law (the working precedent)

Frozen `sporta-*` packages stay external-dep-free. An HF client SDK and the
operator token live at the HOST layer only (this providers root's
`SandboxModelAdapter` over `z-ai-web-dev-sdk` — web package dependency,
injected client seam — is the placement precedent). The concrete root is
the future lane's work-order decision.

## What exists today (honest inventory)

- Pinned dependencies are digest-referenced records on manifests and
  surfaced through the marketplace launch disclosure (the working wiring:
  `studioComposition.ts` → `readLaunchDisclosure`).
- No HF token exists in the station vault; no HF fetch, cache, mirror or
  hosting path exists in this tree.

**No HF hosting implementation is claimed anywhere in this tree.**
