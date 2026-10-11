import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  InkscapeAdapter,
  InkscapeSvgError,
  inkscapeLayersOf,
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
 * InkscapeAdapter — REAL round-trip tests for the SVG 1.1 adapter. The
 * fixture document below mirrors the shape real Inkscape writes (svg root
 * with namespaces and viewBox, a sodipodi:namedview, layer groups with
 * inkscape:groupmode/label, modeled paths with d data, unmodeled elements
 * like <text>/<rect>). Evidence grades:
 *
 * - REAL (how measured): file-based lanes write serialized bytes to a
 *   real temp workspace directory (one per session, removed on dispose),
 *   read them back with node:fs, re-parse and re-serialize, and prove
 *   export -> import -> export byte stability with string equality on the
 *   actual file bytes; parse results are compared with deepStrictEqual.
 * - FIXTURE (labeled in the test name): the broker smoke test wires the
 *   REAL adapter through in-memory fixture stores.
 */

const adapter = new InkscapeAdapter(sha256EditorHash);

const REAL_INKSCAPE_SVG = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" width="210mm" height="297mm" viewBox="0 0 210 297" version="1.1" inkscape:version="1.4.2">
  <sodipodi:namedview id="base">
    <inkscape:grid type="xygrid" units="mm"/>
  </sodipodi:namedview>
  <g inkscape:groupmode="layer" inkscape:label="Tactics" id="layer1">
    <path id="path_pitch" d="M 10,10 L 190,10 L 190,130 L 10,130 Z" fill="none" stroke="#000000"/>
    <path id="path_arrow" d="M 50,50 L 120,90" stroke="#ff0000" stroke-width="2"/>
    <text id="text_note">4-3-3</text>
  </g>
  <g inkscape:groupmode="layer" inkscape:label="Anmerkungen" id="layer2">
    <rect id="rect_box" x="5" y="5" width="20" height="10"/>
  </g>
</svg>
`;

async function realTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "sporta-inkscape-"));
}

test("adapter declares honest inkscape metadata", () => {
  assert.equal(adapter.editorId, "inkscape");
  assert.equal(adapter.integrationLevel, 2);
  assert.equal(adapter.licensing, "GPL-3.0");
  assert.deepEqual(adapter.knownProjectFormats, ["image/svg+xml"]);
  assert.match(adapter.editorVersion, /^\d+\.\d+\.\d+$/);
});

test("parseInkscapeSvgDocument reads a real-shaped SVG document into the canonical state", () => {
  const state = adapter.parseInkscapeSvgDocument(REAL_INKSCAPE_SVG);

  // Root geometry attributes are all preserved, verbatim.
  assert.equal(state.svg.attributes.xmlns, "http://www.w3.org/2000/svg");
  assert.equal(state.svg.attributes["xmlns:inkscape"], "http://www.inkscape.org/namespaces/inkscape");
  assert.equal(state.svg.attributes.width, "210mm");
  assert.equal(state.svg.attributes.height, "297mm");
  assert.equal(state.svg.attributes.viewBox, "0 0 210 297");

  // Document order is preserved (paint order): namedview, layer1, layer2.
  assert.equal(state.svg.children.length, 3);
  assert.equal(state.svg.children[0]?.type, "unknown");
  assert.equal(state.svg.children[0]?.tag, "sodipodi:namedview");

  const layers = inkscapeLayersOf(state.svg);
  assert.deepEqual(
    layers.map((layer) => layer.label),
    ["Tactics", "Anmerkungen"],
  );
  assert.deepEqual(
    layers.map((layer) => layer.id),
    ["layer1", "layer2"],
  );

  const pitch = layers[0]?.children[0];
  assert.ok(pitch && pitch.type === "path");
  assert.equal(pitch.id, "path_pitch");
  assert.equal(pitch.d, "M 10,10 L 190,10 L 190,130 L 10,130 Z");
  assert.deepEqual(pitch.attributes, { fill: "none", stroke: "#000000" });

  const arrow = layers[0]?.children[1];
  assert.ok(arrow && arrow.type === "path");
  assert.equal(arrow.d, "M 50,50 L 120,90");

  // The unmodeled <text> stays inside the layer's children order.
  const note = layers[0]?.children[2];
  assert.ok(note && note.type === "unknown" && note.tag === "text");
});

test("unknown elements are carried opaquely and never mutated (verbatim multi-line raw)", () => {
  const state = adapter.parseInkscapeSvgDocument(REAL_INKSCAPE_SVG);
  const namedview = state.svg.children[0];
  assert.ok(namedview && namedview.type === "unknown");
  assert.equal(
    namedview.raw,
    '<sodipodi:namedview id="base">\n    <inkscape:grid type="xygrid" units="mm"/>\n  </sodipodi:namedview>',
  );
  const text = inkscapeLayersOf(state.svg)[0]?.children[2];
  assert.ok(text && text.type === "unknown");
  assert.equal(text.raw, '<text id="text_note">4-3-3</text>');
});

test("round-trip: export(parse(doc)) preserves the document body byte-for-byte", () => {
  const exported = adapter.exportToInkscapeSvg(adapter.parseInkscapeSvgDocument(REAL_INKSCAPE_SVG));
  // Only the XML declaration is normalized (the precedent's law: the
  // prolog DOCTYPE/comments are not carried; the declaration is canonical).
  assert.ok(exported.startsWith('<?xml version="1.0" encoding="utf-8"?>'));
  const fixtureBody = REAL_INKSCAPE_SVG.slice(REAL_INKSCAPE_SVG.indexOf("\n") + 1);
  assert.equal(exported.slice(exported.indexOf("\n") + 1), fixtureBody);
});

test("round-trip: export(parse(doc)) is a fixed point — second pass is byte-identical", () => {
  const firstExport = adapter.exportToInkscapeSvg(adapter.parseInkscapeSvgDocument(REAL_INKSCAPE_SVG));
  const secondExport = adapter.exportToInkscapeSvg(adapter.parseInkscapeSvgDocument(firstExport));
  assert.equal(secondExport, firstExport);
});

test("round-trip: state survives export -> parse losslessly (deep equal)", () => {
  const state = adapter.parseInkscapeSvgDocument(REAL_INKSCAPE_SVG);
  const reParsed = adapter.parseInkscapeSvgDocument(adapter.exportToInkscapeSvg(state));
  assert.deepEqual(reParsed, state);
});

test("serialization guarantees the svg and inkscape namespaces on the root", () => {
  const state = adapter.parseInkscapeSvgDocument(
    '<svg width="10" height="10" viewBox="0 0 10 10"/>',
  );
  const exported = adapter.exportToInkscapeSvg(state);
  assert.ok(exported.includes('xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(
    exported.includes('xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"'),
  );
  // A state that already carries them keeps its own values (no duplicates).
  const again = adapter.parseInkscapeSvgDocument(exported);
  assert.equal(again.svg.attributes["xmlns:inkscape"], "http://www.inkscape.org/namespaces/inkscape");
  assert.equal(adapter.exportToInkscapeSvg(again), exported);
});

test("REAL FILE round-trip: .svg file read from disk, edited, re-exported, re-read", async () => {
  const dir = await realTempDir();
  try {
    const originalPath = join(dir, "tactical-board.svg");
    await writeFile(originalPath, REAL_INKSCAPE_SVG, "utf8");

    // The external editor opens the REAL file from disk.
    const fromDisk = await readFile(originalPath, "utf8");
    const state = adapter.parseInkscapeSvgDocument(fromDisk);

    // A real edit: rename a layer, add a path with XML-special geometry label.
    const edited = {
      svg: {
        ...state.svg,
        children: state.svg.children.map((child) =>
          child.type === "layer" && child.id === "layer1"
            ? {
                ...child,
                label: "Angriff & Verteidigung",
                children: [
                  ...child.children,
                  {
                    type: "path" as const,
                    id: "path_new",
                    d: "M 1,2 L 3,4",
                    attributes: { "data-note": "a<b>c" },
                  },
                ],
              }
            : child,
        ),
      },
    };
    const exported = adapter.exportToInkscapeSvg(edited);
    const editedPath = join(dir, "tactical-board-edited.svg");
    await writeFile(editedPath, exported, "utf8");

    // REAL file content assertions against the bytes on disk.
    const saved = await readFile(editedPath, "utf8");
    assert.ok(saved.includes('inkscape:label="Angriff &amp; Verteidigung"'));
    assert.ok(saved.includes('<path id="path_new" d="M 1,2 L 3,4" data-note="a&lt;b&gt;c"/>'));
    // The escaped values decode back on re-parse from disk.
    const reread = adapter.parseInkscapeSvgDocument(saved);
    assert.equal(inkscapeLayersOf(reread.svg)[0]?.label, "Angriff & Verteidigung");
    const added = inkscapeLayersOf(reread.svg)[0]?.children.at(-1);
    assert.ok(added && added.type === "path" && added.id === "path_new");
    assert.equal(added.d, "M 1,2 L 3,4");
    assert.equal(added.attributes["data-note"], "a<b>c");
    // The untouched parts of the document are still intact.
    assert.equal(inkscapeLayersOf(reread.svg)[1]?.label, "Anmerkungen");
    // REAL byte-stability: a serializer-produced file re-parses and
    // re-serializes to the exact same bytes.
    assert.equal(adapter.exportToInkscapeSvg(reread), saved);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("parse refuses non-SVG roots, stray text and malformed XML with typed errors", () => {
  assert.throws(
    () => adapter.parseInkscapeSvgDocument("<foo/>"),
    (error: unknown) => {
      assert.ok(error instanceof InkscapeSvgError);
      assert.equal((error as InkscapeSvgError).detail, "root:foo");
      return true;
    },
  );
  assert.throws(
    () => adapter.parseInkscapeSvgDocument("<svg>stray text</svg>"),
    (error: unknown) => {
      assert.ok(error instanceof InkscapeSvgError);
      assert.equal((error as InkscapeSvgError).detail, "stray-text");
      return true;
    },
  );
  assert.throws(
    () => adapter.parseInkscapeSvgDocument('<svg><g inkscape:groupmode="layer">text</g></svg>'),
    (error: unknown) => {
      assert.ok(error instanceof InkscapeSvgError);
      assert.equal((error as InkscapeSvgError).detail, "stray-text");
      return true;
    },
  );
  const malformed = [
    "This is not XML at all",
    "<svg><path d='M 1,2'/>", // svg never closed
    "<svg></foo>", // mismatched closing tag
    "<svg/><foo/>", // content after the root
    '<svg a="1" a="2"/>', // duplicate attribute
    "<svg>&broken;</svg>", // unknown entity
  ];
  for (const doc of malformed) {
    assert.throws(
      () => adapter.parseInkscapeSvgDocument(doc),
      (error: unknown) => {
        assert.ok(
          error instanceof InkscapeSvgError,
          `expected InkscapeSvgError for ${JSON.stringify(doc)}`,
        );
        return true;
      },
      `expected InkscapeSvgError for ${JSON.stringify(doc)}`,
    );
  }
});

test("exportToInkscapeSvg refuses non-SVG states with a typed error", () => {
  for (const bad of [null, undefined, "string", 123, {}, { notSvg: {} }]) {
    assert.throws(
      () => adapter.exportToInkscapeSvg(bad as never),
      (error: unknown) => {
        assert.ok(error instanceof InkscapeSvgError);
        assert.equal((error as InkscapeSvgError).detail, "not-inkscape-state");
        return true;
      },
    );
  }
});

test("deriveOperations: granular typed paths for SVG-shaped states, sha-256 value hashes", () => {
  const state = adapter.parseInkscapeSvgDocument(REAL_INKSCAPE_SVG);
  const operations = adapter.deriveOperations(state);
  assert.ok(operations.length > 0);
  const paths = new Set(operations.map((operation) => operation.path));
  assert.ok(paths.has("/svg/attributes/viewBox"));
  assert.ok(paths.has("/svg/children/0"));
  assert.ok(paths.has("/svg/children/1/children/0"));
  assert.ok(paths.has("/svg/children/1/children/0/d"));
  assert.ok(paths.has("/svg/children/1/children/1/d"));
  for (const operation of operations) {
    assert.equal(operation.kind, "set");
    assert.match(operation.path, /^\/svg(\/|$)/);
    assert.match(operation.valueHash ?? "", /^[0-9a-f]{64}$/);
  }
});

test("deriveOperations: non-SVG object states fall back to honest top-level carry; non-objects derive nothing", () => {
  assert.deepEqual(
    adapter.deriveOperations({ shapes: [{ id: "x" }], layers: 2 }).map((o) => o.path),
    ["/layers", "/shapes"],
  );
  for (const bad of [null, undefined, "string", 42, true]) {
    assert.deepEqual(adapter.deriveOperations(bad), []);
  }
});

test("deriveOperations changes when the geometry is edited (delta derivation is real)", () => {
  const before = adapter.parseInkscapeSvgDocument(REAL_INKSCAPE_SVG);
  const after = adapter.parseInkscapeSvgDocument(
    REAL_INKSCAPE_SVG.replace("M 50,50 L 120,90", "M 50,50 L 130,95"),
  );
  const opsBefore = adapter.deriveOperations(before);
  const opsAfter = adapter.deriveOperations(after);
  assert.notDeepEqual(opsBefore, opsAfter);
  const dBefore = opsBefore.find((operation) => operation.path === "/svg/children/1/children/1/d");
  const dAfter = opsAfter.find((operation) => operation.path === "/svg/children/1/children/1/d");
  assert.ok(dBefore && dAfter);
  assert.notEqual(dBefore.valueHash, dAfter.valueHash);
  assert.equal(opsBefore.length, opsAfter.length);
});

const smokePolicy: PolicySet = {
  rights: { holders: ["holder:inkscape-smoke"], usages: ["render", "edit"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const smokeProvenance: ProvenanceDescriptor = {
  sourceKind: "agent-run",
  sourceRef: "run:inkscape-smoke",
  capturedAt: "2026-10-12T00:00:00.000Z",
};

test("FIXTURE broker smoke: the REAL adapter resolves, opens and reconciles level-2 through the real EditorBrokerService", async () => {
  const clock = new FixedClock("2026-10-12T00:00:00.000Z");
  const artifacts = new ArtifactGraphService(clock);
  await artifacts.recordArtifact({
    artifactId: "art:svg-smoke",
    kind: "tactical-board-vector",
    editability: "editable",
    policy: smokePolicy,
  });
  const exported = adapter.exportToInkscapeSvg(adapter.parseInkscapeSvgDocument(REAL_INKSCAPE_SVG));
  const r1 = await artifacts.commitRevision({
    artifactId: "art:svg-smoke",
    revisionId: "rev:svg-smoke-1",
    contentHash: sha256Text(exported),
    toolVersions: ["sporta-render@0"],
    provenance: smokeProvenance,
    policy: smokePolicy,
  });

  // The REAL adapter is offered through the broker's injection seam —
  // the broker itself is untouched. A proprietary level-2 competitor
  // must lose to the open-source level-2 adapter (fail-closed license).
  const broker = new EditorBrokerService({
    clock,
    hash: sha256EditorHash,
    artifactGraph: artifacts,
    sessionStore: new InMemoryEditorSessionStore(),
    adapters: [new InkscapeAdapter(sha256EditorHash)],
  } satisfies EditorBrokerDeps);
  const resolution = await broker.resolveEditor({
    revisionId: r1.revisionId,
    operation: "round-trip",
    availability: [
      {
        editorId: "inkscape",
        version: "1.4.2",
        integrationLevel: 2,
        projectFormat: "image/svg+xml",
        licensing: "GPL-3.0",
      },
      {
        editorId: "vectorpro",
        integrationLevel: 2,
        projectFormat: "image/svg+xml",
        licensing: "proprietary",
      },
    ],
  });
  assert.equal(resolution.editorId, "inkscape");
  assert.equal(resolution.integrationLevel, 2);

  const session = await broker.openSession({
    revisionId: r1.revisionId,
    editorId: "inkscape",
    mode: "local",
    policy: smokePolicy,
  });
  // The session's level comes from the REAL adapter record (level 2).
  assert.equal(session.integrationLevel, 2);

  // A REAL parsed SVG state reconciles as UNDERSTOOD through the REAL
  // adapter's declared format, deriving typed operations from real bytes.
  const state = adapter.parseInkscapeSvgDocument(exported);
  const changedProjectHash = sha256Text(adapter.exportToInkscapeSvg(state));
  const result = await broker.reconcileSession({
    editorSessionId: session.editorSessionId,
    changedProjectHash,
    externalTool: { name: "inkscape", version: "1.4.2" },
    projectFormat: "image/svg+xml",
    projectState: state,
  });
  assert.equal(result.understood, true);
  assert.equal(result.revision.parentRevisionId, r1.revisionId);
  assert.equal(result.delta.editor, "inkscape");
  const paths = result.delta.operations.map((operation) => parseEditOperation(operation)?.path);
  assert.ok(paths.includes("/svg/children/1/children/0/d"));
  assert.ok(paths.includes("/svg/attributes/viewBox"));
});
