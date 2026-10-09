/**
 * LearningIntakeService — app-layer implementation of `LearningIntakePort`
 * and (Wave 3, additive) of `LearningArtifactReadPort`.
 *
 * Records one explicit learning-consent decision for a work graph:
 * denied consent throws `LearningConsentRefusedError` BEFORE any store
 * write (no artifact is created); granted consent produces a candidate
 * LearningArtifactRecord (scope "user", status "candidate") that is
 * idempotent per (workGraphId, userId, scopes). Consent cannot exceed
 * the work graph's learning policy scopes.
 *
 * Wave-3 read seam (ADR: docs/architecture/adr-wave3-read-seams.md):
 * `listLearningArtifacts` is a bounded, read-only list over the store
 * this service already owns; summaries mirror LearningArtifactRecord
 * field-for-field. The intake only ever creates candidates — promotion
 * belongs to the organizations/lab/evaluation modules, so this store
 * reports candidates; a promoted status surfaces through a seam
 * implementation that can see promotion state.
 */
import type { LearningIntakePort } from "../contract.js";
import type { LearningConsentInput } from "../contract.js";
import type {
  LearningArtifactQuery,
  LearningArtifactReadPort,
  LearningArtifactRecord,
  LearningArtifactSummary,
} from "@sporta/contracts/contract";
import type { WorkGraphPort } from "@sporta/work/contract";
import { candidateLearningArtifact, consentScopeViolations } from "../domain/learningConsent.js";
import { learningArtifactSummaryOf, learningReadLimit } from "../domain/learningReadSeam.js";
import {
  LearningConsentRefusedError,
  LearningScopeError,
  UnknownWorkGraphError,
} from "../domain/errors.js";

/** Constructor dependencies of the learning intake service. */
export interface LearningIntakeServiceDeps {
  workGraphs: WorkGraphPort;
}

/** The learning-consent intake service (intake port + Wave-3 read seam). */
export class LearningIntakeService implements LearningIntakePort, LearningArtifactReadPort {
  readonly #store = new Map<string, LearningArtifactRecord>();
  readonly #deps: LearningIntakeServiceDeps;

  constructor(deps: LearningIntakeServiceDeps) {
    this.#deps = deps;
  }

  async recordConsent(input: LearningConsentInput): Promise<LearningArtifactRecord> {
    if (input.scopes.length === 0) {
      throw new LearningScopeError("learning consent with empty scopes — nothing to learn");
    }
    const graph = await this.#deps.workGraphs.readWorkGraph(input.workGraphId);
    if (graph === null) {
      throw new UnknownWorkGraphError(input.workGraphId);
    }
    const policy = graph.intent.learningPolicy;
    const violations = consentScopeViolations(input.scopes, policy.scopes);
    if (violations.length > 0) {
      throw new LearningScopeError(
        `learning scopes not permitted by the work graph learning policy: ${violations.join(", ")}`,
      );
    }
    if (input.decision === "denied") {
      throw new LearningConsentRefusedError(input.workGraphId, input.userId);
    }
    const candidate = candidateLearningArtifact(input);
    const existing = this.#store.get(candidate.learningArtifactId);
    if (existing !== undefined) {
      return existing;
    }
    this.#store.set(candidate.learningArtifactId, candidate);
    return candidate;
  }

  /**
   * Wave-3 read seam: bounded learning-artifact list over the store this
   * service owns. Filters are optional; the default limit is capped
   * (bounded-query law). Order is consent order; read-only.
   */
  async listLearningArtifacts(
    query: LearningArtifactQuery,
  ): Promise<readonly LearningArtifactSummary[]> {
    const limit = learningReadLimit(query.limit);
    const summaries: LearningArtifactSummary[] = [];
    for (const record of this.#store.values()) {
      if (summaries.length >= limit) break;
      if (
        query.learningArtifactId !== undefined &&
        record.learningArtifactId !== query.learningArtifactId
      ) {
        continue;
      }
      if (query.scope !== undefined && record.scope !== query.scope) continue;
      if (query.status !== undefined && record.status !== query.status) continue;
      summaries.push(learningArtifactSummaryOf(record));
    }
    return summaries;
  }
}
