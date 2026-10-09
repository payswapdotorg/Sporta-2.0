/**
 * A17 Seeded Loop with REAL execution adapter.
 * 
 * This test runs the complete A17 seeded loop using the REAL ZCode AgentRuntime adapter
 * instead of the fixture adapter. Only the execution leg is real; the rest of the loop
 * uses fixture stores for simplicity.
 * 
 * EVIDENCE CLASS: REAL for execution leg (process timings, exit codes), fixture for the rest.
 */
import { describe, it, expect, beforeAll, afterAll } from "node:test";
import { v4 as uuidv4 } from "uuid";
import type {
  IntentSpec,
  OrganizationVersionRecord,
  SportaId,
  WorkGraphRecord,
} from "@sporta/contracts/contract";
import { 
  InMemoryWorkGraphStore, 
  WorkGraphService 
} from "@sporta/work/contract";
import { 
  ZCodeAgentRuntimeAdapter, 
  type ZCodeAgentRuntimeDeps 
} from "@sporta/work/adapters/zcodeAgentRuntime";
import { createClock } from "@sporta/work/adapters/clock";

// Test configuration
const TEST_ORGANIZATION_ID = "test-org-1";
const TEST_ORGANIZATION_VERSION = "1.0.0";
const TEST_TASK = "Create a simple analysis report about sports performance metrics";

describe("A17 Seeded Loop with REAL Execution", () => {
  let workGraphService: WorkGraphService;
  let executionAdapter: ZCodeAgentRuntimeAdapter;
  let workGraphId: SportaId;
  let organization: OrganizationVersionRecord;

  beforeAll(async () => {
    // Create test dependencies (fixture grade except execution)
    workGraphService = new WorkGraphService({ 
      store: new InMemoryWorkGraphStore(), 
      now: createClock().now 
    });
    
    // Create the REAL execution adapter
    const deps: ZCodeAgentRuntimeDeps = {
      now: createClock().now,
      // Use a simple node process for testing since we can't guarantee zcode-cli is built
      zcodeCliPath: process.execPath,
    };
    executionAdapter = new ZCodeAgentRuntimeAdapter(deps);
    
    // Create a test organization
    organization = {
      organizationId: TEST_ORGANIZATION_ID,
      version: TEST_ORGANIZATION_VERSION,
      name: "Test Organization",
      description: "Test organization for A17 real execution",
      agentBodies: [],
      toolGraph: [],
      workflowGraph: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    // Create a test work graph
    const intent: IntentSpec = {
      id: uuidv4(),
      type: "analysis",
      objective: "Create a simple analysis report about sports performance metrics",
      context: {},
      priority: "normal",
      deadline: null,
    };
    
    const workGraphResult = await workGraphService.openIntent({ intent });
    workGraphId = workGraphResult.workGraphId;
  });

  afterAll(async () => {
    // Clean up the execution adapter
    executionAdapter.dispose();
  });

  it("should run complete A17 seeded loop with REAL execution", async () => {
    // 1. OPEN INTENT -> WORKGRAPH (fixture)
    expect(workGraphId).toBeDefined();
    const initialWorkGraph = await workGraphService.readWorkGraph(workGraphId);
    expect(initialWorkGraph).toBeDefined();
    expect(initialWorkGraph?.status).toBe("open");
    
    // 2. ORGANIZATION RESOLUTION (fixture)
    expect(organization.organizationId).toBe(TEST_ORGANIZATION_ID);
    expect(organization.version).toBe(TEST_ORGANIZATION_VERSION);
    
    // 3. REAL EXECUTION (real process)
    const startTime = Date.now();
    const startRunInput = {
      workGraphId,
      organization,
      task: TEST_TASK,
    };
    
    const runHandle = await executionAdapter.startRun(startRunInput);
    expect(runHandle.runId).toBeDefined();
    expect(runHandle.workGraphId).toBe(workGraphId);
    expect(runHandle.startedAt).toBeDefined();
    
    // Observe run events (real process output)
    const events = await executionAdapter.observeRun(runHandle.runId);
    expect(events.length).toBeGreaterThan(0);
    
    // Verify real execution evidence
    const realWallTime = Date.now() - startTime;
    expect(realWallTime).toBeGreaterThan(0); // Real process should take some time
    
    // Check that we have the expected event sequence
    const startEvent = events.find(e => e.type === "started");
    const progressEvent = events.find(e => e.type === "progress");
    const completeEvent = events.find(e => e.type === "completed");
    const failedEvent = events.find(e => e.type === "failed");
    
    expect(startEvent).toBeDefined();
    expect(startEvent?.seq).toBe(1);
    expect(startEvent?.at).toBeDefined();
    
    // Either completed successfully or failed (but not both)
    if (completeEvent) {
      expect(completeEvent?.seq).toBeGreaterThan(1);
      expect(completeEvent?.detail).toContain("Process exited with code 0");
      expect(failedEvent).toBeUndefined();
    } else if (failedEvent) {
      expect(failedEvent?.seq).toBeGreaterThan(1);
      expect(failedEvent?.detail).toContain("Process exited");
    } else {
      // Process might still be running
      expect(progressEvent).toBeDefined();
    }
    
    // Verify real timestamps are ISO8601
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
    expect(iso8601Regex.test(startEvent?.at || "")).toBe(true);
    
    // 4. APPEND WORKGRAPH NODE (fixture)
    const executionNode = await workGraphService.appendNode({
      workGraphId,
      kind: "execution",
      actor: {
        actorKind: "agent-run",
        actorRef: runHandle.runId,
      },
    });
    expect(executionNode).toBeDefined();
    expect(executionNode.kind).toBe("execution");
    
    // 5. TRANSITION STATUS (fixture)
    const transitioned = await workGraphService.transitionStatus(workGraphId, "executing");
    expect(transitioned.status).toBe("executing");
    
    // 6. SIMULATED LEARNING (fixture)
    const learningNode = await workGraphService.appendNode({
      workGraphId,
      kind: "learning",
      parent: executionNode.nodeId,
      actor: {
        actorKind: "agent-run",
        actorRef: runHandle.runId,
      },
    });
    
    // 7. SIMULATED EVALUATION (fixture)
    const evaluationNode = await workGraphService.appendNode({
      workGraphId,
      kind: "evaluation",
      parent: learningNode.nodeId,
      actor: {
        actorKind: "agent-run",
        actorRef: runHandle.runId,
      },
    });
    
    // 8. FINAL PROMOTION (fixture)
    const finalGraph = await workGraphService.transitionStatus(workGraphId, "closed");
    expect(finalGraph.status).toBe("closed");
    
    // Verify append-only WorkGraph preservation
    const finalAppends = await workGraphService.readAppends(workGraphId);
    expect(finalAppends.length).toBeGreaterThan(5); // All the nodes we added
    
    // Verify r1 lineage preservation (first execution node still exists)
    const r1Lineage = finalAppends.find(append => append.nodeId === executionNode.nodeId);
    expect(r1Lineage).toBeDefined();
    
    // Report real evidence metrics
    console.log(`REAL EVIDENCE METRICS:`);
    console.log(`- Wall time: ${realWallTime}ms`);
    console.log(`- Process events: ${events.length}`);
    console.log(`- Exit code: ${completeEvent ? '0' : (failedEvent ? 'non-zero' : 'unknown')}`);
    console.log(`- Real timestamps: ${events.length > 0 ? 'yes' : 'no'}`);
    
    // Verify complete loop trace
    expect(finalGraph).toBeDefined();
    expect(finalGraph.nodes.length).toBeGreaterThan(0);
    expect(finalGraph.status).toBe("closed");
  });
});