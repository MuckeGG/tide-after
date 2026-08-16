import { describe, expect, it } from 'vitest';
import { directionFromDelta, resolveMovementDirection, visualDirectionFromLegacy } from './utilities';

describe('eight-way visual direction', () => {
  it.each([
    [0, -1, 'north'],
    [1, -1, 'northEast'],
    [1, 0, 'east'],
    [1, 1, 'southEast'],
    [0, 1, 'south'],
    [-1, 1, 'southWest'],
    [-1, 0, 'west'],
    [-1, -1, 'northWest'],
  ] as const)('maps screen delta %s,%s to %s', (x, y, direction) => {
    expect(directionFromDelta(x, y, 'south')).toBe(direction);
  });

  it('maps legacy four-way saves without changing persisted data', () => {
    expect(visualDirectionFromLegacy('up')).toBe('north');
    expect(visualDirectionFromLegacy('down')).toBe('south');
    expect(visualDirectionFromLegacy('left')).toBe('west');
    expect(visualDirectionFromLegacy('right')).toBe('east');
  });

  it('keeps the last committed chord direction when both keys are released', () => {
    expect(resolveMovementDirection(0, 0, 'east', 'northEast')).toBe('northEast');
    expect(resolveMovementDirection(1, 0, 'northEast', 'northEast')).toBe('east');
  });
});
