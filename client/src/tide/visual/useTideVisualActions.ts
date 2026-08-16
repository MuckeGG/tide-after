import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConsumableId, RaftModuleId, TideGameState } from '../types';
import {
  ACTION_SPECS,
  ActionCommitGate,
  canInterruptAction,
  createActionVisualState,
  createIdleVisualState,
} from './animation';
import type { PlayerAction, PlayerVisualState, VisualEffect } from './types';
import { directionFromDelta } from './utilities';

interface GameActions {
  collect: (id?: string) => void;
  fish: () => void;
  consume: (resource: ConsumableId) => void;
  build: (moduleId: RaftModuleId) => void;
  repair: () => void;
  setMovementLocked: (locked: boolean) => void;
}

interface RunOptions {
  target?: { x: number; y: number };
  commit?: () => void;
  after?: PlayerAction;
}

const makeToken = (action: PlayerAction) =>
  action + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);

export const useTideVisualActions = (
  state: TideGameState,
  actions: GameActions,
) => {
  const [visual, setVisual] = useState<PlayerVisualState>(
    () => createIdleVisualState(state.player.facing, performance.now()),
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const visualRef = useRef(visual);
  const effectsRef = useRef<VisualEffect[]>([]);
  const stateRef = useRef(state);
  const actionsRef = useRef(actions);
  const gateRef = useRef(new ActionCommitGate());
  const timersRef = useRef<number[]>([]);
  const previousHealth = useRef(state.player.health);

  useEffect(() => {
    visualRef.current = visual;
  }, [visual]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);

  const pushEffect = useCallback((effect: Omit<VisualEffect, 'id' | 'createdAt'>) => {
    const now = performance.now();
    effectsRef.current = effectsRef.current
      .filter((item) => now - item.createdAt < item.duration)
      .concat({
        ...effect,
        id: 'fx-' + now.toString(36) + '-' + Math.random().toString(36).slice(2, 6),
        createdAt: now,
      })
      .slice(-48);
  }, []);

  const settleIdle = useCallback((direction = visualRef.current.direction) => {
    actionsRef.current.setMovementLocked(false);
    const idle = createIdleVisualState(direction, performance.now());
    visualRef.current = idle;
    setVisual(idle);
  }, []);

  const run = useCallback((
    action: PlayerAction,
    options: RunOptions = {},
  ) => {
    const now = performance.now();
    const current = visualRef.current;
    if (!canInterruptAction(current, action, now)) return false;

    clearTimers();
    const player = stateRef.current.player;
    const direction = options.target
      ? directionFromDelta(options.target.x - player.x, options.target.y - player.y, player.facing)
      : player.facing;
    const token = ACTION_SPECS[action].commitAt === null ? undefined : makeToken(action);
    const next = createActionVisualState(action, direction, now, {
      target: options.target,
      commitToken: token,
    });
    visualRef.current = next;
    setVisual(next);
    actionsRef.current.setMovementLocked(ACTION_SPECS[action].locksMovement);

    const commitAt = ACTION_SPECS[action].commitAt;
    if (commitAt !== null && options.commit) {
      const commitTimer = window.setTimeout(() => {
        if (gateRef.current.shouldCommit(next, performance.now())) {
          options.commit?.();
          if (action === 'hookCast' && options.target) {
            pushEffect({
              kind: 'loot',
              x: options.target.x,
              y: options.target.y,
              targetX: 480,
              targetY: 524,
              duration: 620,
              tone: '#f0cc62',
            });
          }
        }
      }, next.duration * commitAt + 8);
      timersRef.current.push(commitTimer);
    }

    const finishTimer = window.setTimeout(() => {
      if (options.after) {
        const chained = createActionVisualState(options.after, direction, performance.now(), {
          target: options.target,
        });
        visualRef.current = chained;
        setVisual(chained);
        actionsRef.current.setMovementLocked(ACTION_SPECS[options.after].locksMovement);
        const chainTimer = window.setTimeout(
          () => settleIdle(direction),
          ACTION_SPECS[options.after].duration,
        );
        timersRef.current.push(chainTimer);
      } else {
        settleIdle(direction);
      }
    }, next.duration);
    timersRef.current.push(finishTimer);
    return true;
  }, [clearTimers, pushEffect, settleIdle]);

  const invalid = useCallback((message: string) => {
    setFeedback(message);
    const timer = window.setTimeout(() => setFeedback(null), 1_250);
    timersRef.current.push(timer);
  }, []);

  const collect = useCallback((id?: string) => {
    const current = stateRef.current;
    const targetId = id ?? current.debris
      .map((item) => ({
        id: item.id,
        distance: Math.hypot(item.x - current.player.x, item.y - current.player.y),
      }))
      .sort((a, b) => a.distance - b.distance)[0]?.id;
    const target = current.debris.find((item) => item.id === targetId);
    if (!target) {
      invalid('附近没有可打捞物');
      return false;
    }
    const distance = Math.hypot(target.x - current.player.x, target.y - current.player.y);
    if (distance > 206) {
      invalid('目标超出钩索范围，先靠近一点');
      return false;
    }
    return run('hookCast', {
      target,
      commit: () => actionsRef.current.collect(target.id),
      after: 'hookPull',
    });
  }, [invalid, run]);

  const fish = useCallback(() => {
    const current = stateRef.current;
    const distance = 118;
    const offset = {
      up: [0, -distance],
      down: [0, distance],
      left: [-distance, 0],
      right: [distance, 0],
    }[current.player.facing];
    const target = { x: current.player.x + offset[0], y: current.player.y + offset[1] };
    const action: PlayerAction = current.fishing.active ? 'fishReel' : 'fishCast';
    return run(action, {
      target,
      commit: () => actionsRef.current.fish(),
    });
  }, [run]);

  const build = useCallback((moduleId: RaftModuleId) => {
    return run('build', {
      target: { x: 480, y: 260 },
      commit: () => actionsRef.current.build(moduleId),
    });
  }, [run]);

  const consume = useCallback((resource: ConsumableId) => (
    run('consume', { commit: () => actionsRef.current.consume(resource) })
  ), [run]);

  const repair = useCallback(() => (
    run('repair', {
      target: { x: stateRef.current.player.x + 42, y: stateRef.current.player.y + 28 },
      commit: () => actionsRef.current.repair(),
    })
  ), [run]);

  useEffect(() => {
    if (state.player.health < previousHealth.current) {
      run('hurt');
    }
    previousHealth.current = state.player.health;
  }, [run, state.player.health]);

  useEffect(() => () => {
    clearTimers();
    actionsRef.current.setMovementLocked(false);
  }, [clearTimers]);

  return {
    visual,
    visualRef,
    effectsRef,
    feedback,
    busy: visual.action !== 'idle' && visual.action !== 'walk',
    actions: { collect, fish, build, consume, repair },
  };
};
