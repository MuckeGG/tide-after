import type { PlayerAction, PlayerVisualState } from './types';
import type { VisualDirection } from './utilities';
import { clamp01 } from './utilities';

export interface ActionSpec {
  duration: number;
  commitAt: number | null;
  priority: number;
  locksMovement: boolean;
}

export const ACTION_SPECS: Record<PlayerAction, ActionSpec> = {
  idle: { duration: Number.POSITIVE_INFINITY, commitAt: null, priority: 0, locksMovement: false },
  walk: { duration: 180, commitAt: null, priority: 1, locksMovement: false },
  hookCast: { duration: 760, commitAt: 0.64, priority: 4, locksMovement: true },
  hookPull: { duration: 360, commitAt: null, priority: 4, locksMovement: true },
  fishCast: { duration: 720, commitAt: 0.72, priority: 4, locksMovement: false },
  fishWait: { duration: Number.POSITIVE_INFINITY, commitAt: null, priority: 4, locksMovement: false },
  fishReel: { duration: 680, commitAt: 0.58, priority: 5, locksMovement: true },
  build: { duration: 1_080, commitAt: 0.76, priority: 5, locksMovement: true },
  consume: { duration: 620, commitAt: 0.52, priority: 3, locksMovement: false },
  repair: { duration: 980, commitAt: 0.7, priority: 5, locksMovement: true },
  attack: { duration: 520, commitAt: 0.38, priority: 6, locksMovement: true },
  switch: { duration: 340, commitAt: null, priority: 2, locksMovement: false },
  hurt: { duration: 480, commitAt: null, priority: 10, locksMovement: true },
};

export const createIdleVisualState = (
  direction: VisualDirection = 'south',
  now = 0,
): PlayerVisualState => ({
  action: 'idle',
  direction,
  startedAt: now,
  duration: ACTION_SPECS.idle.duration,
});

export const createActionVisualState = (
  action: PlayerAction,
  direction: VisualDirection,
  now: number,
  options: Pick<PlayerVisualState, 'target' | 'commitToken'> = {},
): PlayerVisualState => ({
  action,
  direction,
  startedAt: now,
  duration: ACTION_SPECS[action].duration,
  ...options,
});

export const getActionProgress = (state: PlayerVisualState, now: number) => {
  if (!Number.isFinite(state.duration)) return 0;
  return clamp01((now - state.startedAt) / state.duration);
};

export const isActionFinished = (state: PlayerVisualState, now: number) =>
  Number.isFinite(state.duration) && now >= state.startedAt + state.duration;

export const canInterruptAction = (
  current: PlayerVisualState,
  next: PlayerAction,
  now: number,
) => isActionFinished(current, now)
  || next === 'hurt'
  || ACTION_SPECS[next].priority > ACTION_SPECS[current.action].priority;

export const isMovementLocked = (state: PlayerVisualState, now: number) =>
  !isActionFinished(state, now) && ACTION_SPECS[state.action].locksMovement;

export const getFishingTransition = (
  action: PlayerAction,
  fishingActive: boolean,
): 'fishCast' | 'fishReel' | null => {
  if (action === 'fishCast' || action === 'fishReel') return null;
  if (fishingActive || action === 'fishWait') return 'fishReel';
  return 'fishCast';
};

export class ActionCommitGate {
  private committed = new Set<string>();

  shouldCommit(state: PlayerVisualState, now: number) {
    const token = state.commitToken;
    const commitAt = ACTION_SPECS[state.action].commitAt;
    if (!token || commitAt === null || this.committed.has(token)) return false;
    if (getActionProgress(state, now) < commitAt) return false;
    this.committed.add(token);
    if (this.committed.size > 96) {
      const oldest = this.committed.values().next().value as string | undefined;
      if (oldest) this.committed.delete(oldest);
    }
    return true;
  }

  hasCommitted(token: string) {
    return this.committed.has(token);
  }
}
