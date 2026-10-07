/**
 * sporta-lab — organization search, replay and candidate generation.
 *
 * The Lab optimizes "best organization for this user, this intent, this
 * source, this environment and these constraints" — never only benchmark
 * score. Simulation results never become production truth.
 */
import type { IntentSpec, SportaId } from "@sporta/contracts/contract";
import type { OrganizationCandidate } from "@sporta/organizations/contract";

/** Population kinds the Lab may search. */
export type LabPopulationKind =
  | "baseline-generalist"
  | "specialist"
  | "historical-winner"
  | "personalized"
  | "hand-authored"
  | "arena-improved"
  | "experimentally-evolved";

/** Input for a Lab population search. */
export interface LabSearchInput {
  intent: IntentSpec;
  userRef?: SportaId;
  sourceRef?: SportaId;
  environmentProfile: string;
  constraints: readonly string[];
  populations: readonly LabPopulationKind[];
}

/** Input for replaying a historical WorkGraph under a candidate organization. */
export interface LabReplayInput {
  workGraphId: SportaId;
  organization: OrganizationCandidate["organization"];
}

/** Fixture- or replay-grade report; never production truth. */
export interface LabReplayReport {
  workGraphId: SportaId;
  organizationId: SportaId;
  replayedAt: string;
  outcome: "success" | "partial" | "failure";
  /** Manual interventions counted during replay (first-class evaluation signal). */
  interventionCost: number;
  evidence: readonly SportaId[];
}

/** The Lab port. */
export interface LabPort {
  searchPopulation(input: LabSearchInput): Promise<readonly OrganizationCandidate[]>;
  replay(input: LabReplayInput): Promise<LabReplayReport>;
}
