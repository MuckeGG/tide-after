import { describe, expect, it } from 'vitest';
import { PointerActionGate } from './inputGate';

describe('pointer action transactions', () => {
  it('accepts one primary left-button transaction until release', () => {
    const gate = new PointerActionGate();
    expect(gate.begin(7, 0, true, 12.34)).toBe('pointer-7-12.34');
    expect(gate.begin(7, 0, true, 13)).toBeNull();
    gate.end(7);
    expect(gate.begin(7, 0, true, 14)).toBe('pointer-7-14.00');
  });

  it('rejects secondary buttons and non-primary pointers', () => {
    const gate = new PointerActionGate();
    expect(gate.begin(1, 2, true, 1)).toBeNull();
    expect(gate.begin(2, 0, false, 1)).toBeNull();
  });
});
