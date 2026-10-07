# sporta-lab

Organization population search and replay.

Invariants that types cannot express:

- Lab search considers intent success, output quality, source fidelity, preference fit, intervention cost, latency, resource cost, reliability, determinism, rights/security and provenance — never benchmark score alone.
- Replay reports are simulation evidence, never production truth.
- Personalized populations are isolated per user; cross-user leakage is forbidden.

Wave 1 additions (see SPEC.md for full behavior):

- Population membership is a declared deterministic heuristic over record
  fields (SPEC.md table); unknown kinds are typed errors, empty results are
  honest empty arrays.
- Replay reports are simulation, never production truth; the intervention-cost
  formula is a declared fixture heuristic over the append ledger.
- Replay evidence references only ids that already exist in the replayed
  WorkGraph; the Lab fabricates no evidence ids.
- The Lab applies no user preference during search (personalization boundary).
