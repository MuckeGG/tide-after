export type VisualDirection =
  | 'north'
  | 'northEast'
  | 'east'
  | 'southEast'
  | 'south'
  | 'southWest'
  | 'west'
  | 'northWest';

export type LegacyDirection = 'up' | 'down' | 'left' | 'right';

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export const visualDirectionFromLegacy = (direction: LegacyDirection): VisualDirection => ({
  up: 'north',
  down: 'south',
  left: 'west',
  right: 'east',
} as const)[direction];

export const directionFromDelta = (
  x: number,
  y: number,
  fallback: VisualDirection,
): VisualDirection => {
  if (Math.hypot(x, y) < 0.001) return fallback;
  const angle = Math.atan2(y, x);
  const octant = Math.round(angle / (Math.PI / 4));
  return ({
    [-4]: 'west',
    [-3]: 'northWest',
    [-2]: 'north',
    [-1]: 'northEast',
    0: 'east',
    1: 'southEast',
    2: 'south',
    3: 'southWest',
    4: 'west',
  } as Record<number, VisualDirection>)[octant] ?? fallback;
};

export const resolveMovementDirection = (
  screenX: number,
  screenY: number,
  current: VisualDirection,
  lastCommitted: VisualDirection,
) => (screenX || screenY
  ? directionFromDelta(screenX, screenY, current)
  : lastCommitted);

export const visualDirectionVector = (direction: VisualDirection) => ({
  north: { x: 0, y: -1 },
  northEast: { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  east: { x: 1, y: 0 },
  southEast: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  south: { x: 0, y: 1 },
  southWest: { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  west: { x: -1, y: 0 },
  northWest: { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
})[direction];
