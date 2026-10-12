/**
 * W7C-2 — the deployment-descriptor validator (SPEC §W7C-2).
 *
 * FAIL-CLOSED: every problem is a typed issue; the whole issue list is
 * carried on the thrown `DeploymentDescriptorError` (never a silent
 * default, never a partial read). Unknown shapes, missing components,
 * invalid ports, missing/malformed store roots, malformed env names,
 * health checks referencing unknown components, and a missing
 * hosted-preview entry all refuse the descriptor.
 */
import {
  LOCAL_BOOT_COMPONENT_IDS,
  REQUIRED_LOCAL_BOOT_COMPONENTS,
  type LocalBootComponentId,
  type LocalDeploymentDescriptor,
} from './deploymentDescriptor.js';

/** The descriptor schema version this validator understands. */
const KNOWN_DESCRIPTOR_VERSION = 1;
const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/** One typed validation issue (machine-readable rule + detail). */
export interface DeploymentDescriptorIssue {
  readonly rule:
    | 'shape'
    | 'name'
    | 'version'
    | 'components-empty'
    | 'component-unknown'
    | 'component-missing'
    | 'component-duplicate'
    | 'port-invalid'
    | 'store-root-missing'
    | 'store-root-invalid'
    | 'env-name-invalid'
    | 'env-duplicate'
    | 'health-check-empty'
    | 'health-check-unknown-component'
    | 'preview-entry-invalid';
  readonly detail: string;
}

/** The fail-closed validation error — carries the FULL issue list. */
export class DeploymentDescriptorError extends Error {
  readonly issues: readonly DeploymentDescriptorIssue[];

  constructor(issues: readonly DeploymentDescriptorIssue[]) {
    super(
      `deployment descriptor rejected (${String(issues.length)} issue(s)): ` +
        issues.map((issue) => `${issue.rule}(${issue.detail})`).join('; '),
    );
    this.name = 'DeploymentDescriptorError';
    this.issues = issues;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArrayOf(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return null;
    out.push(item);
  }
  return out;
}

function validateStoreRoots(
  value: unknown,
  issues: DeploymentDescriptorIssue[],
): void {
  if (!isPlainObject(value)) {
    issues.push({ rule: 'store-root-missing', detail: 'storeRoots must be an object' });
    return;
  }
  for (const key of ['blobs', 'editorSessions', 'sharedSessions', 'runJournals'] as const) {
    const root = value[key];
    if (typeof root !== 'string' || root.length === 0) {
      issues.push({ rule: 'store-root-missing', detail: `storeRoots.${key} must be a non-empty string` });
      continue;
    }
    if (root.startsWith('/') || root.includes('..') || root.includes('\\')) {
      issues.push({
        rule: 'store-root-invalid',
        detail: `storeRoots.${key} must be a relative name under the store root (no '/', '..', or '\\')`,
      });
    }
  }
}

function validateEnvNames(
  label: 'requiredEnv' | 'optionalEnv',
  value: unknown,
  issues: DeploymentDescriptorIssue[],
  seenAcross: Map<string, string>,
): void {
  const names = stringArrayOf(value);
  if (names === null) {
    issues.push({ rule: 'env-name-invalid', detail: `${label} must be an array of strings` });
    return;
  }
  const seen = new Set<string>();
  for (const name of names) {
    if (!ENV_NAME_PATTERN.test(name)) {
      issues.push({ rule: 'env-name-invalid', detail: `${label}: "${name}" is not an UPPER_SNAKE env name` });
    }
    if (seen.has(name)) {
      issues.push({ rule: 'env-duplicate', detail: `${label}: duplicate name "${name}"` });
    }
    seen.add(name);
    const other = seenAcross.get(name);
    if (other !== undefined && other !== label) {
      issues.push({ rule: 'env-duplicate', detail: `"${name}" appears in both ${other} and ${label}` });
    }
    seenAcross.set(name, label);
  }
}

/**
 * Validate an unknown value as a LocalDeploymentDescriptor. Returns the
 * typed descriptor on success; THROWS `DeploymentDescriptorError` carrying
 * the full issue list otherwise (fail-closed — never a silent default).
 */
export function validateDeploymentDescriptor(input: unknown): LocalDeploymentDescriptor {
  const issues: DeploymentDescriptorIssue[] = [];
  if (!isPlainObject(input)) {
    throw new DeploymentDescriptorError([{ rule: 'shape', detail: 'descriptor must be a plain object' }]);
  }

  if (typeof input.name !== 'string' || input.name.length === 0) {
    issues.push({ rule: 'name', detail: 'name must be a non-empty string' });
  }
  if (input.version !== KNOWN_DESCRIPTOR_VERSION) {
    issues.push({
      rule: 'version',
      detail: `version must be exactly ${String(KNOWN_DESCRIPTOR_VERSION)} (got ${String(input.version)})`,
    });
  }

  const components = stringArrayOf(input.components);
  if (components === null || components.length === 0) {
    issues.push({ rule: 'components-empty', detail: 'components must be a non-empty array' });
  } else {
    const seen = new Set<string>();
    for (const id of components) {
      if (!(LOCAL_BOOT_COMPONENT_IDS as readonly string[]).includes(id)) {
        issues.push({ rule: 'component-unknown', detail: `unknown component "${id}"` });
      }
      if (seen.has(id)) {
        issues.push({ rule: 'component-duplicate', detail: `duplicate component "${id}"` });
      }
      seen.add(id);
    }
    for (const required of REQUIRED_LOCAL_BOOT_COMPONENTS) {
      if (!seen.has(required)) {
        issues.push({ rule: 'component-missing', detail: `required component "${required}" is missing` });
      }
    }
  }

  if (!isPlainObject(input.portMap) || typeof input.portMap.wsDeltaSink !== 'number') {
    issues.push({ rule: 'port-invalid', detail: 'portMap.wsDeltaSink must be a number' });
  } else {
    const port = input.portMap.wsDeltaSink;
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      issues.push({
        rule: 'port-invalid',
        detail: `portMap.wsDeltaSink must be an integer 0-65535 (0 = OS-assigned); got ${String(port)}`,
      });
    }
  }

  validateStoreRoots(input.storeRoots, issues);

  const envSeen = new Map<string, string>();
  validateEnvNames('requiredEnv', input.requiredEnv, issues, envSeen);
  validateEnvNames('optionalEnv', input.optionalEnv, issues, envSeen);

  if (!Array.isArray(input.healthChecks) || input.healthChecks.length === 0) {
    issues.push({ rule: 'health-check-empty', detail: 'healthChecks must be a non-empty array' });
  } else {
    const declared = new Set(components ?? []);
    for (const check of input.healthChecks) {
      if (!isPlainObject(check) || typeof check.component !== 'string' || typeof check.check !== 'string' || check.check.length === 0) {
        issues.push({ rule: 'health-check-empty', detail: 'each health check needs a component and a non-empty check' });
        continue;
      }
      const component = check.component as LocalBootComponentId;
      if (!(LOCAL_BOOT_COMPONENT_IDS as readonly string[]).includes(component) || !declared.has(component)) {
        issues.push({
          rule: 'health-check-unknown-component',
          detail: `health check references "${String(check.component)}" which is not a declared component`,
        });
      }
    }
  }

  if (typeof input.hostedPreviewEntryPoint !== 'string' || !input.hostedPreviewEntryPoint.startsWith('/')) {
    issues.push({
      rule: 'preview-entry-invalid',
      detail: 'hostedPreviewEntryPoint must be a route path starting with "/"',
    });
  }

  if (issues.length > 0) throw new DeploymentDescriptorError(issues);

  // Shape is fully validated above; cast through the validated object.
  return input as unknown as LocalDeploymentDescriptor;
}
