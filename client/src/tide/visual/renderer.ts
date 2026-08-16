import { WORLD } from '../config';
import { getNearestCollectableId } from '../game';
import type { DebrisItem, RaftModuleId, TideGameState } from '../types';
import { getActionProgress } from './animation';
import type {
  LoadedTideAssets,
  Particle,
  PlayerVisualState,
  VisualEffect,
} from './types';
import { clamp01 } from './utilities';

interface SceneEntity {
  id: string;
  depth: number;
  draw: () => void;
}

export interface TideRendererMemory {
  lastPlayerX: number;
  lastPlayerY: number;
  lastMovedAt: number;
  particles: Particle[];
  emitted: Set<string>;
  nextParticleId: number;
}

export const createTideRendererMemory = (state: TideGameState): TideRendererMemory => ({
  lastPlayerX: state.player.x,
  lastPlayerY: state.player.y,
  lastMovedAt: 0,
  particles: [],
  emitted: new Set(),
  nextParticleId: 1,
});

const waveColor = (alpha: number) => 'rgba(186, 244, 236, ' + alpha.toFixed(3) + ')';

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
  const sun = Math.max(0.12, Math.sin(state.world.timeOfDay * Math.PI));
  const storm = state.world.weather === 'storm';
  const gradient = context.createLinearGradient(0, 0, WORLD.width, WORLD.height);
  gradient.addColorStop(0, storm ? '#102f3d' : '#086a7f');
  gradient.addColorStop(0.55, storm ? '#174451' : '#0d8794');
  gradient.addColorStop(1, state.world.timeOfDay > 0.7 ? '#083242' : '#095f72');
  context.fillStyle = gradient;
  context.fillRect(0, 0, WORLD.width, WORLD.height);

  const layers = [
    { speed: 13, spacing: 62, length: 31, alpha: 0.07, width: 2 },
    { speed: -21, spacing: 88, length: 46, alpha: 0.11, width: 3 },
    { speed: 34, spacing: 126, length: 68, alpha: 0.08, width: 4 },
  ];
  layers.forEach((layer, layerIndex) => {
    const offset = (seconds * layer.speed) % layer.spacing;
    context.strokeStyle = waveColor(layer.alpha + sun * 0.045);
    context.lineWidth = layer.width;
    for (let row = -2; row < 12; row += 1) {
      const y = row * layer.spacing * 0.62 + offset + layerIndex * 15;
      for (let column = -2; column < 15; column += 1) {
        const x = column * layer.spacing + (row % 2) * layer.spacing * 0.38;
        context.beginPath();
        context.moveTo(x, y);
        context.quadraticCurveTo(
          x + layer.length * 0.5,
          y - 7 - layerIndex * 2,
          x + layer.length,
          y,
        );
        context.stroke();
      }
    }
  });

  context.fillStyle = 'rgba(102, 222, 210, 0.035)';
  for (let index = 0; index < 18; index += 1) {
    const x = (index * 97 + seconds * 10) % (WORLD.width + 120) - 60;
    const y = (index * 53 + Math.sin(seconds + index) * 19) % WORLD.height;
    context.beginPath();
    context.ellipse(x, y, 45, 10, -0.2, 0, Math.PI * 2);
    context.fill();
  }

  if (storm) {
    context.strokeStyle = 'rgba(218, 242, 242, 0.24)';
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
  now: number,
  highlighted: boolean,
) => {
  const seconds = now / 1000;
  const bob = Math.sin(seconds * 2.7 + item.x * 0.021) * 2.8;
  context.save();
  context.translate(Math.round(item.x), Math.round(item.y + bob));
  context.rotate(Math.sin(seconds * 1.4 + item.y) * 0.08);
  context.fillStyle = 'rgba(1, 24, 31, 0.3)';
  context.beginPath();
  context.ellipse(2, 11, 19, 6, 0, 0, Math.PI * 2);
  context.fill();
  if (highlighted) {
    context.strokeStyle = 'rgba(248, 218, 112, 0.78)';
    context.lineWidth = 2;
    context.setLineDash([5, 4]);
    context.beginPath();
    context.ellipse(0, 0, 24, 19, 0, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);
  }

  if (item.type === 'wood') {
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
  context.restore();
};

const drawRaftBase = (
  context: CanvasRenderingContext2D,
  state: TideGameState,
  assets: LoadedTideAssets,
  now: number,
) => {
  const tile = WORLD.tileSize;
  const size = state.raft.size;
  const startX = WORLD.centerX - size * tile / 2;
  const startY = WORLD.centerY - size * tile / 2;
  const width = size * tile;
  const side = 10;

  context.fillStyle = 'rgba(0, 18, 24, 0.32)';
  context.beginPath();
  context.ellipse(
    startX + width / 2 + 8,
    startY + width / 2 + 14,
    width * 0.57,
    width * 0.52,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();

  context.fillStyle = '#3c2c25';
  context.beginPath();
  context.moveTo(startX + 4, startY + width);
  context.lineTo(startX + width, startY + width);
  context.lineTo(startX + width - 7, startY + width + side);
  context.lineTo(startX + 10, startY + width + side);
  context.closePath();
  context.fill();
  context.fillStyle = '#4f3828';
  context.beginPath();
  context.moveTo(startX + width, startY + 5);
  context.lineTo(startX + width, startY + width);
  context.lineTo(startX + width - 7, startY + width + side);
  context.lineTo(startX + width - 7, startY + 11);
  context.closePath();
  context.fill();

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const seed = row * 17 + column * 31 + state.world.seed;
      const nudgeX = ((seed % 3) - 1) * 2;
      const nudgeY = (((seed >> 2) % 3) - 1);
      const x = Math.round(startX + column * tile + nudgeX);
      const y = Math.round(startY + row * tile + nudgeY);
      const light = (row + column + seed) % 2 === 0;
      context.fillStyle = '#4d3125';
      roundedRect(context, x + 2, y + 3, tile - 3, tile - 2, 5);
      context.fill();
      context.fillStyle = light ? '#a86d3f' : '#95603a';
      roundedRect(context, x + 2, y + 1, tile - 5, tile - 6, 5);
      context.fill();

      if (assets.mode === 'reference' && assets.woodTile) {
        context.save();
        roundedRect(context, x + 3, y + 2, tile - 7, tile - 8, 4);
        context.clip();
        context.globalAlpha = 0.24;
        context.drawImage(assets.woodTile, 0, 0, 16, 16, x + 3, y + 2, tile - 7, tile - 8);
        context.restore();
      }

      context.strokeStyle = light ? '#d09a58' : '#bf8750';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x + 8, y + 11);
      context.quadraticCurveTo(x + tile * 0.55, y + 7, x + tile - 10, y + 12);
      context.moveTo(x + 10, y + tile - 14);
      context.lineTo(x + tile - 16, y + tile - 17);
      context.stroke();
      context.fillStyle = '#303435';
      context.beginPath();
      context.arc(x + 9, y + 9, 2.2, 0, Math.PI * 2);
      context.arc(x + tile - 12, y + tile - 12, 2.2, 0, Math.PI * 2);
      context.fill();
    }
  }

  if (state.raft.modules.reinforcedDeck) {
    context.strokeStyle = '#667579';
    context.lineWidth = 6;
    roundedRect(context, startX - 3, startY - 3, width + 6, width + 8, 5);
    context.stroke();
    context.strokeStyle = '#aeb9ad';
    context.lineWidth = 2;
    roundedRect(context, startX - 2, startY - 2, width + 4, width + 6, 4);
    context.stroke();
  }

  const foamPhase = now / 180;
  context.strokeStyle = 'rgba(214, 247, 235, 0.55)';
  context.lineWidth = 3;
  for (let index = 0; index < size * 2 + 2; index += 1) {
    const x = startX + 8 + (index * 43 + foamPhase) % Math.max(40, width - 16);
    context.beginPath();
    context.arc(x, startY + width + side + Math.sin(index + foamPhase) * 2, 7, Math.PI, Math.PI * 2);
    context.stroke();
  }

  return { startX, startY, width };
};

const drawNet = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
) => {
  context.save();
  context.strokeStyle = '#d7bf82';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x + 8, y);
  context.quadraticCurveTo(x + width / 2, y + 31, x + width - 8, y);
  context.stroke();
  for (let index = 14; index < width - 10; index += 18) {
    context.beginPath();
    context.moveTo(x + index, y + 2);
    context.lineTo(x + index + 12, y + 23);
    context.stroke();
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

const facilityEntities = (
  context: CanvasRenderingContext2D,
  state: TideGameState,
  bounds: { startX: number; startY: number; width: number },
  now: number,
) => {
  const { startX, startY, width } = bounds;
  const placements: Partial<Record<RaftModuleId, [number, number]>> = {
    purifier: [startX + 36, startY + 54],
    grill: [startX + width - 40, startY + 55],
    storage: [startX + 43, startY + width - 25],
    workshop: [startX + width * 0.5, startY + width * 0.55],
    garden: [startX + width - 43, startY + width - 24],
    sail: [startX + width * 0.73, startY + width * 0.54],
    radio: [startX + 37, startY + width * 0.52],
    beacon: [startX + width * 0.5, startY + 32],
  };
  const entities: SceneEntity[] = [];
  (Object.keys(placements) as RaftModuleId[]).forEach((moduleId) => {
    if (!state.raft.modules[moduleId]) return;
    const position = placements[moduleId];
    if (!position) return;
    entities.push({
      id: moduleId,
      depth: position[1] + (moduleId === 'sail' ? 4 : 0),
      draw: () => drawFacility(context, moduleId, position[0], position[1], now),
    });
  });
  return entities;
};

const atlasFrame = { down: 0, left: 1, right: 2, up: 3 } as const;

const drawFallbackDiver = (context: CanvasRenderingContext2D) => {
  context.fillStyle = '#182637';
  roundedRect(context, -18, -20, 36, 42, 12);
  context.fill();
  context.fillStyle = '#aa6034';
  context.beginPath();
  context.arc(0, -23, 18, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#0f6970';
  context.beginPath();
  context.arc(0, -22, 11, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#ddae50';
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = '#d66a32';
  context.fillRect(-18, -7, 7, 18);
  context.fillStyle = '#876329';
  context.fillRect(-15, 19, 12, 13);
  context.fillRect(3, 19, 12, 13);
};

const actionTarget = (visual: PlayerVisualState, x: number, y: number) => {
  if (visual.target) return visual.target;
  const offset = {
    up: [0, -100],
    down: [0, 100],
    left: [-100, 0],
    right: [100, 0],
  }[visual.direction];
  return { x: x + offset[0], y: y + offset[1] };
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
    const cast = visual.action === 'hookCast' ? Math.sin(progress * Math.PI * 0.85) : 1 - progress * 0.28;
    const endX = x + (target.x - x) * cast;
    const endY = y + (target.y - y) * cast;
    context.save();
    context.strokeStyle = '#d7c28a';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x + (visual.direction === 'left' ? -18 : 18), y - 14);
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
  if (visual.action === 'fishCast' || visual.action === 'fishReel') {
    const cast = visual.action === 'fishCast' ? Math.sin(progress * Math.PI * 0.75) : 1 - progress * 0.45;
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
};

const drawDiver = (
  context: CanvasRenderingContext2D,
  state: TideGameState,
  visual: PlayerVisualState,
  assets: LoadedTideAssets,
  now: number,
  walking: boolean,
) => {
  const x = state.player.x;
  const y = state.player.y;
  const actionProgress = getActionProgress(visual, now);
  const walkPhase = now / 105;
  const idleBob = Math.sin(now / 420) * 1.2;
  const walkBob = walking ? Math.abs(Math.sin(walkPhase)) * -2.2 : 0;
  const actionLean = visual.action === 'hookCast'
    ? Math.sin(actionProgress * Math.PI) * (visual.direction === 'left' ? -0.08 : 0.08)
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

  if (assets.diver) {
    const sourceX = atlasFrame[visual.direction] * 64;
    const stride = walking ? Math.sin(walkPhase) * 1.8 : 0;
    context.save();
    context.translate(stride, 0);
    if (visual.action === 'consume') {
      context.translate(0, -Math.sin(actionProgress * Math.PI) * 3);
    }
    context.drawImage(assets.diver, sourceX, 0, 64, 64, -32, -37, 64, 64);
    context.restore();
  } else {
    drawFallbackDiver(context);
  }

  if (walking) {
    context.fillStyle = '#d5a84c';
    const footOffset = Math.sin(walkPhase) * 3;
    context.fillRect(-15, 24 + footOffset, 12, 4);
    context.fillRect(3, 24 - footOffset, 12, 4);
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
  const target = actionTarget(visual, state.player.x, state.player.y);
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
          emitParticles(memory, 'spark', state.player.x + 24, state.player.y + 10, now, 8)
        ));
      }
    });
  }
  if (visual.action === 'consume' && progress > 0.48) {
    markOnce(memory, token + '-bubble', () => (
      emitParticles(memory, 'bubble', state.player.x + 13, state.player.y - 28, now, 7)
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
      emitParticles(memory, kind, effect.x, effect.y, now, 10);
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
    const x = effect.x + (targetX - effect.x) * progress;
    const y = effect.y + (targetY - effect.y) * progress - Math.sin(progress * Math.PI) * 90;
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
    context.fillStyle = 'rgba(2, 12, 35, ' + (night * 0.58) + ')';
    context.fillRect(0, 0, WORLD.width, WORLD.height);
    const lamp = context.createRadialGradient(
      state.player.x,
      state.player.y,
      18,
      state.player.x,
      state.player.y,
      125,
    );
    lamp.addColorStop(0, 'rgba(241, 198, 86, 0.17)');
    lamp.addColorStop(1, 'rgba(241, 198, 86, 0)');
    context.globalCompositeOperation = 'screen';
    context.fillStyle = lamp;
    context.fillRect(0, 0, WORLD.width, WORLD.height);
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
  now: number,
  memory: TideRendererMemory,
) => {
  context.clearRect(0, 0, WORLD.width, WORLD.height);
  drawOcean(context, state, now);

  const nearestId = getNearestCollectableId(state);
  state.debris.forEach((item) => drawDebris(context, item, now, item.id === nearestId));

  const bounds = drawRaftBase(context, state, assets, now);
  if (state.raft.modules.net) {
    drawNet(context, bounds.startX, bounds.startY + bounds.width + 6, bounds.width);
  }

  const moved = Math.hypot(
    state.player.x - memory.lastPlayerX,
    state.player.y - memory.lastPlayerY,
  ) > 0.2;
  if (moved) {
    memory.lastMovedAt = now;
    memory.lastPlayerX = state.player.x;
    memory.lastPlayerY = state.player.y;
  }
  const walking = visual.action === 'walk'
    || (visual.action === 'idle' && now - memory.lastMovedAt < 170);

  const entities = facilityEntities(context, state, bounds, now);
  entities.push({
    id: 'player',
    depth: state.player.y + 28,
    draw: () => drawDiver(context, state, visual, assets, now, walking),
  });
  entities.sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
  entities.forEach((entity) => entity.draw());

  syncActionParticles(memory, visual, state, now);
  syncExternalEffects(memory, effects, now);
  drawParticles(context, memory, effects, now);
  drawLighting(context, state);
};
