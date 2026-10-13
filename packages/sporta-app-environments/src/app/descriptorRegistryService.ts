/**
 * W9C-1 — the descriptor registry service (app layer). Registers validated
 * `ApplicationEnvironmentDescriptor`s into an injected store and verifies
 * targets honestly through the `ApplicationTargetStatePort` (the adapter
 * owns the real IO). An unreachable target is NEVER registered as healthy
 * — verification returns the observed state and the caller decides.
 */
import type {
  ApplicationEnvironmentDescriptor,
  SportaId,
} from "@sporta/app-environments/contract";
import {
  ApplicationDescriptorValidationError,
  ApplicationUnknownRecordError,
} from "../domain/errors.js";
import { validateApplicationEnvironmentDescriptor } from "../domain/registry.js";
import type {
  ApplicationDescriptorStorePort,
  ApplicationTargetStatePort,
  AppEnvironmentClock,
} from "../domain/ports.js";

/** Constructor dependencies — every IO seam injected. */
export interface DescriptorRegistryServiceDeps {
  clock: AppEnvironmentClock;
  descriptors: ApplicationDescriptorStorePort;
  /** Optional target verification seam; absent = registration unverified (honest null). */
  targets?: ApplicationTargetStatePort;
}

/** The result of one target verification (real adapter read). */
export interface ApplicationTargetVerification {
  descriptorId: SportaId;
  targetIdentity: string;
  reachable: boolean;
  stateDigest: string | null;
  observations: readonly { kind: string; detail: string }[];
  verifiedAt: string;
}

export class DescriptorRegistryService {
  private readonly deps: DescriptorRegistryServiceDeps;

  constructor(deps: DescriptorRegistryServiceDeps) {
    this.deps = deps;
  }

  /**
   * Register one descriptor (idempotent per descriptorId). Fail-closed:
   * a descriptor with typed validation violations is refused — the typed
   * error carries every violation. Re-registering a byte-identical
   * descriptor is a no-op returning the stored record.
   */
  registerDescriptor(descriptor: ApplicationEnvironmentDescriptor): ApplicationEnvironmentDescriptor {
    const validation = validateApplicationEnvironmentDescriptor(descriptor);
    if (!validation.valid) {
      throw new ApplicationDescriptorValidationError(
        `descriptor ${descriptor.descriptorId} failed validation with ${validation.violations.length} violation(s)`,
        validation.violations,
      );
    }
    const existing = this.deps.descriptors.byDescriptorId(descriptor.descriptorId);
    if (existing !== null) {
      if (JSON.stringify(existing) !== JSON.stringify(descriptor)) {
        throw new ApplicationDescriptorValidationError(
          `descriptor ${descriptor.descriptorId} is already registered with different content — a changed app release requires a new descriptor id (reauthorization law)`,
          [{ kind: "descriptor-conflict", detail: "same id, different content" }],
        );
      }
      return existing;
    }
    this.deps.descriptors.save(descriptor);
    return descriptor;
  }

  /** Read one descriptor (typed unknown error, never null lies). */
  readDescriptor(descriptorId: SportaId): ApplicationEnvironmentDescriptor {
    const descriptor = this.deps.descriptors.byDescriptorId(descriptorId);
    if (descriptor === null) {
      throw new ApplicationUnknownRecordError(
        `no application environment descriptor ${descriptorId}`,
        "descriptor",
        descriptorId,
      );
    }
    return descriptor;
  }

  /** Read the descriptor of one application (latest registered). */
  readDescriptorByApplication(applicationId: SportaId): ApplicationEnvironmentDescriptor {
    const descriptor = this.deps.descriptors.byApplicationId(applicationId);
    if (descriptor === null) {
      throw new ApplicationUnknownRecordError(
        `no descriptor registered for application ${applicationId}`,
        "descriptor",
        applicationId,
      );
    }
    return descriptor;
  }

  /** List all registered descriptors (the attachable app catalog). */
  listDescriptors(): readonly ApplicationEnvironmentDescriptor[] {
    return this.deps.descriptors.list();
  }

  /**
   * Verify one descriptor's target through the real adapter read. An
   * unreadable state reports `reachable: false` honestly (the typed
   * adapter error is caught and surfaced in observations); a reachable
   * target reports the real state digest. Registration health is the
   * CALLER's decision — verification never flips state silently.
   */
  async verifyTarget(descriptorId: SportaId): Promise<ApplicationTargetVerification> {
    const descriptor = this.readDescriptor(descriptorId);
    if (this.deps.targets === undefined) {
      return {
        descriptorId: descriptor.descriptorId,
        targetIdentity: descriptor.targetIdentity,
        reachable: false,
        stateDigest: null,
        observations: [{ kind: "verification-seam-absent", detail: "no target state port wired" }],
        verifiedAt: this.deps.clock.now(),
      };
    }
    try {
      const snapshot = await this.deps.targets.readTargetState(descriptor.targetIdentity);
      return {
        descriptorId: descriptor.descriptorId,
        targetIdentity: descriptor.targetIdentity,
        reachable: true,
        stateDigest: snapshot.stateDigest,
        observations: snapshot.observations,
        verifiedAt: this.deps.clock.now(),
      };
    } catch (cause) {
      return {
        descriptorId: descriptor.descriptorId,
        targetIdentity: descriptor.targetIdentity,
        reachable: false,
        stateDigest: null,
        observations: [
          {
            kind: "target-unreachable",
            detail: cause instanceof Error ? cause.message : String(cause),
          },
        ],
        verifiedAt: this.deps.clock.now(),
      };
    }
  }
}
