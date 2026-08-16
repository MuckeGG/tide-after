import { describe, expect, it } from 'vitest';
import { createInitialGame, resolveFishing } from './game';
import { getPrimaryAction } from './guidance';

describe('单一当前目标', () => {
  it('首局先要求移动，再引导打捞', () => {
    const state = createInitialGame('guide-test', 42);
    expect(getPrimaryAction(state).kind).toBe('move');
    state.progress.stats.distanceMoved = 20;
    expect(['collect', 'fish']).toContain(getPrimaryAction(state).kind);
  });

  it('低口渴且有水时优先补水', () => {
    const state = createInitialGame('guide-water', 42);
    state.progress.stats.distanceMoved = 40;
    state.player.thirst = 20;
    state.inventory.water = 1;
    const guidance = getPrimaryAction(state);
    expect(guidance.kind).toBe('consume');
    expect(guidance.title).toContain('淡水');
  });

  it('甲板材料齐全时把首次扩建设为主目标', () => {
    const state = createInitialGame('guide-build', 42);
    state.progress.stats.distanceMoved = 40;
    state.progress.stats.collected = 3;
    state.progress.stats.fishCaught = 1;
    state.inventory.wood = 8;
    state.inventory.plastic = 6;
    const guidance = getPrimaryAction(state);
    expect(guidance.kind).toBe('build');
    expect(guidance.title).toContain('3×3');
  });
});

describe('钓鱼三级结果', () => {
  it('中心亮区触发完美收线并至少获得两条鱼', () => {
    const state = createInitialGame('perfect-fish', 19);
    state.fishing.active = true;
    state.fishing.targetStart = 30;
    state.fishing.targetWidth = 30;
    state.fishing.marker = 45;
    const result = resolveFishing(state);
    expect(result.inventory.fish).toBeGreaterThanOrEqual(2);
    expect(result.notices.some((notice) => notice.text.includes('完美收线'))).toBe(true);
  });
});
