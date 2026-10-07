# sporta-contracts

Canonical record contracts (baseline v1, frozen by TL Wave 0).

Invariants that types cannot express:

- Record identifiers are stable, opaque and never derived from provider identifiers.
- Timestamps come from injectable clocks; tests never depend on wall time.
- Every record that asserts a production fact carries provenance and, where measured, confidence.
- No field in these contracts stores hidden chain-of-thought.
- `EvaluationMetric.basis` distinguishes measured/estimated/fixture values; fixture values never satisfy a promotion gate.
- Breaking changes to this surface require an ADR (docs/architecture/adr-\*.md).
