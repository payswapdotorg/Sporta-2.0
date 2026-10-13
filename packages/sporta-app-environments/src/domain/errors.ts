/**
 * W9C — typed error taxonomy (domain — pure declarations).
 *
 * Every failure is typed and honest (the sibling packages' law): a refusal
 * or state-law violation is a named error class, never a swallowed
 * falsehood. No IO, no node: imports.
 */
import type { SportaId } from "@sporta/contracts/contract";

/** Base class for every sporta-app-environments typed error. */
export class AppEnvironmentError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "AppEnvironmentError";
    this.code = code;
  }
}

/** A required record (descriptor/attachment/session) does not exist. */
export class ApplicationUnknownRecordError extends AppEnvironmentError {
  readonly recordKind: string;
  readonly recordId: SportaId;
  constructor(message: string, recordKind: string, recordId: SportaId) {
    super(message, `unknown-${recordKind}`);
    this.name = "ApplicationUnknownRecordError";
    this.recordKind = recordKind;
    this.recordId = recordId;
  }
}

/** Descriptor registration refused — typed validation violations. */
export class ApplicationDescriptorValidationError extends AppEnvironmentError {
  readonly violations: readonly { kind: string; detail: string }[];
  constructor(message: string, violations: readonly { kind: string; detail: string }[]) {
    super(message, "descriptor-invalid");
    this.name = "ApplicationDescriptorValidationError";
    this.violations = violations;
  }
}

/** Attachment consent/grant law violation (fail-closed). */
export class ApplicationAttachmentError extends AppEnvironmentError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "ApplicationAttachmentError";
  }
}

/** Session lifecycle law violation (closeState law, unknown session). */
export class ApplicationSessionStateError extends AppEnvironmentError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "ApplicationSessionStateError";
  }
}

/** Append-only audit violation — same id, different bytes. */
export class ApplicationAuditConflictError extends AppEnvironmentError {
  readonly actionRecordId: SportaId;
  constructor(message: string, actionRecordId: SportaId) {
    super(message, "audit-conflict");
    this.name = "ApplicationAuditConflictError";
    this.actionRecordId = actionRecordId;
  }
}

/** The app-target read failed honestly (unreachable/corrupt state). */
export class ApplicationTargetStateError extends AppEnvironmentError {
  readonly targetIdentity: string;
  constructor(message: string, targetIdentity: string) {
    super(message, "target-state-unreadable");
    this.name = "ApplicationTargetStateError";
    this.targetIdentity = targetIdentity;
  }
}

/** Reconciliation through the existing WorkGraph/artifact seams failed. */
export class ApplicationReconciliationError extends AppEnvironmentError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "ApplicationReconciliationError";
  }
}
