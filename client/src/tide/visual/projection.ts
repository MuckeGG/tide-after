import { WORLD } from '../config';

export interface WorldPoint {
  x: number;
  y: number;
  z?: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export const ISO_X = 0.7;
export const ISO_Y = 0.35;

export const projectWorldPoint = ({ x, y, z = 0 }: WorldPoint): ScreenPoint => {
  const dx = x - WORLD.centerX;
  const dy = y - WORLD.centerY;
  return {
    x: WORLD.centerX + (dx - dy) * ISO_X,
    y: WORLD.centerY + (dx + dy) * ISO_Y - z,
  };
};

export const unprojectScreenPoint = ({ x, y }: ScreenPoint): WorldPoint => {
  const screenX = (x - WORLD.centerX) / ISO_X;
  const screenY = (y - WORLD.centerY) / ISO_Y;
  return {
    x: WORLD.centerX + (screenX + screenY) / 2,
    y: WORLD.centerY + (screenY - screenX) / 2,
  };
};

export const projectWorldVector = (x: number, y: number): ScreenPoint => ({
  x: (x - y) * ISO_X,
  y: (x + y) * ISO_Y,
});

export const unprojectScreenVector = (x: number, y: number): ScreenPoint => ({
  x: (x / ISO_X + y / ISO_Y) / 2,
  y: (y / ISO_Y - x / ISO_X) / 2,
});

export const screenIntentToWorldDelta = (screenX: number, screenY: number) => {
  const length = Math.hypot(screenX, screenY);
  if (!length) return { x: 0, y: 0 };
  const world = unprojectScreenVector(screenX / length, screenY / length);
  const worldLength = Math.hypot(world.x, world.y) || 1;
  return { x: world.x / worldLength, y: world.y / worldLength };
};

export const projectedDistance = (a: ScreenPoint, b: ScreenPoint) => {
  const projectedA = projectWorldPoint(a);
  const projectedB = projectWorldPoint(b);
  return Math.hypot(projectedA.x - projectedB.x, projectedA.y - projectedB.y);
};

export const interpolatePosition = (
  current: number,
  target: number,
  deltaMs: number,
  responseMs = 42,
) => current + (target - current) * (1 - Math.exp(-Math.max(0, deltaMs) / responseMs));

export const raftBob = (now: number) => Math.sin(now / 760) * 2.4;

export const isScreenPointOnRaft = (point: ScreenPoint, size: number) => {
  const world = unprojectScreenPoint(point);
  const half = size * WORLD.tileSize / 2;
  return Math.abs(world.x - WORLD.centerX) <= half
    && Math.abs(world.y - WORLD.centerY) <= half;
};

export const clampFishingTarget = (player: WorldPoint, requested: WorldPoint) => {
  const projectedPlayer = projectWorldPoint(player);
  const projectedRequested = projectWorldPoint(requested);
  const dx = projectedRequested.x - projectedPlayer.x;
  const dy = projectedRequested.y - projectedPlayer.y;
  const distance = Math.hypot(dx, dy) || 1;
  const clamped = Math.min(190, Math.max(96, distance));
  return unprojectScreenPoint({
    x: projectedPlayer.x + dx / distance * clamped,
    y: projectedPlayer.y + dy / distance * clamped,
  });
};
