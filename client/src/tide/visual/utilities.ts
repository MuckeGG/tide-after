export type Direction = 'up' | 'down' | 'left' | 'right';

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export const directionFromDelta = (x: number, y: number, fallback: Direction): Direction => {
  if (Math.abs(x) > Math.abs(y)) return x < 0 ? 'left' : 'right';
  if (Math.abs(y) > 0) return y < 0 ? 'up' : 'down';
  return fallback;
};
