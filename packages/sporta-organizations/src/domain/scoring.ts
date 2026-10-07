/**
 * Organization selection scoring — pure and deterministic
 * (see packages/sporta-organizations/SPEC.md for the factor table).
 * Byte-identical output for equal inputs: fixed weights, fixed factor
 * order, total ranking order (total desc, organizationId asc, version
 * desc). User preferences participate only when a preference record for
 * the SAME userRef is present (personalization boundary).
 */
import type { OrganizationVersionRecord } from "@sporta/contracts/contract";
import type {
  OrganizationCandidate,
  OrganizationSelection,
  OrganizationSelectionContext,
  OrganizationUserPreference,
  SelectionFactor,
} from "./ports.js";
import { OrganizationResolutionError } from "./errors.js";

/** Declared Wave 1 factor weights (fixture-grade, not learned values). */
export const FACTOR_WEIGHTS = {
  environmentMatch: 0.3,
  intentProfileFit: 0.25,
  evidenceBacking: 0.15,
  budgetFit: 0.15,
  preferenceFit: 0.15,
} as const;

const EVIDENCE_FULL_SCORE = 3;

function tokens(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

interface ScoredFactor {
  name: string;
  weight: number;
  score: number;
  detail: string;
}

function environmentMatchFactor(
  record: OrganizationVersionRecord,
  context: OrganizationSelectionContext,
): ScoredFactor {
  const matches = record.environmentProfile === context.environmentProfile;
  return {
    name: "environment-match",
    weight: FACTOR_WEIGHTS.environmentMatch,
    score: matches ? 1 : 0,
    detail: `candidate environment '${record.environmentProfile}' ${matches ? "matches" : "differs from"} context '${context.environmentProfile}'`,
  };
}

function intentProfileFitFactor(
  record: OrganizationVersionRecord,
  context: OrganizationSelectionContext,
): ScoredFactor {
  const intentTokens = new Set([
    ...tokens(context.intent.goal),
    ...tokens(context.intent.artifactRequirements.join(" ")),
  ]);
  const profileTokens = new Set(tokens(record.intentProfile));
  let overlap = 0;
  for (const token of profileTokens) if (intentTokens.has(token)) overlap += 1;
  const total = intentTokens.size;
  const score = total === 0 ? 0 : overlap / total;
  return {
    name: "intent-profile-fit",
    weight: FACTOR_WEIGHTS.intentProfileFit,
    score,
    detail: `intent profile '${record.intentProfile}' overlaps ${overlap}/${total} intent tokens`,
  };
}

function evidenceBackingFactor(record: OrganizationVersionRecord): ScoredFactor {
  const score = Math.min(1, record.evidence.length / EVIDENCE_FULL_SCORE);
  return {
    name: "evidence-backing",
    weight: FACTOR_WEIGHTS.evidenceBacking,
    score,
    detail: `${record.evidence.length} evidence reference(s) (full score at ${EVIDENCE_FULL_SCORE})`,
  };
}

function budgetFitFactor(
  record: OrganizationVersionRecord,
  context: OrganizationSelectionContext,
): ScoredFactor {
  const intentBudget = context.intent.budget;
  const candidateCost = record.budgets.costMax;
  let score: number;
  let detail: string;
  if (intentBudget === undefined || candidateCost === undefined) {
    score = 0.5;
    detail =
      intentBudget === undefined
        ? "no intent budget declared; neutral fit"
        : `candidate declares no cost budget; neutral fit against limit ${intentBudget.limit} ${intentBudget.currency}`;
  } else if (candidateCost <= intentBudget.limit) {
    score = 1;
    detail = `candidate cost budget ${candidateCost} fits intent limit ${intentBudget.limit} ${intentBudget.currency}`;
  } else {
    score = 0;
    detail = `candidate cost budget ${candidateCost} exceeds intent limit ${intentBudget.limit} ${intentBudget.currency}`;
  }
  return { name: "budget-fit", weight: FACTOR_WEIGHTS.budgetFit, score, detail };
}

function preferenceFitFactor(
  record: OrganizationVersionRecord,
  preference: OrganizationUserPreference,
): ScoredFactor {
  const prefersThisOrganization = preference.preferredOrganizationId === record.organizationId;
  const prefersThisEnvironment =
    preference.preferredEnvironmentProfile !== undefined &&
    record.environmentProfile === preference.preferredEnvironmentProfile;
  const score = prefersThisOrganization ? 1 : prefersThisEnvironment ? 0.5 : 0;
  const signals = [
    ...(preference.preferredOrganizationId === undefined
      ? []
      : [preference.preferredOrganizationId]),
    ...(preference.preferredEnvironmentProfile === undefined
      ? []
      : [`environment '${preference.preferredEnvironmentProfile}'`]),
  ];
  return {
    name: "preference-fit",
    weight: FACTOR_WEIGHTS.preferenceFit,
    score,
    detail: `user ${preference.userRef} preference (${signals.join(", ")}) scored ${score} for ${record.organizationId} v${record.version}`,
  };
}

function preferenceActive(preference: OrganizationUserPreference | null): boolean {
  return (
    preference !== null &&
    (preference.preferredOrganizationId !== undefined ||
      preference.preferredEnvironmentProfile !== undefined)
  );
}

interface RankedCandidate {
  candidate: OrganizationCandidate;
  factors: ScoredFactor[];
  total: number;
}

function scoreCandidate(
  record: OrganizationVersionRecord,
  context: OrganizationSelectionContext,
  preference: OrganizationUserPreference | null,
): RankedCandidate {
  const factors: ScoredFactor[] = [
    environmentMatchFactor(record, context),
    intentProfileFitFactor(record, context),
    evidenceBackingFactor(record),
    budgetFitFactor(record, context),
  ];
  if (preferenceActive(preference) && preference !== null)
    factors.push(preferenceFitFactor(record, preference));
  const total = factors.reduce((sum, factor) => sum + factor.weight * factor.score, 0);
  return {
    candidate: {
      organization: record,
      rationale: "",
      evidence: record.evidence,
    },
    factors,
    total,
  };
}

/**
 * Deterministic explainable selection. Same records + context +
 * preference => byte-identical OrganizationSelection.
 */
export function resolveOrganizationSelection(
  records: readonly OrganizationVersionRecord[],
  context: OrganizationSelectionContext,
  preference: OrganizationUserPreference | null,
): OrganizationSelection {
  if (records.length === 0) {
    throw new OrganizationResolutionError(
      "organization resolution failed: no promoted candidates in the registry",
    );
  }
  const ranked = records
    .map((record) => scoreCandidate(record, context, preference))
    .sort(
      (left, right) =>
        right.total - left.total ||
        left.candidate.organization.organizationId.localeCompare(
          right.candidate.organization.organizationId,
        ) ||
        right.candidate.organization.version - left.candidate.organization.version,
    );
  const candidates: OrganizationCandidate[] = ranked.map((entry, index) => ({
    organization: entry.candidate.organization,
    rationale: `total score ${entry.total.toFixed(2)}, rank ${index + 1} of ${ranked.length}`,
    evidence: entry.candidate.evidence,
  }));
  const winner = ranked[0];
  const selected = candidates[0];
  if (winner === undefined || selected === undefined) {
    throw new OrganizationResolutionError("organization resolution failed");
  }
  const explanation: SelectionFactor[] = winner.factors.map((factor) => ({
    factor: factor.name,
    weight: factor.weight,
    detail: factor.detail,
  }));
  return { selected, candidates, explanation };
}
