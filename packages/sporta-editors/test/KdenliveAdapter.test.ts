import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  KdenliveAdapter,
  KdenliveXmlError,
  sha256EditorHash,
} from "../src/contract.js";

/**
 * KdenliveAdapter — REAL round-trip tests for the .kdenlive (MLT XML)
 * adapter. The fixture document below mirrors the shape real Kdenlive
 * writes (mlt root, profile, producers with <property> children,
 * playlists with <entry>/<blank>, tractors with <track> and an unknown
 * <transition>). File-based tests write and re-read real files from a real
 * temp directory; every assertion below runs against real parsed/exported
 * bytes — no mocks, no fake clocks beyond the injected hash.
 */

const adapter = new KdenliveAdapter(sha256EditorHash);

const REAL_KDENLIVE_DOC = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE kdenlivedoc SYSTEM "kdenlive-0.9.dtd">
<mlt LC_NUMERIC="C" version="7.0.0" title="Anonymous Submission" producer="main_bin">
  <profile description="1920x1080 25.000 fps" width="1920" height="1080" frame_rate_num="25" frame_rate_den="1"/>
  <producer id="producer0" in="00:00:00.000" out="00:00:05.000">
    <property name="length">00:00:05.000</property>
    <property name="resource">/home/user/videos/goal.mp4</property>
    <property name="mlt_service">avformat</property>
  </producer>
  <playlist id="playlist0">
    <property name="kdenlive:track_name">Video 1</property>
    <entry producer="producer0" in="00:00:00.000" out="00:00:05.000"/>
    <blank length="00:00:01.000"/>
  </playlist>
  <tractor id="tractor0" in="00:00:00.000" out="00:00:06.000">
    <track producer="playlist0"/>
    <transition id="transition0" out="00:00:01.000">
      <property name="mlt_service">mix</property>
    </transition>
  </tractor>
</mlt>
`;

async function realTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "sporta-kdenlive-"));
}

test("adapter declares honest kdenlive metadata", () => {
  assert.equal(adapter.editorId, "kdenlive");
  assert.equal(adapter.editorVersion, "24.08.0");
  assert.equal(adapter.integrationLevel, 2);
  assert.equal(adapter.licensing, "GPL-3.0");
  assert.deepEqual(adapter.knownProjectFormats, ["kdenlive"]);
});

test("parseKdenliveXml reads a real-shaped MLT document into the canonical state", () => {
  const state = adapter.parseKdenliveXml(REAL_KDENLIVE_DOC);

  assert.deepEqual(state.mlt.attributes, {
    LC_NUMERIC: "C",
    version: "7.0.0",
    title: "Anonymous Submission",
    producer: "main_bin",
  });
  assert.deepEqual(state.mlt.profile, {
    description: "1920x1080 25.000 fps",
    width: "1920",
    height: "1080",
    frame_rate_num: "25",
    frame_rate_den: "1",
  });

  assert.equal(state.mlt.producers.length, 1);
  const producer = state.mlt.producers[0];
  assert.ok(producer);
  assert.deepEqual(producer.attributes, {
    id: "producer0",
    in: "00:00:00.000",
    out: "00:00:05.000",
  });
  assert.deepEqual(producer.properties, {
    length: "00:00:05.000",
    resource: "/home/user/videos/goal.mp4",
    mlt_service: "avformat",
  });

  assert.equal(state.mlt.playlists.length, 1);
  const playlist = state.mlt.playlists[0];
  assert.ok(playlist);
  assert.deepEqual(playlist.attributes, { id: "playlist0" });
  assert.deepEqual(playlist.properties, { "kdenlive:track_name": "Video 1" });
  assert.equal(playlist.children.length, 2);
  const entry = playlist.children[0];
  assert.ok(entry && entry.type === "entry");
  assert.deepEqual(entry.attributes, {
    producer: "producer0",
    in: "00:00:00.000",
    out: "00:00:05.000",
  });
  const blank = playlist.children[1];
  assert.ok(blank && blank.type === "unknown" && blank.tag === "blank");
  assert.equal(blank.raw, '<blank length="00:00:01.000"/>');

  assert.equal(state.mlt.tractors.length, 1);
  const tractor = state.mlt.tractors[0];
  assert.ok(tractor);
  const track = tractor.children[0];
  assert.ok(track && track.type === "track");
  assert.deepEqual(track.attributes, { producer: "playlist0" });
});

test("parseKdenliveXml carries unknown elements verbatim (nothing guessed, nothing dropped)", () => {
  const state = adapter.parseKdenliveXml(REAL_KDENLIVE_DOC);
  const transition = state.mlt.tractors[0]?.children[1];
  assert.ok(transition && transition.type === "unknown" && transition.tag === "transition");
  // Verbatim means byte-exact, including the original inner whitespace.
  assert.equal(
    transition.raw,
    '<transition id="transition0" out="00:00:01.000">\n      <property name="mlt_service">mix</property>\n    </transition>',
  );
});

test("round-trip: export(parse(doc)) is a fixed point — second pass is byte-identical", () => {
  const firstExport = adapter.exportToKdenliveXml(adapter.parseKdenliveXml(REAL_KDENLIVE_DOC));
  const secondExport = adapter.exportToKdenliveXml(adapter.parseKdenliveXml(firstExport));
  assert.equal(secondExport, firstExport);
  // Canonical shape checks on the exported document.
  assert.ok(firstExport.startsWith('<?xml version="1.0" encoding="utf-8"?>'));
  assert.ok(firstExport.includes("<mlt LC_NUMERIC=\"C\" version=\"7.0.0\""));
  assert.ok(firstExport.includes("<producer id=\"producer0\""));
  assert.ok(firstExport.includes('<property name="resource">/home/user/videos/goal.mp4</property>'));
  assert.ok(firstExport.includes('<entry producer="producer0" in="00:00:00.000" out="00:00:05.000"/>'));
  assert.ok(firstExport.includes('<track producer="playlist0"/>'));
  assert.ok(firstExport.trim().endsWith("</mlt>"));
});

test("round-trip: state survives export -> parse losslessly (deep equal)", () => {
  const state = adapter.parseKdenliveXml(REAL_KDENLIVE_DOC);
  const reParsed = adapter.parseKdenliveXml(adapter.exportToKdenliveXml(state));
  assert.deepEqual(reParsed, state);
});

test("REAL FILE round-trip: .kdenlive file read from disk, edited, re-exported, re-read", async () => {
  const dir = await realTempDir();
  try {
    const originalPath = join(dir, "match-timeline.kdenlive");
    await writeFile(originalPath, REAL_KDENLIVE_DOC, "utf8");

    // The external editor opens the REAL file from disk.
    const fromDisk = await readFile(originalPath, "utf8");
    const state = adapter.parseKdenliveXml(fromDisk);

    // A real edit: rename the document and add a producer property.
    const edited = {
      mlt: {
        ...state.mlt,
        attributes: { ...state.mlt.attributes, title: "Match 7 — Second Half" },
        producers: state.mlt.producers.map((producer) =>
          producer.attributes.id === "producer0"
            ? {
                ...producer,
                properties: {
                  ...producer.properties,
                  "kdenlive:clipname": "goal <final> & 'winner'",
                },
              }
            : producer,
        ),
      },
    };
    const exported = adapter.exportToKdenliveXml(edited);
    const editedPath = join(dir, "match-timeline-edited.kdenlive");
    await writeFile(editedPath, exported, "utf8");

    // REAL file content assertions against the file on disk.
    const saved = await readFile(editedPath, "utf8");
    assert.ok(saved.includes('title="Match 7 — Second Half"'));
    assert.ok(saved.includes('name="kdenlive:clipname"'));
    // The special characters were escaped on disk and survive a re-parse.
    const reread = adapter.parseKdenliveXml(saved);
    assert.equal(reread.mlt.attributes.title, "Match 7 — Second Half");
    assert.equal(
      reread.mlt.producers[0]?.properties["kdenlive:clipname"],
      "goal <final> & 'winner'",
    );
    // The untouched parts of the project are still intact.
    assert.equal(reread.mlt.playlists[0]?.children.length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("entities: predefined, decimal and hex character references decode on parse", () => {
  const doc =
    '<mlt><producer id="p">' +
    '<property name="a">caf&#233; &amp; cr&#x00E8;me</property>' +
    '<property name="b">&lt;tag&gt; &quot;q&quot; &apos;a&apos;</property>' +
    "</producer></mlt>";
  const state = adapter.parseKdenliveXml(doc);
  assert.equal(state.mlt.producers[0]?.properties.a, "café & crème");
  assert.equal(state.mlt.producers[0]?.properties.b, '<tag> "q" \'a\'');
});

test("export escapes XML-special values and round-trips them back", () => {
  const state = adapter.parseKdenliveXml(
    '<mlt><producer id="p"><property name="name">plain</property></producer></mlt>',
  );
  const edited = {
    mlt: {
      ...state.mlt,
      producers: [
        {
          attributes: { id: "p&" },
          properties: { value: "a<b>c&d\"e'f" },
          unknown: [],
        },
      ],
    },
  };
  const xml = adapter.exportToKdenliveXml(edited);
  assert.ok(xml.includes('<producer id="p&amp;">'));
  assert.ok(xml.includes('<property name="value">a&lt;b&gt;c&amp;d"e\'f</property>'));
  const back = adapter.parseKdenliveXml(xml);
  assert.equal(back.mlt.producers[0]?.attributes.id, "p&");
  assert.equal(back.mlt.producers[0]?.properties.value, 'a<b>c&d"e\'f');
});

test("parseKdenliveXml refuses non-MLT roots and malformed XML with typed errors", () => {
  assert.throws(
    () => adapter.parseKdenliveXml("<foo/>"),
    (error: unknown) => {
      assert.ok(error instanceof KdenliveXmlError);
      assert.equal((error as KdenliveXmlError).detail, "root:foo");
      return true;
    },
  );
  const malformed = [
    "This is not valid XML",
    "<mlt><producer></mlt>", // unclosed producer
    "<mlt></foo>", // mismatched closing tag
    "<mlt/><foo/>", // content after the root
    '<mlt a="1" a="2"/>', // duplicate attribute
    '<mlt a=unquoted/>', // unquoted attribute
    "<mlt>&broken;</mlt>", // unknown entity
    "<mlt>&amp</mlt>", // unterminated entity
    "<mlt><!-- never closed</mlt>", // unterminated comment
  ];
  for (const doc of malformed) {
    assert.throws(
      () => adapter.parseKdenliveXml(doc),
      (error: unknown) => {
        assert.ok(
          error instanceof KdenliveXmlError,
          `expected KdenliveXmlError for ${JSON.stringify(doc)}`,
        );
        return true;
      },
      `expected KdenliveXmlError for ${JSON.stringify(doc)}`,
    );
  }
});

test("exportToKdenliveXml refuses non-kdenlive states with a typed error", () => {
  for (const bad of [null, undefined, "string", 123, {}, { notMlt: {} }]) {
    assert.throws(
      () => adapter.exportToKdenliveXml(bad as never),
      (error: unknown) => {
        assert.ok(error instanceof KdenliveXmlError);
        assert.equal((error as KdenliveXmlError).detail, "not-kdenlive-state");
        return true;
      },
    );
  }
});

test("deriveOperations: granular typed paths for MLT-shaped states, sha-256 value hashes", () => {
  const state = adapter.parseKdenliveXml(REAL_KDENLIVE_DOC);
  const operations = adapter.deriveOperations(state);
  assert.ok(operations.length > 0);
  const paths = new Set(operations.map((operation) => operation.path));
  assert.ok(paths.has("/mlt/attributes/version"));
  assert.ok(paths.has("/mlt/profile/width"));
  assert.ok(paths.has("/mlt/producers/0/properties/resource"));
  assert.ok(paths.has("/mlt/playlists/0/children/0"));
  assert.ok(paths.has("/mlt/tractors/0/children/0"));
  for (const operation of operations) {
    assert.equal(operation.kind, "set");
    assert.match(operation.path, /^\/mlt(\/|$)/);
    assert.match(operation.valueHash ?? "", /^[0-9a-f]{64}$/);
  }
});

test("deriveOperations: non-MLT object states fall back to honest top-level carry", () => {
  const operations = adapter.deriveOperations({ clips: [{ start: 0 }], tracks: 2 });
  assert.deepEqual(
    operations.map((operation) => operation.path),
    ["/clips", "/tracks"],
  );
  for (const operation of operations) {
    assert.equal(operation.kind, "set");
    assert.match(operation.valueHash ?? "", /^[0-9a-f]{64}$/);
  }
});

test("deriveOperations: non-object states derive nothing", () => {
  for (const bad of [null, undefined, "string", 42, true]) {
    assert.deepEqual(adapter.deriveOperations(bad), []);
  }
});

test("deriveOperations changes when the project is edited (delta derivation is real)", () => {
  const before = adapter.parseKdenliveXml(REAL_KDENLIVE_DOC);
  const after = adapter.parseKdenliveXml(
    REAL_KDENLIVE_DOC.replace("/home/user/videos/goal.mp4", "/home/user/videos/winner.mp4"),
  );
  const opsBefore = adapter.deriveOperations(before);
  const opsAfter = adapter.deriveOperations(after);
  assert.notDeepEqual(opsBefore, opsAfter);
  const resourceBefore = opsBefore.find((operation) =>
    operation.path === "/mlt/producers/0/properties/resource",
  );
  const resourceAfter = opsAfter.find((operation) =>
    operation.path === "/mlt/producers/0/properties/resource",
  );
  assert.ok(resourceBefore && resourceAfter);
  assert.notEqual(resourceBefore.valueHash, resourceAfter.valueHash);
  // Everything else about the project is unchanged.
  assert.equal(opsBefore.length, opsAfter.length);
});
