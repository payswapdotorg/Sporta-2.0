import { KdenliveAdapter } from "../src/adapters/KdenliveAdapter.js";
import type { EditOperation } from "../src/domain/operations.js";

describe("KdenliveAdapter", () => {
  let adapter: KdenliveAdapter;

  beforeEach(() => {
    adapter = new KdenliveAdapter((input: string) => {
      // Simple hash function for testing
      let hash = 0;
      for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return Math.abs(hash).toString(16);
    });
  });

  describe("metadata", () => {
    it("has correct editor metadata", () => {
      expect(adapter.editorId).toBe("kdenlive");
      expect(adapter.editorVersion).toBe("24.08.0");
      expect(adapter.integrationLevel).toBe(2);
      expect(adapter.licensing).toBe("GPL-3.0");
      expect(adapter.knownProjectFormats).toEqual(["kdenlive"]);
    });
  });

  describe("deriveOperations", () => {
    it("derives operations from valid Kdenlive project state", () => {
      const projectState = {
        kdenliveproject: {
          properties: {
            documentname: "Test Project",
            fps: "25.0",
          },
          producers: [
            {
              id: "producer1",
              properties: {
                length: "00:00:10.000",
                resource: "/path/to/video.mp4",
              },
            },
          ],
          playlist: [
            {
              producer: "producer1",
              entry: {
                in: "00:00:00.000",
                out: "00:00:05.000",
              },
            },
          ],
          tractor: [
            {
              track: [
                {
                  playlist: [
                    {
                      producer: "producer1",
                      entry: {
                        in: "00:00:00.000",
                        out: "00:00:05.000",
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      const operations = adapter.deriveOperations(projectState);

      expect(operations).toBeInstanceOf(Array);
      expect(operations.length).toBeGreaterThan(0);

      // Check that we have operations for different parts of the project
      const propertyOps = operations.filter(op => op.path.startsWith("/properties/"));
      const producerOps = operations.filter(op => op.path.startsWith("/producers/"));
      const playlistOps = operations.filter(op => op.path.startsWith("/playlist/"));
      const tractorOps = operations.filter(op => op.path.startsWith("/tractor/"));

      expect(propertyOps.length).toBeGreaterThan(0);
      expect(producerOps.length).toBeGreaterThan(0);
      expect(playlistOps.length).toBeGreaterThan(0);
      expect(tractorOps.length).toBeGreaterThan(0);

      // Verify operation structure
      operations.forEach(op => {
        expect(op).toHaveProperty("kind");
        expect(op).toHaveProperty("path");
        expect(op).toHaveProperty("valueHash");
        expect(op.kind).toBe("set");
        expect(typeof op.path).toBe("string");
        expect(typeof op.valueHash).toBe("string");
      });
    });

    it("handles empty project state", () => {
      const operations = adapter.deriveOperations({});
      expect(operations).toEqual([]);
    });

    it("handles null/undefined project state", () => {
      expect(adapter.deriveOperations(null)).toEqual([]);
      expect(adapter.deriveOperations(undefined)).toEqual([]);
    });

    it("handles non-object project state", () => {
      expect(adapter.deriveOperations("not an object")).toEqual([]);
      expect(adapter.deriveOperations(123)).toEqual([]);
      expect(adapter.deriveOperations(true)).toEqual([]);
    });

    it("preserves unknown elements", () => {
      const projectState = {
        kdenliveproject: {
          properties: {
            documentname: "Test Project",
          },
          unknownElement: {
            someData: "value",
          },
        },
        anotherUnknown: "top-level unknown",
      };

      const operations = adapter.deriveOperations(projectState);
      
      // Should have operations for known elements
      expect(operations.some(op => op.path === "/properties/documentname")).toBe(true);
      
      // Should also have operations for unknown elements
      expect(operations.some(op => op.path === "/unknownElement")).toBe(true);
      expect(operations.some(op => op.path === "/anotherUnknown")).toBe(true);
    });
  });

  describe("exportToKdenliveXml", () => {
    it("exports valid Kdenlive XML", () => {
      const projectState = {
        kdenliveproject: {
          properties: {
            documentname: "Test Project",
            fps: "25.0",
          },
          producers: [
            {
              id: "producer1",
              properties: {
                length: "00:00:10.000",
                resource: "/path/to/video.mp4",
              },
            },
          ],
          playlist: [
            {
              producer: "producer1",
            },
          ],
        },
      };

      const xml = adapter.exportToKdenliveXml(projectState);
      
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<!DOCTYPE kdenlivedoc SYSTEM "kdenlive-0.9.dtd">');
      expect(xml).toContain('<kdenliveproject version="1.0">');
      expect(xml).toContain('<properties>');
      expect(xml).toContain('<documentname>Test Project</documentname>');
      expect(xml).toContain('<fps>25.0</fps>');
      expect(xml).toContain('<producers>');
      expect(xml).toContain('<producer id="producer0">');
      expect(xml).toContain('</kdenliveproject>');
    });

    it("escapes XML special characters", () => {
      const projectState = {
        kdenliveproject: {
          properties: {
            documentname: 'Test & "Project" <with> \'special\' characters',
          },
        },
      };

      const xml = adapter.exportToKdenliveXml(projectState);
      expect(xml).toContain('<documentname>Test &amp; &quot;Project&quot; &lt;with&gt; &apos;special&apos; characters</documentname>');
    });

    it("throws for invalid project state", () => {
      expect(() => adapter.exportToKdenliveXml(null)).toThrow();
      expect(() => adapter.exportToKdenliveXml(undefined)).toThrow();
      expect(() => adapter.exportToKdenliveXml("not an object")).toThrow();
    });
  });

  describe("parseKdenliveXml", () => {
    it("parses valid Kdenlive XML", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE kdenlivedoc SYSTEM "kdenlive-0.9.dtd">
<kdenliveproject version="1.0">
  <properties>
    <documentname>Test Project</documentname>
    <fps>25.0</fps>
  </properties>
  <producers>
    <producer id="producer0">
      <properties>
        <length>00:00:10.000</length>
        <resource>/path/to/video.mp4</resource>
      </properties>
    </producer>
  </producers>
  <playlist>
    <entry producer="producer0"/>
  </playlist>
</kdenliveproject>`;

      const parsed = adapter.parseKdenliveXml(xml);
      
      expect(parsed).toHaveProperty("kdenliveproject");
      expect(parsed.kdenliveproject).toHaveProperty("properties");
      expect(parsed.kdenliveproject.properties.documentname).toBe("Test Project");
      expect(parsed.kdenliveproject.properties.fps).toBe("25.0");
      expect(parsed.kdenliveproject).toHaveProperty("producers");
      expect(parsed.kdenliveproject.producers).toHaveLength(1);
      expect(parsed.kdenliveproject.producers[0].id).toBe("producer0");
      expect(parsed.kdenliveproject).toHaveProperty("playlist");
      expect(parsed.kdenliveproject.playlist).toHaveLength(1);
      expect(parsed.kdenliveproject.playlist[0].producer).toBe("producer0");
    });

    it("handles malformed XML", () => {
      const invalidXml = "This is not valid XML";
      
      expect(() => adapter.parseKdenliveXml(invalidXml)).toThrow();
    });

    it("preserves unknown elements", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE kdenlivedoc SYSTEM "kdenlive-0.9.dtd">
<kdenliveproject version="1.0">
  <properties>
    <documentname>Test Project</documentname>
  </properties>
  <unknownElement>
    <someData>value</someData>
  </unknownElement>
  <anotherUnknown>top-level unknown</anotherUnknown>
</kdenliveproject>`;

      const parsed = adapter.parseKdenliveXml(xml);
      
      expect(parsed).toHaveProperty("kdenliveproject");
      expect(parsed.kdenliveproject).toHaveProperty("unknownElement");
      expect(parsed.kdenliveproject.unknownElement).toHaveProperty("someData", "value");
      expect(parsed).toHaveProperty("anotherUnknown", "top-level unknown");
    });
  });

  describe("round-trip fidelity", () => {
    it("maintains fidelity through export/import cycle", () => {
      const originalState = {
        kdenliveproject: {
          properties: {
            documentname: "Round Trip Test",
            fps: "30.0",
          },
          producers: [
            {
              id: "producer1",
              properties: {
                length: "00:00:15.000",
                resource: "/path/to/test.mp4",
              },
            },
          ],
          playlist: [
            {
              producer: "producer1",
              entry: {
                in: "00:00:00.000",
                out: "00:00:10.000",
              },
            },
          ],
        },
      };

      // Export to XML
      const xml = adapter.exportToKdenliveXml(originalState);
      
      // Parse back to object
      const parsedState = adapter.parseKdenliveXml(xml);
      
      // The parsed state should match the original (ignoring minor formatting differences)
      expect(parsedState).toHaveProperty("kdenliveproject");
      expect(parsedState.kdenliveproject).toHaveProperty("properties");
      expect(parsedState.kdenliveproject.properties.documentname).toBe("Round Trip Test");
      expect(parsedState.kdenliveproject.properties.fps).toBe("30.0");
      expect(parsedState.kdenliveproject).toHaveProperty("producers");
      expect(parsedState.kdenliveproject.producers).toHaveLength(1);
      expect(parsedState.kdenliveproject.producers[0].id).toBe("producer1");
    });
  });
});