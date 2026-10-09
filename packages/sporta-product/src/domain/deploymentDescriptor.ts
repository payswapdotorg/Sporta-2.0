/**
 * Provider-neutral deployment descriptor (domain layer).
 *
 * Defines the provider-agnostic deployment seam for Sporta 2.0,
 * supporting local, user-owned and hosted execution planes.
 * This is the C5/C6 provider abstraction per deployment.md.
 */
import type { SportaId } from "@sporta/contracts/contract";

/** Deployment plane types as per deployment.md */
export type DeploymentPlane = "control" | "artifact" | "execution";

/** Provider configuration values (injected at deploy time) */
export interface DeploymentConfig {
  /** Control plane configuration (Vercel-compatible) */
  control: {
    /** API endpoint URL */
    apiEndpoint: string;
    /** Database connection string */
    databaseUrl: string;
    /** Authentication configuration */
    auth: {
      /** Provider type (e.g., 'vercel', 'github') */
      provider: string;
      /** OAuth client ID */
      clientId?: string;
      /** OAuth client secret (runtime-only) */
      clientSecret?: string;
    };
  };
  
  /** Artifact plane configuration */
  artifact: {
    /** Object store endpoint URL */
    storageEndpoint: string;
    /** Access credentials (runtime-only) */
    credentials?: {
      accessKey?: string;
      secretKey?: string;
    };
  };
  
  /** Execution plane configuration */
  execution: {
    /** Compute endpoint URL */
    computeEndpoint: string;
    /** Queue endpoint URL */
    queueEndpoint: string;
    /** Worker configuration */
    workers: {
      /** Number of concurrent workers */
      count: number;
      /** Resource limits */
      limits: {
        memory: string;
        timeout: number;
      };
    };
  };
}

/** Rights-provenance fields that flow from product seam */
export interface RightsProvenance {
  /** User ID making the request */
  userId: SportaId;
  /** Organization context */
  organizationId: SportaId;
  /** Permission scopes */
  scopes: readonly string[];
  /** Session token (if applicable) */
  sessionToken?: string;
  /** Privacy level */
  privacyLevel: "public" | "private" | "confidential";
  /** Retention policy */
  retentionPolicy: {
    /** Duration in seconds */
    duration: number;
    /** Auto-delete flag */
    autoDelete: boolean;
  };
}

/** Deployment descriptor with provider-neutral abstraction */
export interface DeploymentDescriptor {
  /** Deployment ID */
  deploymentId: SportaId;
  /** Provider name (for logging/telemetry) */
  providerName: string;
  /** Configuration for each plane */
  config: DeploymentConfig;
  /** Rights-provenance fields */
  rightsProvenance: RightsProvenance;
  /** Deployment timestamp */
  deployedAt: string;
  /** Version of the deployment descriptor */
  version: string;
}

/** Provider adapter port interface */
export interface DeploymentAdapterPort {
  /** Initialize the adapter with provider-specific configuration */
  initialize(config: DeploymentConfig): Promise<void>;
  
  /** Deploy to the specified plane */
  deploy(plane: DeploymentPlane, resources: DeploymentResources): Promise<DeploymentResult>;
  
  /** Check deployment status */
  status(plane: DeploymentPlane): Promise<DeploymentStatus>;
  
  /** Teardown/cleanup resources */
  teardown(plane: DeploymentPlane): Promise<void>;
}

/** Resources to deploy for each plane */
export interface DeploymentResources {
  /** Control plane resources */
  control?: {
    /** API routes */
    apiRoutes: string[];
    /** Database migrations */
    migrations: string[];
    /** Environment variables */
    environment: Record<string, string>;
  };
  
  /** Artifact plane resources */
  artifact?: {
    /** Object storage buckets */
    buckets: string[];
    /** Content to upload */
    content: Record<string, string>;
  };
  
  /** Execution plane resources */
  execution?: {
    /** Worker functions */
    workers: string[];
    /** Queue definitions */
    queues: string[];
    /** Compute configuration */
    compute: {
      runtime: string;
      entrypoint: string;
    };
  };
}

/** Deployment result */
export interface DeploymentResult {
  /** Success flag */
  success: boolean;
  /** Deployment ID (if successful) */
  deploymentId?: SportaId;
  /** Error message (if failed) */
  error?: string;
  /** Provider-specific response data */
  providerResponse?: Record<string, unknown>;
}

/** Deployment status */
export interface DeploymentStatus {
  /** Status: 'not_deployed', 'deploying', 'deployed', 'failed' */
  status: "not_deployed" | "deploying" | "deployed" | "failed";
  /** Last updated timestamp */
  lastUpdated: string;
  /** Error message (if failed) */
  error?: string;
  /** Provider-specific status data */
  providerStatus?: Record<string, unknown>;
}

/**
 * A single deployment provider's factory: creates adapter instances for
 * one named provider. The adapters-layer registry (DeploymentAdapterFactory
 * class) stores these; the domain only declares the seam.
 */
export interface DeploymentFactory {
  /** Create a new adapter instance for the provider. */
  create(config: DeploymentConfig): DeploymentAdapterPort;

  /** Provider name this factory registers under. */
  getProviderName(): string;

  /** Validate configuration for this provider. */
  validateConfig(config: DeploymentConfig): { valid: boolean; errors: string[] };
}

/** Legacy alias of {@link DeploymentFactory} — the same seam, older name. */
export type DeploymentAdapterFactory = DeploymentFactory;
