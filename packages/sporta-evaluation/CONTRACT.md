# sporta-evaluation

Evidence-backed comparison of organization candidates.

Invariants that types cannot express:

- Intervention cost is always included when available.
- Metrics marked basis "fixture" or "estimated" can never satisfy a promotion gate alone.
- Reports are immutable once issued; revisions are new reports.

Wave 1 additions (see SPEC.md for full behavior):

- The report is deterministic and idempotent per input (same reportId).
- Axis values are report-level means over candidates (the frozen record has
  no per-candidate metric slot).
- Basis honesty: service-derived metrics are always "fixture";
  "measured" appears only when the caller explicitly asserts it on the
  intervention-cost input. Fixture input must never be labeled "measured".
- Evaluating zero candidates is a typed refusal, not an empty report.
