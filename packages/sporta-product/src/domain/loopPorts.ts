/**
 * The product-loop trace and projection-port types (Wave-4 W4C-3
 * restructure, ADR: docs/architecture/adr-wave4-c6-host.md).
 *
 * These types were previously defined IN src/contract.ts, which forced
 * the app-layer stage/projection files to import "../contract.js" — the
 * only such pattern in the repo (every sibling package defines its
 * ports in src/domain and re-exports them through the contract; see
 * sporta-arena domain/clientPorts.ts, sporta-work domain/ports.ts).
 * With the wave-4 composition roots now value-exported through the
 * contract entrypoint, that app->contract edge became an import cycle
 * (architecture:check). The definitions move here (domain layer, no
 * imports at all); contract.ts re-exports them unchanged, so the public
 * surface is byte-for-byte the same set of names.
 */
/** The 12 canonical UX stages of the Sporta product loop. */
export type ProductLoopStageKind =
  | "intent"
  | "organization"
  | "execution"
  | "progress"
  | "artifact"
  | "takeover"
  | "editor"
  | "learning"
  | "capability-gap"
  | "arena"
  | "result"
  | "organization-improvement";

/** One stage of the product loop trace. */
export interface ProductLoopStage {
  stage: ProductLoopStageKind;
  /** Reference to the underlying record when derivable (e.g. the organization version). */
  ref?: string;
  state: "pending" | "active" | "done" | "blocked" | "refused";
  detail?: string;
}

/** The full product loop trace for one WorkGraph. */
export interface ProductLoopTrace {
  workGraphId: string;
  stages: readonly ProductLoopStage[];
}

/** Projects a WorkGraph into the 12-stage product loop trace. */
export interface ProductLoopProjectionPort {
  trace(workGraphId: string): Promise<ProductLoopTrace>;
}
