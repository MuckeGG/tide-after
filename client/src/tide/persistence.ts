import { assignDefaultPlacements, createGuestId, createInitialGame } from './game';
import type {
  DebrisItem,
  FishingState,
  GameNotice,
  Inventory,
  PlayerState,
  RaftModuleId,
  TideGameState,
  WorldState,
} from './types';

const SAVE_KEY = 'tide-after.save.v2';
const LEGACY_SAVE_KEY = 'tide-after.save.v1';
const GUEST_KEY = 'tide-after.guest.v1';

interface LegacySave {
  schemaVersion?: number;
  guestId?: string;
  runId?: string;
  createdAt?: number;
  updatedAt?: number;
  player?: Partial<PlayerState>;
  inventory?: Partial<Inventory>;
  raft?: {
    size?: number;
    integrity?: number;
    modules?: Partial<Record<RaftModuleId, boolean>>;
  };
  world?: Partial<WorldState>;
  debris?: DebrisItem[];
  fishing?: Partial<FishingState>;
  rngStep?: number;
  notices?: GameNotice[];
  gameOver?: boolean;
}

const storageAvailable = () => typeof window !== 'undefined' && Boolean(window.localStorage);

export const getOrCreateGuestId = () => {
  if (!storageAvailable()) return createGuestId();
  const existing = window.localStorage.getItem(GUEST_KEY);
  if (existing) return existing;
  const guestId = createGuestId();
  window.localStorage.setItem(GUEST_KEY, guestId);
  return guestId;
};

const isValidSave = (value: unknown): value is TideGameState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TideGameState>;
  return candidate.schemaVersion === 2 &&
    typeof candidate.guestId === 'string' &&
    typeof candidate.runId === 'string' &&
    typeof candidate.player?.health === 'number' &&
    typeof candidate.inventory?.wood === 'number' &&
    typeof candidate.progress?.level === 'number' &&
    Array.isArray(candidate.debris);
};

const normalizeV2Save = (value: TideGameState): TideGameState => {
  const fresh = createInitialGame(value.guestId, value.world.seed);
  const normalized: TideGameState = {
    ...value,
    equipment: value.equipment ?? fresh.equipment,
    raft: { ...value.raft, placements: value.raft.placements ?? {} },
    world: {
      ...value.world,
      nextEnemyAt: value.world.nextEnemyAt ?? value.world.elapsedSeconds + 5,
    },
    progress: {
      ...value.progress,
      stats: {
        ...value.progress.stats,
        enemiesDefeated: value.progress.stats.enemiesDefeated ?? 0,
      },
    },
    enemies: Array.isArray(value.enemies) ? value.enemies : [],
    // 随机海上事件已关闭：加载时直接清除未处理事件，不扣资源、不记失败。
    event: null,
  };
  assignDefaultPlacements(normalized);
  return normalized;
};

export const migrateSave = (value: unknown, fallbackGuestId: string): TideGameState | null => {
  if (!value || typeof value !== 'object') return null;
  if (isValidSave(value)) return normalizeV2Save(value);

  const legacy = value as LegacySave;
  if (legacy.schemaVersion !== 1 || !legacy.player || !legacy.inventory || !legacy.raft || !legacy.world) {
    return null;
  }

  const guestId = legacy.guestId ?? fallbackGuestId;
  const migrated = createInitialGame(guestId, legacy.world.seed);
  migrated.runId = legacy.runId ?? migrated.runId;
  migrated.createdAt = legacy.createdAt ?? migrated.createdAt;
  migrated.updatedAt = Date.now();
  migrated.player = { ...migrated.player, ...legacy.player };
  migrated.inventory = { ...migrated.inventory, ...legacy.inventory };
  migrated.raft = {
    ...migrated.raft,
    integrity: legacy.raft.integrity ?? 100,
    size: legacy.raft.size === 3 ? 3 : legacy.raft.size === 4 ? 4 : 2,
    modules: { ...migrated.raft.modules, ...legacy.raft.modules },
  };
  assignDefaultPlacements(migrated);
  migrated.world = { ...migrated.world, ...legacy.world };
  migrated.debris = Array.isArray(legacy.debris) ? legacy.debris : migrated.debris;
  migrated.fishing = { ...migrated.fishing, ...legacy.fishing };
  migrated.rngStep = legacy.rngStep ?? migrated.rngStep;
  migrated.notices = Array.isArray(legacy.notices) ? legacy.notices : migrated.notices;
  migrated.gameOver = legacy.gameOver ?? false;
  return migrated;
};

const readSave = (key: string, fallbackGuestId: string) => {
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    return migrateSave(JSON.parse(raw) as unknown, fallbackGuestId);
  } catch {
    return null;
  }
};

export const loadGame = (fallbackGuestId = getOrCreateGuestId()): TideGameState | null => {
  if (!storageAvailable()) return null;
  const current = readSave(SAVE_KEY, fallbackGuestId);
  if (current) return current;

  const migrated = readSave(LEGACY_SAVE_KEY, fallbackGuestId);
  if (migrated) window.localStorage.setItem(SAVE_KEY, JSON.stringify(migrated));
  return migrated;
};

export const saveGame = (state: TideGameState) => {
  if (!storageAvailable()) return;
  window.localStorage.setItem(SAVE_KEY, JSON.stringify(state));
};

export const loadOrCreateGame = () => {
  const guestId = getOrCreateGuestId();
  const saved = loadGame(guestId);
  if (saved) return { state: { ...saved, guestId }, hadSave: true };
  return { state: createInitialGame(guestId), hadSave: false };
};

export const cloudSaveConfigured = () =>
  Boolean(import.meta.env.VITE_SPACETIME_HOST && import.meta.env.VITE_SPACETIME_MODULE);
