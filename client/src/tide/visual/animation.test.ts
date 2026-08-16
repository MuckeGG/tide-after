import { describe, expect, it, vi } from 'vitest';
import {
  ActionCommitGate,
  canInterruptAction,
  createActionVisualState,
  createIdleVisualState,
  getActionProgress,
  isMovementLocked,
} from './animation';
import { resolveAssetSelection } from './assets';

describe('瞬时动作控制', () => {
  it('同级连点不会中断当前动作，受伤可以立即中断', () => {
    const current = createActionVisualState('build', 'down', 100, { commitToken: 'build-1' });
    expect(canInterruptAction(current, 'build', 180)).toBe(false);
    expect(canInterruptAction(current, 'hookCast', 180)).toBe(false);
    expect(canInterruptAction(current, 'hurt', 180)).toBe(true);
  });

  it('关键帧只允许同一个 commitToken 提交一次', () => {
    const state = createActionVisualState('hookCast', 'right', 0, { commitToken: 'hook-1' });
    const gate = new ActionCommitGate();
    expect(gate.shouldCommit(state, 300)).toBe(false);
    expect(gate.shouldCommit(state, 600)).toBe(true);
    expect(gate.shouldCommit(state, 700)).toBe(false);
    expect(gate.hasCommitted('hook-1')).toBe(true);
  });

  it('动作进度、移动锁和结束后的中断规则正确', () => {
    const hook = createActionVisualState('hookCast', 'left', 1_000);
    expect(getActionProgress(hook, 1_380)).toBeCloseTo(0.5, 2);
    expect(isMovementLocked(hook, 1_200)).toBe(true);
    expect(isMovementLocked(hook, 2_000)).toBe(false);
    expect(canInterruptAction(hook, 'consume', 2_000)).toBe(true);
  });

  it('待机不会锁移动', () => {
    const idle = createIdleVisualState('up', 0);
    expect(isMovementLocked(idle, 5_000)).toBe(false);
  });

  it('参考素材缺失时回退原创模式', () => {
    expect(resolveAssetSelection('reference', false)).toBe('original');
    expect(resolveAssetSelection('reference', true)).toBe('reference');
    expect(resolveAssetSelection('original', true)).toBe('original');
    vi.restoreAllMocks();
  });
});
