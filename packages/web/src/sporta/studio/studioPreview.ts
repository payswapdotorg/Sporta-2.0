/**
 * The studio sample preview (W9C-6) — runs the CURRENT draft's
 * deterministic lane over the sample feed bytes: a REAL child process
 * (real spawn, real pipes, real exit code, real resource evidence) over
 * real temp-dir files. When the draft contains a model node, the
 * FIXTURE model lane runs over the trimmed output (labeled; never
 * claimed real). The preview never mutates the marketplace/graph state.
 */
import type {
  TransformDeterministicNodePort,
  TransformModelPort,
} from "@sporta/transforms/contract";
import type { StudioPreviewState } from "./studioPorts.js";
import type { StudioDraft } from "./studioGraph.js";
import { STUDIO_FEED_PROVENANCE } from "./studioGraph.js";

/** Run the sample preview (REAL deterministic lane; fixture model lane). */
export async function runStudioPreview(
  draft: StudioDraft,
  feedBytes: Uint8Array,
  deterministic: TransformDeterministicNodePort,
  models: TransformModelPort,
): Promise<StudioPreviewState> {
  const trimNode = draft.nodes.find((node) => node.kind === "deterministic-filter");
  if (trimNode === undefined) {
    return {
      status: "failed",
      detail: "no deterministic node in the graph to preview",
      outputPreview: "",
      laneNotes: [],
      evidenceGrade: "real",
    };
  }
  const executed = await deterministic.execute({
    node: trimNode,
    parameters: { ...draft.parameters[trimNode.nodeId] },
    input: { bytes: feedBytes, provenance: STUDIO_FEED_PROVENANCE },
  });
  const laneNotes = [
    `deterministic lane: ${executed.detail} (${executed.timingMs}ms, real child process)`,
    `resources: cpu ${executed.resourceUse.cpuMs}ms, ${executed.resourceUse.memoryMiB}MiB, out ${executed.resourceUse.outputBytes}B`,
  ];
  if (executed.status !== "succeeded" || executed.outputBytes === null) {
    return {
      status: "failed",
      detail: executed.detail,
      outputPreview: "",
      laneNotes,
      evidenceGrade: "real",
    };
  }
  const modelNode = draft.nodes.find((node) => node.kind === "model");
  if (modelNode !== undefined) {
    const invoked = await models.invokeModel({
      modelRef: { name: modelNode.componentRef.name, digest: modelNode.componentRef.digest },
      prompt: new TextDecoder().decode(executed.outputBytes),
      parameters: {},
    });
    laneNotes.push(`model lane (${invoked.evidenceGrade}): ${invoked.detail}`);
  }
  return {
    status: "ran",
    detail:
      executed.summary === null
        ? executed.detail
        : `kept ${executed.summary.keptCount}, dropped ${executed.summary.droppedCount} events`,
    outputPreview: new TextDecoder().decode(executed.outputBytes.slice(0, 400)),
    laneNotes,
    evidenceGrade: draft.nodes.some((node) => node.kind === "model") ? "fixture" : "real",
  };
}
