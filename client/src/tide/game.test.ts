import { describe, expect, it } from 'vitest';
import {
  attackEnemy,
  buildModule,
  collectNearby,
  consumeResource,
  createInitialGame,
  getContractProgress,
  movePlayer,
  repairRaft,
  resolveFishing,
  resolveOceanEvent,
  restartGame,
  selectEquipment,
  setRoute,
  startFishing,
  tickGame,
  upgradePerk,
} from './game';
import { migrateSave } from './persistence';
import { COMBAT, SPAWNING, WORLD } from './config';
import { projectedDistance, projectWorldVector } from './visual/projection';
import type { RaftModuleId, ResourceId, TideGameState } from './types';

const fund = (state: TideGameState, quantity = 999) => {
  (Object.keys(state.inventory) as ResourceId[]).forEach((resource) => {
    state.inventory[resource] = quantity;
  });
  state.progress.level = 12;
  state.progress.signalFragments = 4;
  return state;
};

const buildSequence = (state: TideGameState, modules: RaftModuleId[]) =>
  modules.reduce((current, module) => buildModule(current, module).state, state);

describe('Tide After game engine', () => {
  it('creates the generous v2 starting state', () => {
    const state = createInitialGame('guest-test', 42);
    expect(state.schemaVersion).toBe(2);
    expect(state.raft).toMatchObject({ size: 2, integrity: 100 });
    expect(state.player).toMatchObject({ health: 100, hunger: 100, thirst: 100 });
    expect(state.inventory).toEqual({
      wood: 4, plastic: 3, scrap: 1, fiber: 0,
      fish: 0, meal: 0, water: 0, parts: 0,
    });
    expect(state.debris).toHaveLength(8);
    expect(state.equipment.selected).toBe('cutlass');
    expect(state.enemies).toEqual([]);
    expect(state.progress.tutorial.step).toBe(0);
  });

  it('starts with four reachable items and enforces the active debris cap', () => {
    const state = createInitialGame('guest-debris-cap', 42);
    expect(state.debris.slice(0, 4).every((item) => (
      projectedDistance(item, state.player) <= WORLD.collectRange
    ))).toBe(true);

    const template = state.debris[0];
    state.debris = Array.from({ length: SPAWNING.maxDebrisCount }, (_, index) => ({
      ...template,
      id: `cap-${index}`,
      x: WORLD.centerX - 200 + index * 8,
      y: WORLD.centerY - 120,
      ttl: SPAWNING.debrisLifetimeSeconds,
    }));
    state.world.nextDebrisAt = 0;
    expect(tickGame(state, 0.1).debris).toHaveLength(SPAWNING.maxDebrisCount);
  });

  it('keeps debris moving while it slips around the raft edge', () => {
    const state = createInitialGame('guest-slip', 91);
    state.debris = [{
      ...state.debris[0],
      id: 'edge-slip',
      x: WORLD.centerX + 70,
      y: WORLD.centerY,
      vx: 0,
      vy: 0,
      ttl: SPAWNING.debrisLifetimeSeconds,
    }];
    const moved = tickGame(state, 0.25).debris[0];
    const screenVelocity = projectWorldVector(moved.vx, moved.vy);
    expect(Math.hypot(screenVelocity.x, screenVelocity.y)).toBeGreaterThanOrEqual(16);
    expect(projectedDistance(moved, state.debris[0])).toBeGreaterThan(0);
  });

  it('drains survival meters and damages health only after a meter is empty', () => {
    const state = createInitialGame('guest-test', 42);
    const next = tickGame(state, 1);
    expect(next.player.hunger).toBeLessThan(100);
    expect(next.player.thirst).toBeLessThan(100);
    expect(next.player.health).toBe(100);
    next.player.hunger = 0;
    expect(tickGame(next, 1).player.health).toBeLessThan(100);
  });

  it('rewards the first tutorial step after moving', () => {
    const state = createInitialGame('guest-test', 42);
    const moved = movePlayer(state, 1, 0, 0.2);
    expect(moved.progress.tutorial.step).toBe(1);
    expect(moved.inventory.wood).toBe(6);
    expect(moved.progress.xp).toBeGreaterThan(0);
  });

  it('collects a floating item only once', () => {
    const state = createInitialGame('guest-test', 42);
    const target = state.debris[0];
    target.type = 'wood';
    target.x = state.player.x;
    target.y = state.player.y;
    const before = state.inventory.wood;
    const collected = collectNearby(state, target.id);
    const collectedAgain = collectNearby(collected, target.id);
    expect(collected.inventory.wood).toBe(before + 1);
    expect(collectedAgain.inventory.wood).toBe(before + 1);
    expect(collectedAgain.debris.some((item) => item.id === target.id)).toBe(false);
  });

  it('awards a chain bonus every five hook salvages', () => {
    let state = createInitialGame('guest-test', 42);
    state.progress.tutorial.completed = true;
    state.debris = state.debris.slice(0, 5).map((item, index) => ({
      ...item,
      id: `chain-${index}`,
      type: 'wood',
      x: state.player.x,
      y: state.player.y,
    }));
    for (const item of [...state.debris]) state = collectNearby(state, item.id);
    expect(state.progress.combo).toBe(5);
    expect(state.inventory.plastic).toBe(5);
    expect(state.inventory.fiber).toBe(1);
  });

  it('rewards a successful fishing timing check and advances its tutorial', () => {
    const base = createInitialGame('guest-test', 42);
    base.progress.tutorial.step = 2;
    const state = startFishing(base);
    state.fishing.marker = state.fishing.targetStart + 2;
    const resolved = resolveFishing(state);
    expect(resolved.fishing.active).toBe(false);
    expect(resolved.inventory.fish).toBeGreaterThanOrEqual(1);
    expect(resolved.inventory.water).toBe(2);
    expect(resolved.progress.tutorial.step).toBe(3);
  });

  it('supports raw fish, cooked meals and drinking water', () => {
    const state = createInitialGame('guest-test', 42);
    state.player.health = 80;
    state.player.hunger = 20;
    state.player.thirst = 20;
    state.inventory.fish = 1;
    state.inventory.meal = 1;
    state.inventory.water = 1;
    const ateFish = consumeResource(state, 'fish');
    const ateMeal = consumeResource(ateFish, 'meal');
    const drank = consumeResource(ateMeal, 'water');
    expect(drank.player.hunger).toBeGreaterThan(70);
    expect(drank.player.health).toBe(87);
    expect(drank.player.thirst).toBe(52);
    expect(drank.progress.stats.consumed).toBe(3);
  });

  it('blocks invalid upgrades and supports the full dependency chain', () => {
    const poor = createInitialGame('guest-test', 42);
    expect(buildModule(poor, 'deck').ok).toBe(false);
    expect(buildModule(poor, 'workshop').ok).toBe(false);

    const funded = fund(createInitialGame('guest-test', 42));
    const complete = buildSequence(funded, [
      'deck', 'net', 'purifier', 'grill', 'storage', 'reinforcedDeck',
      'workshop', 'sail', 'garden', 'radio', 'beacon',
    ]);
    expect(complete.raft.size).toBe(4);
    expect(complete.raft.modules.beacon).toBe(true);
    expect(complete.progress.stats.built).toBe(11);
  });

  it('repairs structural damage using wood and improves with hull research', () => {
    const state = createInitialGame('guest-test', 42);
    state.raft.integrity = 40;
    state.inventory.wood = 4;
    state.progress.perks.hull = 2;
    const repaired = repairRaft(state);
    expect(repaired.raft.integrity).toBe(74);
    expect(repaired.inventory.wood).toBe(2);
    expect(repaired.progress.stats.repaired).toBe(1);
  });

  it('spends increasing tech points to improve perks', () => {
    let state = createInitialGame('guest-test', 42);
    state.progress.techPoints = 3;
    state = upgradePerk(state, 'hook');
    state = upgradePerk(state, 'hook');
    expect(state.progress.perks.hook).toBe(2);
    expect(state.progress.techPoints).toBe(0);
  });

  it('locks route choice until a sail exists', () => {
    const state = createInitialGame('guest-test', 42);
    expect(setRoute(state, 'fishing').world.route).toBe('salvage');
    state.raft.modules.sail = true;
    expect(setRoute(state, 'safe').world.route).toBe('safe');
  });

  it('automates water, cooking, gardening and net collection', () => {
    const state = createInitialGame('guest-test', 42);
    state.progress.tutorial.completed = true;
    state.raft.modules.net = true;
    state.raft.modules.purifier = true;
    state.raft.modules.grill = true;
    state.raft.modules.garden = true;
    state.inventory.fish = 1;
    state.world.nextNetAt = 0;
    state.world.nextWaterAt = 0;
    state.world.nextCookAt = 0;
    state.world.nextGardenAt = 0;
    const debrisBefore = state.debris.length;
    const next = tickGame(state, 0.5);
    expect(next.inventory.water).toBe(1);
    expect(next.inventory.meal).toBe(2);
    expect(next.inventory.fish).toBe(0);
    expect(next.debris.length).toBeLessThan(debrisBefore);
  });

  it('resolves risk-reward ocean events exactly once', () => {
    const state = createInitialGame('guest-test', 42);
    state.event = { id: 'event-test', kind: 'supply', createdAt: 0, expiresAt: 30 };
    const resolved = resolveOceanEvent(state, 'deep');
    const resolvedAgain = resolveOceanEvent(resolved, 'deep');
    expect(resolved.player.health).toBe(92);
    expect(resolved.inventory.parts).toBe(2);
    expect(resolved.progress.stats.events).toBe(1);
    expect(resolvedAgain.progress.stats.events).toBe(1);
  });

  it('completes a daily contract without duplicate rewards', () => {
    const state = createInitialGame('guest-test', 42);
    state.progress.tutorial.completed = true;
    state.progress.contract = {
      id: 'contract-test', day: 1, title: '测试合约', description: '打捞一次',
      objective: 'collect', baseline: 0, target: 1, reward: { parts: 2 }, xp: 10, completed: false,
    };
    const target = state.debris[0];
    target.type = 'wood';
    target.x = state.player.x;
    target.y = state.player.y;
    const completed = collectNearby(state, target.id);
    expect(completed.progress.contract.completed).toBe(true);
    expect(completed.inventory.parts).toBe(2);
    expect(getContractProgress(completed)).toBe(1);
    expect(tickGame(completed, 0.1).inventory.parts).toBe(2);
  });

  it('does not apply storm damage during the generous first two days', () => {
    const state = createInitialGame('guest-test', 9);
    state.world.elapsedSeconds = 149;
    state.world.nextStormHitAt = 0;
    state.raft.integrity = 100;
    const next = tickGame(state, 1);
    expect(next.world.day).toBe(2);
    expect(next.raft.integrity).toBe(100);
  });

  it('keeps the first night safe and begins enemy threats on the second night', () => {
    const firstNight = createInitialGame('guest-safe-night', 18);
    firstNight.world.elapsedSeconds = 70;
    firstNight.world.nextEnemyAt = 0;
    expect(tickGame(firstNight, 0.5).enemies).toHaveLength(0);

    const secondNight = createInitialGame('guest-hostile-night', 18);
    secondNight.world.elapsedSeconds = 219;
    secondNight.world.nextEnemyAt = 0;
    const threatened = tickGame(secondNight, 0.5);
    expect(threatened.world.day).toBe(2);
    expect(threatened.enemies).toHaveLength(1);
    expect(threatened.enemies[0].phase).toBe('swimming');
  });

  it('caps enemies and removes swimmers after dawn while deck enemies remain', () => {
    const state = createInitialGame('guest-enemy-cap', 31);
    state.world.elapsedSeconds = 219;
    state.world.nextEnemyAt = 0;
    state.enemies = Array.from({ length: COMBAT.maxEnemies }, (_, index) => ({
      id: `enemy-${index}`,
      type: 'tideCrab' as const,
      phase: index === 0 ? 'deck' as const : 'swimming' as const,
      x: WORLD.centerX + 30 + index,
      y: WORLD.centerY,
      targetX: WORLD.centerX,
      targetY: WORLD.centerY,
      health: COMBAT.tideCrabHealth,
      maxHealth: COMBAT.tideCrabHealth,
      spawnedAt: 0,
      phaseEndsAt: 0,
      nextAttackAt: 999,
    }));
    expect(tickGame(state, 0.2).enemies).toHaveLength(COMBAT.maxEnemies);
    state.world.elapsedSeconds = 285;
    state.world.timeOfDay = 0.13;
    const dawn = tickGame(state, 0.2);
    expect(dawn.enemies).toHaveLength(1);
    expect(dawn.enemies[0].phase).toBe('deck');
  });

  it('switches equipment and applies one sword hit per cooldown with a single drop', () => {
    let state = createInitialGame('guest-combat', 42);
    state = selectEquipment(state, 'salvageTool');
    expect(state.equipment.selected).toBe('salvageTool');
    state = selectEquipment(state, 'cutlass');
    state.enemies = [{
      id: 'crab-target', type: 'tideCrab', phase: 'deck',
      x: state.player.x + 20, y: state.player.y,
      targetX: state.player.x, targetY: state.player.y,
      health: COMBAT.tideCrabHealth, maxHealth: COMBAT.tideCrabHealth,
      spawnedAt: 0, phaseEndsAt: 0, nextAttackAt: 999,
    }];
    const first = attackEnemy(state, 'crab-target');
    expect(first.enemies[0].health).toBe(COMBAT.tideCrabHealth - COMBAT.cutlassDamage);
    expect(attackEnemy(first, 'crab-target').enemies[0].health).toBe(first.enemies[0].health);
    first.world.elapsedSeconds = first.equipment.nextAttackAt + 0.01;
    const defeated = attackEnemy(first, 'crab-target');
    expect(defeated.enemies).toHaveLength(0);
    expect(defeated.progress.stats.enemiesDefeated).toBe(1);
    expect(defeated.inventory.scrap).toBe(state.inventory.scrap + 1);
    expect(defeated.inventory.fiber + defeated.inventory.parts).toBe(1);
    expect(attackEnemy(defeated, 'crab-target').progress.stats.enemiesDefeated).toBe(1);
  });

  it('unlocks endless voyage after day twelve with the beacon', () => {
    const state = createInitialGame('guest-test', 42);
    state.raft.modules.beacon = true;
    state.world.elapsedSeconds = 11 * 150;
    state.player.hunger = 100;
    state.player.thirst = 100;
    const next = tickGame(state, 0.1);
    expect(next.world.day).toBe(12);
    expect(next.progress.endlessUnlocked).toBe(true);
    expect(next.progress.completedChapters).toContain('beyond');
  });

  it('keeps the guest identity but changes the run when restarting', () => {
    const state = createInitialGame('guest-test', 42);
    const restarted = restartGame(state);
    expect(restarted.guestId).toBe(state.guestId);
    expect(restarted.runId).not.toBe(state.runId);
    expect(restarted.world.seed).toBe(139);
    expect(restarted.progress.level).toBe(1);
  });

  it('migrates v1 saves without losing identity, raft or inventory', () => {
    const legacy = {
      schemaVersion: 1,
      guestId: 'guest-legacy', runId: 'run-legacy', createdAt: 1, updatedAt: 2,
      player: { x: 470, y: 260, health: 72, hunger: 55, thirst: 44, facing: 'left' },
      inventory: { wood: 21, plastic: 9, scrap: 4, fish: 2, water: 3 },
      raft: { size: 3, modules: { deck: true, net: true, purifier: false } },
      world: { seed: 77, elapsedSeconds: 80, day: 1, timeOfDay: .6, weather: 'cloudy', nextDebrisAt: 90, nextNetAt: 99, nextWaterAt: 100 },
      debris: [], fishing: { active: false, marker: 0, direction: 1, targetStart: 40, targetWidth: 20 },
      rngStep: 4, notices: [], gameOver: false,
    };
    const migrated = migrateSave(legacy, 'fallback');
    expect(migrated?.schemaVersion).toBe(2);
    expect(migrated?.guestId).toBe('guest-legacy');
    expect(migrated?.runId).toBe('run-legacy');
    expect(migrated?.inventory).toMatchObject({ wood: 21, fish: 2, fiber: 0, meal: 0, parts: 0 });
    expect(migrated?.raft).toMatchObject({ size: 3, integrity: 100 });
    expect(migrated?.raft.modules.net).toBe(true);
  });

  it('normalizes older v2 saves that predate equipment and enemies', () => {
    const current = createInitialGame('guest-old-v2', 72);
    const old = structuredClone(current) as unknown as {
      equipment?: TideGameState['equipment'];
      enemies?: TideGameState['enemies'];
      world: Partial<TideGameState['world']>;
      progress: Omit<TideGameState['progress'], 'stats'> & {
        stats: Partial<TideGameState['progress']['stats']>;
      };
    };
    delete old.equipment;
    delete old.enemies;
    delete old.world.nextEnemyAt;
    delete old.progress.stats.enemiesDefeated;
    const migrated = migrateSave(old, 'fallback');
    expect(migrated?.equipment.selected).toBe('cutlass');
    expect(migrated?.enemies).toEqual([]);
    expect(migrated?.progress.stats.enemiesDefeated).toBe(0);
    expect(migrated?.world.nextEnemyAt).toBeGreaterThan(migrated?.world.elapsedSeconds ?? 0);
  });

  it('survives a deterministic twelve-day simulation without invalid state', () => {
    let state = createInitialGame('guest-long-run', 20260816);
    state.progress.tutorial.completed = true;
    state.raft.modules.net = true;
    state.raft.modules.purifier = true;
    state.raft.modules.grill = true;
    state.raft.modules.garden = true;
    for (let index = 0; index < 3_605; index += 1) {
      state.player.health = 100;
      state.player.hunger = 100;
      state.player.thirst = 100;
      state.raft.integrity = 100;
      state.enemies = [];
      state = tickGame(state, 0.5);
      if (state.event) state = resolveOceanEvent(state, state.event.kind === 'supply' ? 'safe' : 'ignore');
    }
    expect(state.world.day).toBeGreaterThanOrEqual(12);
    expect(state.gameOver).toBe(false);
    expect(state.debris.length).toBeLessThan(100);
    expect(Object.values(state.inventory).every(Number.isFinite)).toBe(true);
    expect([state.player.health, state.player.hunger, state.player.thirst, state.raft.integrity].every((value) => value >= 0 && value <= 100)).toBe(true);
  });
});
