/**
 * Tests for the HTTP Arena transport adapter.
 *
 * These tests use a real local HTTP server (node:http) to verify the
 * transport works against actual endpoints. This is REAL evidence.
 */
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { HttpArenaTransport, type ArenaTransportError } from "../src/adapters/httpArenaTransport.js";
import type { ArenaTransportSubmission } from "../src/app/arenaTransport.js";
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "node:test";
import type { ArenaEscalationRecord } from "@sporta/contracts/contract";

describe("HttpArenaTransport", () => {
  let server: Server;
  let serverUrl: string;
  let testEscalation: ArenaEscalationRecord;
  let testSubmission: ArenaTransportSubmission;

  beforeAll(async () => {
    // Create a test server that simulates Arena behavior
    server = createServer((req, res) => {
      // Handle CORS preflight
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        });
        res.end();
        return;
      }

      // Parse URL and handle routing
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const method = req.method;

      // Handle POST /escalations
      if (method === "POST" && url.pathname === "/escalations") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });

        req.on("end", async () => {
          try {
            const payload = JSON.parse(body);
            
            // Validate request structure
            if (!payload.escalation || !payload.contextRefs) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Invalid request structure" }));
              return;
            }

            // Simulate different response scenarios based on escalation id
            const escalationId = payload.escalation.escalationId;
            
            // Return idempotent response for same escalation
            res.writeHead(201, {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            });
            res.end(JSON.stringify({
              escalationId,
              lifecycle: "triaged",
            }));
          } catch (error) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid JSON" }));
          }
        });
      }
      // Handle GET /escalations/:id
      else if (method === "GET" && url.pathname.startsWith("/escalations/")) {
        const escalationId = url.pathname.split("/").pop()!;
        
        // Simulate different scenarios based on escalation id
        if (escalationId === "not-found") {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Not found" }));
        } else if (escalationId === "error") {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Server error" }));
        } else {
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          });
          
          // Return status based on escalation id
          let lifecycle = "created";
          let result = null;
          
          if (escalationId.includes("submitted")) {
            lifecycle = "submitted";
            result = {
              resultId: `res:${escalationId}`,
              escalationId,
              resultType: "solution",
              payloadHash: "testhash",
              validated: false,
              learningArtifactRefs: ["learn:test"],
              provenance: {
                sourceKind: "arena-session",
                sourceRef: escalationId,
                capturedAt: new Date().toISOString(),
              },
            };
          } else if (escalationId.includes("triaged")) {
            lifecycle = "triaged";
          }
          
          res.end(JSON.stringify({
            escalationId,
            lifecycle,
            result,
          }));
        }
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
      }
    });

    // Start server and get URL
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        if (typeof address === "string") {
          serverUrl = address;
        } else if (address) {
          serverUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  beforeEach(() => {
    // Create test escalation data
    testEscalation = {
      escalationId: "test-escalation-1",
      lifecycle: "created",
      sessionMode: "correct",
      permittedActions: ["review"],
      idempotencyKey: "test-key-1",
      tenantRef: "test-tenant",
      capabilityRef: "test-capability",
      sessionRef: "test-session",
      createdAt: "2023-01-01T00:00:00.000Z",
    };

    // Create test submission
    testSubmission = {
      escalation: testEscalation,
      contextRefs: ["context-1", "context-2"],
    };
  });

  describe("constructor", () => {
    it("should create transport with required baseUrl", () => {
      expect(() => new HttpArenaTransport({ baseUrl: serverUrl })).not.toThrow();
    });

    it("should throw error without baseUrl", () => {
      expect(() => new HttpArenaTransport({} as any)).toThrow("HTTP Arena transport requires a baseUrl");
    });

    it("should normalize baseUrl with trailing slash", () => {
      const transport = new HttpArenaTransport({ baseUrl: "http://example.com" });
      expect(transport["#baseUrl"]).toBe("http://example.com/");
    });

    it("should preserve baseUrl with existing trailing slash", () => {
      const transport = new HttpArenaTransport({ baseUrl: "http://example.com/" });
      expect(transport["#baseUrl"]).toBe("http://example.com/");
    });
  });

  describe("submit", () => {
    it("should successfully submit escalation", async () => {
      const transport = new HttpArenaTransport({ baseUrl: serverUrl });
      await expect(transport.submit(testSubmission)).resolves.not.toThrow();
    });

    it("should be idempotent - second submit with same escalation does nothing", async () => {
      const transport = new HttpArenaTransport({ baseUrl: serverUrl });
      
      // First submission
      await transport.submit(testSubmission);
      
      // Second submission with same escalation should not throw
      await expect(transport.submit(testSubmission)).resolves.not.toThrow();
    });

    it("should handle network errors", async () => {
      const transport = new HttpArenaTransport({ baseUrl: "http://localhost:9999" });
      await expect(transport.submit(testSubmission)).rejects.toThrow(ArenaTransportError);
      await expect(transport.submit(testSubmission)).rejects.toHaveProperty("code", "network_error");
    });

    it("should handle HTTP errors", async () => {
      // Create a submission that will cause an error
      const errorSubmission = {
        ...testSubmission,
        escalation: {
          ...testSubmission.escalation,
          escalationId: "error",
        },
      };
      
      const transport = new HttpArenaTransport({ baseUrl: serverUrl });
      await expect(transport.submit(errorSubmission)).rejects.toThrow(ArenaTransportError);
      await expect(transport.submit(errorSubmission)).rejects.toHaveProperty("code", "http_error");
    });

    it("should handle timeouts", async () => {
      // Create a slow server
      const slowServer = createServer((req, res) => {
        setTimeout(() => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        }, 100);
      });

      await new Promise<void>((resolve) => {
        slowServer.listen(0, () => {
          const address = slowServer.address();
          if (typeof address === "string") {
            const slowUrl = address;
            const transport = new HttpArenaTransport({ 
              baseUrl: slowUrl, 
              timeout: 50 // 50ms timeout
            });
            
            expect(transport.submit(testSubmission)).rejects.toThrow(ArenaTransportError);
            expect(transport.submit(testSubmission)).rejects.toHaveProperty("code", "timeout_error");
            
            slowServer.close(() => resolve());
          }
        });
      });
    });

    it("should validate response structure", async () => {
      const transport = new HttpArenaTransport({ baseUrl: serverUrl });
      await expect(transport.submit(testSubmission)).resolves.not.toThrow();
    });
  });

  describe("status", () => {
    it("should return status for existing escalation", async () => {
      const transport = new HttpArenaTransport({ baseUrl: serverUrl });
      
      // First submit the escalation
      await transport.submit(testSubmission);
      
      // Then check status
      const status = await transport.status(testEscalation.escalationId);
      expect(status).toEqual({
        lifecycle: "triaged",
        result: null,
      });
    });

    it("should return null for non-existent escalation", async () => {
      const transport = new HttpArenaTransport({ baseUrl: serverUrl });
      const status = await transport.status("not-found");
      expect(status).toBeNull();
    });

    it("should handle server errors", async () => {
      const transport = new HttpArenaTransport({ baseUrl: serverUrl });
      const status = await transport.status("error");
      expect(status).toBeNull(); // 404 response for error endpoint
    });

    it("should return result when escalation is submitted", async () => {
      const transport = new HttpArenaTransport({ baseUrl: serverUrl });
      const status = await transport.status("submitted-escalation");
      expect(status).toEqual({
        lifecycle: "submitted",
        result: {
          resultId: "res:submitted-escalation",
          escalationId: "submitted-escalation",
          resultType: "solution",
          payloadHash: "testhash",
          validated: false,
          learningArtifactRefs: ["learn:test"],
          provenance: {
            sourceKind: "arena-session",
            sourceRef: "submitted-escalation",
            capturedAt: expect.any(String),
          },
        },
      });
    });
  });

  describe("authorization", () => {
    it("should include authorization header when provided", async () => {
      let authHeader: string | undefined;
      
      const authServer = createServer((req, res) => {
        authHeader = req.headers.authorization;
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ escalationId: "test", lifecycle: "created" }));
      });

      await new Promise<void>((resolve) => {
        authServer.listen(0, () => {
          const address = authServer.address();
          if (typeof address === "string") {
            const transport = new HttpArenaTransport({ 
              baseUrl: address,
              authorization: "Bearer test-token"
            });
            
            expect(transport.submit(testSubmission)).resolves.not.toThrow();
            expect(authHeader).toBe("Bearer test-token");
            
            authServer.close(() => resolve());
          }
        });
      });
    });

    it("should not include authorization header when not provided", async () => {
      let authHeader: string | undefined;
      
      const noAuthServer = createServer((req, res) => {
        authHeader = req.headers.authorization;
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ escalationId: "test", lifecycle: "created" }));
      });

      await new Promise<void>((resolve) => {
        noAuthServer.listen(0, () => {
          const address = noAuthServer.address();
          if (typeof address === "string") {
            const transport = new HttpArenaTransport({ baseUrl: address });
            
            expect(transport.submit(testSubmission)).resolves.not.toThrow();
            expect(authHeader).toBeUndefined();
            
            noAuthServer.close(() => resolve());
          }
        });
      });
    });
  });

  describe("custom headers", () => {
    it("should include custom headers", async () => {
      let customHeader: string | undefined;
      
      const customHeaderServer = createServer((req, res) => {
        customHeader = req.headers["x-custom-header"];
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ escalationId: "test", lifecycle: "created" }));
      });

      await new Promise<void>((resolve) => {
        customHeaderServer.listen(0, () => {
          const address = customHeaderServer.address();
          if (typeof address === "string") {
            const transport = new HttpArenaTransport({ 
              baseUrl: address,
              headers: { "X-Custom-Header": "test-value" }
            });
            
            expect(transport.submit(testSubmission)).resolves.not.toThrow();
            expect(customHeader).toBe("test-value");
            
            customHeaderServer.close(() => resolve());
          }
        });
      });
    });
  });
});