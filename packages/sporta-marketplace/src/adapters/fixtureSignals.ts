/**
 * FIXTURE signal sources (adapters layer) — clearly labeled.
 *
 * EVIDENCE CLASS: FIXTURE. These feed the unsafe-dependency-signal
 * and similarity-signal checks until real scanners plug the same
 * seams (`TransformDependencySignalSource`,
 * `TransformSimilaritySignalSource`). Deterministic, no fabricated
 * real-world claims; evidence grades report "fixture".
 */
import type { TransformReleaseCandidate } from "@sporta/transforms/contract";
import type {
  TransformDependencySignal,
  TransformDependencySignalSource,
  TransformSimilaritySignal,
  TransformSimilaritySignalSource,
} from "../domain/ports.js";

/**
 * Deterministic dependency-risk source: every dependency whose name
 * is in `flagged` reports flagged with the given reason.
 */
export class FixtureDependencySignalSource implements TransformDependencySignalSource {
  private readonly flagged: ReadonlyMap<string, string>;

  constructor(flagged: Readonly<Record<string, string>> = {}) {
    this.flagged = new Map(Object.entries(flagged));
  }

  signalsFor(dependencies: readonly { name: string; digest: string }[]): readonly TransformDependencySignal[] {
    return dependencies.map((dependency) => {
      const reason = this.flagged.get(dependency.name);
      return {
        name: dependency.name,
        flagged: reason !== undefined,
        evidenceKind: "fixture" as const,
        detail: reason ?? "FIXTURE signal source: not flagged",
      };
    });
  }
}

/**
 * Deterministic similarity source: scores are declared per pipeline
 * id (fixture). The score is a QUALITY SIGNAL only — P9-16: it may
 * trigger a WARN for human review; it never approves or clears.
 */
export class FixtureSimilaritySignalSource implements TransformSimilaritySignalSource {
  private readonly scores: ReadonlyMap<string, number>;

  constructor(scores: Readonly<Record<string, number>> = {}) {
    this.scores = new Map(Object.entries(scores));
  }

  similarityFor(candidate: TransformReleaseCandidate): TransformSimilaritySignal {
    const score = this.scores.get(candidate.pipelineId) ?? 0;
    return {
      score,
      evidenceKind: "fixture",
      detail: `FIXTURE similarity score declared for ${candidate.pipelineId}`,
    };
  }
}
