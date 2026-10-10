/**
 * The learning-intake port types (Wave-4 W4C-3 restructure, ADR:
 * docs/architecture/adr-wave4-c6-host.md).
 *
 * These types were previously defined IN src/contract.ts, which forced
 * the intake service (app) and the consent domain to import
 * "../contract.js" — the only such pattern in the repo (every sibling
 * package defines its ports in src/domain and re-exports them through
 * the contract). With the wave-4 composition roots now value-exported
 * through the contract entrypoint, that edge became an import cycle
 * (architecture:check). The definitions move here; contract.ts
 * re-exports them unchanged, so the public surface is the same names.
 */
import type { LearningArtifactRecord, LearningPolicyRef, SportaId } from "@sporta/contracts/contract";

/** Input for recording one explicit learning-consent decision. */
export interface LearningConsentInput {
  workGraphId: SportaId;
  userId: SportaId;
  /** Learning scopes the consent covers (values from LearningPolicyRef.scopes). */
  scopes: LearningPolicyRef["scopes"];
  decision: "granted" | "denied";
}

/**
 * The learning-consent intake port. Granted consent produces a candidate
 * LearningArtifactRecord (scope "user"); denied consent creates NO
 * artifact and throws `LearningConsentRefusedError` (design decision:
 * the port is a pure success type, refusals are typed errors — see
 * CONTRACT.md). Idempotent per (workGraphId, userId, scopes).
 */
export interface LearningIntakePort {
  recordConsent(input: LearningConsentInput): Promise<LearningArtifactRecord>;
}
