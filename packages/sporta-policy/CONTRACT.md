# sporta-policy

Rights/privacy/retention primitives carried by every Sporta record.

Invariants that types cannot express:

- PolicySets propagate unchanged across every plane boundary (artifacts, editors, Arena, learning).
- `prohibitions` are honored even when a downstream provider would permit the usage.
- Provider identifiers never appear in `holders`.
