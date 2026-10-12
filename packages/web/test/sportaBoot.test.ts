/**
 * W7C-2 REAL test lane: boot the local composition on a real temp dir
 * (SPEC §W7C-2), assert the wiring facts, validate the deployment
 * descriptor end-to-end (accept + fail-closed rejections), drive live
 * traffic through the booted surfaces, and tear down cleanly.
 *
 * EVIDENCE CLASS: REAL — real temp dir on the real FS (blob writes, durable
 * editor-history appends read back through a FRESH store instance, durable
 * run journal read back through a FRESH journal instance, shared-session
 * ledger), a real spawned child process for the execution leg (the labeled
 * stand-in executable), a real WS listener on an OS-assigned port with a
 * real client receiving a broadcast delta, and a real localhost HTTP arena
 * (the ROLE behind it fixture-scripted). FIXTURE (labeled): the in-memory
 * work/organization/preference/session ledgers, the seed data, the
 * stand-in executable.
 */
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootSportaLocal } from "../src/sporta/boot/boot.js";
import {
  DEFAULT_LOCAL_DEPLOYMENT_DESCRIPTOR,
  LOCAL_BOOT_COMPONENT_IDS,
} from "../src/sporta/boot/deploymentDescriptor.js";
import {
  DeploymentDescriptorError,
  validateDeploymentDescriptor,
} from "../src/sporta/boot/validateDeploymentDescriptor.js";
import { FsEditorSessionHistoryStore, connectWs, serializeEditOperation, sha256EditorHash } from "@sporta/editors/contract";
import { FsAgentRunJournal } from "@sporta/work/contract";
import { StubArenaRole, countFiles } from "./support/stubArenaRole.js";

const STANDIN_PATH = fileURLToPath(new URL("./fixtures/zcode-cli-standin.mjs", import.meta.url));

test("W7C-2 REAL: the local boot wires the real composition; facts measured; descriptor validated end-to-end", async () => {
  const tempRoot = await fs.mkdtemp(join(tmpdir(), "sporta-local-boot-"));
  const arenaRole = await StubArenaRole.start();
  try {
    const booted = await bootSportaLocal({
      storeRoot: tempRoot,
      zcodeCliPath: STANDIN_PATH,
      arenaBaseUrl: arenaRole.baseUrl,
      wsPort: 0, // OS-assigned; the ACTUAL port must come back in the facts
    });
    try {
      // ── the wiring facts are measured, not defaulted ────────────────────
      const facts = booted.facts;
      assert.match(facts.bootedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      for (const root of Object.values(facts.storeRoots)) {
        const stat = await fs.stat(root);
        assert.ok(stat.isDirectory(), `store root ${root} exists on the real FS`);
      }
      assert.ok(Number.isInteger(facts.ports.wsDeltaSink) && facts.ports.wsDeltaSink > 0, "the ACTUAL WS port was read back");
      assert.deepEqual(
        facts.seams,
        { editorSessionHistory: true, learningArtifacts: true, organizationCandidates: true, escalations: true, sharedSessionHistory: true },
        "ALL read seams wired, the w6c sharedSessionHistory seam included",
      );
      assert.deepEqual([...facts.components], [...LOCAL_BOOT_COMPONENT_IDS]);
      assert.equal(facts.wsAuthMode, "dev-mode", "absent wsAuth = the documented dev-mode law");

      // ── the descriptor validates end-to-end and MATCHES the boot ───────
      const descriptor = validateDeploymentDescriptor(DEFAULT_LOCAL_DEPLOYMENT_DESCRIPTOR);
      assert.equal(descriptor.name, "sporta-local");
      assert.deepEqual([...descriptor.components], [...facts.components], "descriptor components = booted components");
      assert.equal(
        Object.keys(descriptor.storeRoots).length,
        Object.keys(facts.storeRoots).length,
        "descriptor store roots = booted store roots",
      );
      for (const [key, name] of Object.entries(descriptor.storeRoots)) {
        const bootedRoot = facts.storeRoots[key as keyof typeof facts.storeRoots];
        assert.equal(bootedRoot.split("/").pop(), name, `storeRoots.${key} matches the descriptor name`);
      }
      for (const envName of [...descriptor.requiredEnv, ...descriptor.optionalEnv]) {
        assert.match(envName, /^[A-Z][A-Z0-9_]*$/, "env names only — never values");
      }
      assert.equal(descriptor.hostedPreviewEntryPoint, "/sporta");
      assert.ok(descriptor.healthChecks.length >= descriptor.components.length);

      // ── fail-closed rejections (typed, full issue lists) ───────────────
      const missingComponent = { ...DEFAULT_LOCAL_DEPLOYMENT_DESCRIPTOR, components: ["product-host"] };
      assert.throws(() => validateDeploymentDescriptor(missingComponent), (error: unknown) => {
        assert.ok(error instanceof DeploymentDescriptorError);
        assert.ok(error.issues.some((issue) => issue.rule === "component-missing"));
        return true;
      });
      for (const badPort of [-1, 1.5, 70000]) {
        assert.throws(
          () => validateDeploymentDescriptor({ ...DEFAULT_LOCAL_DEPLOYMENT_DESCRIPTOR, portMap: { wsDeltaSink: badPort } }),
          (error: unknown) => {
            assert.ok(error instanceof DeploymentDescriptorError);
            assert.ok(error.issues.some((issue) => issue.rule === "port-invalid"));
            return true;
          },
          `port ${String(badPort)} must fail-close`,
        );
      }
      assert.throws(
        () => validateDeploymentDescriptor({ ...DEFAULT_LOCAL_DEPLOYMENT_DESCRIPTOR, storeRoots: { blobs: "blobs" } }),
        (error: unknown) => {
          assert.ok(error instanceof DeploymentDescriptorError);
          assert.ok(error.issues.some((issue) => issue.rule === "store-root-missing"));
          return true;
        },
      );
      assert.throws(
        () => validateDeploymentDescriptor({ ...DEFAULT_LOCAL_DEPLOYMENT_DESCRIPTOR, requiredEnv: ["sporta_store_root"] }),
        (error: unknown) => {
          assert.ok(error instanceof DeploymentDescriptorError);
          assert.ok(error.issues.some((issue) => issue.rule === "env-name-invalid"));
          return true;
        },
      );
      assert.throws(
        () =>
          validateDeploymentDescriptor({
            ...DEFAULT_LOCAL_DEPLOYMENT_DESCRIPTOR,
            healthChecks: [{ component: "product-host", check: "x" }, { component: "not-a-component", check: "y" }],
          }),
        (error: unknown) => {
          assert.ok(error instanceof DeploymentDescriptorError);
          assert.ok(error.issues.some((issue) => issue.rule === "health-check-unknown-component"));
          return true;
        },
      );
      assert.throws(() => validateDeploymentDescriptor("not-an-object"), (error: unknown) => {
        assert.ok(error instanceof DeploymentDescriptorError);
        assert.ok(error.issues.some((issue) => issue.rule === "shape"));
        return true;
      });

      // ── live traffic through the booted surfaces ───────────────────────
      await booted.loop.openIntent();
      await booted.loop.registerOrganizationDraft(1);
      await booted.loop.promoteOrganization(1);
      const state = await booted.host.readState(); // the SportaPanel route's read
      assert.equal(state.workGraphId, "wg:sporta-host");
      assert.equal(state.evidence, "real");
      assert.equal(state.trace.stages[0]?.state, "done", "the projection is live through the booted host");

      const exec = await booted.loop.runExecution("render the tactical board from the authorized source");
      assert.ok(exec.events > 0, "the real process produced observable events");

      // the run journal is DURABLE: a FRESH journal instance replays the run.
      const journalFresh = new FsAgentRunJournal(facts.storeRoots.runJournals);
      const prefixDir = (await fs.readdir(facts.storeRoots.runJournals))[0];
      assert.ok(prefixDir !== undefined, "the journal root has content on disk");
      const journalFile = (await fs.readdir(join(facts.storeRoots.runJournals, prefixDir))).find((f) => f.endsWith(".jsonl"));
      assert.ok(journalFile !== undefined);
      const headerLine = (await fs.readFile(join(facts.storeRoots.runJournals, prefixDir, journalFile))).toString("utf8").split("\n")[0];
      const runId = (JSON.parse(headerLine ?? "{}") as { runId?: string }).runId;
      assert.ok(typeof runId === "string" && runId.length > 0);
      const replayed = await journalFresh.readJournal(runId);
      assert.equal(replayed?.events.at(-1)?.type, "completed", "the journaled run replays to its terminal event");

      const seed = await booted.loop.seedRenderArtifact();
      assert.match(seed.contentHash, /^[0-9a-f]{64}$/, "a real sha-256 content address on the real FS");
      assert.ok((await countFiles(facts.storeRoots.blobs)) >= 1, "the blob root holds the real file");

      const takeover = await booted.host.submitTakeover({ label: "boot-edit-1" });
      assert.equal(takeover.outcome, "appended");
      assert.ok(takeover.revisionId !== undefined);
      const historyFresh = new FsEditorSessionHistoryStore(facts.storeRoots.editorSessions);
      const sessions = await historyFresh.list({});
      assert.ok(sessions.some((session) => session.editorSessionId === "es:wg:sporta-host"), "the editor session is durable on disk (fresh-instance read-back)");

      // the live shared-session lane: a REAL WS client on the ACTUAL bound port.
      const wsClient = await connectWs({ host: "127.0.0.1", port: facts.ports.wsDeltaSink, path: "/shared-deltas" });
      const { sessionId } = await booted.sharedSessions.openSharedSession({
        sessionId: "ss:boot-1",
        revisionId: "rev:sporta-host-1",
        availability: [
          { editorId: "kdenlive", version: "24.08.0", integrationLevel: 2, projectFormat: "kdenlive", licensing: "GPL-3.0" },
        ],
        userPreference: "kdenlive",
        mode: "local",
        policy: {
          rights: { holders: ["holder:operator"], usages: ["render", "edit", "derive"], prohibitions: [] },
          privacy: { visibility: "tenant", exportableFields: [] },
          retention: { disposition: "retain" },
        },
        opener: { participantId: "user:director", capabilities: ["timeline"], usage: { usages: ["edit", "render"] } },
      });
      assert.equal(sessionId, "ss:boot-1");
      const receipt = await booted.sharedSessions.broadcastDelta({
        sessionId,
        participantId: "user:director",
        baseRevisionId: "rev:sporta-host-1",
        operations: [serializeEditOperation({ kind: "set", path: "/mlt/attributes/title", valueHash: sha256EditorHash("Boot — Live") })],
      });
      assert.ok(receipt, "the broadcast returned a receipt");
      const received = await wsClient.waitForMessage(undefined, 2000);
      const delivery = JSON.parse(received) as { sessionId: string };
      assert.equal(delivery.sessionId, sessionId, "the delta crossed the real wire to the real client");

      // the w6c-4 seam: the shared-session projection reads the real FS ledger.
      const sharedList = await booted.sharedSessionProjection.listSessions();
      assert.equal(sharedList.wired, true);
      assert.ok(
        sharedList.sessions.some((session) => session.sessionId === "ss:boot-1"),
        "the shared-session projection sees the real session",
      );

      await wsClient.close(1000);
      console.log(
        `W7C-2 BOOT EVIDENCE: ws port ${String(facts.ports.wsDeltaSink)} (OS-assigned, read back); ` +
          `${String(await countFiles(facts.storeRoots.blobs))} blob(s); journal replayed for ${runId}; ` +
          `editor history durable (${String(sessions.length)} session(s)); shared session ${sessionId} broadcast over the wire`,
      );
    } finally {
      await booted.dispose();
    }

    // ── teardown is clean: the listener is gone ──────────────────────────
    // (the OS may reuse the port later; the immediate assertion is that the
    // boot's own listener closed — connecting right after dispose refuses.)
    await assert.rejects(
      connectWs({ host: "127.0.0.1", port: booted.facts.ports.wsDeltaSink, path: "/shared-deltas", timeoutMs: 1500 }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        return /ECONNREFUSED|connect/.test(error.message);
      },
      "the WS listener is closed after dispose",
    );
  } finally {
    await arenaRole.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
