export type ResourceId =
  | 'wood'
  | 'plastic'
  | 'scrap'
  | 'fiber'
  | 'fish'
  | 'meal'
  | 'water'
  | 'parts';

export type ConsumableId = 'fish' | 'meal' | 'water';
export type Weather = 'clear' | 'cloudy' | 'storm';
export type RouteMode = 'salvage' | 'fishing' | 'safe';
export type DebrisType = 'wood' | 'plastic' | 'scrap' | 'fiber' | 'crate';
export type EquipmentId = 'cutlass' | 'salvageTool' | 'fishingRod';
export type EnemyType = 'tideCrab' | 'lanternBeast';
export type EnemyPhase = 'swimming' | 'boarding' | 'deck';

export type RaftModuleId =
  | 'deck'
  | 'net'
  | 'purifier'
  | 'grill'
  | 'storage'
  | 'reinforcedDeck'
  | 'workshop'
  | 'sail'
  | 'garden'
  | 'radio'
  | 'beacon';

export type PerkId =
  | 'hook'
  | 'angler'
  | 'metabolism'
  | 'salvage'
  | 'automation'
  | 'hull';

export type NoticeTone = 'info' | 'good' | 'warning';
export type EventKind = 'supply' | 'storm' | 'castaway' | 'drone' | 'whale';
export type ContractObjective = 'collect' | 'fish' | 'build' | 'survive' | 'repair';

export interface Inventory {
  wood: number;
  plastic: number;
  scrap: number;
  fiber: number;
  fish: number;
  meal: number;
  water: number;
  parts: number;
}

export interface PlayerState {
  x: number;
  y: number;
  health: number;
  hunger: number;
  thirst: number;
  facing: 'up' | 'down' | 'left' | 'right';
}

export interface DebrisItem {
  id: string;
  type: DebrisType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl: number;
}

export interface EnemyState {
  id: string;
  type: EnemyType;
  phase: EnemyPhase;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  health: number;
  maxHealth: number;
  spawnedAt: number;
  phaseEndsAt: number;
  nextAttackAt: number;
}

export interface EquipmentState {
  selected: EquipmentId;
  nextAttackAt: number;
}

export interface FishingState {
  active: boolean;
  marker: number;
  direction: 1 | -1;
  targetStart: number;
  targetWidth: number;
}

export interface RaftState {
  size: 2 | 3 | 4;
  integrity: number;
  modules: Record<RaftModuleId, boolean>;
}

export interface WorldState {
  seed: number;
  elapsedSeconds: number;
  day: number;
  timeOfDay: number;
  weather: Weather;
  route: RouteMode;
  nextDebrisAt: number;
  nextNetAt: number;
  nextWaterAt: number;
  nextCookAt: number;
  nextGardenAt: number;
  nextStormHitAt: number;
  nextEventAt: number;
  nextEnemyAt: number;
}

export interface GameNotice {
  id: string;
  text: string;
  tone: NoticeTone;
}

export interface RunStats {
  collected: number;
  fishCaught: number;
  built: number;
  consumed: number;
  repaired: number;
  crates: number;
  events: number;
  stormHits: number;
  distanceMoved: number;
  survivedSeconds: number;
  enemiesDefeated: number;
}

export interface TutorialState {
  step: number;
  completed: boolean;
  minimized: boolean;
}

export interface DailyContract {
  id: string;
  day: number;
  title: string;
  description: string;
  objective: ContractObjective;
  baseline: number;
  target: number;
  reward: Partial<Record<ResourceId, number>>;
  xp: number;
  completed: boolean;
}

export interface OceanEvent {
  id: string;
  kind: EventKind;
  createdAt: number;
  expiresAt: number;
}

export interface ProgressState {
  level: number;
  xp: number;
  techPoints: number;
  signalFragments: number;
  combo: number;
  comboExpiresAt: number;
  score: number;
  perks: Record<PerkId, number>;
  achievements: string[];
  completedChapters: string[];
  endlessUnlocked: boolean;
  tutorial: TutorialState;
  contract: DailyContract;
  stats: RunStats;
}

export interface TideGameState {
  schemaVersion: 2;
  guestId: string;
  runId: string;
  createdAt: number;
  updatedAt: number;
  player: PlayerState;
  inventory: Inventory;
  equipment: EquipmentState;
  raft: RaftState;
  world: WorldState;
  progress: ProgressState;
  debris: DebrisItem[];
  enemies: EnemyState[];
  fishing: FishingState;
  event: OceanEvent | null;
  rngStep: number;
  notices: GameNotice[];
  gameOver: boolean;
}

export type BuildResult =
  | { ok: true; state: TideGameState }
  | { ok: false; reason: string; state: TideGameState };
