/**
 * sporta-policy — rights/privacy/retention primitives.
 *
 * Every Sporta record and session boundary carries a PolicySet so that
 * rights, privacy and retention propagate through artifacts, editors,
 * Arena escalations and learning (architecture lock invariant 22).
 */

/** Permitted and prohibited usage classes for a record. */
export interface RightsScope {
  /** Opaque rights-holder references; never provider identifiers. */
  holders: readonly string[];
  /** Permitted usage classes, e.g. "render", "edit", "derive". */
  usages: readonly string[];
  /** Prohibited usage classes honored by every downstream plane. */
  prohibitions: readonly string[];
}

/** Visibility boundary for a record. */
export interface PrivacyScope {
  visibility: "tenant" | "session" | "escalation" | "public";
  /** Field names permitted to leave the owning tenant boundary. */
  exportableFields: readonly string[];
}

/** Retention decision for a record. */
export interface RetentionPolicy {
  disposition: "retain" | "archive" | "purge";
  /** ISO-8601 date after which the disposition applies. */
  retainUntil?: string;
  /** Maximum number of runs for which the record is retained. */
  retainRuns?: number;
}

/** The propagation set carried by every Sporta record and session boundary. */
export interface PolicySet {
  rights: RightsScope;
  privacy: PrivacyScope;
  retention: RetentionPolicy;
}
