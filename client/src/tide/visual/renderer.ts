import { COMBAT, PLACEMENT, WORLD } from '../config';
import {
  getFacilityWorldPoint,
  getNearestCollectableId,
  getNetCollectOrigin,
  getPlacementWorldPoint,
  isEdgePlacement,
  validatePlacement,
} from '../game';
import type {
  DebrisItem,
  EnemyState,
  EquipmentId,
  ModulePlacement,
  PlaceableModuleId,
  PlacementIntent,
  RaftModuleId,
  TideGameState,
} from '../types';
import { getActionProgress } from './animation';
import {
  interpolatePosition,
  projectWorldPoint,
  projectWorldVector,
  projectedDistance,
} from './projection';
import type {
  LoadedTideAssets,
  MovementIntent,
  Particle,
  PlayerVisualState,
  VisualEffect,
} from './types';
import { clamp01, type VisualDirection, visualDirectionVector } from './utilities';
import { DEBRIS_WATER_PROFILES, sampleWaterSurface } from './water';

interface SceneEntity {
  id: string;
  depth: number;
  draw: () => void;
}

export interface TideRendererMemory {
  lastPlayerX: number;
  lastPlayerY: number;
  lastMovedAt: number;
  renderedPlayerX: number;
  renderedPlayerY: number;
  lastFrameAt: number;
  particles: Particle[];
  emitted: Set<string>;
  nextParticleId: number;
}

export const createTideRendererMemory = (state: TideGameState): TideRendererMemory => ({
  lastPlayerX: state.player.x,
  lastPlayerY: state.player.y,
  lastMovedAt: 0,
  renderedPlayerX: state.player.x,
  renderedPlayerY: state.player.y,
  lastFrameAt: 0,
  particles: [],
  emitted: new Set(),
  nextParticleId: 1,
});

const roundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
};

const drawOcean = (
  context: CanvasRenderingContext2D,
  state: TideGameState,
  now: number,
) => {
  const seconds = now / 1000;
  const storm = state.world.weather === 'storm';
  const cloudy = state.world.weather === 'cloudy';
  const night = state.world.timeOfDay >= COMBAT.nightStart || state.world.timeOfDay < COMBAT.dawnEnd;
  const gradient = context.createLinearGradient(0, 0, WORLD.width, WORLD.height);
  gradient.addColorStop(0, storm ? '#102d3b' : night ? '#052f43' : cloudy ? '#0a5366' : '#08798c');
  gradient.addColorStop(0.46, storm ? '#18434e' : night ? '#075069' : cloudy ? '#0c7180' : '#0b99a0');
  gradient.addColorStop(1, storm ? '#0b2735' : night ? '#031f35' : '#086477');
  context.fillStyle = gradient;
  context.fillRect(0, 0, WORLD.width, WORLD.height);

  context.save();
  context.globalCompositeOperation = 'screen';
  for (let index = 0; index < 14; index += 1) {
    const drift = seconds * (7 + index % 3 * 4);
    const x = ((index * 173 + drift) % (WORLD.width + 260)) - 130;
    const y = 35 + ((index * 97 + Math.sin(seconds * 0.28 + index) * 44) % (WORLD.height - 40));
    const sample = sampleWaterSurface(x, y, now, state.world.weather);
    const width = 95 + (index * 37) % 170;
    const patch = context.createRadialGradient(x, y, 4, x, y, width);
    patch.addColorStop(0, `rgba(88, 224, 216, ${0.035 + sample.foam * 0.035})`);
    patch.addColorStop(1, 'rgba(17, 92, 111, 0)');
    context.fillStyle = patch;
    context.beginPath();
    context.ellipse(x, y, width, 18 + index % 4 * 7, -0.15 + index % 3 * 0.12, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();

  // 海面主线减少到 2–3 层，去掉杂乱青色细线，改用白色浪花承担可读性。
  const waveCount = storm ? 30 : cloudy ? 22 : 16;
  for (let index = 0; index < waveCount; index += 1) {
    const lane = (index * 83 + state.world.seed * 0.013) % (WORLD.height + 100) - 50;
    const speed = (index % 2 ? 18 : -12) * (storm ? 1.55 : 1);
    const x = ((index * 149 + seconds * speed) % (WORLD.width + 260) + WORLD.width + 260) % (WORLD.width + 260) - 130;
    const y = lane + Math.sin(seconds * (0.42 + index % 5 * 0.07) + index * 1.73) * (9 + index % 4 * 4);
    const length = 32 + (index * 29) % 92;
    context.strokeStyle = `rgba(198, 238, 234, ${storm ? 0.16 : 0.1})`;
    context.lineWidth = 1.6;
    context.beginPath();
    context.moveTo(x, y + 3);
    context.quadraticCurveTo(x + length * 0.5, y - 5, x + length, y + 2);
    context.stroke();
  }

  // 白色破浪：浪尖形成 → 横向展开 → 破碎成数段白沫 → 逐渐消失。
  const breakerCount = storm ? 16 : cloudy ? 11 : 7;
  const breakerWidth = storm ? 150 : cloudy ? 110 : 86;
  for (let index = 0; index < breakerCount; index += 1) {
    const cycle = storm ? 3.4 : cloudy ? 4.4 : 5.4;
    const phase = ((seconds / cycle) + index * 0.618) % 1;
    const lane = (index * 131 + state.world.seed * 0.017) % (WORLD.height - 60) + 30;
    const x = ((index * 211 - seconds * (storm ? 26 : 14)) % (WORLD.width + 200) + WORLD.width + 200) % (WORLD.width + 200) - 100;
    const y = lane + Math.sin(seconds * 0.5 + index) * 8;
    let spread: number;
    let alpha: number;
    if (phase < 0.22) {
      spread = 0.18 + (phase / 0.22) * 0.3;
      alpha = 0.5 + (phase / 0.22) * 0.4;
    } else if (phase < 0.58) {
      spread = 0.48 + ((phase - 0.22) / 0.36) * 0.52;
      alpha = 0.9;
    } else if (phase < 0.84) {
      spread = 1;
      alpha = 0.9 - ((phase - 0.58) / 0.26) * 0.45;
    } else {
      spread = 1;
      alpha = 0.45 * (1 - (phase - 0.84) / 0.16);
    }
    const half = breakerWidth * spread / 2;
    context.strokeStyle = `rgba(240, 252, 250, ${alpha.toFixed(3)})`;
    context.lineWidth = phase < 0.22 ? 3 : phase < 0.58 ? 2.6 : 2.2;
    context.beginPath();
    if (phase < 0.58) {
      context.moveTo(x - half, y + 4);
      context.quadraticCurveTo(x, y - 6 - (1 - spread) * 6, x + half, y + 4);
      context.stroke();
    } else {
      // 破碎阶段：拆成数段独立白沫。
      const segments = 4;
      for (let segment = 0; segment < segments; segment += 1) {
        const segX = x - half + (segment + 0.5) * (breakerWidth * spread / segments);
        const segLen = half / segments * 0.72;
        const wob = Math.sin(seconds * 3 + segment * 1.9 + index) * 3;
        context.moveTo(segX - segLen, y + 3 + wob * 0.4);
        context.quadraticCurveTo(segX, y - 3 + wob, segX + segLen, y + 3 - wob * 0.3);
      }
      context.stroke();
    }
  }

  if (night) {
    context.fillStyle = 'rgba(82, 230, 218, 0.28)';
    for (let index = 0; index < 18; index += 1) {
      const pulse = 0.35 + Math.sin(seconds * 1.3 + index * 2.1) * 0.35;
      if (pulse < 0.22) continue;
      const x = (index * 211 + state.world.seed) % WORLD.width;
      const y = (index * 113 + state.world.seed * 0.2) % WORLD.height;
      context.globalAlpha = pulse;
      context.fillRect(x, y, 2 + index % 3, 1);
    }
    context.globalAlpha = 1;
  }

  if (storm) {
    context.strokeStyle = 'rgba(218, 242, 242, 0.25)';
    context.lineWidth = 2;
    for (let index = 0; index < 46; index += 1) {
      const x = (index * 71 + seconds * 148) % (WORLD.width + 130) - 70;
      const y = (index * 39 + seconds * 260) % (WORLD.height + 130) - 70;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x - 15, y + 32);
      context.stroke();
    }
  }
};

const drawDebris = (
  context: CanvasRenderingContext2D,
  item: DebrisItem,
  state: TideGameState,
  assets: LoadedTideAssets,
  now: number,
  highlighted: boolean,
  netOrigin: { x: number; y: number } | null,
) => {
  const seconds = now / 1000;
  const projected = projectWorldPoint(item);
  const velocity = projectWorldVector(item.vx, item.vy);
  const speed = Math.hypot(velocity.x, velocity.y) || 1;
  const profile = DEBRIS_WATER_PROFILES[item.type];
  const water = sampleWaterSurface(item.x, item.y, now, state.world.weather);
  const bob = water.height * profile.bobStrength - profile.submerge * 0.4;
  const angle = water.slopeX * profile.rollStrength
    + Math.sin(seconds * 0.75 + item.y * 0.019) * 0.045 * profile.rollStrength;
  const withinNet = netOrigin !== null
    && projectedDistance(item, netOrigin) <= PLACEMENT.netCollectRadius;
  context.save();
  context.translate(Math.round(projected.x), Math.round(projected.y + bob));
  context.strokeStyle = `rgba(190, 239, 231, ${0.13 + profile.wakeStrength * 0.13})`;
  context.lineWidth = 1.4 + profile.wakeStrength;
  context.beginPath();
  context.moveTo(-velocity.x / speed * 8, -velocity.y / speed * 8 + profile.submerge);
  context.quadraticCurveTo(
    -velocity.x / speed * 22 - velocity.y / speed * 5,
    -velocity.y / speed * 22 + profile.submerge + 4,
    -velocity.x / speed * (28 + profile.wakeStrength * 8),
    -velocity.y / speed * (28 + profile.wakeStrength * 8) + profile.submerge + 2,
  );
  context.stroke();
  context.rotate(angle);
  if (highlighted) {
    context.strokeStyle = 'rgba(248, 218, 112, 0.78)';
    context.lineWidth = 2;
    context.setLineDash([5, 4]);
    context.beginPath();
    context.ellipse(0, 0, 24, 19, 0, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);
  }
  if (withinNet) {
    context.strokeStyle = 'rgba(126, 200, 236, 0.7)';
    context.lineWidth = 1.6;
    context.beginPath();
    context.ellipse(0, 0, 21, 16, 0, 0, Math.PI * 2);
    context.stroke();
  }

  const drawDebrisSprite = () => {
    if (assets.combat) {
      const columns: Record<DebrisItem['type'], number> = {
        wood: 0,
        plastic: 1,
        scrap: 2,
        fiber: 3,
        crate: 4,
      };
      const size = profile.displaySize;
      context.drawImage(
        assets.combat,
        columns[item.type] * 128,
        128,
        128,
        128,
        -size / 2,
        -size * 0.72,
        size,
        size,
      );
    } else if (item.type === 'wood') {
      context.fillStyle = '#573827';
      roundedRect(context, -19, -7, 38, 14, 5);
      context.fill();
      context.fillStyle = '#a76c3f';
      roundedRect(context, -17, -8, 34, 12, 4);
      context.fill();
      context.strokeStyle = '#d09a59';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(-13, -3);
      context.lineTo(11, -3);
      context.stroke();
      context.fillStyle = '#332c28';
      context.fillRect(-5, -8, 3, 12);
    } else if (item.type === 'plastic') {
      context.fillStyle = '#7cc5c7';
      roundedRect(context, -8, -13, 16, 25, 5);
      context.fill();
      context.fillStyle = '#d3f1e9';
      roundedRect(context, -5, -10, 8, 14, 3);
      context.fill();
      context.fillStyle = '#326b78';
      context.fillRect(-5, -16, 10, 5);
    } else if (item.type === 'fiber') {
      context.strokeStyle = '#ccb477';
      context.lineWidth = 4;
      for (let index = -9; index <= 9; index += 6) {
        context.beginPath();
        context.moveTo(index, -11);
        context.quadraticCurveTo(index + 10, 0, index + 5, 11);
        context.stroke();
      }
    } else if (item.type === 'crate') {
      context.fillStyle = '#4b2c20';
      roundedRect(context, -18, -16, 36, 32, 4);
      context.fill();
      context.fillStyle = '#a76636';
      roundedRect(context, -15, -14, 30, 27, 3);
      context.fill();
      context.strokeStyle = '#d59b52';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(-12, -10);
      context.lineTo(12, 9);
      context.moveTo(12, -10);
      context.lineTo(-12, 9);
      context.stroke();
      context.fillStyle = '#e1c367';
      context.fillRect(-3, -3, 6, 7);
    } else {
      context.fillStyle = '#58666b';
      context.beginPath();
      context.moveTo(-13, -10);
      context.lineTo(11, -13);
      context.lineTo(16, 7);
      context.lineTo(-8, 13);
      context.closePath();
      context.fill();
      context.fillStyle = '#a9aaa0';
      context.fillRect(-8, -6, 15, 4);
      context.fillStyle = '#c6633e';
      context.fillRect(8, -10, 5, 16);
    }
  };

  // 真正裁切：水下约 35%–55% 被水面遮挡，只保留非常淡的水下轮廓。
  const size = profile.displaySize;
  const spriteTop = -size * 0.72;
  const waterY = spriteTop + size * (1 - profile.hiddenFraction);
  context.save();
  context.globalAlpha = 0.13;
  drawDebrisSprite();
  context.restore();
  context.save();
  context.beginPath();
  context.rect(-size, spriteTop - 4, size * 2, waterY - spriteTop + 4);
  context.clip();
  drawDebrisSprite();
  context.restore();

  // 水线经过物体时的白色短泡沫和少量气泡。
  context.strokeStyle = `rgba(240, 252, 250, ${0.5 + water.foam * 0.4})`;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(-profile.displaySize * 0.4, waterY + 1);
  context.quadraticCurveTo(0, waterY - 2 - water.foam * 2, profile.displaySize * 0.4, waterY + 1);
  context.stroke();
  const bubbleWindow = ((seconds + item.x * 0.031 + item.y * 0.017) * profile.bubbleRate) % 5;
  if (bubbleWindow < 0.75) {
    context.strokeStyle = 'rgba(197, 244, 238, 0.55)';
    context.lineWidth = 1;
    for (let index = 0; index < 3; index += 1) {
      context.beginPath();
      context.arc(-12 + index * 8, waterY + 5 + Math.sin(seconds * 2 + index) * 3, 1.5 + index * 0.7, 0, Math.PI * 2);
      context.stroke();
    }
  }
  context.restore();
};

const diamondPath = (
  context: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
) => {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.closePath();
};

const drawRaftBase = (
  context: CanvasRenderingContext2D,
  state: TideGameState,
  assets: LoadedTideAssets,
  now: number,
) => {
  const tile = WORLD.tileSize;
  const size = state.raft.size;
  const half = size * tile / 2;
  const startX = WORLD.centerX - half;
  const startY = WORLD.centerY - half;
  const centerWater = sampleWaterSurface(WORLD.centerX, WORLD.centerY, now, state.world.weather);
  const bob = Math.max(-2.5, Math.min(2.5, centerWater.height * 0.72));
  const side = 16;
  const projectDeck = (x: number, y: number) => {
    const point = projectWorldPoint({ x, y });
    const tilt = Math.max(-2.4, Math.min(
      2.4,
      (x - WORLD.centerX) * centerWater.slopeX * 0.12
        + (y - WORLD.centerY) * centerWater.slopeY * 0.12,
    ));
    return { x: point.x, y: point.y + bob + tilt };
  };
  const back = projectDeck(WORLD.centerX - half, WORLD.centerY - half);
  const right = projectDeck(WORLD.centerX + half, WORLD.centerY - half);
  const front = projectDeck(WORLD.centerX + half, WORLD.centerY + half);
  const left = projectDeck(WORLD.centerX - half, WORLD.centerY + half);

  context.fillStyle = 'rgba(0, 21, 29, 0.24)';
  diamondPath(context, [
    { x: back.x, y: back.y + side - 3 },
    { x: right.x + 7, y: right.y + side - 2 },
    { x: front.x + 4, y: front.y + side + 4 },
    { x: left.x - 7, y: left.y + side - 2 },
  ]);
  context.fill();

  context.fillStyle = '#3c2922';
  diamondPath(context, [right, front, { x: front.x, y: front.y + side }, { x: right.x, y: right.y + side }]);
  context.fill();
  context.fillStyle = '#523729';
  diamondPath(context, [front, left, { x: left.x, y: left.y + side }, { x: front.x, y: front.y + side }]);
  context.fill();

  context.fillStyle = '#98613a';
  diamondPath(context, [back, right, front, left]);
  context.fill();
  context.strokeStyle = '#3b2922';
  context.lineWidth = 2;
  context.stroke();

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const seed = row * 17 + column * 31 + state.world.seed;
      const x0 = startX + column * tile;
      const y0 = startY + row * tile;
      const tilePoints = [
        projectDeck(x0, y0),
        projectDeck(x0 + tile, y0),
        projectDeck(x0 + tile, y0 + tile),
        projectDeck(x0, y0 + tile),
      ];
      context.fillStyle = (row + column + seed) % 2 === 0 ? '#aa7042' : '#95603a';
      diamondPath(context, tilePoints);
      context.fill();
      context.strokeStyle = 'rgba(54, 35, 27, 0.78)';
      context.lineWidth = 1.25;
      context.stroke();

      if (assets.mode === 'reference' && assets.woodTile) {
        context.save();
        diamondPath(context, tilePoints);
        context.clip();
        context.globalAlpha = 0.18;
        context.drawImage(
          assets.woodTile,
          0,
          0,
          16,
          16,
          tilePoints[3].x,
          tilePoints[0].y,
          tilePoints[1].x - tilePoints[3].x,
          tilePoints[2].y - tilePoints[0].y,
        );
        context.restore();
      }

      context.strokeStyle = '#d09a58';
      context.lineWidth = 1.5;
      context.beginPath();
      const grainA = projectDeck(x0 + 9, y0 + 17 + seed % 8);
      const grainB = projectDeck(x0 + tile - 10, y0 + 17 + seed % 8);
      const grainC = projectDeck(x0 + 12, y0 + tile - 13);
      const grainD = projectDeck(x0 + tile - 13, y0 + tile - 13);
      context.moveTo(grainA.x, grainA.y);
      context.lineTo(grainB.x, grainB.y);
      context.moveTo(grainC.x, grainC.y);
      context.lineTo(grainD.x, grainD.y);
      context.stroke();
      const knot = projectDeck(x0 + tile * 0.5, y0 + tile * 0.5);
      context.fillStyle = '#3b312b';
      context.beginPath();
      context.arc(knot.x, knot.y, 1.7, 0, Math.PI * 2);
      context.fill();
    }
  }

  if (state.raft.modules.reinforcedDeck) {
    context.strokeStyle = '#667579';
    context.lineWidth = 5;
    diamondPath(context, [back, right, front, left]);
    context.stroke();
    context.strokeStyle = '#aeb9ad';
    context.lineWidth = 1.5;
    context.stroke();
  }

  const waterLine = side - 5 + Math.sin(now / 390) * 1.2;
  context.fillStyle = state.world.weather === 'storm'
    ? 'rgba(18, 73, 86, 0.56)'
    : 'rgba(13, 116, 130, 0.46)';
  diamondPath(context, [
    { x: right.x, y: right.y + waterLine },
    { x: front.x, y: front.y + waterLine },
    { x: front.x, y: front.y + side + 2 },
    { x: right.x, y: right.y + side + 2 },
  ]);
  context.fill();
  diamondPath(context, [
    { x: front.x, y: front.y + waterLine },
    { x: left.x, y: left.y + waterLine },
    { x: left.x, y: left.y + side + 2 },
    { x: front.x, y: front.y + side + 2 },
  ]);
  context.fill();

  const foamPhase = now / 1000;
  context.strokeStyle = state.world.weather === 'storm'
    ? 'rgba(224, 250, 242, 0.78)'
    : 'rgba(214, 247, 235, 0.56)';
  context.lineWidth = state.world.weather === 'storm' ? 3 : 2;
  const contactEdges = [[left, front], [right, front]] as const;
  contactEdges.forEach(([edgeStart, edgeEnd], edgeIndex) => {
    for (let index = 0; index < size + 2; index += 1) {
      const progress = (index * 0.27 + foamPhase * (0.08 + edgeIndex * 0.03)) % 1;
      const x = edgeStart.x + (edgeEnd.x - edgeStart.x) * progress;
      const y = edgeStart.y + (edgeEnd.y - edgeStart.y) * progress + waterLine;
      const length = 5 + (index * 3) % 9;
      context.beginPath();
      context.moveTo(x - length, y + Math.sin(foamPhase * 2 + index) * 1.5);
      context.quadraticCurveTo(x, y - 3, x + length, y + 1);
      context.stroke();
    }
  });

  return { startX, startY, width: size * tile, half, bob };
};

/** 收集网的蓝色等距范围圈。 */
const drawNetRange = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  strong: boolean,
) => {
  context.save();
  context.strokeStyle = strong ? 'rgba(112, 196, 236, 0.75)' : 'rgba(112, 196, 236, 0.18)';
  context.lineWidth = strong ? 2.2 : 1.4;
  context.setLineDash(strong ? [8, 6] : []);
  context.beginPath();
  context.ellipse(x, y, PLACEMENT.netCollectRadius, PLACEMENT.netCollectRadius * 0.62, 0, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([]);
  if (strong) {
    context.fillStyle = 'rgba(96, 178, 226, 0.06)';
    context.fill();
  }
  context.restore();
};

const drawEnemy = (
  context: CanvasRenderingContext2D,
  enemy: EnemyState,
  state: TideGameState,
  assets: LoadedTideAssets,
  now: number,
  raftOffset: number,
) => {
  const projected = projectWorldPoint(enemy);
  const water = sampleWaterSurface(enemy.x, enemy.y, now, state.world.weather);
  const isElite = enemy.type === 'lanternBeast';
  const size = isElite ? 82 : 62;
  const boardingDuration = isElite ? 1.15 : 0.82;
  const boardingProgress = enemy.phase === 'boarding'
    ? clamp01(1 - Math.max(0, enemy.phaseEndsAt - state.world.elapsedSeconds) / boardingDuration)
    : 0;
  const y = projected.y
    + (enemy.phase === 'deck' ? raftOffset : water.height * 0.8)
    - boardingProgress * 22
    + Math.sin(now / (isElite ? 210 : 155) + enemy.x * 0.02) * (enemy.phase === 'deck' ? 1 : 2.2);

  context.save();
  context.translate(projected.x, y);
  if (enemy.phase === 'swimming') {
    const targetScreen = projectWorldPoint({ x: enemy.targetX, y: enemy.targetY });
    const dx = targetScreen.x - projected.x;
    const dy = targetScreen.y - projected.y;
    const length = Math.hypot(dx, dy) || 1;
    context.strokeStyle = isElite ? 'rgba(92, 232, 220, 0.5)' : 'rgba(205, 244, 235, 0.34)';
    context.lineWidth = isElite ? 3 : 2;
    context.beginPath();
    context.moveTo(-dx / length * 17, -dy / length * 17 + 6);
    context.quadraticCurveTo(-dx / length * 35 - dy / length * 6, -dy / length * 35 + 10, -dx / length * 51, -dy / length * 51 + 7);
    context.stroke();
  }
  context.fillStyle = 'rgba(0, 18, 25, 0.3)';
  context.beginPath();
  context.ellipse(2, 8, size * 0.35, 7, 0, 0, Math.PI * 2);
  context.fill();
  if (isElite) {
    const glow = context.createRadialGradient(0, -20, 2, 0, -20, 42);
    glow.addColorStop(0, 'rgba(88, 238, 224, 0.38)');
    glow.addColorStop(1, 'rgba(88, 238, 224, 0)');
    context.fillStyle = glow;
    context.fillRect(-45, -65, 90, 90);
  }
  if (assets.combat) {
    context.drawImage(
      assets.combat,
      (isElite ? 1 : 0) * 128,
      0,
      128,
      128,
      -size / 2,
      -size * 0.78,
      size,
      size,
    );
  } else {
    context.fillStyle = isElite ? '#225e67' : '#9a4d32';
    context.beginPath();
    context.ellipse(0, -13, size * 0.3, size * 0.22, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = isElite ? '#68e1d4' : '#d88955';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(-10, -5);
    context.lineTo(-27, 8);
    context.moveTo(10, -5);
    context.lineTo(27, 8);
    context.stroke();
  }
  if (enemy.phase !== 'deck') {
    context.fillStyle = state.world.weather === 'storm'
      ? 'rgba(18, 69, 82, 0.5)'
      : 'rgba(11, 117, 132, 0.4)';
    context.fillRect(-size * 0.47, -1, size * 0.94, size * 0.35);
    context.strokeStyle = 'rgba(211, 248, 239, 0.6)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(-size * 0.38, 0);
    context.quadraticCurveTo(0, -5 - water.foam * 4, size * 0.38, 0);
    context.stroke();
  }
  if (enemy.health < enemy.maxHealth || enemy.phase === 'deck') {
    const width = isElite ? 50 : 39;
    context.fillStyle = 'rgba(5, 17, 21, 0.82)';
    context.fillRect(-width / 2 - 2, -size * 0.72 - 8, width + 4, 6);
    context.fillStyle = isElite ? '#65d8c8' : '#d4674b';
    context.fillRect(-width / 2, -size * 0.72 - 6, width * enemy.health / enemy.maxHealth, 2);
  }
  context.restore();
};

const drawFacility = (
  context: CanvasRenderingContext2D,
  moduleId: RaftModuleId,
  x: number,
  y: number,
  now: number,
) => {
  context.save();
  context.translate(x, y);
  context.fillStyle = 'rgba(0, 13, 18, 0.32)';
  context.beginPath();
  context.ellipse(3, 8, 27, 9, 0, 0, Math.PI * 2);
  context.fill();

  if (moduleId === 'net') {
    context.strokeStyle = '#d7bf82';
    context.lineWidth = 2.4;
    context.beginPath();
    context.ellipse(0, -6, 24, 12, 0, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = 'rgba(215, 191, 130, 0.7)';
    context.lineWidth = 1.2;
    for (let ring = 1; ring <= 3; ring += 1) {
      context.beginPath();
      context.ellipse(0, -6 - ring * 6, 24 - ring * 5, 12 - ring * 2.6, 0, 0, Math.PI * 2);
      context.stroke();
    }
    context.strokeStyle = '#8d292b';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(-24, -6);
    context.lineTo(-30, -14);
    context.moveTo(24, -6);
    context.lineTo(30, -14);
    context.stroke();
    context.restore();
    return;
  }
  if (moduleId === 'purifier') {
    context.fillStyle = '#263f45';
    roundedRect(context, -21, -24, 42, 33, 7);
    context.fill();
    context.fillStyle = '#a6d8d2';
    roundedRect(context, -15, -18, 30, 17, 4);
    context.fill();
    context.strokeStyle = '#e1bf61';
    context.lineWidth = 4;
    context.beginPath();
    context.arc(0, -20, 11, Math.PI, Math.PI * 2);
    context.stroke();
  } else if (moduleId === 'grill') {
    context.fillStyle = '#273237';
    context.beginPath();
    context.ellipse(0, -9, 23, 14, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#db623b';
    context.beginPath();
    context.ellipse(0, -7, 15, 6, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#b7b6a8';
    context.lineWidth = 3;
    for (let line = -12; line <= 12; line += 6) {
      context.beginPath();
      context.moveTo(line, -17);
      context.lineTo(line, 2);
      context.stroke();
    }
  } else if (moduleId === 'storage') {
    context.fillStyle = '#4a2c21';
    roundedRect(context, -25, -23, 50, 34, 7);
    context.fill();
    context.fillStyle = '#a86838';
    roundedRect(context, -21, -20, 42, 26, 5);
    context.fill();
    context.strokeStyle = '#d6a25c';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(0, -18, 23, Math.PI, 0);
    context.stroke();
    context.fillStyle = '#ecd06b';
    roundedRect(context, -4, -8, 8, 10, 2);
    context.fill();
  } else if (moduleId === 'workshop') {
    context.fillStyle = '#2e4145';
    context.beginPath();
    context.moveTo(-30, 8);
    context.lineTo(-27, -24);
    context.lineTo(24, -28);
    context.lineTo(31, 5);
    context.closePath();
    context.fill();
    context.fillStyle = '#b07a43';
    roundedRect(context, -26, -22, 51, 9, 3);
    context.fill();
    context.fillStyle = '#9cc2bd';
    context.fillRect(-17, -11, 9, 14);
    context.fillStyle = '#d4a552';
    context.fillRect(4, -13, 16, 5);
  } else if (moduleId === 'garden') {
    context.fillStyle = '#4b3024';
    context.beginPath();
    context.moveTo(-26, 7);
    context.lineTo(-22, -18);
    context.lineTo(24, -15);
    context.lineTo(27, 8);
    context.closePath();
    context.fill();
    context.fillStyle = '#284e3d';
    roundedRect(context, -20, -13, 40, 15, 4);
    context.fill();
    context.strokeStyle = '#78a753';
    context.lineWidth = 4;
    [-12, 0, 12].forEach((plant) => {
      context.beginPath();
      context.moveTo(plant, 0);
      context.quadraticCurveTo(plant - 7, -13, plant - 2, -21);
      context.moveTo(plant, 0);
      context.quadraticCurveTo(plant + 8, -12, plant + 3, -20);
      context.stroke();
    });
  } else if (moduleId === 'radio') {
    context.fillStyle = '#263b41';
    roundedRect(context, -22, -29, 44, 37, 7);
    context.fill();
    context.fillStyle = '#69c3c0';
    roundedRect(context, -15, -22, 20, 12, 3);
    context.fill();
    context.fillStyle = '#e3c45f';
    context.beginPath();
    context.arc(13, -8, 4, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#d7ded2';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(12, -28);
    context.lineTo(24, -57);
    context.stroke();
  } else if (moduleId === 'sail') {
    context.fillStyle = '#332d29';
    context.fillRect(-3, -79, 7, 85);
    context.fillStyle = '#ddd0aa';
    context.beginPath();
    context.moveTo(5, -74);
    context.quadraticCurveTo(38, -56, 42, -7);
    context.lineTo(5, -17);
    context.closePath();
    context.fill();
    context.fillStyle = '#c85d3e';
    context.beginPath();
    context.moveTo(7, -43);
    context.lineTo(37, -28);
    context.lineTo(40, -20);
    context.lineTo(7, -35);
    context.closePath();
    context.fill();
    context.strokeStyle = '#e8dcba';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(8, -72);
    context.lineTo(8, -16);
    context.stroke();
  } else if (moduleId === 'beacon') {
    context.fillStyle = '#2b3b3f';
    context.beginPath();
    context.moveTo(-11, 6);
    context.lineTo(-7, -55);
    context.lineTo(7, -55);
    context.lineTo(11, 6);
    context.closePath();
    context.fill();
    context.fillStyle = '#e8c957';
    roundedRect(context, -14, -64, 28, 14, 5);
    context.fill();
    context.fillStyle = 'rgba(249, 219, 96, 0.12)';
    context.beginPath();
    context.arc(0, -57, 34 + Math.sin(now / 180) * 4, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
};

const PLACEABLE_MODULE_IDS: PlaceableModuleId[] = [
  'net', 'purifier', 'grill', 'storage', 'workshop', 'sail', 'garden', 'radio', 'beacon',
];

const facilityEntities = (
  context: CanvasRenderingContext2D,
  state: TideGameState,
  bounds: { bob: number },
  now: number,
) => {
  const entities: SceneEntity[] = [];
  for (const moduleId of PLACEABLE_MODULE_IDS) {
    if (!state.raft.modules[moduleId]) continue;
    const position = getFacilityWorldPoint(state, moduleId);
    if (!position) continue;
    const projected = projectWorldPoint(position);
    projected.y += bounds.bob;
    entities.push({
      id: moduleId,
      depth: moduleId === 'net' ? projected.y - 40 : projected.y + (moduleId === 'sail' ? 4 : 0),
      draw: () => drawFacility(context, moduleId, projected.x, projected.y, now),
    });
  }
  return entities;
};

const atlasRow: Record<VisualDirection, number> = {
  south: 0,
  southWest: 1,
  west: 2,
  northWest: 3,
  north: 4,
  northEast: 5,
  east: 6,
  southEast: 7,
};

const drawFallbackDiver = (context: CanvasRenderingContext2D) => {
  context.fillStyle = '#d59b25';
  roundedRect(context, -17, -21, 34, 43, 10);
  context.fill();
  context.fillStyle = '#8d292b';
  context.beginPath();
  context.arc(0, -25, 15, Math.PI, Math.PI * 2);
  context.fill();
  context.fillStyle = '#276d6e';
  context.fillRect(-15, -13, 30, 19);
  context.fillStyle = '#4d362a';
  context.fillRect(-15, 19, 12, 13);
  context.fillRect(3, 19, 12, 13);
};

/** 八方向手部锚点：behind 为 true 时工具画在身体后方（朝北一侧）。 */
const HAND_ANCHORS: Record<VisualDirection, { x: number; y: number; behind: boolean; flip: boolean }> = {
  south: { x: 15, y: -8, behind: false, flip: false },
  southWest: { x: -15, y: -8, behind: false, flip: true },
  west: { x: -17, y: -10, behind: false, flip: true },
  northWest: { x: -13, y: -12, behind: true, flip: true },
  north: { x: 2, y: -16, behind: true, flip: false },
  northEast: { x: 13, y: -12, behind: true, flip: false },
  east: { x: 17, y: -10, behind: false, flip: false },
  southEast: { x: 15, y: -8, behind: false, flip: false },
};

/** 简洁像素工具：24×24 风格，直接以色块绘制，始终握在手中。 */
const drawHeldTool = (
  context: CanvasRenderingContext2D,
  equipment: EquipmentId,
  anchor: { x: number; y: number; flip: boolean },
  lift: number,
) => {
  context.save();
  context.translate(anchor.x, anchor.y - lift);
  if (anchor.flip) context.scale(-1, 1);
  if (equipment === 'cutlass') {
    context.fillStyle = '#4a3323';
    context.fillRect(-2, -1, 5, 9);
    context.fillStyle = '#d8c489';
    context.fillRect(-1, -18, 3, 18);
    context.fillStyle = '#f2e4b0';
    context.fillRect(1, -18, 3, 15);
  } else if (equipment === 'salvageTool') {
    context.fillStyle = '#5d3f28';
    context.fillRect(-2, -14, 4, 22);
    context.fillStyle = '#9aa5a1';
    context.fillRect(-8, -18, 14, 6);
    context.fillStyle = '#c2ccc6';
    context.fillRect(-8, -18, 14, 2);
  } else {
    context.strokeStyle = '#6b4a2f';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(-2, 8);
    context.lineTo(10, -20);
    context.stroke();
    context.strokeStyle = '#d9e2d6';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(10, -20);
    context.quadraticCurveTo(15, -8, 13, 2);
    context.stroke();
  }
  context.restore();
};

const actionTarget = (visual: PlayerVisualState, x: number, y: number) => {
  if (visual.target) return projectWorldPoint(visual.target);
  const direction = visualDirectionVector(visual.direction);
  return { x: x + direction.x * 100, y: y + direction.y * 100 };
};

const drawActionOverlay = (
  context: CanvasRenderingContext2D,
  visual: PlayerVisualState,
  x: number,
  y: number,
  now: number,
) => {
  const progress = getActionProgress(visual, now);
  const target = actionTarget(visual, x, y);
  if (visual.action === 'hookCast' || visual.action === 'hookPull') {
    const cast = visual.action === 'hookCast'
      ? 1 - Math.pow(1 - progress, 3)
      : 1 - progress * 0.28;
    const endX = x + (target.x - x) * cast;
    const endY = y + (target.y - y) * cast;
    context.save();
    context.strokeStyle = '#d7c28a';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x + (visualDirectionVector(visual.direction).x < 0 ? -18 : 18), y - 14);
    context.quadraticCurveTo((x + endX) / 2, Math.min(y, endY) - 38, endX, endY);
    context.stroke();
    context.fillStyle = '#6a7372';
    context.beginPath();
    context.arc(endX, endY, 5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#c6d2ca';
    context.beginPath();
    context.arc(endX + 4, endY + 4, 6, Math.PI * 0.8, Math.PI * 1.65);
    context.stroke();
    context.restore();
  }
  if (visual.action === 'fishCast' || visual.action === 'fishWait' || visual.action === 'fishReel') {
    const cast = visual.action === 'fishCast'
      ? 1 - Math.pow(1 - progress, 3)
      : visual.action === 'fishWait'
        ? 1
        : 1 - Math.pow(progress, 1.4);
    const endX = x + (target.x - x) * cast;
    const endY = y + (target.y - y) * cast;
    context.save();
    context.strokeStyle = '#3c2c25';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(x + 10, y - 15);
    context.lineTo(x + 25, y - 58);
    context.stroke();
    context.strokeStyle = 'rgba(232, 237, 218, 0.8)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x + 25, y - 58);
    context.quadraticCurveTo((x + endX) / 2, y - 76, endX, endY);
    context.stroke();
    context.fillStyle = '#e05f3d';
    context.beginPath();
    context.arc(endX, endY, 4, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
  if (visual.action === 'build') {
    context.save();
    context.globalAlpha = 0.24 + Math.sin(progress * Math.PI) * 0.18;
    context.strokeStyle = '#f2d56b';
    context.lineWidth = 2;
    context.setLineDash([7, 5]);
    roundedRect(context, target.x - 27, target.y - 39, 54, 45, 7);
    context.stroke();
    context.setLineDash([]);
    context.restore();
  }
  if (visual.action === 'attack') {
    const swing = Math.sin(progress * Math.PI);
    const vector = visualDirectionVector(visual.direction);
    const angle = Math.atan2(vector.y, vector.x) - 1.25 + progress * 2.5;
    context.save();
    context.translate(x + vector.x * 13, y - 15 + vector.y * 8);
    context.rotate(angle);
    context.fillStyle = '#e7d69b';
    context.fillRect(4, -2, 31, 4);
    context.fillStyle = '#8e5c36';
    context.fillRect(-7, -3, 14, 6);
    context.restore();
    context.strokeStyle = `rgba(246, 225, 157, ${0.2 + swing * 0.7})`;
    context.lineWidth = 5;
    context.beginPath();
    context.arc(x + vector.x * 22, y - 15 + vector.y * 8, 35, -1.15 + progress * 1.4, -0.2 + progress * 1.4);
    context.stroke();
  }
};

const drawDiver = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  visual: PlayerVisualState,
  direction: VisualDirection,
  assets: LoadedTideAssets,
  now: number,
  walking: boolean,
  equipment: EquipmentId,
) => {
  const actionProgress = getActionProgress(visual, now);
  const walkPhase = now / 105;
  const idleBob = Math.sin(now / 420) * 1.2;
  const walkBob = walking ? Math.abs(Math.sin(walkPhase)) * -2.2 : 0;
  const actionLean = visual.action === 'hookCast'
    ? Math.sin(actionProgress * Math.PI) * (visualDirectionVector(direction).x < 0 ? -0.08 : 0.08)
    : visual.action === 'attack'
      ? Math.sin(actionProgress * Math.PI) * (visualDirectionVector(direction).x < 0 ? -0.12 : 0.12)
    : visual.action === 'hurt'
      ? Math.sin(actionProgress * Math.PI * 5) * 0.08
      : 0;
  const hurtShake = visual.action === 'hurt' ? Math.sin(actionProgress * Math.PI * 8) * 5 : 0;

  drawActionOverlay(context, visual, x, y, now);
  context.save();
  context.translate(Math.round(x + hurtShake), Math.round(y + idleBob + walkBob));
  context.fillStyle = 'rgba(0, 15, 20, 0.4)';
  context.beginPath();
  context.ellipse(2, 27, 23, 8, 0, 0, Math.PI * 2);
  context.fill();
  context.rotate(actionLean);

  // 当前装备始终握在手中；切换装备时播放短促抬手。
  const anchor = HAND_ANCHORS[direction];
  const toolLift = visual.action === 'switch' ? Math.sin(actionProgress * Math.PI) * 12 : 0;
  const showHeldTool = visual.action === 'idle' || visual.action === 'walk'
    || visual.action === 'switch' || visual.action === 'hookCast' || visual.action === 'hookPull';
  if (showHeldTool && anchor.behind) {
    drawHeldTool(context, equipment, anchor, toolLift);
  }

  if (assets.character) {
    const sourceColumn = walking
      ? 2 + Math.floor(now / 83) % 6
      : Math.floor(now / 250) % 2;
    const sourceX = sourceColumn * 64;
    const sourceY = atlasRow[direction] * 64;
    context.save();
    if (visual.action === 'consume') {
      context.translate(0, -Math.sin(actionProgress * Math.PI) * 3);
    }
    context.drawImage(assets.character, sourceX, sourceY, 64, 64, -32, -37, 64, 64);
    context.restore();
  } else {
    drawFallbackDiver(context);
  }
  if (showHeldTool && !anchor.behind) {
    drawHeldTool(context, equipment, anchor, toolLift);
  }
  if (visual.action === 'build') {
    const hitPhase = (actionProgress * 3) % 1;
    context.save();
    context.rotate(-1 + hitPhase * 1.5);
    context.fillStyle = '#6e4128';
    context.fillRect(14, -25, 4, 30);
    context.fillStyle = '#9ca6a2';
    roundedRect(context, 8, -30, 17, 9, 3);
    context.fill();
    context.restore();
  }
  if (visual.action === 'repair') {
    context.save();
    context.rotate(-0.7 + Math.sin(actionProgress * Math.PI * 5) * 0.45);
    context.strokeStyle = '#cbd4cb';
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(12, -2);
    context.lineTo(26, 12);
    context.stroke();
    context.strokeStyle = '#78888a';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(29, 15, 6, 0.2, Math.PI * 1.8);
    context.stroke();
    context.restore();
  }
  if (visual.action === 'consume') {
    context.fillStyle = '#7ed4cc';
    roundedRect(context, 12, -23 - Math.sin(actionProgress * Math.PI) * 9, 10, 14, 3);
    context.fill();
    context.fillStyle = '#e8d5a9';
    context.fillRect(13, -24 - Math.sin(actionProgress * Math.PI) * 9, 8, 3);
  }
  if (visual.action === 'hurt') {
    context.globalCompositeOperation = 'source-atop';
    context.fillStyle = 'rgba(224, 68, 45, ' + (0.18 + Math.sin(actionProgress * Math.PI) * 0.35) + ')';
    context.fillRect(-35, -42, 70, 76);
  }
  context.restore();
};

const isSamePlacement = (a: ModulePlacement | undefined, b: ModulePlacement) => {
  if (!a) return false;
  if (a.kind === 'tile' && b.kind === 'tile') return a.gridX === b.gridX && a.gridY === b.gridY;
  if (a.kind === 'edge' && b.kind === 'edge') return a.side === b.side && a.index === b.index;
  return false;
};

/** 摆放模式：合法格青绿、非法格红色，悬停显示半透明设施轮廓与收集网范围。 */
const drawPlacementOverlay = (
  context: CanvasRenderingContext2D,
  state: TideGameState,
  intent: PlacementIntent,
  now: number,
) => {
  const tile = WORLD.tileSize;
  if (intent.mode === 'locate') {
    const position = getFacilityWorldPoint(state, intent.moduleId);
    if (position) {
      const projected = projectWorldPoint(position);
      const pulse = 0.5 + Math.sin(now / 160) * 0.5;
      context.save();
      context.strokeStyle = `rgba(248, 218, 112, ${0.5 + pulse * 0.45})`;
      context.lineWidth = 2.6;
      context.setLineDash([10, 7]);
      context.beginPath();
      context.ellipse(projected.x, projected.y - 8, 42 + pulse * 8, 26 + pulse * 5, 0, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
      context.restore();
    }
    return;
  }
  const isEdgeModule = isEdgePlacement(intent.moduleId);
  const candidates: ModulePlacement[] = [];
  if (isEdgeModule) {
    for (const side of ['north', 'east', 'south', 'west'] as const) {
      for (let index = 0; index < state.raft.size; index += 1) {
        candidates.push({ kind: 'edge', side, index });
      }
    }
  } else {
    for (let y = 0; y < state.raft.size; y += 1) {
      for (let x = 0; x < state.raft.size; x += 1) {
        candidates.push({ kind: 'tile', gridX: x, gridY: y });
      }
    }
  }

  const pulse = 0.6 + Math.sin(now / 240) * 0.16;
  candidates.forEach((candidate) => {
    const check = validatePlacement(state, intent.moduleId, candidate);
    const valid = check.ok;
    const hovered = isSamePlacement(intent.hover, candidate);
    if (!valid && !hovered) return;
    const center = getPlacementWorldPoint(state, candidate);
    const projected = projectWorldPoint(center);
    const pad = isEdgeModule ? tile * 0.24 : tile * 0.5;
    diamondPath(context, [
      { x: projected.x, y: projected.y - pad * 0.62 },
      { x: projected.x + pad, y: projected.y },
      { x: projected.x, y: projected.y + pad * 0.62 },
      { x: projected.x - pad, y: projected.y },
    ]);
    context.fillStyle = valid
      ? `rgba(94, 210, 180, ${hovered ? 0.42 : 0.16 * pulse + 0.08})`
      : 'rgba(226, 92, 78, 0.4)';
    context.fill();
    context.strokeStyle = valid
      ? `rgba(126, 232, 198, ${hovered ? 0.95 : 0.55})`
      : 'rgba(240, 128, 112, 0.85)';
    context.lineWidth = hovered ? 2.4 : 1.4;
    context.stroke();

    if (hovered) {
      if (intent.moduleId === 'net') {
        drawNetRange(context, projected.x, projected.y, true);
      }
      context.save();
      context.globalAlpha = valid ? 0.6 : 0.4;
      drawFacility(context, intent.moduleId, projected.x, projected.y, now);
      context.restore();
    }
  });
};

const particlePalette = {
  splash: ['#c7f0ea', '#70c9c7'],
  woodchip: ['#d99a54', '#7f4c2e'],
  spark: ['#f6d567', '#f17c3e'],
  bubble: ['#b9eeeb', '#72c9c9'],
} as const;

const emitParticles = (
  memory: TideRendererMemory,
  kind: Exclude<VisualEffect['kind'], 'loot'>,
  x: number,
  y: number,
  now: number,
  amount: number,
) => {
  const palette = particlePalette[kind];
  for (let index = 0; index < amount && memory.particles.length < 200; index += 1) {
    const phase = (memory.nextParticleId * 2.399 + index) % (Math.PI * 2);
    const speed = 16 + (index % 5) * 7;
    memory.particles.push({
      id: memory.nextParticleId++,
      kind,
      x,
      y,
      vx: Math.cos(phase) * speed,
      vy: Math.sin(phase) * speed - (kind === 'bubble' ? 22 : 8),
      gravity: kind === 'bubble' ? -8 : kind === 'splash' ? 34 : 58,
      createdAt: now,
      duration: kind === 'spark' ? 360 : 620,
      color: palette[index % palette.length],
      size: 2 + index % 3,
    });
  }
};

const markOnce = (memory: TideRendererMemory, key: string, callback: () => void) => {
  if (memory.emitted.has(key)) return;
  memory.emitted.add(key);
  callback();
  if (memory.emitted.size > 300) {
    const oldest = memory.emitted.values().next().value as string | undefined;
    if (oldest) memory.emitted.delete(oldest);
  }
};

const syncActionParticles = (
  memory: TideRendererMemory,
  visual: PlayerVisualState,
  state: TideGameState,
  now: number,
) => {
  const token = visual.commitToken ?? (visual.action + '-' + visual.startedAt);
  const progress = getActionProgress(visual, now);
  const player = projectWorldPoint(state.player);
  const target = actionTarget(visual, player.x, player.y);
  if ((visual.action === 'hookCast' || visual.action === 'fishCast') && progress > 0.55) {
    markOnce(memory, token + '-splash', () => emitParticles(memory, 'splash', target.x, target.y, now, 12));
  }
  if (visual.action === 'build') {
    [0.23, 0.5, 0.76].forEach((threshold, index) => {
      if (progress >= threshold) {
        markOnce(memory, token + '-wood-' + index, () => (
          emitParticles(memory, 'woodchip', target.x, target.y - 12, now, 7)
        ));
      }
    });
  }
  if (visual.action === 'repair' && progress > 0.34) {
    [0.34, 0.7].forEach((threshold, index) => {
      if (progress >= threshold) {
        markOnce(memory, token + '-spark-' + index, () => (
          emitParticles(memory, 'spark', player.x + 24, player.y + 10, now, 8)
        ));
      }
    });
  }
  if (visual.action === 'consume' && progress > 0.48) {
    markOnce(memory, token + '-bubble', () => (
      emitParticles(memory, 'bubble', player.x + 13, player.y - 28, now, 7)
    ));
  }
  if (visual.action === 'attack' && progress > 0.36) {
    markOnce(memory, token + '-attack', () => (
      emitParticles(memory, 'spark', target.x, target.y - 10, now, 8)
    ));
  }
};

const syncExternalEffects = (
  memory: TideRendererMemory,
  effects: VisualEffect[],
  now: number,
) => {
  effects.forEach((effect) => {
    const kind = effect.kind;
    if (kind === 'loot') return;
    markOnce(memory, effect.id, () => {
      const projected = projectWorldPoint(effect);
      emitParticles(memory, kind, projected.x, projected.y, now, 10);
    });
  });
};

const drawParticles = (
  context: CanvasRenderingContext2D,
  memory: TideRendererMemory,
  effects: VisualEffect[],
  now: number,
) => {
  memory.particles = memory.particles.filter((particle) => now - particle.createdAt < particle.duration);
  memory.particles.forEach((particle) => {
    const age = (now - particle.createdAt) / 1000;
    const progress = clamp01((now - particle.createdAt) / particle.duration);
    const x = particle.x + particle.vx * age;
    const y = particle.y + particle.vy * age + 0.5 * particle.gravity * age * age;
    context.save();
    context.globalAlpha = 1 - progress;
    context.fillStyle = particle.color;
    if (particle.kind === 'bubble' || particle.kind === 'splash') {
      context.strokeStyle = particle.color;
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(x, y, particle.size, 0, Math.PI * 2);
      context.stroke();
    } else {
      context.fillRect(Math.round(x), Math.round(y), particle.size, particle.size);
    }
    context.restore();
  });

  effects.forEach((effect) => {
    if (effect.kind !== 'loot') return;
    const progress = clamp01((now - effect.createdAt) / effect.duration);
    if (progress >= 1) return;
    const targetX = effect.targetX ?? WORLD.centerX;
    const targetY = effect.targetY ?? WORLD.height - 12;
    const source = projectWorldPoint(effect);
    const x = source.x + (targetX - source.x) * progress;
    const y = source.y + (targetY - source.y) * progress - Math.sin(progress * Math.PI) * 90;
    context.save();
    context.globalAlpha = 1 - progress * 0.35;
    context.fillStyle = effect.tone ?? '#f2cf66';
    context.beginPath();
    context.moveTo(x, y - 7);
    context.lineTo(x + 7, y);
    context.lineTo(x, y + 7);
    context.lineTo(x - 7, y);
    context.closePath();
    context.fill();
    context.restore();
  });
};

const drawLighting = (context: CanvasRenderingContext2D, state: TideGameState) => {
  const night = state.world.timeOfDay > 0.68
    ? clamp01((state.world.timeOfDay - 0.68) * 2.4)
    : clamp01((0.16 - state.world.timeOfDay) * 2.4);
  if (night > 0) {
    const player = projectWorldPoint(state.player);
    context.fillStyle = 'rgba(2, 12, 35, ' + (night * 0.58) + ')';
    context.fillRect(0, 0, WORLD.width, WORLD.height);
    const lamp = context.createRadialGradient(
      player.x,
      player.y,
      18,
      player.x,
      player.y,
      125,
    );
    lamp.addColorStop(0, 'rgba(241, 198, 86, 0.17)');
    lamp.addColorStop(1, 'rgba(241, 198, 86, 0)');
    context.globalCompositeOperation = 'screen';
    context.fillStyle = lamp;
    context.fillRect(0, 0, WORLD.width, WORLD.height);
    state.enemies
      .filter((enemy) => enemy.type === 'lanternBeast')
      .forEach((enemy) => {
        const source = projectWorldPoint(enemy);
        const monsterLamp = context.createRadialGradient(source.x, source.y - 18, 4, source.x, source.y - 18, 82);
        monsterLamp.addColorStop(0, 'rgba(77, 232, 220, 0.3)');
        monsterLamp.addColorStop(1, 'rgba(77, 232, 220, 0)');
        context.fillStyle = monsterLamp;
        context.fillRect(source.x - 85, source.y - 103, 170, 170);
      });
    context.globalCompositeOperation = 'source-over';
  }
  const vignette = context.createRadialGradient(
    WORLD.centerX,
    WORLD.centerY,
    150,
    WORLD.centerX,
    WORLD.centerY,
    610,
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 12, 18, 0.4)');
  context.fillStyle = vignette;
  context.fillRect(0, 0, WORLD.width, WORLD.height);
};

export const renderTideScene = (
  context: CanvasRenderingContext2D,
  state: TideGameState,
  visual: PlayerVisualState,
  assets: LoadedTideAssets,
  effects: VisualEffect[],
  movementIntent: MovementIntent,
  placementIntent: PlacementIntent | null,
  now: number,
  memory: TideRendererMemory,
) => {
  context.clearRect(0, 0, WORLD.width, WORLD.height);
  drawOcean(context, state, now);

  const nearestId = getNearestCollectableId(state);
  const netOrigin = getNetCollectOrigin(state);
  const backDebris = state.debris.filter((item) => projectWorldPoint(item).y <= WORLD.centerY + 8);
  const frontDebris = state.debris.filter((item) => projectWorldPoint(item).y > WORLD.centerY + 8);
  backDebris.forEach((item) => drawDebris(context, item, state, assets, now, item.id === nearestId, netOrigin));
  state.enemies
    .filter((enemy) => enemy.phase === 'swimming' && projectWorldPoint(enemy).y <= WORLD.centerY + 8)
    .forEach((enemy) => drawEnemy(context, enemy, state, assets, now, 0));

  const bounds = drawRaftBase(context, state, assets, now);
  if (netOrigin) {
    const netProjected = projectWorldPoint(netOrigin);
    drawNetRange(context, netProjected.x, netProjected.y, false);
  }
  frontDebris.forEach((item) => drawDebris(context, item, state, assets, now, item.id === nearestId, netOrigin));
  state.enemies
    .filter((enemy) => enemy.phase === 'swimming' && projectWorldPoint(enemy).y > WORLD.centerY + 8)
    .forEach((enemy) => drawEnemy(context, enemy, state, assets, now, 0));

  const frameDelta = memory.lastFrameAt ? Math.min(50, now - memory.lastFrameAt) : 16;
  memory.lastFrameAt = now;
  memory.renderedPlayerX = interpolatePosition(memory.renderedPlayerX, state.player.x, frameDelta);
  memory.renderedPlayerY = interpolatePosition(memory.renderedPlayerY, state.player.y, frameDelta);
  const moved = movementIntent.active || Math.hypot(
    state.player.x - memory.lastPlayerX,
    state.player.y - memory.lastPlayerY,
  ) > 0.2;
  if (moved) {
    memory.lastMovedAt = now;
    memory.lastPlayerX = state.player.x;
    memory.lastPlayerY = state.player.y;
  }
  const walking = (visual.action === 'walk' || visual.action === 'idle')
    && (movementIntent.active || now - memory.lastMovedAt < 170);
  const direction = visual.action === 'idle' || visual.action === 'walk'
    ? movementIntent.direction
    : visual.direction;
  const projectedPlayer = projectWorldPoint({
    x: memory.renderedPlayerX,
    y: memory.renderedPlayerY,
  });
  projectedPlayer.y += bounds.bob;

  const entities = facilityEntities(context, state, bounds, now);
  state.enemies
    .filter((enemy) => enemy.phase !== 'swimming')
    .forEach((enemy) => {
      const projected = projectWorldPoint(enemy);
      entities.push({
        id: enemy.id,
        depth: projected.y + bounds.bob + (enemy.type === 'lanternBeast' ? 34 : 26),
        draw: () => drawEnemy(context, enemy, state, assets, now, bounds.bob),
      });
    });
  entities.push({
    id: 'player',
    depth: projectedPlayer.y + 28,
    draw: () => drawDiver(
      context,
      projectedPlayer.x,
      projectedPlayer.y,
      visual,
      direction,
      assets,
      now,
      walking,
      state.equipment.selected,
    ),
  });
  entities.sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
  entities.forEach((entity) => entity.draw());

  if (placementIntent) {
    drawPlacementOverlay(context, state, placementIntent, now);
  }

  syncActionParticles(memory, visual, state, now);
  syncExternalEffects(memory, effects, now);
  drawParticles(context, memory, effects, now);
  drawLighting(context, state);
};
