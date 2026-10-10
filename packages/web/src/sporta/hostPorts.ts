/**
 * The Sporta host port — the packages/web surface law types
 * (SPEC.md, "Wave-4 host conversion").
 *
 * TYPE-ONLY module: these types are what the React render surface and
 * the headless Node composition share. They import only types from
 * @sporta/product/contract (erased at build — verbatimModuleSyntax), so
 * the browser bundle never resolves a Node-only dependency.
 *
 * Host surface law: read-only projection state + EXACTLY two write
 * paths (learning-consent intake, takeover append). Any other mutation
 * through the host is a spec violation.
 */
import type { LearningPolicyRef } from "@sporta/contracts/contract";
import type { ProductLoopTrace } from "@sporta/product/contract";

/**
 * Evidence grade of the backing host, surfaced IN the UI (the honesty
 * law): "real" = the headless Node composition (real legs per the
 * composition law); "fixture" = the browser fixture host (the Node
 * runtime legs cannot execute in a browser bundle — labeled, never
 * claimed real).
 */
export type SportaHostEvidence = "real" | "fixture";

/** The read surface: the live projection state for the active loop. */
export interface SportaHostState {
  workGraphId: string;
  trace: ProductLoopTrace;
  evidence: SportaHostEvidence;
}

/** Input of write path A — the learning-consent intake. */
export interface SportaConsentInput {
  /** Learning scopes the consent covers (LearningPolicyRef.scopes values). */
  scopes: LearningPolicyRef["scopes"];
  decision: "granted" | "denied";
}

/** Honest outcome of write path A (a denial is a typed refusal, never swallowed). */
export interface SportaConsentOutcome {
  outcome: "granted" | "refused";
  /** The learning artifact id on grant; the typed refusal detail on denial. */
  detail: string;
}

/** Input of write path B — the takeover entry (the A17 takeover leg). */
export interface SportaTakeoverInput {
  /** Human label for the user edit (lineage evidence in the appended node). */
  label: string;
}

/** Honest outcome of write path B. */
export interface SportaTakeoverOutcome {
  outcome: "appended" | "failed";
  detail: string;
  /** The reconciled revision id on success (the real MLT round-trip product). */
  revisionId?: string;
}

/**
 * The host port: one read + two writes. Implemented HEADLESS (Node) by
 * the composition (packages/web/src/sporta/composition.ts) and by the
 * labeled fixture host for the browser route
 * (packages/web/src/sporta/browserFixtureHost.ts).
 */
export interface SportaHostPort {
  readState(): Promise<SportaHostState>;
  submitConsent(input: SportaConsentInput): Promise<SportaConsentOutcome>;
  submitTakeover(input: SportaTakeoverInput): Promise<SportaTakeoverOutcome>;
  dispose?(): Promise<void>;
}
