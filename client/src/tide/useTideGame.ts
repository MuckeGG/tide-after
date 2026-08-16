import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildModule,
  collectNearby,
  consumeResource,
  movePlayer,
  repairRaft,
  resolveOceanEvent,
  resolveFishing,
  restartGame,
  setRoute,
  setTutorialMinimized,
  startFishing,
  tickGame,
  upgradePerk,
} from './game';
import { loadOrCreateGame, saveGame } from './persistence';
import { TideSpacetimeBridge, type CloudStatus } from './spacetimeBridge';
import type {
  ConsumableId,
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
  const stateRef = useRef(state);
  const bridgeRef = useRef<TideSpacetimeBridge | null>(null);

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
        let x = 0;
        let y = 0;
        if (!movementLocked.current) {
          for (const key of pressedKeys.current) {
            const direction = MOVEMENT_KEYS[key];
            if (direction) {
              x += direction[0];
              y += direction[1];
            }
          }
          if (continuousMove.current) {
            x += continuousMove.current[0];
            y += continuousMove.current[1];
          }
        }
        if (x || y) next = movePlayer(next, x, y, 0.1);
        return next;
      });
    }, 100);
    return () => window.clearInterval(interval);
  }, []);

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
        event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      pressedKeys.current.delete(event.key.toLowerCase());
    };
    const clearKeys = () => {
      pressedKeys.current.clear();
      continuousMove.current = null;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearKeys);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
    };
  }, []);

  const move = useCallback((x: number, y: number) => {
    if (movementLocked.current) return;
    setState((current) => movePlayer(current, x, y, 0.13));
  }, []);

  const startMove = useCallback((x: number, y: number) => {
    if (movementLocked.current) return;
    continuousMove.current = [x, y];
  }, []);

  const stopMove = useCallback(() => {
    continuousMove.current = null;
  }, []);

  const setMovementLocked = useCallback((locked: boolean) => {
    movementLocked.current = locked;
    if (locked) continuousMove.current = null;
  }, []);

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
      research,
      chooseRoute,
      resolveEvent,
      minimizeTutorial,
      restart,
      saveNow,
    },
  };
};
