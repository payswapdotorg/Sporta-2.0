import type { Confidence, Iso8601, SportaId } from "@sporta/contracts/contract";
import { isValidConfidence } from "../snapshot.js";
import type { NormalizedObservation } from "./normalization.js";
import { PerceptionError } from "./errors.js";
import type { PerceptionFactKind, PerceivedPosition } from "./provenance.js";
import { isFiniteNumber, isNonEmptyString, joinIdSegments } from "./provenance.js";

/**
 * Stage 3 — perception (domain layer — pure).
 *
 * HONEST TYPED TRANSFORM — NO ML. No model is loaded, executed or
 * claimed: every perceived fact is produced by a DECLARED rule (a
 * typed field-mapping the caller supplies) applied deterministically
 * to a normalized observation payload. A rule engages an observation
 * when at least one mapped field is present; every PRESENT mapped
 * field must be well-typed (mistyped = typed refusal — a declared rule
 * hitting bad data is a misconfiguration, not a skip); a fact is
 * produced only when ALL required mapped fields are present. Absence
 * is never a fact; nothing is guessed.
 */

/** Base field map every perception rule declares. */
interface RuleBase {
  ruleId: SportaId;
  /** Which payload field holds the entity/ball id. */
  entityIdField: string;
  xField: string;
  yField: string;
  zField?: string;
  /** Declared ceiling applied by min — carry or lower only. */
  confidenceFactor?: Confidence;
}

/** Rule extracting an entity's state from a payload. */
export interface EntityStateRule extends RuleBase {
  kind: "entity-state";
}

/** Rule extracting a ball's state (with optional possession) from a payload. */
export interface BallStateRule extends RuleBase {
  kind: "ball-state";
  /** Optional: where the ball's possession lives in the payload. */
  possessionField?: string;
}

export type PerceptionRule = EntityStateRule | BallStateRule;

/** One perceived fact — deterministic rule output over one observation. */
export interface PerceivedFact {
  /** Deterministic: rule + observation + entity. */
  factId: SportaId;
  ruleId: SportaId;
  kind: PerceptionFactKind;
  /** Provenance ref to the source observation. */
  observationId: SportaId;
  mediaRef: SportaId;
  entityId: SportaId;
  position: PerceivedPosition;
  possession?: SportaId;
  capturedAt: Iso8601;
  /** min(observation confidence, rule factor) — carry or lower only. */
  confidence: Confidence;
  /** Sorted unique authorized-chain citations. */
  acquisitionIds: readonly SportaId[];
}

/**
 * Perceive a batch of normalized observations through declared rules.
 * Facts are deduplicated by factId and sorted by factId (the batch
 * output order is independent of the input order). Mixed domains in
 * one batch are refused.
 */
export function perceiveObservations(
  normalized: readonly NormalizedObservation[],
  rules: readonly PerceptionRule[],
): PerceivedFact[] {
  validateRules(rules);
  const firstDomain = normalized[0]?.observation.domain;
  for (const entry of normalized) {
    if (entry.observation.domain !== firstDomain) {
      throw new PerceptionError(
        `perception batch mixes domains "${String(firstDomain)}" and "${entry.observation.domain}"`,
        `${String(firstDomain)}|${entry.observation.domain}`,
      );
    }
  }
  const facts = new Map<SportaId, PerceivedFact>();
  for (const entry of normalized) {
    for (const rule of rules) {
      const fact = applyRule(rule, entry);
      if (fact !== undefined) facts.set(fact.factId, fact);
    }
  }
  return [...facts.values()].sort((left, right) =>
    left.factId < right.factId ? -1 : left.factId > right.factId ? 1 : 0,
  );
}

function validateRules(rules: readonly PerceptionRule[]): void {
  if (!Array.isArray(rules)) {
    throw new PerceptionError("perception rules must be an array", "rules");
  }
  const seenRuleIds = new Set<SportaId>();
  for (const rule of rules) {
    if (rule === null || typeof rule !== "object") {
      throw new PerceptionError("perception rule must be an object", "rule");
    }
    if (rule.kind !== "entity-state" && rule.kind !== "ball-state") {
      throw new PerceptionError(
        `perception rule kind "${String(rule.kind)}" is not in the declared vocabulary`,
        `kind:${String(rule.kind)}`,
      );
    }
    if (!isNonEmptyString(rule.ruleId)) {
      throw new PerceptionError("ruleId must be a non-empty string", "ruleId");
    }
    if (seenRuleIds.has(rule.ruleId)) {
      throw new PerceptionError(
        `duplicate ruleId "${rule.ruleId}" in one batch`,
        `duplicate:${rule.ruleId}`,
      );
    }
    seenRuleIds.add(rule.ruleId);
    for (const field of [rule.entityIdField, rule.xField, rule.yField]) {
      if (!isNonEmptyString(field)) {
        throw new PerceptionError(
          `rule "${rule.ruleId}" must declare non-empty field names`,
          `field:${rule.ruleId}`,
        );
      }
    }
    if (rule.zField !== undefined && !isNonEmptyString(rule.zField)) {
      throw new PerceptionError(
        `rule "${rule.ruleId}" zField must be a non-empty string`,
        `z-field:${rule.ruleId}`,
      );
    }
    if (
      rule.kind === "ball-state" &&
      rule.possessionField !== undefined &&
      !isNonEmptyString(rule.possessionField)
    ) {
      throw new PerceptionError(
        `rule "${rule.ruleId}" possessionField must be a non-empty string`,
        `possession-field:${rule.ruleId}`,
      );
    }
    if (rule.confidenceFactor !== undefined && !isValidConfidence(rule.confidenceFactor)) {
      throw new PerceptionError(
        `rule "${rule.ruleId}" confidenceFactor ${rule.confidenceFactor} is outside [0, 1]`,
        `factor:${rule.ruleId}`,
      );
    }
  }
}

/** Does this mapped payload field expect a finite number (vs an id string)? */
function fieldExpectsNumber(rule: PerceptionRule, field: string): boolean {
  const isIdentityField =
    field === rule.entityIdField || (rule.kind === "ball-state" && rule.possessionField === field);
  // An identity field wins when a misconfiguration maps both roles to one name.
  return (
    !isIdentityField && (rule.xField === field || rule.yField === field || rule.zField === field)
  );
}

function applyRule(rule: PerceptionRule, entry: NormalizedObservation): PerceivedFact | undefined {
  const payload = entry.rawPayload;
  const requiredFields: string[] = [rule.entityIdField, rule.xField, rule.yField];
  if (rule.zField !== undefined) requiredFields.push(rule.zField);
  const optionalFields: string[] = [];
  if (rule.kind === "ball-state" && rule.possessionField !== undefined) {
    optionalFields.push(rule.possessionField);
  }
  const mappedFields = [...requiredFields, ...optionalFields];
  const engaged = mappedFields.some((field) => Object.hasOwn(payload, field));
  if (!engaged) return undefined; // the rule does not match this observation at all
  // Every PRESENT mapped field must be well-typed (fail-closed on misconfiguration).
  for (const field of mappedFields) {
    if (!Object.hasOwn(payload, field)) continue;
    const value = payload[field];
    const expectsNumber = fieldExpectsNumber(rule, field);
    const valid = expectsNumber ? isFiniteNumber(value) : isNonEmptyString(value);
    if (!valid) {
      throw new PerceptionError(
        `rule "${rule.ruleId}" maps payload field "${field}" with the wrong type (expected ${expectsNumber ? "a finite number" : "a non-empty string"})`,
        `field:${rule.ruleId}:${field}`,
      );
    }
  }
  // Application requires ALL required mapped fields present.
  if (!requiredFields.every((field) => Object.hasOwn(payload, field))) return undefined;
  const entityId = payload[rule.entityIdField];
  const x = payload[rule.xField];
  const y = payload[rule.yField];
  // Belt-and-braces for the type checker; unreachable after validation.
  if (!isNonEmptyString(entityId) || !isFiniteNumber(x) || !isFiniteNumber(y)) return undefined;
  const position: PerceivedPosition = { x, y };
  if (rule.zField !== undefined) {
    const z = payload[rule.zField];
    if (isFiniteNumber(z)) position.z = z;
  }
  let possession: SportaId | undefined;
  if (rule.kind === "ball-state" && rule.possessionField !== undefined) {
    const value = payload[rule.possessionField];
    if (isNonEmptyString(value)) possession = value; // optional: absent possession is carried honestly
  }
  const fact: PerceivedFact = {
    factId: joinIdSegments("fact", rule.ruleId, entry.observationId, entityId),
    ruleId: rule.ruleId,
    kind: rule.kind,
    observationId: entry.observationId,
    mediaRef: entry.mediaRef,
    entityId,
    position,
    capturedAt: entry.observation.capturedAt,
    confidence: Math.min(entry.observation.confidence, rule.confidenceFactor ?? 1),
    acquisitionIds: [entry.chain.acquisitionId],
  };
  if (possession !== undefined) fact.possession = possession;
  return fact;
}
