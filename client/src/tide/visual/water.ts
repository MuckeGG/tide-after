import type { DebrisType, Weather } from '../types';

export interface WaterSample {
  height: number;
  slopeX: number;
  slopeY: number;
  foam: number;
}

export interface WaterContactProfile {
  submerge: number;
  bobStrength: number;
  rollStrength: number;
  wakeStrength: number;
  bubbleRate: number;
  displaySize: number;
  /** 水面遮挡掉的高度比例：水下部分只保留非常淡的轮廓。 */
  hiddenFraction: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const baseHeight = (
  x: number,
  y: number,
  timeSeconds: number,
  weather: Weather,
) => {
  const weatherScale = weather === 'storm' ? 1.75 : weather === 'cloudy' ? 1.22 : 1;
  const swell = Math.sin(x * 0.0105 + y * 0.0045 + timeSeconds * 0.82) * 1.65;
  const cross = Math.sin(x * -0.006 + y * 0.015 + timeSeconds * 1.18 + 1.7) * 1.05;
  const chop = Math.sin(x * 0.028 + y * -0.019 + timeSeconds * 1.72 + 4.1) * 0.48;
  return (swell + cross + chop) * weatherScale;
};

export const sampleWaterSurface = (
  x: number,
  y: number,
  now: number,
  weather: Weather,
): WaterSample => {
  const timeSeconds = now / 1000;
  const height = baseHeight(x, y, timeSeconds, weather);
  const slopeX = (baseHeight(x + 5, y, timeSeconds, weather) - height) / 5;
  const slopeY = (baseHeight(x, y + 5, timeSeconds, weather) - height) / 5;
  const foamThreshold = weather === 'storm' ? 1.1 : weather === 'cloudy' ? 1.75 : 2.35;
  return {
    height,
    slopeX,
    slopeY,
    foam: clamp01((height - foamThreshold) * 0.7 + Math.hypot(slopeX, slopeY) * 2.2),
  };
};

export const DEBRIS_WATER_PROFILES: Record<DebrisType, WaterContactProfile> = {
  wood: { submerge: 4, bobStrength: 0.75, rollStrength: 0.55, wakeStrength: 0.8, bubbleRate: 0.25, displaySize: 44, hiddenFraction: 0.35 },
  plastic: { submerge: 7, bobStrength: 1.15, rollStrength: 1.15, wakeStrength: 0.5, bubbleRate: 0.62, displaySize: 40, hiddenFraction: 0.45 },
  scrap: { submerge: 11, bobStrength: 0.42, rollStrength: 0.32, wakeStrength: 1.05, bubbleRate: 0.48, displaySize: 43, hiddenFraction: 0.55 },
  fiber: { submerge: 6, bobStrength: 0.92, rollStrength: 0.78, wakeStrength: 0.36, bubbleRate: 0.2, displaySize: 42, hiddenFraction: 0.45 },
  crate: { submerge: 8, bobStrength: 0.5, rollStrength: 0.28, wakeStrength: 1.25, bubbleRate: 0.36, displaySize: 52, hiddenFraction: 0.45 },
};
