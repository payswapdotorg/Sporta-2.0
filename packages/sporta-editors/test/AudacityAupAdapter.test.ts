import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AudacityAupAdapter,
  AudacityAupError,
  audacityWavetracksOf,
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
 * AudacityAupAdapter — REAL round-trip tests for the Audacity 2.x legacy
 * XML project (.aup) adapter. The fixture below mirrors the shape real
 * Audacity 2.4.2 writes (project attributes incl. snapto/selection, a
 * tags block, a wavetrack with gain/linked, waveclip -> sequence ->
 * waveblock chains with simpleblockfile sample references and
 * aliasblockfile summary/alias references, plus real unmodeled elements
 * like labeltrack/envelope). The referenced sample data stays external —
 * an .aup without its sample blocks on disk is still a legal document
 * (the Kdenlive-MLT law); binary sample data is never fabricated.
 * Evidence grades:
 *
 * - REAL (how measured): file-based lanes write serialized bytes to a
 *   real temp workspace directory (one per session, removed on dispose),
 *   read them back with node:fs, re-parse and re-serialize, and prove
 *   export -> import -> export byte stability with string equality on the
 *   actual file bytes; parse results are compared with deepStrictEqual.
 * - FIXTURE (labeled in the test name): the broker smoke test wires the
 *   REAL adapter through in-memory fixture stores.
 */

const adapter = new AudacityAupAdapter(sha256EditorHash);

const REAL_AUDACITY_AUP = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<!DOCTYPE project PUBLIC "-//audacityproject-1.3.0//DTD//EN" "http://audacityteam.org/xml/audacityproject-1.3.0.dtd">
<project xmlns="http://audacityteam.org/xml/" projname="second_half_data" version="1.3.0" audacityversion="2.4.2" rate="44100" snapto="off" selectionformat="hh:mm:ss + samples">
  <tags>
    <tag name="software">Audacity 2.4.2</tag>
    <tag name="artist">stadion sprecher</tag>
  </tags>
  <wavetrack name="Kommentator" channel="2" linked="1" offset="0.00000000" rate="44100" gain="1.0" pan="0.0" visible="true" height="150" minimized="false" isSelected="0">
    <waveclip offset="0.00000000">
      <sequence maxlen="882000" gapless="false">
        <waveblock start="0">
          <simpleblockfile filename="e00/e0000000.au" len="262144" min="-0.913803" max="0.915436" rms="0.188103"/>
        </waveblock>
        <waveblock start="262144">
          <aliasblockfile summaryfile="e00/e0000001.auf" aliasfile="/media/recordings/crowd.wav" aliasstart="44100" aliaslen="262144" aliaschannels="2" min="-0.5" max="0.5" rms="0.3"/>
        </waveblock>
      </sequence>
    </waveclip>
    <envelope numpoints="1">
      <controlpoint t="0.5" val="1.0"/>
    </envelope>
  </wavetrack>
  <labeltrack name="Marken" height="30" minimized="false"/>
</project>
`;

async function realTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "sporta-audacity-"));
}

test("adapter declares honest audacity metadata", () => {
  assert.equal(adapter.editorId, "audacity");
  assert.equal(adapter.integrationLevel, 2);
  assert.equal(adapter.licensing, "GPL-2.0+");
  assert.deepEqual(adapter.knownProjectFormats, ["application/x-audacity-project"]);
  assert.match(adapter.editorVersion, /^\d+\.\d+\.\d+$/);
});

test("parseAudacityAupDocument reads a real-shaped .aup into the canonical state", () => {
  const state = adapter.parseAudacityAupDocument(REAL_AUDACITY_AUP);

  // Project attributes: projname, rate, snapto/selection preserved.
  assert.equal(state.project.attributes.projname, "second_half_data");
  assert.equal(state.project.attributes.rate, "44100");
  assert.equal(state.project.attributes.snapto, "off");
  assert.equal(state.project.attributes.selectionformat, "hh:mm:ss + samples");
  assert.equal(state.project.attributes.xmlns, "http://audacityteam.org/xml/");

  // Document order: tags, wavetrack, labeltrack.
  assert.equal(state.project.children.length, 3);

  // The tags block with decoded text.
  const tags = state.project.children[0];
  assert.ok(tags && tags.type === "tags");
  assert.deepEqual(tags.tags, [
    { name: "software", value: "Audacity 2.4.2" },
    { name: "artist", value: "stadion sprecher" },
  ]);

  // The wavetrack list with channel/rate and the block chain.
  const tracks = audacityWavetracksOf(state.project);
  assert.equal(tracks.length, 1);
  const track = tracks[0];
  assert.ok(track);
  assert.equal(track.attributes.name, "Kommentator");
  assert.equal(track.attributes.channel, "2");
  assert.equal(track.attributes.rate, "44100");
  assert.equal(track.attributes.gain, "1.0");
  assert.equal(track.attributes.linked, "1");

  const clip = track.children[0];
  assert.ok(clip && clip.type === "waveclip");
  assert.equal(clip.attributes.offset, "0.00000000");
  assert.ok(clip.sequence);
  assert.equal(clip.sequence.attributes.maxlen, "882000");

  // The waveblock chain: start values + external file references.
  const blocks = clip.sequence.waveblocks;
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]?.start, "0");
  assert.deepEqual(blocks[0]?.blockFile, {
    type: "simpleblockfile",
    attributes: {
      filename: "e00/e0000000.au",
      len: "262144",
      min: "-0.913803",
      max: "0.915436",
      rms: "0.188103",
    },
  });
  assert.equal(blocks[1]?.start, "262144");
  assert.equal(blocks[1]?.blockFile?.type, "aliasblockfile");
  assert.equal(blocks[1]?.blockFile?.attributes.summaryfile, "e00/e0000001.auf");
  assert.equal(blocks[1]?.blockFile?.attributes.aliasfile, "/media/recordings/crowd.wav");
});

test("unknown elements are carried opaquely and never mutated (verbatim multi-line raw)", () => {
  const state = adapter.parseAudacityAupDocument(REAL_AUDACITY_AUP);
  const labeltrack = state.project.children[2];
  assert.ok(labeltrack && labeltrack.type === "unknown" && labeltrack.tag === "labeltrack");
  assert.equal(
    labeltrack.raw,
    '<labeltrack name="Marken" height="30" minimized="false"/>',
  );
  const envelope = audacityWavetracksOf(state.project)[0]?.children[1];
  assert.ok(envelope && envelope.type === "unknown" && envelope.tag === "envelope");
  assert.equal(
    envelope.raw,
    '<envelope numpoints="1">\n      <controlpoint t="0.5" val="1.0"/>\n    </envelope>',
  );
});

test("round-trip: export(parse(doc)) is a fixed point — second pass is byte-identical", () => {
  const firstExport = adapter.exportToAudacityAup(adapter.parseAudacityAupDocument(REAL_AUDACITY_AUP));
  const secondExport = adapter.exportToAudacityAup(adapter.parseAudacityAupDocument(firstExport));
  assert.equal(secondExport, firstExport);
  // Canonical shape checks on the exported document.
  assert.ok(firstExport.startsWith('<?xml version="1.0" encoding="utf-8"?>'));
  assert.ok(firstExport.includes('<project xmlns="http://audacityteam.org/xml/"'));
  assert.ok(firstExport.includes('<wavetrack name="Kommentator"'));
  assert.ok(firstExport.includes('<sequence maxlen="882000"'));
  assert.ok(firstExport.includes('<waveblock start="262144">'));
  assert.ok(firstExport.trim().endsWith("</project>"));
});

test("round-trip: state survives export -> parse losslessly (deep equal)", () => {
  const state = adapter.parseAudacityAupDocument(REAL_AUDACITY_AUP);
  const reParsed = adapter.parseAudacityAupDocument(adapter.exportToAudacityAup(state));
  assert.deepEqual(reParsed, state);
});

test("the external-reference chain is preserved across the round-trip (document-only honesty)", () => {
  const state = adapter.parseAudacityAupDocument(REAL_AUDACITY_AUP);
  const reParsed = adapter.parseAudacityAupDocument(adapter.exportToAudacityAup(state));
  const chains = (project: typeof state.project): string[] =>
    audacityWavetracksOf(project).flatMap((track) =>
      track.children.flatMap((clip) =>
        clip.type === "waveclip" && clip.sequence !== undefined
          ? clip.sequence.waveblocks.map(
              (block) =>
                block.blockFile?.attributes.filename ??
                block.blockFile?.attributes.summaryfile ??
                "<missing>",
            )
          : [],
      ),
    );
  assert.deepEqual(chains(reParsed.project), chains(state.project));
  assert.deepEqual(chains(reParsed.project), ["e00/e0000000.au", "e00/e0000001.auf"]);
});

test("REAL FILE round-trip: .aup file read from disk, edited, re-exported, re-read", async () => {
  const dir = await realTempDir();
  try {
    const originalPath = join(dir, "match-commentary.aup");
    await writeFile(originalPath, REAL_AUDACITY_AUP, "utf8");

    // The external editor opens the REAL file from disk.
    const fromDisk = await readFile(originalPath, "utf8");
    const state = adapter.parseAudacityAupDocument(fromDisk);

    // A real edit: raise the gain and add a waveblock referencing a new
    // external sample file (the sample data itself stays external).
    const edited = {
      project: {
        ...state.project,
        children: state.project.children.map((child) => {
          if (child.type !== "wavetrack") return child;
          return {
            ...child,
            attributes: { ...child.attributes, gain: "1.25" },
            children: child.children.map((clip) =>
              clip.type === "waveclip" && clip.sequence !== undefined
                ? {
                    ...clip,
                    sequence: {
                      ...clip.sequence,
                      waveblocks: [
                        ...clip.sequence.waveblocks,
                        {
                          start: "524288",
                          attributes: {},
                          blockFile: {
                            type: "simpleblockfile" as const,
                            attributes: {
                              filename: "e00/e0000002.au",
                              len: "100000",
                              min: "-0.1",
                              max: "0.1",
                              rms: "0.05",
                            },
                          },
                          unknown: [],
                        },
                      ],
                    },
                  }
                : clip,
            ),
          };
        }),
      },
    };
    const exported = adapter.exportToAudacityAup(edited);
    const editedPath = join(dir, "match-commentary-edited.aup");
    await writeFile(editedPath, exported, "utf8");

    // REAL file content assertions against the bytes on disk.
    const saved = await readFile(editedPath, "utf8");
    assert.ok(saved.includes('gain="1.25"'));
    assert.ok(saved.includes('<waveblock start="524288">'));
    assert.ok(
      saved.includes(
        '<simpleblockfile filename="e00/e0000002.au" len="100000" min="-0.1" max="0.1" rms="0.05"/>',
      ),
    );
    // The alias reference chain is still intact on disk.
    assert.ok(saved.includes('aliasfile="/media/recordings/crowd.wav"'));

    // Re-parse from disk: the edit and the full reference chain survived.
    const reread = adapter.parseAudacityAupDocument(saved);
    const track = audacityWavetracksOf(reread.project)[0];
    assert.ok(track);
    assert.equal(track.attributes.gain, "1.25");
    const blocks = track.children
      .flatMap((clip) => (clip.type === "waveclip" && clip.sequence ? clip.sequence.waveblocks : []));
    assert.equal(blocks.length, 3);
    assert.equal(blocks[2]?.start, "524288");
    assert.equal(blocks[2]?.blockFile?.attributes.filename, "e00/e0000002.au");
    // The unknown envelope is still carried verbatim.
    assert.ok(saved.includes('<controlpoint t="0.5" val="1.0"/>'));
    // REAL byte-stability: a serializer-produced file re-parses and
    // re-serializes to the exact same bytes.
    assert.equal(adapter.exportToAudacityAup(reread), saved);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("entities: predefined, decimal and hex character references decode on parse", () => {
  const doc =
    '<project><tags><tag name="note">caf&#233; &amp; cr&#x00E8;me</tag>' +
    '<tag name="b">&lt;tag&gt; &quot;q&quot; &apos;a&apos;</tag></tags></project>';
  const state = adapter.parseAudacityAupDocument(doc);
  const tags = state.project.children[0];
  assert.ok(tags && tags.type === "tags");
  assert.equal(tags.tags[0]?.value, "café & crème");
  assert.equal(tags.tags[1]?.value, '<tag> "q" \'a\'');
});

test("export escapes XML-special values and round-trips them back", () => {
  const state = adapter.parseAudacityAupDocument(
    "<project><tags><tag name=\"software\">plain</tag></tags></project>",
  );
  const edited = {
    project: {
      ...state.project,
      children: [
        {
          type: "tags" as const,
          tags: [{ name: "note", value: "a<b>c&d\"e'f" }],
          unknown: [],
        },
      ],
    },
  };
  const xml = adapter.exportToAudacityAup(edited);
  // Text content escapes &, < and > (quotes are legal raw in text — the
  // scanner's precedent semantics); re-parse decodes them losslessly.
  assert.ok(xml.includes("<tag name=\"note\">a&lt;b&gt;c&amp;d\"e'f</tag>"));
  const back = adapter.parseAudacityAupDocument(xml);
  const tags = back.project.children[0];
  assert.ok(tags && tags.type === "tags");
  assert.equal(tags.tags[0]?.value, 'a<b>c&d"e\'f');
});

test("parse refuses non-project roots, waveblocks without start, and malformed XML", () => {
  assert.throws(
    () => adapter.parseAudacityAupDocument("<foo/>"),
    (error: unknown) => {
      assert.ok(error instanceof AudacityAupError);
      assert.equal((error as AudacityAupError).detail, "root:foo");
      return true;
    },
  );
  assert.throws(
    () =>
      adapter.parseAudacityAupDocument(
        '<project><wavetrack><waveclip><sequence><waveblock len="100"/></sequence></waveclip></wavetrack></project>',
      ),
    (error: unknown) => {
      assert.ok(error instanceof AudacityAupError);
      assert.match((error as AudacityAupError).detail, /^waveblock-without-start:\d+$/);
      return true;
    },
  );
  const malformed = [
    "This is not XML at all",
    "<project><wavetrack></project>", // unclosed wavetrack
    "<project></foo>", // mismatched closing tag
    "<project/><foo/>", // content after the root
    '<project a="1" a="2"/>', // duplicate attribute
    "<project>&broken;</project>", // unknown entity
    "<project>stray text</project>", // stray text in element-only position
  ];
  for (const doc of malformed) {
    assert.throws(
      () => adapter.parseAudacityAupDocument(doc),
      (error: unknown) => {
        assert.ok(
          error instanceof AudacityAupError,
          `expected AudacityAupError for ${JSON.stringify(doc)}`,
        );
        return true;
      },
      `expected AudacityAupError for ${JSON.stringify(doc)}`,
    );
  }
});

test("exportToAudacityAup refuses non-project states with a typed error", () => {
  for (const bad of [null, undefined, "string", 123, {}, { notProject: {} }]) {
    assert.throws(
      () => adapter.exportToAudacityAup(bad as never),
      (error: unknown) => {
        assert.ok(error instanceof AudacityAupError);
        assert.equal((error as AudacityAupError).detail, "not-aup-state");
        return true;
      },
    );
  }
});

test("deriveOperations: granular typed paths for aup-shaped states, sha-256 value hashes", () => {
  const state = adapter.parseAudacityAupDocument(REAL_AUDACITY_AUP);
  const operations = adapter.deriveOperations(state);
  assert.ok(operations.length > 0);
  const paths = new Set(operations.map((operation) => operation.path));
  assert.ok(paths.has("/project/attributes/projname"));
  assert.ok(paths.has("/project/children/0/tags/0"));
  assert.ok(paths.has("/project/children/1/children/0"));
  for (const operation of operations) {
    assert.equal(operation.kind, "set");
    assert.match(operation.path, /^\/project(\/|$)/);
    assert.match(operation.valueHash ?? "", /^[0-9a-f]{64}$/);
  }
});

test("deriveOperations: non-aup object states fall back to honest top-level carry; non-objects derive nothing", () => {
  assert.deepEqual(
    adapter.deriveOperations({ tracks: [{ name: "T" }], rate: 44100 }).map((o) => o.path),
    ["/rate", "/tracks"],
  );
  for (const bad of [null, undefined, "string", 42, true]) {
    assert.deepEqual(adapter.deriveOperations(bad), []);
  }
});

const smokePolicy: PolicySet = {
  rights: { holders: ["holder:aup-smoke"], usages: ["render", "edit"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const smokeProvenance: ProvenanceDescriptor = {
  sourceKind: "agent-run",
  sourceRef: "run:aup-smoke",
  capturedAt: "2026-10-12T00:00:00.000Z",
};

test("FIXTURE broker smoke: the REAL adapter resolves, opens and reconciles level-2 through the real EditorBrokerService", async () => {
  const clock = new FixedClock("2026-10-12T00:00:00.000Z");
  const artifacts = new ArtifactGraphService(clock);
  await artifacts.recordArtifact({
    artifactId: "art:aup-smoke",
    kind: "match-commentary-audio",
    editability: "editable",
    policy: smokePolicy,
  });
  const exported = adapter.exportToAudacityAup(adapter.parseAudacityAupDocument(REAL_AUDACITY_AUP));
  const r1 = await artifacts.commitRevision({
    artifactId: "art:aup-smoke",
    revisionId: "rev:aup-smoke-1",
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
    adapters: [new AudacityAupAdapter(sha256EditorHash)],
  } satisfies EditorBrokerDeps);
  const resolution = await broker.resolveEditor({
    revisionId: r1.revisionId,
    operation: "round-trip",
    availability: [
      {
        editorId: "audacity",
        version: "2.4.2",
        integrationLevel: 2,
        projectFormat: "application/x-audacity-project",
        licensing: "GPL-2.0+",
      },
    ],
  });
  assert.equal(resolution.editorId, "audacity");
  assert.equal(resolution.integrationLevel, 2);

  const session = await broker.openSession({
    revisionId: r1.revisionId,
    editorId: "audacity",
    mode: "external",
    policy: smokePolicy,
  });
  assert.equal(session.integrationLevel, 2);

  // A REAL parsed .aup state reconciles as UNDERSTOOD through the REAL
  // adapter's declared format. The changedProjectHash is the REAL sha-256
  // of the REAL re-serialized document bytes.
  const state = adapter.parseAudacityAupDocument(exported);
  const changedProjectHash = sha256Text(adapter.exportToAudacityAup(state));
  const result = await broker.reconcileSession({
    editorSessionId: session.editorSessionId,
    changedProjectHash,
    externalTool: { name: "audacity", version: "2.4.2" },
    projectFormat: "application/x-audacity-project",
    projectState: state,
  });
  assert.equal(result.understood, true);
  assert.equal(result.revision.parentRevisionId, r1.revisionId);
  assert.equal(result.delta.editor, "audacity");
  const paths = result.delta.operations.map((operation) => parseEditOperation(operation)?.path);
  assert.ok(paths.includes("/project/attributes/projname"));
  assert.ok(paths.includes("/project/children/1/children/0"));
});
