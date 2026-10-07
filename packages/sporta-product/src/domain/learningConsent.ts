/**
 * Learning-consent derivation (domain layer — pure).
 *
 * Turns one granted consent decision into a candidate LearningArtifactRecord
 * (scope "user", status "candidate") with a deterministic id, and checks the
 * consent's scopes against the work graph's learning policy. No IO, no store.
 */
import type { LearningArtifactRecord, LearningPolicyRef } from "@sporta/contracts/contract";
import type { LearningConsentInput } from "../contract.js";
import { LearningScopeError } from "./errors.js";

/** Scope values a learning policy may permit. */
export type LearningScope = LearningPolicyRef["scopes"][number];

/** The scopes in `requested` that the policy does not permit (empty when fine). */
export function consentScopeViolations(
  requested: readonly LearningScope[],
  permitted: readonly LearningScope[],
): readonly LearningScope[] {
  return requested.filter((scope) => !permitted.includes(scope));
}

function sortedUniqueScopes(scopes: readonly LearningScope[]): readonly LearningScope[] {
  const seen = new Set<LearningScope>();
  for (const scope of scopes) {
    seen.add(scope);
  }
  return [...seen].sort();
}

/** Deterministic learning artifact id for (workGraphId, userId, scopes). */
export function learningArtifactIdFor(input: LearningConsentInput): string {
  return `learn:${input.userId}:${input.workGraphId}:${sortedUniqueScopes(input.scopes).join("+")}`;
}

/**
 * The candidate learning artifact for one granted consent.
 * Throws `LearningScopeError` on empty scopes (nothing to learn).
 */
export function candidateLearningArtifact(input: LearningConsentInput): LearningArtifactRecord {
  const scopes = sortedUniqueScopes(input.scopes);
  const primary = scopes.at(0);
  if (primary === undefined) {
    throw new LearningScopeError("learning consent with empty scopes — nothing to learn");
  }
  return {
    learningArtifactId: learningArtifactIdFor(input),
    class: primary,
    scope: "user",
    evidence: [],
    permission: {
      scopes,
      requireConsent: true,
    },
    status: "candidate",
  };
}
