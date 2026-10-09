/**
 * Provider deployment adapters (adapters layer).
 *
 * Implements the provider-agnostic deployment seam with concrete
 * provider adapters. This is the C5/C6 provider abstraction.
 */
import type {
  DeploymentAdapterPort,
  DeploymentConfig,
  DeploymentDescriptor,
  DeploymentFactory,
  DeploymentPlane,
  DeploymentResources,
  DeploymentResult,
  DeploymentStatus,
  RightsProvenance,
} from "../domain/deploymentDescriptor.js";

/** Factory for creating deployment adapters */
export class DeploymentAdapterFactory {
  private static readonly providers = new Map<string, DeploymentFactory>();

  /** Register a provider factory */
  static registerProvider(name: string, factory: DeploymentFactory): void {
    this.providers.set(name, factory);
  }

  /** Create a deployment adapter for the specified provider */
  static createAdapter(providerName: string, config: DeploymentConfig): DeploymentAdapterPort {
    const factory = this.providers.get(providerName);
    if (!factory) {
      throw new Error(`Unknown provider: ${providerName}`);
    }
    return factory.create(config);
  }

  /** Get all registered provider names */
  static getRegisteredProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

/** Base deployment adapter with common functionality */
export abstract class BaseDeploymentAdapter implements DeploymentAdapterPort {
  protected config: DeploymentConfig;
  protected initialized = false;

  constructor(config: DeploymentConfig) {
    this.config = config;
  }

  async initialize(config: DeploymentConfig): Promise<void> {
    // Validate configuration
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(", ")}`);
    }
    
    this.config = config;
    this.initialized = true;
    
    // Provider-specific initialization
    await this.doInitialize();
  }

  abstract doInitialize(): Promise<void>;

  abstract deploy(plane: DeploymentPlane, resources: DeploymentResources): Promise<DeploymentResult>;
  abstract status(plane: DeploymentPlane): Promise<DeploymentStatus>;
  abstract teardown(plane: DeploymentPlane): Promise<void>;

  /** Default implementation of config validation */
  validateConfig(config: DeploymentConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate control plane
    if (!config.control.apiEndpoint || !config.control.databaseUrl) {
      errors.push("Control plane requires apiEndpoint and databaseUrl");
    }

    // Validate artifact plane
    if (!config.artifact.storageEndpoint) {
      errors.push("Artifact plane requires storageEndpoint");
    }

    // Validate execution plane
    if (!config.execution.computeEndpoint || !config.execution.queueEndpoint) {
      errors.push("Execution plane requires computeEndpoint and queueEndpoint");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/** Fixture provider adapter for testing */
export class FixtureDeploymentAdapter extends BaseDeploymentAdapter {
  private deploymentStatus = new Map<DeploymentPlane, DeploymentStatus>();

  constructor(config: DeploymentConfig) {
    super(config);
    // Initialize with not_deployed status
    this.deploymentStatus.set("control", {
      status: "not_deployed",
      lastUpdated: new Date().toISOString(),
    });
    this.deploymentStatus.set("artifact", {
      status: "not_deployed",
      lastUpdated: new Date().toISOString(),
    });
    this.deploymentStatus.set("execution", {
      status: "not_deployed",
      lastUpdated: new Date().toISOString(),
    });
  }

  async doInitialize(): Promise<void> {
    // Fixture initialization - no actual setup needed
    this.deploymentStatus.forEach((status, plane) => {
      status.lastUpdated = new Date().toISOString();
    });
  }

  async deploy(plane: DeploymentPlane, resources: DeploymentResources): Promise<DeploymentResult> {
    if (!this.initialized) {
      throw new Error("Adapter not initialized");
    }

    // Simulate deployment
    const deploymentId = `fixture-deployment-${Date.now()}`;
    
    // Update status to deploying
    this.deploymentStatus.set(plane, {
      status: "deploying",
      lastUpdated: new Date().toISOString(),
    });

    // Simulate deployment delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Simulate successful deployment
    this.deploymentStatus.set(plane, {
      status: "deployed",
      lastUpdated: new Date().toISOString(),
      providerStatus: {
        deploymentId,
        resourcesDeployed: Object.keys(resources).length,
      },
    });

    return {
      success: true,
      deploymentId,
      providerResponse: {
        plane,
        timestamp: new Date().toISOString(),
        resources: resources,
      },
    };
  }

  async status(plane: DeploymentPlane): Promise<DeploymentStatus> {
    if (!this.initialized) {
      throw new Error("Adapter not initialized");
    }

    const status = this.deploymentStatus.get(plane);
    if (!status) {
      throw new Error(`Unknown plane: ${plane}`);
    }

    return { ...status };
  }

  async teardown(plane: DeploymentPlane): Promise<void> {
    if (!this.initialized) {
      throw new Error("Adapter not initialized");
    }

    // Simulate teardown
    this.deploymentStatus.set(plane, {
      status: "not_deployed",
      lastUpdated: new Date().toISOString(),
    });
  }
}

/** Factory for fixture provider */
export const FixtureDeploymentFactory: DeploymentFactory = {
  create(config: DeploymentConfig): DeploymentAdapterPort {
    return new FixtureDeploymentAdapter(config);
  },

  getProviderName(): string {
    return "fixture";
  },

  validateConfig(config: DeploymentConfig): { valid: boolean; errors: string[] } {
    // Fixture provider accepts any configuration
    return { valid: true, errors: [] };
  },
};

/** Register the fixture provider by default */
DeploymentAdapterFactory.registerProvider("fixture", FixtureDeploymentFactory);

/** Error types for deployment adapters */
export class DeploymentAdapterError extends Error {
  readonly code: "configuration_error" | "deployment_error" | "teardown_error" | "provider_error";
  readonly plane?: DeploymentPlane;
  readonly providerResponse?: Record<string, unknown>;

  constructor(
    code: DeploymentAdapterError["code"],
    message: string,
    plane?: DeploymentPlane,
    providerResponse?: Record<string, unknown>
  ) {
    super(message);
    this.name = "DeploymentAdapterError";
    this.code = code;
    this.plane = plane;
    this.providerResponse = providerResponse;
  }
}

/** Helper to create a deployment descriptor with rights provenance */
export function createDeploymentDescriptor(
  deploymentId: string,
  providerName: string,
  config: DeploymentConfig,
  rightsProvenance: RightsProvenance
): DeploymentDescriptor {
  return {
    deploymentId,
    providerName,
    config,
    rightsProvenance,
    deployedAt: new Date().toISOString(),
    version: "1.0.0",
  };
}

/** Helper to validate rights provenance */
export function validateRightsProvenance(provenance: RightsProvenance): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!provenance.userId) {
    errors.push("Missing userId");
  }

  if (!provenance.organizationId) {
    errors.push("Missing organizationId");
  }

  if (!provenance.scopes || provenance.scopes.length === 0) {
    errors.push("Missing or empty scopes");
  }

  if (!["public", "private", "confidential"].includes(provenance.privacyLevel)) {
    errors.push("Invalid privacyLevel");
  }

  if (provenance.retentionPolicy.duration <= 0) {
    errors.push("Invalid retention duration");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}