import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { COMBAT, WORLD } from '../config';
import type { ConsumableId, RaftModuleId, TideGameState } from '../types';
import {
  ACTION_SPECS,
  ActionCommitGate,
  canInterruptAction,
  createActionVisualState,
  createIdleVisualState,
  getFishingTransition,
} from './animation';
import { clampFishingTarget, projectWorldPoint, projectedDistance, unprojectScreenPoint } from './projection';
import type { MovementIntent, PlayerAction, PlayerVisualState, VisualEffect } from './types';
import {
  directionFromDelta,
  visualDirectionFromLegacy,
  visualDirectionVector,
} from './utilities';

interface GameActions {
  collect: (id?: string) => void;
  fish: () => void;
  consume: (resource: ConsumableId) => void;
  build: (moduleId: RaftModuleId) => void;
  repair: () => void;
  attack: (enemyId?: string) => void;
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
  movementIntentRef: MutableRefObject<MovementIntent>,
) => {
  const [visual, setVisual] = useState<PlayerVisualState>(
    () => createIdleVisualState(visualDirectionFromLegacy(state.player.facing), performance.now()),
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
    const projectedPlayer = projectWorldPoint(player);
    const projectedTarget = options.target ? projectWorldPoint(options.target) : null;
    const direction = projectedTarget
      ? directionFromDelta(
          projectedTarget.x - projectedPlayer.x,
          projectedTarget.y - projectedPlayer.y,
          movementIntentRef.current.direction,
        )
      : movementIntentRef.current.direction;
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
        if (Number.isFinite(ACTION_SPECS[options.after].duration)) {
          const chainTimer = window.setTimeout(
            () => settleIdle(direction),
            ACTION_SPECS[options.after].duration,
          );
          timersRef.current.push(chainTimer);
        }
      } else {
        settleIdle(direction);
      }
    }, next.duration);
    timersRef.current.push(finishTimer);
    return true;
  }, [clearTimers, movementIntentRef, pushEffect, settleIdle]);

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
        distance: projectedDistance(item, current.player),
      }))
      .sort((a, b) => a.distance - b.distance)[0]?.id;
    const target = current.debris.find((item) => item.id === targetId);
    if (!target) {
      invalid('附近没有可打捞物');
      return false;
    }
    const distance = projectedDistance(target, current.player);
    const range = WORLD.collectRange + current.progress.perks.hook * 28;
    if (distance > range) {
      invalid('目标超出钩索范围，先靠近一点');
      return false;
    }
    return run('hookCast', {
      target,
      commit: () => actionsRef.current.collect(target.id),
      after: 'hookPull',
    });
  }, [invalid, run]);

  const fish = useCallback((requestedTarget?: { x: number; y: number }) => {
    const current = stateRef.current;
    const transition = getFishingTransition(visualRef.current.action, current.fishing.active);
    if (!transition) return false;
    if (transition === 'fishReel') {
      return run('fishReel', {
        target: visualRef.current.target,
        commit: () => actionsRef.current.fish(),
      });
    }
    const playerScreen = projectWorldPoint(current.player);
    const vector = visualDirectionVector(movementIntentRef.current.direction);
    const fallback = unprojectScreenPoint({
      x: playerScreen.x + vector.x * 132,
      y: playerScreen.y + vector.y * 132,
    });
    const target = clampFishingTarget(current.player, requestedTarget ?? fallback);
    return run('fishCast', {
      target,
      commit: () => actionsRef.current.fish(),
      after: 'fishWait',
    });
  }, [movementIntentRef, run]);

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

  const attack = useCallback((enemyId?: string, requestedTarget?: { x: number; y: number }) => {
    const current = stateRef.current;
    const enemy = enemyId
      ? current.enemies.find((candidate) => candidate.id === enemyId)
      : current.enemies
          .filter((candidate) => candidate.phase === 'boarding' || candidate.phase === 'deck')
          .map((candidate) => ({
            enemy: candidate,
            distance: projectedDistance(candidate, current.player),
          }))
          .filter((candidate) => candidate.distance <= COMBAT.cutlassRange)
          .sort((a, b) => a.distance - b.distance)[0]?.enemy;
    const playerScreen = projectWorldPoint(current.player);
    const vector = visualDirectionVector(movementIntentRef.current.direction);
    const fallback = unprojectScreenPoint({
      x: playerScreen.x + vector.x * 84,
      y: playerScreen.y + vector.y * 84,
    });
    const target = enemy ?? requestedTarget ?? fallback;
    if (enemy && projectedDistance(enemy, current.player) > COMBAT.cutlassRange) {
      invalid('目标超出弯刀攻击范围');
      return false;
    }
    const lethal = Boolean(enemy && enemy.health <= COMBAT.cutlassDamage);
    return run('attack', {
      target,
      commit: enemy ? () => {
        actionsRef.current.attack(enemy.id);
        pushEffect({ kind: 'spark', x: enemy.x, y: enemy.y, duration: 420, tone: '#f2d777' });
        if (lethal) {
          pushEffect({
            kind: 'loot',
            x: enemy.x,
            y: enemy.y,
            targetX: 480,
            targetY: 524,
            duration: 720,
            tone: enemy.type === 'lanternBeast' ? '#62e5db' : '#dc8f58',
          });
        }
      } : undefined,
    });
  }, [invalid, movementIntentRef, pushEffect, run]);

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
    busy: visual.action !== 'idle' && visual.action !== 'walk' && visual.action !== 'fishWait',
    actions: { collect, fish, build, consume, repair, attack, invalid },
  };
};
