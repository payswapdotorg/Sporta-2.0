import type { TacticalRenderModel } from "../domain/tactical.js";
import { TACTICAL_BOARD_MARGIN } from "../domain/board.js";
/**
 * The tactical SVG document serializer (adapters layer — external
 * document format boundary; the kdenliveXml.ts precedent).
 *
 * Deterministic SVG 1.1 output through HAND-WRITTEN string building
 * only: no DOM, no XML library, no IO, no external state (runs in
 * plain node — proven by the node:test battery). The serializer
 * consumes the RENDER MODEL only, never the SWM record (the renderer
 * adapter boundary invariant — a test machine-checks this file for
 * contract imports and SWM record tokens).
 *
 * Honesty: the reality is the RENDER MODEL + this serializer — a
 * data-class SVG document, NOT pixels (no rasterization or
 * browser-execution claim). Every marker and label comes from the
 * model; all interpolated text is XML-escaped. The canvas appends a
 * renderer-owned timeline strip (120 units) below the board box —
 * scaffolding geometry, not a world fact.
 */

/** Height of the renderer-owned timeline strip below the board box. */
export const TACTICAL_TIMELINE_STRIP_HEIGHT = 120;

const SVG_NS = "http://www.w3.org/2000/svg";

/** XML-escape every interpolated text value (`& < > " '`). */
function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** One deterministic number-formatting rule: 2-decimal rounding. */
function fmt(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * Serializes a tactical render model into a deterministic SVG 1.1
 * document string. Identical models ⇒ byte-identical documents.
 */
export function serializeTacticalSvg(model: TacticalRenderModel): string {
  const { board, timeline, source, provenance, rightsScope } = model;
  const canvasHeight = board.height + TACTICAL_TIMELINE_STRIP_HEIGHT;
  const usableWidth = board.width - 2 * TACTICAL_BOARD_MARGIN;
  const timelineBaseline = board.height + TACTICAL_TIMELINE_STRIP_HEIGHT / 2;
  const lines: string[] = [];

  lines.push(
    `<svg xmlns="${SVG_NS}" viewBox="0 0 ${String(board.width)} ${String(canvasHeight)}" width="${String(board.width)}" height="${String(canvasHeight)}">`,
  );
  lines.push(
    `  <title>Tactical board — SWM ${escapeXml(source.swmId)} (${escapeXml(source.domain)}) @ ${escapeXml(source.snapshotHash)}</title>`,
  );
  lines.push(
    `  <desc>source ${escapeXml(provenance.sourceKind)}/${escapeXml(provenance.sourceRef)} captured ${escapeXml(provenance.capturedAt)}; rights usages [${escapeXml(rightsScope.usages.join(", "))}] prohibitions [${escapeXml(rightsScope.prohibitions.join(", "))}] holders [${escapeXml(rightsScope.holders.join(", "))}]; coordinate system ${escapeXml(board.coordinateSystem)}</desc>`,
  );

  // Board frame + renderer-owned scaffolding lines (geometry only).
  lines.push(
    `  <rect x="0" y="0" width="${String(board.width)}" height="${String(board.height)}" fill="none" stroke="#333333" stroke-width="2" />`,
  );
  const midX = board.width / 2;
  const midY = board.height / 2;
  lines.push(
    `  <line x1="${fmt(midX)}" y1="0" x2="${fmt(midX)}" y2="${String(board.height)}" stroke="#cccccc" stroke-width="1" />`,
  );
  lines.push(
    `  <line x1="0" y1="${fmt(midY)}" x2="${String(board.width)}" y2="${fmt(midY)}" stroke="#cccccc" stroke-width="1" />`,
  );

  // Entity markers: one circle + label per board entity record.
  for (const entity of board.entities) {
    lines.push(`  <circle cx="${fmt(entity.x)}" cy="${fmt(entity.y)}" r="6" fill="#333333" />`);
    lines.push(
      `  <text x="${fmt(entity.x)}" y="${fmt(entity.y - 10)}" font-size="12" text-anchor="middle">${escapeXml(entity.entityId)}</text>`,
    );
    if (entity.confidence !== undefined) {
      lines.push(
        `  <text x="${fmt(entity.x)}" y="${fmt(entity.y + 18)}" font-size="10" text-anchor="middle">conf ${escapeXml(String(entity.confidence))}</text>`,
      );
    }
  }

  // Timeline strip: baseline, anchor label, one tick per event record.
  lines.push(
    `  <line x1="${String(TACTICAL_BOARD_MARGIN)}" y1="${fmt(timelineBaseline)}" x2="${String(board.width - TACTICAL_BOARD_MARGIN)}" y2="${fmt(timelineBaseline)}" stroke="#333333" stroke-width="1" />`,
  );
  lines.push(
    `  <text x="${String(TACTICAL_BOARD_MARGIN)}" y="${fmt(timelineBaseline - 28)}" font-size="11">anchor ${escapeXml(timeline.anchor)} (snapshot provenance)</text>`,
  );
  const total = timeline.events.length;
  for (const event of timeline.events) {
    const x =
      total === 1
        ? board.width / 2
        : TACTICAL_BOARD_MARGIN + (event.sequence * usableWidth) / (total - 1);
    lines.push(`  <circle cx="${fmt(x)}" cy="${fmt(timelineBaseline)}" r="4" fill="#333333" />`);
    lines.push(
      `  <text x="${fmt(x)}" y="${fmt(timelineBaseline - 12)}" font-size="11" text-anchor="middle">#${String(event.sequence + 1)}</text>`,
    );
    lines.push(
      `  <text x="${fmt(x)}" y="${fmt(timelineBaseline + 16)}" font-size="11" text-anchor="middle">${escapeXml(event.eventId)}</text>`,
    );
    if (event.confidence !== undefined) {
      lines.push(
        `  <text x="${fmt(x)}" y="${fmt(timelineBaseline + 32)}" font-size="10" text-anchor="middle">conf ${escapeXml(String(event.confidence))}</text>`,
      );
    }
  }

  lines.push("</svg>");
  return `${lines.join("\n")}\n`;
}
