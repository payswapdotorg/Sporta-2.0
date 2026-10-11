import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GodotTscnAdapter,
  GodotTscnError,
  parseEditOperation,
  sha256EditorHash,
  EditorBrokerService,
  FixedClock,
  InMemoryEditorSessionStore,
  type EditorBrokerDeps,
} from "../src/contract.js";
import {
  ArtifactGraphService,
  sha256Text,
} from "@sporta/artifacts/contract";
import type { PolicySet, ProvenanceDescriptor } from "@sporta/contracts/contract";

/**
 * GodotTscnAdapter — REAL round-trip tests for the Godot text scene
 * (.tscn) adapter. The fixture below mirrors the shape real Godot 4
 * writes (gd_scene header with uid, adjacent ext_resource sections,
 * sub_resource with Vector2 properties, node sections with parent paths,
 * typed literals incl. ExtResource/SubResource references, arrays,
 * dictionaries, a NodePath, an int64 and an unmodeled Color literal, and
 * a real [connection] section). Evidence grades:
 *
 * - REAL (how measured): file-based lanes write serialized bytes to a
 *   real temp workspace directory (one per session, removed on dispose),
 *   read them back with node:fs, re-parse and re-serialize, and prove
 *   export -> import -> export byte stability with string equality on the
 *   actual file bytes; parse results are compared with deepStrictEqual.
 * - FIXTURE (labeled in the test name): the broker smoke test wires the
 *   REAL adapter through in-memory fixture stores.
 */

const adapter = new GodotTscnAdapter(sha256EditorHash);

const REAL_GODOT_TSCN = `[gd_scene load_steps=4 format=3 uid="uid://c8x5q2sv3b1nk"]

[ext_resource type="Script" path="res://player.gd" id="1_fc3an"]
[ext_resource type="Texture2D" path="res://assets/jersey.png" id="2_jersey"]

[sub_resource type="RectangleShape2D" id="RectangleShape2D_1"]
size = Vector2(32.0, 48.0)

[node name="Player" type="CharacterBody2D"]
script = ExtResource("1_fc3an")
speed = 420
session_id = 9223372036854775807
falling = false
formation = ["4-3-3", "4-2-3-1"]
roles = {"ST": 9, "CM": 8}

[node name="Sprite" type="Sprite2D" parent="."]
texture = ExtResource("2_jersey")
position = Vector2(100.0, -20.5)

[node name="Collision" type="CollisionShape2D" parent="Sprite"]
shape = SubResource("RectangleShape2D_1")

[node name="Label" parent="."]
text = "Gegen \\"Kolonnenpressing\\" & Aufbau"
look_at = NodePath("../Sprite")
debug_color = Color(0.85, 0.42, 0.19, 0.35)

[connection signal="pressed" from="Button" to="." method="_on_pressed"]
`;

async function realTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "sporta-godot-"));
}

test("adapter declares honest godot metadata", () => {
  assert.equal(adapter.editorId, "godot");
  assert.equal(adapter.integrationLevel, 2);
  assert.equal(adapter.licensing, "MIT");
  assert.deepEqual(adapter.knownProjectFormats, ["application/x-godot-scene", ".tscn"]);
  assert.match(adapter.editorVersion, /^\d+\.\d+\.\d+$/);
});

test("parseGodotTscnDocument reads a real-shaped .tscn into the canonical state", () => {
  const state = adapter.parseGodotTscnDocument(REAL_GODOT_TSCN);

  // Header fields as parsed literals, verbatim.
  assert.deepEqual(state.tscn.header.attributes.load_steps, { kind: "int", literal: "4" });
  assert.deepEqual(state.tscn.header.attributes.format, { kind: "int", literal: "3" });
  assert.deepEqual(state.tscn.header.attributes.uid, {
    kind: "string",
    value: "uid://c8x5q2sv3b1nk",
  });

  const sections = state.tscn.sections;
  assert.equal(sections.length, 8);

  // ext_resource records: id + type preserved.
  assert.deepEqual(sections[0], {
    kind: "extResource",
    attributes: {
      type: { kind: "string", value: "Script" },
      path: { kind: "string", value: "res://player.gd" },
      id: { kind: "string", value: "1_fc3an" },
    },
  });

  // sub_resource: attributes plus typed property literals.
  const sub = sections[2];
  assert.ok(sub && sub.kind === "subResource");
  assert.deepEqual(sub.attributes.id, { kind: "string", value: "RectangleShape2D_1" });
  assert.deepEqual(sub.properties.size, { kind: "vector2", x: "32.0", y: "48.0" });

  // The node tree with parent paths: root, ".", "Sprite".
  const [player, sprite, collision, label, connection] = [
    sections[3],
    sections[4],
    sections[5],
    sections[6],
    sections[7],
  ];
  assert.ok(player && player.kind === "node");
  assert.equal(player.name, "Player");
  assert.equal(player.nodeType, "CharacterBody2D");
  assert.equal(player.parent, undefined);
  assert.ok(sprite && sprite.kind === "node");
  assert.equal(sprite.parent, ".");
  assert.ok(collision && collision.kind === "node");
  assert.equal(collision.parent, "Sprite");
  assert.ok(label && label.kind === "node");
  assert.equal(label.nodeType, undefined);
  assert.equal(label.parent, ".");
  assert.ok(connection && connection.kind === "opaque");
});

test("property literals are typed, verbatim for numbers, opaque for the unmodeled", () => {
  const state = adapter.parseGodotTscnDocument(REAL_GODOT_TSCN);
  const sections = state.tscn.sections;
  const player = sections[3];
  const label = sections[6];
  assert.ok(player && player.kind === "node" && label && label.kind === "node");

  // int/float literals are carried VERBATIM (no int64 corruption).
  assert.deepEqual(player.properties.speed, { kind: "int", literal: "420" });
  assert.deepEqual(player.properties.session_id, {
    kind: "int",
    literal: "9223372036854775807",
  });
  assert.deepEqual(player.properties.falling, { kind: "bool", value: false });
  assert.deepEqual(player.properties.formation, {
    kind: "array",
    items: [
      { kind: "string", value: "4-3-3" },
      { kind: "string", value: "4-2-3-1" },
    ],
  });
  assert.deepEqual(player.properties.roles, {
    kind: "dictionary",
    entries: [
      { key: { kind: "string", value: "ST" }, value: { kind: "int", literal: "9" } },
      { key: { kind: "string", value: "CM" }, value: { kind: "int", literal: "8" } },
    ],
  });
  // References preserve their ids.
  assert.deepEqual(player.properties.script, { kind: "extResource", id: "1_fc3an" });
  // String escapes decode.
  assert.deepEqual(label.properties.text, {
    kind: "string",
    value: 'Gegen "Kolonnenpressing" & Aufbau',
  });
  assert.deepEqual(label.properties.look_at, { kind: "nodePath", value: "../Sprite" });
  // The unmodeled Color constructor is carried opaquely, verbatim.
  assert.deepEqual(label.properties.debug_color, {
    kind: "opaque",
    raw: "Color(0.85, 0.42, 0.19, 0.35)",
  });
});

test("unknown sections are carried opaquely and re-emitted byte-identically", () => {
  const state = adapter.parseGodotTscnDocument(REAL_GODOT_TSCN);
  const connection = state.tscn.sections[7];
  assert.ok(connection && connection.kind === "opaque");
  assert.equal(
    connection.raw,
    '[connection signal="pressed" from="Button" to="." method="_on_pressed"]',
  );
  // The raw fragment survives a full round-trip untouched.
  const reParsed = adapter.parseGodotTscnDocument(adapter.exportToGodotTscn(state));
  assert.deepEqual(reParsed.tscn.sections[7], connection);
});

test("round-trip: export(parse(doc)) is a fixed point — second pass is byte-identical", () => {
  const firstExport = adapter.exportToGodotTscn(adapter.parseGodotTscnDocument(REAL_GODOT_TSCN));
  const secondExport = adapter.exportToGodotTscn(adapter.parseGodotTscnDocument(firstExport));
  assert.equal(secondExport, firstExport);
  // The only first-pass normalization: one blank line between sections
  // (the fixture keeps the two ext_resource sections adjacent, exactly
  // like the real Godot emitter; ids, paths, literals are untouched).
  assert.ok(firstExport.includes('id="1_fc3an"]\n\n[ext_resource type="Texture2D"'));
});

test("round-trip: state survives export -> parse losslessly (deep equal)", () => {
  const state = adapter.parseGodotTscnDocument(REAL_GODOT_TSCN);
  const reParsed = adapter.parseGodotTscnDocument(adapter.exportToGodotTscn(state));
  assert.deepEqual(reParsed, state);
});

test("REAL FILE round-trip: .tscn file read from disk, edited, re-exported, re-read", async () => {
  const dir = await realTempDir();
  try {
    const originalPath = join(dir, "match-scene.tscn");
    await writeFile(originalPath, REAL_GODOT_TSCN, "utf8");

    // The external editor opens the REAL file from disk.
    const fromDisk = await readFile(originalPath, "utf8");
    const state = adapter.parseGodotTscnDocument(fromDisk);

    // A real edit: move the Sprite and add a property with escapes.
    const edited = {
      tscn: {
        ...state.tscn,
        sections: state.tscn.sections.map((section) =>
          section.kind === "node" && section.name === "Sprite"
            ? {
                ...section,
                properties: {
                  ...section.properties,
                  position: { kind: "vector2" as const, x: "250.0", y: "-20.5" },
                  nickname: { kind: "string" as const, value: 'Der "Zauberer" \\ Nr. 10' },
                },
              }
            : section,
        ),
      },
    };
    const exported = adapter.exportToGodotTscn(edited);
    const editedPath = join(dir, "match-scene-edited.tscn");
    await writeFile(editedPath, exported, "utf8");

    // REAL file content assertions against the bytes on disk.
    const saved = await readFile(editedPath, "utf8");
    assert.ok(saved.includes("position = Vector2(250.0, -20.5)"));
    assert.ok(saved.includes('nickname = "Der \\"Zauberer\\" \\\\ Nr. 10"'));
    // int64 literals are still uncorrupted on disk.
    assert.ok(saved.includes("session_id = 9223372036854775807"));
    // The unmodeled Color literal is still byte-identical.
    assert.ok(saved.includes("debug_color = Color(0.85, 0.42, 0.19, 0.35)"));
    // The unknown [connection] section is still there, verbatim.
    assert.ok(
      saved.includes('[connection signal="pressed" from="Button" to="." method="_on_pressed"]'),
    );

    // Re-parse from disk: edits decoded, ids and paths preserved.
    const reread = adapter.parseGodotTscnDocument(saved);
    const sprite = reread.tscn.sections.find(
      (section) => section.kind === "node" && section.name === "Sprite",
    );
    assert.ok(sprite && sprite.kind === "node");
    assert.deepEqual(sprite.properties.position, { kind: "vector2", x: "250.0", y: "-20.5" });
    assert.deepEqual(sprite.properties.nickname, {
      kind: "string",
      value: 'Der "Zauberer" \\ Nr. 10',
    });
    // REAL byte-stability: a serializer-produced file re-parses and
    // re-serializes to the exact same bytes.
    assert.equal(adapter.exportToGodotTscn(reread), saved);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("parse refuses non-tscn documents with typed errors naming the failure point", () => {
  assert.throws(
    () => adapter.parseGodotTscnDocument("hello world"),
    (error: unknown) => {
      assert.ok(error instanceof GodotTscnError);
      assert.equal((error as GodotTscnError).detail, "not-tscn:line 1");
      return true;
    },
  );
  assert.throws(
    () => adapter.parseGodotTscnDocument('[gd_resource type="Resource" format=3]\n'),
    (error: unknown) => {
      assert.ok(error instanceof GodotTscnError);
      assert.equal((error as GodotTscnError).detail, "first-section:gd_resource");
      return true;
    },
  );
  assert.throws(
    () => adapter.parseGodotTscnDocument(""),
    (error: unknown) => {
      assert.ok(error instanceof GodotTscnError);
      assert.equal((error as GodotTscnError).detail, "empty-document");
      return true;
    },
  );
});

test("parse refuses malformed sections and property lines with typed errors naming section + line", () => {
  const header = '[gd_scene format=3]\n\n';
  const malformed = [
    '[gd_scene format=3\n', // unterminated header
    '[gd_scene format=3] trailing\n', // content after ]
    '[gd_scene format=3]\nspeed = 12\n', // property outside a section
    `${header}[node name="A" type="B" speed 12]\n`, // attribute without value
    `${header}[sub_resource type="T" id="1"]\nsize = Vector2(32,)\n`, // missing arg
    `${header}[node name="A"]\nspeed = 12abc\n`, // trailing garbage in value
    `${header}[node name="A"]\ntext = "unterminated\n`, // unterminated string
    `${header}[node name="A"]\ntext = "bad \\q escape"\n`, // unknown escape
    `${header}[node name="A"]\nshape = SubResource(12)\n`, // non-string reference
    `${header}[node type="Node"]\n`, // node without a name
    `${header}[node name="A"]\ngarbage line\n`, // not key = value
    `${header}[ext_resource type="T" id="1"]\nkey = 1\n`, // ext_resource with properties
  ];
  for (const doc of malformed) {
    assert.throws(
      () => adapter.parseGodotTscnDocument(doc),
      (error: unknown) => {
        assert.ok(
          error instanceof GodotTscnError,
          `expected GodotTscnError for ${JSON.stringify(doc)}`,
        );
        assert.match((error as GodotTscnError).detail, /line \d+$/);
        return true;
      },
      `expected GodotTscnError for ${JSON.stringify(doc)}`,
    );
  }
});

test("exportToGodotTscn refuses non-scene states with a typed error", () => {
  for (const bad of [null, undefined, "string", 123, {}, { tres: {} }]) {
    assert.throws(
      () => adapter.exportToGodotTscn(bad as never),
      (error: unknown) => {
        assert.ok(error instanceof GodotTscnError);
        assert.equal((error as GodotTscnError).detail, "not-tscn-state");
        return true;
      },
    );
  }
});

test("deriveOperations: granular typed paths for tscn-shaped states, sha-256 value hashes", () => {
  const state = adapter.parseGodotTscnDocument(REAL_GODOT_TSCN);
  const operations = adapter.deriveOperations(state);
  assert.ok(operations.length > 0);
  const paths = new Set(operations.map((operation) => operation.path));
  assert.ok(paths.has("/tscn/header/format"));
  assert.ok(paths.has("/tscn/sections/0"));
  assert.ok(paths.has("/tscn/sections/2/properties/size"));
  assert.ok(paths.has("/tscn/sections/3/properties/script"));
  for (const operation of operations) {
    assert.equal(operation.kind, "set");
    assert.match(operation.path, /^\/tscn(\/|$)/);
    assert.match(operation.valueHash ?? "", /^[0-9a-f]{64}$/);
  }
});

test("deriveOperations: non-tscn object states fall back to honest top-level carry; non-objects derive nothing", () => {
  assert.deepEqual(
    adapter.deriveOperations({ nodes: [{ name: "A" }], tree: 3 }).map((o) => o.path),
    ["/nodes", "/tree"],
  );
  for (const bad of [null, undefined, "string", 42, true]) {
    assert.deepEqual(adapter.deriveOperations(bad), []);
  }
});

test("deriveOperations changes when the scene is edited (delta derivation is real)", () => {
  const before = adapter.parseGodotTscnDocument(REAL_GODOT_TSCN);
  const after = adapter.parseGodotTscnDocument(REAL_GODOT_TSCN.replace("speed = 420", "speed = 450"));
  const opsBefore = adapter.deriveOperations(before);
  const opsAfter = adapter.deriveOperations(after);
  assert.notDeepEqual(opsBefore, opsAfter);
  const speedBefore = opsBefore.find((operation) =>
    operation.path === "/tscn/sections/3/properties/speed",
  );
  const speedAfter = opsAfter.find((operation) =>
    operation.path === "/tscn/sections/3/properties/speed",
  );
  assert.ok(speedBefore && speedAfter);
  assert.notEqual(speedBefore.valueHash, speedAfter.valueHash);
  assert.equal(opsBefore.length, opsAfter.length);
});

const smokePolicy: PolicySet = {
  rights: { holders: ["holder:godot-smoke"], usages: ["render", "edit"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const smokeProvenance: ProvenanceDescriptor = {
  sourceKind: "agent-run",
  sourceRef: "run:godot-smoke",
  capturedAt: "2026-10-12T00:00:00.000Z",
};

test("FIXTURE broker smoke: the REAL adapter resolves, opens and reconciles level-2 through the real EditorBrokerService", async () => {
  const clock = new FixedClock("2026-10-12T00:00:00.000Z");
  const artifacts = new ArtifactGraphService(clock);
  await artifacts.recordArtifact({
    artifactId: "art:tscn-smoke",
    kind: "tactical-simulation-scene",
    editability: "editable",
    policy: smokePolicy,
  });
  const exported = adapter.exportToGodotTscn(adapter.parseGodotTscnDocument(REAL_GODOT_TSCN));
  const r1 = await artifacts.commitRevision({
    artifactId: "art:tscn-smoke",
    revisionId: "rev:tscn-smoke-1",
    contentHash: sha256Text(exported),
    toolVersions: ["sporta-render@0"],
    provenance: smokeProvenance,
    policy: smokePolicy,
  });

  const broker = new EditorBrokerService({
    clock,
    hash: sha256EditorHash,
    artifactGraph: artifacts,
    sessionStore: new InMemoryEditorSessionStore(),
    adapters: [new GodotTscnAdapter(sha256EditorHash)],
  } satisfies EditorBrokerDeps);
  const resolution = await broker.resolveEditor({
    revisionId: r1.revisionId,
    operation: "round-trip",
    availability: [
      {
        editorId: "godot",
        version: "4.3.0",
        integrationLevel: 2,
        projectFormat: "application/x-godot-scene",
        licensing: "MIT",
      },
      { editorId: "exporter-only", integrationLevel: 1, licensing: "MIT" },
    ],
  });
  assert.equal(resolution.editorId, "godot");
  assert.equal(resolution.integrationLevel, 2);

  const session = await broker.openSession({
    revisionId: r1.revisionId,
    editorId: "godot",
    mode: "local",
    policy: smokePolicy,
  });
  assert.equal(session.integrationLevel, 2);

  const state = adapter.parseGodotTscnDocument(exported);
  const changedProjectHash = sha256Text(adapter.exportToGodotTscn(state));
  const result = await broker.reconcileSession({
    editorSessionId: session.editorSessionId,
    changedProjectHash,
    externalTool: { name: "godot", version: "4.3.0" },
    projectFormat: "application/x-godot-scene",
    projectState: state,
  });
  assert.equal(result.understood, true);
  assert.equal(result.revision.parentRevisionId, r1.revisionId);
  assert.equal(result.delta.editor, "godot");
  const paths = result.delta.operations.map((operation) => parseEditOperation(operation)?.path);
  assert.ok(paths.includes("/tscn/header/format"));
  assert.ok(paths.includes("/tscn/sections/3/properties/script"));

  // The .tscn extension token is a declared format too — understood path.
  const second = await broker.reconcileSession({
    editorSessionId: session.editorSessionId,
    changedProjectHash: sha256Text(`${exported}\nsecond-save`),
    externalTool: { name: "godot", version: "4.3.0" },
    projectFormat: ".tscn",
    projectState: state,
  });
  assert.equal(second.understood, true);
});
