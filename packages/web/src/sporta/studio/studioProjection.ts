/**
 * The studio projection (W9C-6) — the pure read-model that assembles the
 * `StudioState` from the wired world. No mutation, no IO: it projects
 * the graph draft, the marketplace read ports, the launch surfaces and
 * the app-environment permission surface (data scope, granted classes,
 * learning-consent state, the audit trail) exactly as the panel renders
 * them (P9-12/18/22).
 */
import type {
  ApplicationActionRecord,
  ApplicationAttachment,
  ApplicationCapabilityClass,
  ApplicationEnvironmentDescriptor,
  ApplicationSession,
} from "@sporta/app-environments/contract";
import type {
  TransformLaunchDisclosure,
  TransformListing,
  TransformReviewDecision,
} from "@sporta/marketplace/contract";
import type { TransformGraphValidation } from "@sporta/transforms/contract";
import type {
  StudioAppsState,
  StudioGraphState,
  StudioLaunchState,
  StudioMarketplaceState,
  StudioPreviewState,
  StudioState,
} from "./studioPorts.js";
import type { StudioDraft } from "./studioGraph.js";

/** The read seams the projection needs (all injected by the composition). */
export interface StudioProjectionSeams {
  validate(draft: StudioDraft): TransformGraphValidation;
  listingByPipeline(pipelineId: string): TransformListing | null;
  decisionsByCandidateDigest(digest: string): readonly TransformReviewDecision[];
  disclosureForListing(listingId: string): TransformLaunchDisclosure | null;
  attachments(): readonly ApplicationAttachment[];
  appDescriptor(): ApplicationEnvironmentDescriptor | null;
  sessionsOf(attachmentId: string): readonly ApplicationSession[];
  auditTrailOf(sessionIds: readonly string[]): readonly ApplicationActionRecord[];
  targetVerification(): { reachable: boolean; stateDigest: string | null } | null;
}

/** Project the graph-building + validation view. */
export function projectGraphState(draft: StudioDraft, seams: StudioProjectionSeams): StudioGraphState {
  return {
    pipelineId: draft.pipelineId,
    version: draft.version,
    nodes: draft.nodes.map((node) => ({
      nodeId: node.nodeId,
      kind: node.kind,
      componentName: node.componentRef.name,
      componentDigest: node.componentRef.digest,
      note: node.note,
    })),
    edges: draft.edges.map((edge) => ({ from: edge.from.nodeId, to: edge.to.nodeId })),
    parameters: draft.parameters,
    validation: seams.validate(draft),
  };
}

/** Project the marketplace/review status (read ports only). */
export function projectMarketplaceState(
  seams: StudioProjectionSeams,
  pipelineId: string,
): StudioMarketplaceState {
  const listing = seams.listingByPipeline(pipelineId);
  // The listing's release digest IS the approving decision's candidate
  // digest (the w9b byte-equality law) — decisions resolve through it.
  const decisions =
    listing === null ? [] : seams.decisionsByCandidateDigest(listing.currentRelease.releaseDigest);
  return {
    listing,
    decisions,
    disclosure: listing === null ? null : seams.disclosureForListing(listing.listingId),
  };
}

/** Project the app permission/data-scope surface. */
export function projectAppsState(seams: StudioProjectionSeams): StudioAppsState {
  const descriptor = seams.appDescriptor();
  const attachable = descriptor === null ? null : {
    applicationId: descriptor.applicationId,
    descriptorId: descriptor.descriptorId,
    targetIdentity: descriptor.targetIdentity,
    targetKind: descriptor.targetKind,
    dataScope: descriptor.dataClasses,
    networkNeeds: descriptor.networkNeeds,
    limitations: descriptor.limitations,
    licensing: descriptor.licensing,
    capabilities: descriptor.capabilities.map((capability) => ({
      capabilityId: capability.capabilityId,
      capabilityClass: capability.capabilityClass as ApplicationCapabilityClass,
      action: capability.action,
      sideEffects: capability.sideEffects,
      requiredPermissions: capability.requiredPermissions,
    })),
  };
  const attached = seams.attachments().map((attachment) => {
    const sessions = seams.sessionsOf(attachment.attachmentId);
    return {
      attachment,
      dataScope: descriptor?.dataClasses ?? [],
      capabilityCatalog: attachable?.capabilities ?? [],
      sessions,
      auditTrail: seams.auditTrailOf(sessions.map((session) => session.sessionId)),
      targetVerification: seams.targetVerification(),
    };
  });
  return { attachableApp: attachable, attached };
}

/** Project the full studio read state (the panel's single read). */
export function projectStudioState(input: {
  seams: StudioProjectionSeams;
  draft: StudioDraft;
  preview: StudioPreviewState | null;
  launch: StudioLaunchState | null;
}): StudioState {
  const { seams, draft, preview, launch } = input;
  return {
    evidence: "real",
    graph: projectGraphState(draft, seams),
    preview,
    marketplace: projectMarketplaceState(seams, draft.pipelineId),
    launch,
    apps: projectAppsState(seams),
  };
}
