/**
 * LabService — app-layer orchestrator implementing LabPort. Owns no
 * state: reads the organizations catalog and the WorkGraph (+ ledger)
 * through constructor-injected ports; injects the clock.
 */
import type {
  OrganizationCandidate,
  OrganizationCatalogPort,
} from "@sporta/organizations/contract";
import type { WorkGraphLedgerPort, WorkGraphPort } from "@sporta/work/contract";
import type { LabPort, LabReplayInput, LabReplayReport, LabSearchInput } from "../domain/ports.js";
import { assertPopulationKinds, derivePopulationCandidates } from "../domain/population.js";
import { simulateReplay } from "../domain/replay.js";
import { LabWorkGraphNotFoundError } from "../domain/errors.js";

export interface LabServiceDeps {
  /** Read access to the organization registry. */
  catalog: OrganizationCatalogPort;
  workGraphs: WorkGraphPort & WorkGraphLedgerPort;
  /** Injectable ISO-8601 clock (fixtures inject a fixed clock). */
  now: () => string;
}

export class LabService implements LabPort {
  private readonly workGraphs: WorkGraphPort & WorkGraphLedgerPort;
  private readonly now: () => string;
  private readonly catalog: LabServiceDeps["catalog"];

  constructor(deps: LabServiceDeps) {
    this.catalog = deps.catalog;
    this.workGraphs = deps.workGraphs;
    this.now = deps.now;
  }

  async searchPopulation(input: LabSearchInput): Promise<readonly OrganizationCandidate[]> {
    assertPopulationKinds(input.populations);
    const entries = await this.catalog.listVersions();
    const derived = derivePopulationCandidates(
      entries.map((entry) => ({ record: entry.record, promoted: entry.promoted })),
      input.populations,
    );
    return derived.map((candidate) => ({
      organization: candidate.record,
      rationale: `matched populations: ${candidate.populations.join(", ")}`,
      evidence: candidate.record.evidence,
    }));
  }

  async replay(input: LabReplayInput): Promise<LabReplayReport> {
    const graph = await this.workGraphs.readWorkGraph(input.workGraphId);
    if (graph === null) {
      throw new LabWorkGraphNotFoundError(`work graph not found: ${input.workGraphId}`);
    }
    const appends = await this.workGraphs.readAppends(input.workGraphId);
    return simulateReplay(graph, appends, input.organization, this.now());
  }
}
