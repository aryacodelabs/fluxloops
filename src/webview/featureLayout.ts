export interface LayoutNode {
  id: string;
  kind: string;
}

export interface Point {
  x: number;
  y: number;
}

const COLUMN_GAP = 200;
const ROW_GAP = 72;

export function computeFeatureLayout(
  nodes: LayoutNode[],
  centerX: number,
  centerY: number,
): Map<string, Point> {
  const positions = new Map<string, Point>();
  const byKind = new Map<string, LayoutNode[]>();

  for (const node of nodes) {
    const list = byKind.get(node.kind) ?? [];
    list.push(node);
    byKind.set(node.kind, list);
  }

  for (const list of byKind.values()) {
    list.sort((a, b) => a.id.localeCompare(b.id));
  }

  const stateNodes = byKind.get('state') ?? [];
  const primaryState = stateNodes[0];
  if (primaryState) {
    positions.set(primaryState.id, { x: centerX, y: centerY });
    placeColumn(stateNodes.slice(1), centerX, centerY - 120, positions, true);
  }

  placeColumn(byKind.get('reducer') ?? [], centerX - COLUMN_GAP, centerY, positions, true);
  placeColumn(byKind.get('action') ?? [], centerX + COLUMN_GAP, centerY, positions, true);
  placeColumn(byKind.get('effect') ?? [], centerX, centerY + COLUMN_GAP, positions, false);
  placeColumn(byKind.get('component') ?? [], centerX, centerY - COLUMN_GAP, positions, false);

  for (const node of nodes) {
    if (!positions.has(node.id)) {
      positions.set(node.id, { x: centerX, y: centerY });
    }
  }

  return positions;
}

function placeColumn(
  nodes: LayoutNode[],
  anchorX: number,
  anchorY: number,
  positions: Map<string, Point>,
  vertical: boolean,
): void {
  if (nodes.length === 0) {
    return;
  }

  const span = (nodes.length - 1) * ROW_GAP;
  nodes.forEach((node, index) => {
    const offset = index * ROW_GAP - span / 2;
    positions.set(
      node.id,
      vertical ? { x: anchorX, y: anchorY + offset } : { x: anchorX + offset, y: anchorY },
    );
  });
}