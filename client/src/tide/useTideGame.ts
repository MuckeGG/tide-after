import { useCallback, useEffect, useRef, useState } from 'react';
import {
  attackEnemy,
  buildModule,
  collectNearby,
  consumeResource,
  movePlayer,
  repairRaft,
  resolveOceanEvent,
  resolveFishing,
  restartGame,
  selectEquipment,
  setRoute,
  setTutorialMinimized,
  startFishing,
  tickGame,
  upgradePerk,
} from './game';
import { loadOrCreateGame, saveGame } from './persistence';
import { TideSpacetimeBridge, type CloudStatus } from './spacetimeBridge';
import { screenIntentToWorldDelta } from './visual/projection';
import type { MovementIntent } from './visual/types';
import { resolveMovementDirection, visualDirectionFromLegacy } from './visual/utilities';
import type {
  ConsumableId,
  EquipmentId,
  PerkId,
  RaftModuleId,
  RouteMode,
  TideGameState,
} from './types';

const MOVEMENT_KEYS: Record<string, [number, number]> = {
  w: [0, -1],
  arrowup: [0, -1],
  s: [0, 1],
  arrowdown: [0, 1],
  a: [-1, 0],
  arrowleft: [-1, 0],
  d: [1, 0],
  arrowright: [1, 0],
};

export const useTideGame = () => {
  const initialRef = useRef(loadOrCreateGame());
  const [state, setState] = useState<TideGameState>(initialRef.current.state);
  const [hadSave] = useState(initialRef.current.hadSave);
  const [lastSavedAt, setLastSavedAt] = useState(state.updatedAt);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>('local');
  const pressedKeys = useRef(new Set<string>());
  const continuousMove = useRef<[number, number] | null>(null);
  const movementLocked = useRef(false);
  const movementIntentRef = useRef<MovementIntent>({
    screenX: 0,
    screenY: 0,
    direction: visualDirectionFromLegacy(state.player.facing),
    active: false,
    changedAt: performance.now(),
  });
  const lastCommittedDirectionRef = useRef(movementIntentRef.current.direction);
  const stateRef = useRef(state);
  const bridgeRef = useRef<TideSpacetimeBridge | null>(null);

  const readScreenIntent = useCallback(() => {
    let screenX = 0;
    let screenY = 0;
    for (const key of pressedKeys.current) {
      const direction = MOVEMENT_KEYS[key];
      if (direction) {
        screenX += direction[0];
        screenY += direction[1];
      }
    }
    if (continuousMove.current) {
      screenX += continuousMove.current[0];
      screenY += continuousMove.current[1];
    }
    return { screenX, screenY };
  }, []);

  const refreshMovementIntent = useCallback(() => {
    const { screenX, screenY } = readScreenIntent();
    const active = !movementLocked.current && Boolean(screenX || screenY);
    const current = movementIntentRef.current;
    const direction = resolveMovementDirection(
      screenX,
      screenY,
      current.direction,
      lastCommittedDirectionRef.current,
    );
    if (
      current.screenX !== screenX
      || current.screenY !== screenY
      || current.active !== active
      || current.direction !== direction
    ) {
      movementIntentRef.current = {
        screenX,
        screenY,
        direction,
        active,
        changedAt: performance.now(),
      };
    }
    return movementIntentRef.current;
  }, [readScreenIntent]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const bridge = new TideSpacetimeBridge();
    bridgeRef.current = bridge;
    void bridge.connect({
      initialState: stateRef.current,
      onStatus: setCloudStatus,
      onRemoteState: (remoteState) => {
        setState((current) => remoteState.updatedAt > current.updatedAt ? remoteState : current);
      },
    });
    return () => bridge.disconnect();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setState((current) => {
        let next = tickGame(current, 0.1);
        const intent = refreshMovementIntent();
        if (intent.active) {
          lastCommittedDirectionRef.current = intent.direction;
          const world = screenIntentToWorldDelta(intent.screenX, intent.screenY);
          next = movePlayer(next, world.x, world.y, 0.1);
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(interval);
  }, [refreshMovementIntent]);

  useEffect(() => {
    const persistCurrentState = () => {
      const current = stateRef.current;
      saveGame(current);
      bridgeRef.current?.save(current);
      setLastSavedAt(Date.now());
    };
    const saveTimer = window.setInterval(persistCurrentState, 1_800);
    window.addEventListener('pagehide', persistCurrentState);
    return () => {
      window.clearInterval(saveTimer);
      window.removeEventListener('pagehide', persistCurrentState);
      persistCurrentState();
    };
  }, []);

  const collect = useCallback((id?: string) => {
    setState((current) => collectNearby(current, id));
  }, []);

  const fish = useCallback(() => {
    setState((current) =>
      current.fishing.active ? resolveFishing(current) : startFishing(current),
    );
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (MOVEMENT_KEYS[key]) {
        pressedKeys.current.add(key);
        refreshMovementIntent();
        event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      pressedKeys.current.delete(event.key.toLowerCase());
      refreshMovementIntent();
    };
    const clearKeys = () => {
      pressedKeys.current.clear();
      continuousMove.current = null;
      refreshMovementIntent();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearKeys);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
    };
  }, [refreshMovementIntent]);

  const move = useCallback((x: number, y: number) => {
    if (movementLocked.current) return;
    const world = screenIntentToWorldDelta(x, y);
    setState((current) => movePlayer(current, world.x, world.y, 0.13));
  }, []);

  const startMove = useCallback((x: number, y: number) => {
    if (movementLocked.current) return;
    continuousMove.current = [x, y];
    refreshMovementIntent();
  }, [refreshMovementIntent]);

  const stopMove = useCallback(() => {
    continuousMove.current = null;
    refreshMovementIntent();
  }, [refreshMovementIntent]);

  const setMovementLocked = useCallback((locked: boolean) => {
    movementLocked.current = locked;
    if (locked) continuousMove.current = null;
    refreshMovementIntent();
  }, [refreshMovementIntent]);

  const consume = useCallback((resource: ConsumableId) => {
    setState((current) => consumeResource(current, resource));
  }, []);

  const build = useCallback((moduleId: RaftModuleId) => {
    setState((current) => buildModule(current, moduleId).state);
  }, []);

  const restart = useCallback(() => {
    setState((current) => restartGame(current));
  }, []);

  const repair = useCallback(() => {
    setState((current) => repairRaft(current));
  }, []);

  const selectTool = useCallback((equipment: EquipmentId) => {
    setState((current) => selectEquipment(current, equipment));
  }, []);

  const attack = useCallback((enemyId?: string) => {
    setState((current) => attackEnemy(current, enemyId));
  }, []);

  const research = useCallback((perkId: PerkId) => {
    setState((current) => upgradePerk(current, perkId));
  }, []);

  const chooseRoute = useCallback((route: RouteMode) => {
    setState((current) => setRoute(current, route));
  }, []);

  const resolveEvent = useCallback((choiceId: string) => {
    setState((current) => resolveOceanEvent(current, choiceId));
  }, []);

  const minimizeTutorial = useCallback((minimized: boolean) => {
    setState((current) => setTutorialMinimized(current, minimized));
  }, []);

  const saveNow = useCallback(() => {
    saveGame(state);
    bridgeRef.current?.save(state);
    setLastSavedAt(Date.now());
  }, [state]);

  return {
    state,
    movementIntentRef,
    hadSave,
    lastSavedAt,
    cloudStatus,
    actions: {
      move,
      startMove,
      stopMove,
      setMovementLocked,
      collect,
      fish,
      consume,
      build,
      repair,
      selectEquipment: selectTool,
      attack,
      research,
      chooseRoute,
      resolveEvent,
      minimizeTutorial,
      restart,
      saveNow,
    },
  };
};
