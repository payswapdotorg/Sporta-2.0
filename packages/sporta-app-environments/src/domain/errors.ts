/**
 * sporta-app-environments typed errors (domain layer — pure).
 *
 * Every operational refusal is a typed error with a machine-readable
 * refusalKind — an honest no, never a swallowed failure (the
 * sporta-marketplace/sporta-work error precedent). POLICY denials of
 * app actions are NOT errors: they are typed
 * ApplicationActionAdmissionResult refusals recorded in the audit
 * trail (see domain/admission.ts). Errors here cover malformed
 * requests, registry/consent/session laws and store integrity.
 */

/** Base type for every app-environment typed error. */
export class AppEnvironmentsError extends Error {
  readonly refusalKind: string;

  constructor(message: string, refusalKind: string) {
    super(message);
    this.name = new.target.name;
    this.refusalKind = refusalKind;
  }
}

/** Descriptor registry laws (validation, catalog stability). */
export class ApplicationRegistryError extends AppEnvironmentsError {
  constructor(message: string, refusalKind: string) {
    super(message, refusalKind);
  }
}

/** Attachment/grant consent laws (scope, classes, expiry, learning consent). */
export class ApplicationAttachmentError extends AppEnvironmentsError {
  constructor(message: string, refusalKind: string) {
    super(message, refusalKind);
  }
}

/** Session lifecycle laws (open/close states, safe-stop). */
export class ApplicationSessionError extends AppEnvironmentsError {
  constructor(message: string, refusalKind: string) {
    super(message, refusalKind);
  }
}

/** Action orchestration laws (invalid requests, audit integrity). */
export class ApplicationActionError extends AppEnvironmentsError {
  constructor(message: string, refusalKind: string) {
    super(message, refusalKind);
  }
}
