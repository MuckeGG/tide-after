import { RESOURCE_LABELS, UPGRADES, WORLD } from './config';
import { canAfford, getNearestCollectableId } from './game';
import type { ResourceId, TideGameState } from './types';

export type PrimaryActionKind =
  | 'move'
  | 'collect'
  | 'fish'
  | 'consume'
  | 'build'
  | 'repair'
  | 'explore';

export interface GuidanceState {
  kind: PrimaryActionKind;
  eyebrow: string;
  title: string;
  detail: string;
  progress?: string;
}

const missingForDeck = (state: TideGameState) => {
  const deck = UPGRADES.find((upgrade) => upgrade.id === 'deck');
  if (!deck) return '';
  return (Object.entries(deck.cost) as [ResourceId, number][])
    .filter(([resource, amount]) => state.inventory[resource] < amount)
    .map(([resource, amount]) => RESOURCE_LABELS[resource] + ' ' + (amount - state.inventory[resource]))
    .join('、');
};

export const getPrimaryAction = (state: TideGameState): GuidanceState => {
  if (state.raft.integrity < 42 && state.inventory.wood >= 2) {
    return {
      kind: 'repair',
      eyebrow: '船体告急',
      title: '先修补木筏',
      detail: '风浪会继续消耗结构，使用扳手完成一次维修。',
      progress: Math.round(state.raft.integrity) + '%',
    };
  }
  if (state.player.thirst < 44 && state.inventory.water > 0) {
    return {
      kind: 'consume',
      eyebrow: '当前最重要',
      title: '喝一份淡水',
      detail: '口渴比饥饿下降更快，先稳住生存状态。',
      progress: Math.round(state.player.thirst) + '%',
    };
  }
  if (state.player.hunger < 42 && (state.inventory.meal > 0 || state.inventory.fish > 0)) {
    return {
      kind: 'consume',
      eyebrow: '当前最重要',
      title: state.inventory.meal > 0 ? '吃一份热食' : '吃一条鲜鱼',
      detail: '补足饱食度再继续远离木筏中心。',
      progress: Math.round(state.player.hunger) + '%',
    };
  }
  if (state.progress.stats.distanceMoved < 16) {
    return {
      kind: 'move',
      eyebrow: '第一步',
      title: '走到木筏边缘',
      detail: '按住 WASD、方向键或触控方向盘连续移动。',
      progress: Math.round(state.progress.stats.distanceMoved) + ' / 16',
    };
  }
  const nearestId = getNearestCollectableId(state);
  if (nearestId && state.progress.stats.collected < 2) {
    return {
      kind: 'collect',
      eyebrow: '30 秒目标',
      title: '打捞发光漂浮物',
      detail: '按 E、点击目标或使用右下动作按钮。',
      progress: state.progress.stats.collected + ' / 2',
    };
  }
  if (state.progress.stats.fishCaught < 1) {
    return {
      kind: 'fish',
      eyebrow: '90 秒目标',
      title: state.fishing.active ? '浮标进亮区时收线' : '抛出第一竿',
      detail: state.fishing.active ? '中心小区域会获得“完美收线”奖励。' : '按空格或上下文动作按钮开始钓鱼。',
      progress: state.progress.stats.fishCaught + ' / 1',
    };
  }
  if (!state.raft.modules.deck) {
    if (canAfford(state, UPGRADES[0].cost)) {
      return {
        kind: 'build',
        eyebrow: '5 分钟目标',
        title: '把甲板扩建为 3×3',
        detail: '材料已齐，打开建造抽屉并敲下三锤。',
      };
    }
    const missing = missingForDeck(state);
    return {
      kind: nearestId ? 'collect' : 'move',
      eyebrow: '5 分钟目标',
      title: '为扩建甲板收集材料',
      detail: missing ? '还缺：' + missing + '。' : '沿木筏边缘寻找漂浮物。',
    };
  }
  if (state.raft.integrity < 75) {
    return {
      kind: 'repair',
      eyebrow: '出发前准备',
      title: '修复受损船体',
      detail: '保持结构在 75% 以上，再选择高风险航线。',
      progress: Math.round(state.raft.integrity) + '%',
    };
  }
  const distanceFromCenter = Math.round(Math.hypot(
    state.player.x - WORLD.centerX,
    state.player.y - WORLD.centerY,
  ));
  return {
    kind: nearestId ? 'collect' : 'explore',
    eyebrow: '当前航程',
    title: nearestId ? '继续打捞并推进自动化' : '观察下一批海流',
    detail: '建造净水、收集网或三角帆，让每次风险选择产生长期收益。',
    progress: '离中心 ' + distanceFromCenter,
  };
};
