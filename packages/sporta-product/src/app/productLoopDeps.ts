/**
 * ProductLoopProjectionDeps — the projection's injected-port declaration
 * (app layer, wiring type).
 *
 * Wave-3 (ADR: docs/architecture/adr-wave3-read-seams.md): the four read
 * seams are OPTIONAL injected deps. Absent seam ⇒ its stage keeps the
 * honest v1 `pending: …` detail (graceful degradation — never throw,
 * never lie); v1-shaped inputs with no seams produce byte-identical
 * traces (regression law).
 *
 * This file is the shared type root for the projection and its seam
 * stage derivations (productLoopProjection.ts, productLoopSeamStages.ts,
 * productLoopEscalationStages.ts) — it imports neither of them, so the
 * app-layer import graph stays acyclic.
 */
import type {
  EditorSessionHistoryReadPort,
  EscalationReadPort,
  LearningArtifactReadPort,
  OrganizationCandidateReadPort,
} from "@sporta/contracts/contract";
import type { WorkGraphPort } from "@sporta/work/contract";
import type { OrganizationResolverPort } from "@sporta/organizations/contract";
import type { ArtifactGraphPort } from "@sporta/artifacts/contract";
import type { EditorBrokerPort } from "@sporta/editors/contract";
import type { ArenaClientPort } from "@sporta/arena/contract";

/** Injected ports + optional ambient shell context + optional read seams. */
export interface ProductLoopProjectionDeps {
  workGraphs: WorkGraphPort;
  organizations: OrganizationResolverPort;
  artifacts: ArtifactGraphPort;
  editors: EditorBrokerPort;
  arena: ArenaClientPort;
  /** Ambient shell context for organization selection (defaults: "unknown" / []). */
  environmentProfile?: string;
  userRef?: string;
  constraints?: readonly string[];
  /**
   * Wave-3 optional read seams (types frozen in @sporta/contracts). An
   * absent seam leaves its stage pending with the honest v1 detail —
   * graceful degradation, never an error, never a fabricated state.
   */
  editorSessionHistory?: EditorSessionHistoryReadPort;
  learningArtifacts?: LearningArtifactReadPort;
  organizationCandidates?: OrganizationCandidateReadPort;
  escalations?: EscalationReadPort;
}
