import type { VisualDirection } from './utilities';

export type PlayerAction =
  | 'idle'
  | 'walk'
  | 'hookCast'
  | 'hookPull'
  | 'fishCast'
  | 'fishWait'
  | 'fishReel'
  | 'build'
  | 'consume'
  | 'repair'
  | 'attack'
  | 'switch'
  | 'hurt';

export interface PlayerVisualState {
  action: PlayerAction;
  direction: VisualDirection;
  startedAt: number;
  duration: number;
  target?: { x: number; y: number };
  commitToken?: string;
}

export interface MovementIntent {
  screenX: number;
  screenY: number;
  direction: VisualDirection;
  active: boolean;
  changedAt: number;
}

export type VisualEffectKind = 'splash' | 'woodchip' | 'spark' | 'bubble' | 'loot';

export interface VisualEffect {
  id: string;
  kind: VisualEffectKind;
  x: number;
  y: number;
  targetX?: number;
  targetY?: number;
  createdAt: number;
  duration: number;
  tone?: string;
}

export interface Particle {
  id: number;
  kind: Exclude<VisualEffectKind, 'loot'>;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  createdAt: number;
  duration: number;
  color: string;
  size: number;
}

export type TideAssetMode = 'original' | 'reference';

export interface LoadedTideAssets {
  mode: TideAssetMode;
  character: HTMLImageElement | null;
  woodTile: HTMLImageElement | null;
  platformEdge: HTMLImageElement | null;
  slotFrame: HTMLImageElement | null;
  combat: HTMLImageElement | null;
}
