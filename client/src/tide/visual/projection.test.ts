import { describe, expect, it } from 'vitest';
import {
  clampFishingTarget,
  interpolatePosition,
  projectWorldPoint,
  projectedDistance,
  screenIntentToWorldDelta,
  unprojectScreenPoint,
} from './projection';

describe('2:1 等距投影', () => {
  it('世界坐标和屏幕坐标可往返', () => {
    const world = { x: 527.5, y: 231.25 };
    const restored = unprojectScreenPoint(projectWorldPoint(world));
    expect(restored.x).toBeCloseTo(world.x, 6);
    expect(restored.y).toBeCloseTo(world.y, 6);
  });

  it('屏幕八向输入会转换成归一化世界向量', () => {
    const north = screenIntentToWorldDelta(0, -1);
    const east = screenIntentToWorldDelta(1, 0);
    expect(Math.hypot(north.x, north.y)).toBeCloseTo(1, 6);
    expect(north.x).toBeLessThan(0);
    expect(north.y).toBeLessThan(0);
    expect(east.x).toBeGreaterThan(0);
    expect(east.y).toBeLessThan(0);
  });

  it('鱼线目标会限制在 96–190 屏幕像素', () => {
    const player = { x: 480, y: 270 };
    const close = clampFishingTarget(player, { x: 482, y: 270 });
    const far = clampFishingTarget(player, { x: 900, y: 30 });
    expect(projectedDistance(player, close)).toBeCloseTo(96, 5);
    expect(projectedDistance(player, far)).toBeCloseTo(190, 5);
  });
});

describe('render interpolation', () => {
  it('approaches state points smoothly without overshooting', () => {
    const first = interpolatePosition(0, 100, 16);
    const second = interpolatePosition(first, 100, 16);
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);
    expect(second).toBeLessThan(100);
    expect(interpolatePosition(10, 20, 0)).toBe(10);
  });
});
