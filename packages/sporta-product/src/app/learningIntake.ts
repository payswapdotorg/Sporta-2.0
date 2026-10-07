/**
 * LearningIntakeService — app-layer implementation of `LearningIntakePort`.
 *
 * Records one explicit learning-consent decision for a work graph:
 * denied consent throws `LearningConsentRefusedError` BEFORE any store
 * write (no artifact is created); granted consent produces a candidate
 * LearningArtifactRecord (scope "user", status "candidate") that is
 * idempotent per (workGraphId, userId, scopes). Consent cannot exceed
 * the work graph's learning policy scopes.
 */
import type { LearningIntakePort } from "../contract.js";
import type { LearningConsentInput } from "../contract.js";
import type { LearningArtifactRecord } from "@sporta/contracts/contract";
import type { WorkGraphPort } from "@sporta/work/contract";
import { candidateLearningArtifact, consentScopeViolations } from "../domain/learningConsent.js";
import {
  LearningConsentRefusedError,
  LearningScopeError,
  UnknownWorkGraphError,
} from "../domain/errors.js";

/** Constructor dependencies of the learning intake service. */
export interface LearningIntakeServiceDeps {
  workGraphs: WorkGraphPort;
}

/** The learning-consent intake service. */
export class LearningIntakeService implements LearningIntakePort {
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
}
