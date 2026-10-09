/**
 * Real HTTP Arena transport adapter (adapters layer).
 *
 * Implements the ArenaTransportPort interface using the Node.js fetch
 * API against an injectable base URL. Evidence class: REAL — every
 * submit/status call performs an actual HTTP request; nothing is
 * simulated in-process.
 *
 * Boundary law (validate-before-apply): wire payloads are unknown JSON.
 * Every field is parsed and narrowed against the domain-owned
 * vocabularies BEFORE a typed value is constructed — an unchecked wire
 * string is never assigned to a contract union type. The boundary
 * validates SHAPE (legal vocabulary members); POLICY validation
 * (session-mode compatibility, provenance sourceKind "arena-session",
 * payload-hash shape) stays in the domain, applied before any state
 * change.
 *
 * Invariants preserved:
 * - Context minimization: only the declared record fields cross the wire
 * - Idempotent escalation semantics: an escalation the Arena already
 *   knows is never re-submitted (remote status check before the POST)
 * - Honest failure typing: network errors, non-2xx, timeouts and
 *   malformed payloads are typed ArenaTransportError failures
 */
import type { ArenaResultRecord, SportaId } from "@sporta/contracts/contract";
import type {
  ArenaTransportPort,
  ArenaTransportStatus,
  ArenaTransportSubmission,
} from "../app/arenaTransport.js";
import {
  ESCALATION_LIFECYCLE_TRANSITIONS,
  type EscalationLifecycle,
} from "../domain/escalation.js";
import {
  ARENA_PROVENANCE_SOURCE_KINDS,
  ARENA_RESULT_TYPES,
  type ArenaResultType,
  type ProvenanceSourceKind,
} from "../domain/resultValidation.js";

/** Constructor options of the HTTP Arena transport. */
export interface HttpArenaTransportDeps {
  /** Base URL of the Arena service (required). */
  baseUrl: string;
  /** Request timeout in milliseconds (default: 30s). */
  timeout?: number;
  /** Optional authorization header value. */
  authorization?: string;
  /** Optional additional headers. */
  headers?: Record<string, string>;
}

/** Error types for the HTTP transport. */
export class ArenaTransportError extends Error {
  readonly code: "network_error" | "http_error" | "validation_error" | "timeout_error";
  readonly statusCode?: number;
  readonly response?: string;

  constructor(
    code: ArenaTransportError["code"],
    message: string,
    statusCode?: number,
    response?: string
  ) {
    super(message);
    this.name = "ArenaTransportError";
    this.code = code;
    this.statusCode = statusCode;
    this.response = response;
  }
}

/** The lifecycle vocabulary as plain strings (narrowing target for wire values). */
const LIFECYCLE_STATES: readonly string[] = Object.keys(ESCALATION_LIFECYCLE_TRANSITIONS);

/** The result-type vocabulary as plain strings. */
const RESULT_TYPES: readonly string[] = ARENA_RESULT_TYPES;

/** The provenance source-kind vocabulary as plain strings. */
const PROVENANCE_SOURCE_KINDS: readonly string[] = ARENA_PROVENANCE_SOURCE_KINDS;

function isEscalationLifecycle(value: unknown): value is EscalationLifecycle {
  return typeof value === "string" && LIFECYCLE_STATES.includes(value);
}

function isArenaResultType(value: unknown): value is ArenaResultType {
  return typeof value === "string" && RESULT_TYPES.includes(value);
}

function isProvenanceSourceKind(value: unknown): value is ProvenanceSourceKind {
  return typeof value === "string" && PROVENANCE_SOURCE_KINDS.includes(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function expectRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ArenaTransportError("validation_error", `Invalid response: ${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseLifecycle(value: unknown, field: string): EscalationLifecycle {
  if (!isEscalationLifecycle(value)) {
    throw new ArenaTransportError(
      "validation_error",
      `Invalid response: ${field} is not a legal escalation lifecycle: ${JSON.stringify(value)}`
    );
  }
  return value;
}

/** HTTP implementation of the Arena transport port. */
export class HttpArenaTransport implements ArenaTransportPort {
  readonly #baseUrl: string;
  readonly #timeout: number;
  readonly #headers: Record<string, string>;
  readonly #authorization?: string;

  constructor(deps: HttpArenaTransportDeps) {
    if (!deps.baseUrl) {
      throw new Error("HTTP Arena transport requires a baseUrl");
    }
    // Ensure baseUrl ends with /
    this.#baseUrl = deps.baseUrl.endsWith("/") ? deps.baseUrl : `${deps.baseUrl}/`;
    this.#timeout = deps.timeout ?? 30000;
    this.#authorization = deps.authorization;
    this.#headers = {
      "Content-Type": "application/json",
      ...deps.headers,
    };
    if (this.#authorization) {
      this.#headers.Authorization = this.#authorization;
    }
  }

  async submit(submission: ArenaTransportSubmission): Promise<void> {
    const { escalation, contextRefs } = submission;

    // Idempotency: an escalation the Arena already knows is not re-sent.
    const existingStatus = await this.status(escalation.escalationId);
    if (existingStatus !== null) {
      return;
    }

    const url = new URL("escalations", this.#baseUrl).href;

    // Context minimization: exactly the declared escalation fields plus
    // the pre-filtered context refs cross the wire — nothing else.
    const payload = {
      escalation: { ...escalation },
      contextRefs: [...contextRefs],
    };

    const response = await this.#fetch(url, { method: "POST", body: JSON.stringify(payload) });
    const body = await this.#readJson(response);
    this.#validateSubmissionResponse(body);
  }

  async status(escalationId: SportaId): Promise<ArenaTransportStatus | null> {
    const url = new URL(`escalations/${encodeURIComponent(escalationId)}`, this.#baseUrl).href;

    const response = await this.#fetch(url, { method: "GET" });
    if (response.status === 404) {
      return null;
    }
    const body = await this.#readJson(response);
    return this.#parseStatusResponse(body);
  }

  /** fetch with timeout/abort and typed network/timeout error mapping. */
  async #fetch(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.#timeout);
    try {
      return await fetch(url, { ...init, headers: this.#headers, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new ArenaTransportError(
          "timeout_error",
          `Request timed out after ${this.#timeout}ms`
        );
      }
      const detail = error instanceof Error ? error.message : String(error);
      const cause =
        error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : "";
      throw new ArenaTransportError("network_error", `Network error: ${detail}${cause}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Read a response body as JSON: non-2xx maps to http_error, invalid JSON to validation_error. */
  async #readJson(response: Response): Promise<unknown> {
    if (!response.ok) {
      const responseText = await response.text();
      throw new ArenaTransportError(
        "http_error",
        `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        responseText
      );
    }
    try {
      return await response.json();
    } catch (error) {
      throw new ArenaTransportError(
        "validation_error",
        `Invalid response: body is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /** Validate the response from a submission request. */
  #validateSubmissionResponse(response: unknown): void {
    const obj = expectRecord(response, "response");
    if (typeof obj.escalationId !== "string") {
      throw new ArenaTransportError(
        "validation_error",
        "Invalid response: missing or invalid escalationId"
      );
    }
    // Legal submission echoes: the record as sent ("created") or the
    // first step the Arena may take (ESCALATION_LIFECYCLE_TRANSITIONS
    // maps "created" -> ["triaged"]).
    const lifecycle = parseLifecycle(obj.lifecycle, "lifecycle");
    if (lifecycle !== "created" && lifecycle !== "triaged") {
      throw new ArenaTransportError(
        "validation_error",
        `Invalid response: illegal lifecycle transition to ${lifecycle}`
      );
    }
  }

  /** Parse the response from a status request into a typed status. */
  #parseStatusResponse(response: unknown): ArenaTransportStatus {
    const obj = expectRecord(response, "response");
    const lifecycle = parseLifecycle(obj.lifecycle, "lifecycle");
    const result =
      obj.result === null || obj.result === undefined ? null : this.#parseResult(obj.result);
    return { lifecycle, result };
  }

  /** Parse one wire result into a typed ArenaResultRecord (validate-before-apply). */
  #parseResult(value: unknown): ArenaResultRecord {
    const resultObj = expectRecord(value, "result");

    if (typeof resultObj.resultId !== "string") {
      throw new ArenaTransportError("validation_error", "Invalid response: missing or invalid resultId");
    }
    if (typeof resultObj.escalationId !== "string") {
      throw new ArenaTransportError(
        "validation_error",
        "Invalid response: missing or invalid result.escalationId"
      );
    }
    const { resultType } = resultObj;
    if (!isArenaResultType(resultType)) {
      throw new ArenaTransportError(
        "validation_error",
        `Invalid response: result.resultType is not a legal arena result type: ${JSON.stringify(resultType)}`
      );
    }
    if (typeof resultObj.payloadHash !== "string") {
      throw new ArenaTransportError(
        "validation_error",
        "Invalid response: missing or invalid result.payloadHash"
      );
    }
    if (typeof resultObj.validated !== "boolean") {
      throw new ArenaTransportError(
        "validation_error",
        "Invalid response: missing or invalid result.validated"
      );
    }
    if (!isStringArray(resultObj.learningArtifactRefs)) {
      throw new ArenaTransportError(
        "validation_error",
        "Invalid response: result.learningArtifactRefs must be an array of strings"
      );
    }

    const provenance = expectRecord(resultObj.provenance, "result.provenance");
    const { sourceKind } = provenance;
    if (!isProvenanceSourceKind(sourceKind)) {
      throw new ArenaTransportError(
        "validation_error",
        `Invalid response: result.provenance.sourceKind is not a legal provenance kind: ${JSON.stringify(sourceKind)}`
      );
    }
    if (typeof provenance.sourceRef !== "string") {
      throw new ArenaTransportError(
        "validation_error",
        "Invalid response: missing or invalid result.provenance.sourceRef"
      );
    }
    if (typeof provenance.capturedAt !== "string") {
      throw new ArenaTransportError(
        "validation_error",
        "Invalid response: missing or invalid result.provenance.capturedAt"
      );
    }
    if (provenance.confidence !== undefined && typeof provenance.confidence !== "number") {
      throw new ArenaTransportError(
        "validation_error",
        "Invalid response: result.provenance.confidence must be a number"
      );
    }

    return {
      resultId: resultObj.resultId,
      escalationId: resultObj.escalationId,
      resultType,
      payloadHash: resultObj.payloadHash,
      validated: resultObj.validated,
      learningArtifactRefs: [...resultObj.learningArtifactRefs],
      provenance: {
        sourceKind,
        sourceRef: provenance.sourceRef,
        capturedAt: provenance.capturedAt,
        ...(provenance.confidence !== undefined ? { confidence: provenance.confidence } : {}),
      },
    };
  }
}
