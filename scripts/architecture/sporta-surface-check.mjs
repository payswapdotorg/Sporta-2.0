#!/usr/bin/env node
/**
 * sporta-surface-check — verifies that the frozen Wave 0/Wave 1 public
 * contract surfaces still export every frozen name (additive-only law:
 * semantic contracts must remain stable unless an ADR changes them).
 *
 * Usage: node scripts/architecture/sporta-surface-check.mjs
 * Exit 0 = all frozen names present; exit 1 = missing exports (with list).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(import.meta.dirname, "../..");

/** Frozen public names per module (Wave 0 freeze + wave-1 additions). */
const FROZEN = {
  "sporta-policy": ["RightsScope", "PrivacyScope", "RetentionPolicy", "PolicySet"],
  "sporta-contracts": [
    "PolicySet",
    "RightsScope",
    "PrivacyScope",
    "RetentionPolicy",
    "SportaId",
    "Iso8601",
    "ContentHash",
    "Confidence",
    "ProvenanceDescriptor",
    "LearningPolicyRef",
    "IntentSpec",
    "WorkGraphNodeKind",
    "WorkGraphNode",
    "WorkGraphRecord",
    "AgentBodyRecord",
    "CapabilityRecord",
    "OrganizationVersionRecord",
    "ToolSessionRecord",
    "ArtifactRecord",
    "ArtifactRevisionRecord",
    "EditDeltaRecord",
    "EditorSessionRecord",
    "SportsWorldModelRecord",
    "EvidenceRecord",
    "CapabilityGapRecord",
    "ArenaEscalationRecord",
    "ArenaResultRecord",
    "LearningArtifactRecord",
    "EvaluationReportRecord",
    "EvaluationMetric",
    "PromotionRecord",
  ],
  "sporta-work": [
    "IntentSpec",
    "WorkGraphNode",
    "WorkGraphNodeKind",
    "WorkGraphRecord",
    "ActorDescriptor",
    "OpenIntentInput",
    "AppendWorkNodeInput",
    "WorkGraphPort",
  ],
  "sporta-organizations": [
    "AgentBodyRecord",
    "CapabilityRecord",
    "OrganizationVersionRecord",
    "ToolSessionRecord",
    "OrganizationSelectionContext",
    "OrganizationCandidate",
    "SelectionFactor",
    "OrganizationSelection",
    "RegisterOrganizationInput",
    "OrganizationResolverPort",
    "OrganizationRegistryPort",
  ],
  "sporta-lab": [
    "LabPopulationKind",
    "LabSearchInput",
    "LabReplayInput",
    "LabReplayReport",
    "LabPort",
  ],
  "sporta-evaluation": [
    "EvaluationMetric",
    "EvaluationReportRecord",
    "InterventionCostInput",
    "EvaluateCandidatesInput",
    "EvaluationPort",
  ],
  "sporta-artifacts": [
    "ArtifactRecord",
    "ArtifactRevisionRecord",
    "EditDeltaRecord",
    "RecordArtifactInput",
    "CommitRevisionInput",
    "ArtifactGraphPort",
  ],
  "sporta-editors": [
    "EditDeltaRecord",
    "EditorSessionRecord",
    "ResolveEditorInput",
    "EditorAvailability",
    "EditorResolution",
    "OpenEditorSessionInput",
    "ReconcileSessionInput",
    "ReconcileResult",
    "EditorBrokerPort",
  ],
  "sporta-world": ["SportsWorldModelRecord", "ObservationInput", "WorldModelPort"],
  "sporta-compute": [
    "PolicySet",
    "ComputeJobSpec",
    "TypedRefusal",
    "ComputeJobState",
    "ComputeJobStatus",
    "ComputeQuote",
    "SubmitComputeInput",
    "ComputeBrokerPort",
  ],
  "sporta-arena": [
    "ArenaEscalationRecord",
    "ArenaResultRecord",
    "CapabilityGapRecord",
    "RecordCapabilityGapInput",
    "EscalateInput",
    "ValidationVerdict",
    "ArenaClientPort",
  ],
  "sporta-product": [
    "ProductLoopStageKind",
    "ProductLoopStage",
    "ProductLoopTrace",
    "ProductLoopProjectionPort",
    "LearningConsentInput",
    "LearningIntakePort",
  ],
};

/** All names exported by one contract.ts (named, re-exported, declared). */
function exportedNames(source) {
  const sf = ts.createSourceFile("contract.ts", source, ts.ScriptTarget.Latest, true);
  const names = new Set();
  function visit(node) {
    if (ts.isExportDeclaration(node)) {
      const clause = node.exportClause;
      if (clause && ts.isNamedExports(clause)) {
        for (const el of clause.elements) names.add(el.name.text);
      }
    } else if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
        names.add(node.name.text);
      } else if (
        (ts.isClassDeclaration(node) ||
          ts.isFunctionDeclaration(node) ||
          ts.isEnumDeclaration(node)) &&
        node.name
      ) {
        names.add(node.name.text);
      } else if (ts.isVariableStatement(node)) {
        for (const d of node.declarationList.declarations) {
          if (ts.isIdentifier(d.name)) names.add(d.name.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return names;
}

let failures = 0;
for (const [pkg, frozen] of Object.entries(FROZEN)) {
  const file = path.join(ROOT, "packages", pkg, "src", "contract.ts");
  let source;
  try {
    source = await fs.readFile(file, "utf8");
  } catch {
    console.error(`MISSING FILE: ${path.relative(ROOT, file)}`);
    failures += 1;
    continue;
  }
  const names = exportedNames(source);
  const missing = frozen.filter((name) => !names.has(name));
  if (missing.length > 0) {
    console.error(`FROZEN SURFACE VIOLATION in ${pkg}: missing ${missing.join(", ")}`);
    failures += 1;
  } else {
    console.log(
      `ok: ${pkg} exports all ${frozen.length} frozen names (+${names.size - frozen.length} additive)`,
    );
  }
}
if (failures > 0) {
  console.error(`sporta-surface-check: FAILED (${failures} module(s))`);
  process.exit(1);
}
console.log("sporta-surface-check: OK — frozen surfaces intact, growth is additive-only");
