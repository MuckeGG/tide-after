import { describe, expect, it } from 'vitest';
import { DEBRIS_WATER_PROFILES, sampleWaterSurface } from './water';

describe('shared water surface', () => {
  it('is deterministic and remains within the intended visual displacement', () => {
    const first = sampleWaterSurface(480, 270, 12_500, 'clear');
    const second = sampleWaterSurface(480, 270, 12_500, 'clear');
    expect(first).toEqual(second);
    expect(Math.abs(first.height)).toBeLessThan(4);
    expect(first.foam).toBeGreaterThanOrEqual(0);
    expect(first.foam).toBeLessThanOrEqual(1);
  });

  it('creates rougher storm water than clear water at the same point', () => {
    const clear = sampleWaterSurface(615, 398, 17_700, 'clear');
    const storm = sampleWaterSurface(615, 398, 17_700, 'storm');
    expect(Math.abs(storm.height)).toBeGreaterThan(Math.abs(clear.height));
    expect(Math.hypot(storm.slopeX, storm.slopeY)).toBeGreaterThan(
      Math.hypot(clear.slopeX, clear.slopeY),
    );
  });

  it('uses distinct buoyancy profiles for recognizable debris', () => {
    expect(DEBRIS_WATER_PROFILES.scrap.submerge).toBeGreaterThan(DEBRIS_WATER_PROFILES.wood.submerge);
    expect(DEBRIS_WATER_PROFILES.plastic.rollStrength).toBeGreaterThan(DEBRIS_WATER_PROFILES.crate.rollStrength);
    expect(DEBRIS_WATER_PROFILES.crate.displaySize).toBeGreaterThan(DEBRIS_WATER_PROFILES.fiber.displaySize);
  });
});
