/**
 * sporta-organizations — semantic owner of organization state.
 *
 * Organization versions are immutable after promotion. Selection is
 * explainable (invariant 17): context = intent + user + source +
 * environment + constraints. A model/provider is not an organization.
 */
import type {
  AgentBodyRecord,
  CapabilityRecord,
  IntentSpec,
  OrganizationVersionRecord,
  SportaId,
  ToolSessionRecord,
  WorkGraphRecord,
} from "@sporta/contracts/contract";

export type {
  AgentBodyRecord,
  CapabilityRecord,
  OrganizationVersionRecord,
  ToolSessionRecord,
} from "@sporta/contracts/contract";

/** Context in which an organization is selected. */
export interface OrganizationSelectionContext {
  intent: IntentSpec;
  workGraph: WorkGraphRecord;
  userRef?: SportaId;
  environmentProfile: string;
  constraints: readonly string[];
}

/** One candidate with evidence-backed rationale (never a single metric). */
export interface OrganizationCandidate {
  organization: OrganizationVersionRecord;
  rationale: string;
  evidence: readonly SportaId[];
}

/** One explainability factor. */
export interface SelectionFactor {
  factor: string;
  weight: number;
  detail: string;
}

/** Explainable selection result. */
export interface OrganizationSelection {
  selected: OrganizationCandidate;
  candidates: readonly OrganizationCandidate[];
  explanation: readonly SelectionFactor[];
}

/** Input for registering a draft (pre-promotion) organization version. */
export interface RegisterOrganizationInput {
  record: OrganizationVersionRecord;
}

/** Resolves the organization to perform work. Deterministic for equal inputs. */
export interface OrganizationResolverPort {
  resolve(context: OrganizationSelectionContext): Promise<OrganizationSelection>;
}

/** Append-only organization registry. Promoted versions are immutable. */
export interface OrganizationRegistryPort {
  registerDraft(input: RegisterOrganizationInput): Promise<OrganizationVersionRecord>;
  readVersion(organizationId: SportaId, version: number): Promise<OrganizationVersionRecord | null>;
}
