import type { PolicySet } from "@sporta/contracts/contract";
/**
 * Policy checks for compute submission (domain layer — pure).
 *
 * Policy is checked BEFORE submission, never after: a job whose rights
 * do not grant the job kind's usage class never reaches a provider.
 */

/**
 * The usage class a job kind requires: `compute:<kind>`. A deterministic,
 * explainable mapping — the policy must grant exactly this usage.
 */
export function requiredUsageForJobKind(kind: string): string {
  return `compute:${kind}`;
}

/** Whether the policy permits submitting a job of this kind. */
export function policyPermitsJob(policy: PolicySet, kind: string): boolean {
  const usage = requiredUsageForJobKind(kind);
  return policy.rights.usages.includes(usage) && !policy.rights.prohibitions.includes(usage);
}
