/**
 * Tactical board geometry (domain layer — pure, no IO).
 *
 * RENDERER-OWNED geometry, not world facts: the board box, the margin
 * and the derived-layout placement rule are constants and
 * deterministic functions of an entity's index in
 * `snapshot.entities` — never a claim about real-world positions (the
 * frozen v1 record carries no pitch geometry; `coordinateSystem:
 * "derived-layout"` labels every board record as derived).
 */

/** Board box width in renderer units (renderer-owned constant). */
export const TACTICAL_BOARD_WIDTH = 1000;

/** Board box height in renderer units (renderer-owned constant). */
export const TACTICAL_BOARD_HEIGHT = 640;

/** Layout margin on every side of the board box. */
export const TACTICAL_BOARD_MARGIN = 40;

/** A derived layout position on the board (renderer units). */
export interface BoardPosition {
  readonly x: number;
  readonly y: number;
}

/** Near-square grid column count for a total entity count. */
export function boardColumns(total: number): number {
  if (total <= 0) return 0;
  return Math.ceil(Math.sqrt(total));
}

/**
 * Deterministic derived-layout position of the entity at `index`
 * among `total` entities: near-square grid (columns = ceil(sqrt n)),
 * row-major, interpolated inside the margin box; a sole entity is
 * centered. The same (index, total) always yields the same position.
 */
export function derivedBoardPosition(index: number, total: number): BoardPosition {
  if (total <= 0 || index < 0 || index >= total) {
    throw new RangeError(`derivedBoardPosition: index ${index} out of 0..${total - 1}`);
  }
  const columns = boardColumns(total);
  const rows = Math.ceil(total / columns);
  const column = index % columns;
  const row = Math.floor(index / columns);
  const usableWidth = TACTICAL_BOARD_WIDTH - 2 * TACTICAL_BOARD_MARGIN;
  const usableHeight = TACTICAL_BOARD_HEIGHT - 2 * TACTICAL_BOARD_MARGIN;
  const x =
    columns === 1
      ? TACTICAL_BOARD_WIDTH / 2
      : TACTICAL_BOARD_MARGIN + (column * usableWidth) / (columns - 1);
  const y =
    rows === 1
      ? TACTICAL_BOARD_HEIGHT / 2
      : TACTICAL_BOARD_MARGIN + (row * usableHeight) / (rows - 1);
  return { x, y };
}
