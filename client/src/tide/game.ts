import {
  ACHIEVEMENTS,
  CHAPTERS,
  PERKS,
  RESOURCE_LABELS,
  SPAWNING,
  STARTING_INVENTORY,
  SURVIVAL,
  TUTORIAL_STEPS,
  UPGRADES,
  WORLD,
} from './config';
import type {
  BuildResult,
  ConsumableId,
  ContractObjective,
  DailyContract,
  DebrisItem,
  EventKind,
  GameNotice,
  OceanEvent,
  PerkId,
  RaftModuleId,
  ResourceId,
  RouteMode,
  TideGameState,
  Weather,
} from './types';

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const makeId = (prefix: string) => {
  const randomId = globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomId}`;
};

const randomAt = (seed: number, step: number) => {
  let value = (seed + step * 0x6d2b79f5) | 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
};

const cloneState = (state: TideGameState): TideGameState => ({
  ...state,
  player: { ...state.player },
  inventory: { ...state.inventory },
  raft: { ...state.raft, modules: { ...state.raft.modules } },
  world: { ...state.world },
  progress: {
    ...state.progress,
    perks: { ...state.progress.perks },
    achievements: [...state.progress.achievements],
    completedChapters: [...state.progress.completedChapters],
    tutorial: { ...state.progress.tutorial },
    contract: { ...state.progress.contract, reward: { ...state.progress.contract.reward } },
    stats: { ...state.progress.stats },
  },
  debris: state.debris.map((item) => ({ ...item })),
  fishing: { ...state.fishing },
  event: state.event ? { ...state.event } : null,
  notices: [...state.notices],
});

const takeRandom = (state: TideGameState) => {
  const value = randomAt(state.world.seed, state.rngStep);
  state.rngStep += 1;
  return value;
};

const addNotice = (
  state: TideGameState,
  text: string,
  tone: GameNotice['tone'] = 'info',
) => {
  state.notices = [
    ...state.notices.slice(-3),
    { id: makeId('notice'), text, tone },
  ];
};

const addResources = (
  state: TideGameState,
  rewards: Partial<Record<ResourceId, number>>,
) => {
  for (const [resource, amount] of Object.entries(rewards) as [ResourceId, number][]) {
    state.inventory[resource] += amount;
  }
};

export const getXpToNext = (level: number) => 50 + (level - 1) * 35;

const awardXp = (state: TideGameState, amount: number) => {
  state.progress.xp += amount;
  state.progress.score += amount * 3;
  let needed = getXpToNext(state.progress.level);
  while (state.progress.xp >= needed) {
    state.progress.xp -= needed;
    state.progress.level += 1;
    state.progress.techPoints += 1;
    addNotice(state, `漂流等级提升至 ${state.progress.level}，获得科技点 +1。`, 'good');
    needed = getXpToNext(state.progress.level);
  }
};

const pickDebrisType = (roll: number, day: number): DebrisItem['type'] => {
  if (roll < 0.39) return 'wood';
  if (roll < 0.68) return 'plastic';
  if (roll < 0.84) return 'fiber';
  if (roll < (day >= 3 ? 0.94 : 0.97)) return 'scrap';
  return 'crate';
};

const spawnDebris = (state: TideGameState, nearby = false, forcedType?: DebrisItem['type']) => {
  const angle = takeRandom(state) * Math.PI * 2;
  const radius = nearby ? 112 + takeRandom(state) * 120 : 350 + takeRandom(state) * 190;
  const speed = 5 + takeRandom(state) * 8;
  const tangent = (takeRandom(state) - 0.5) * 4;
  const type = forcedType ?? pickDebrisType(takeRandom(state), state.world.day);
  const x = WORLD.centerX + Math.cos(angle) * radius;
  const y = WORLD.centerY + Math.sin(angle) * radius * 0.72;

  state.debris.push({
    id: makeId(type),
    type,
    x,
    y,
    vx: -Math.cos(angle) * speed + tangent,
    vy: -Math.sin(angle) * speed * 0.42 + tangent * 0.2,
    ttl: SPAWNING.debrisLifetimeSeconds,
  });
};

const weatherFor = (seed: number, elapsedSeconds: number): Weather => {
  const block = Math.floor(elapsedSeconds / 42);
  const roll = randomAt(seed ^ 0x51f15e, block);
  if (roll < 0.56) return 'clear';
  if (roll < 0.86) return 'cloudy';
  if (elapsedSeconds < WORLD.dayDurationSeconds * 2) return 'cloudy';
  return 'storm';
};

const statValue = (state: TideGameState, objective: ContractObjective) => {
  const stats = state.progress.stats;
  if (objective === 'collect') return stats.collected;
  if (objective === 'fish') return stats.fishCaught;
  if (objective === 'build') return stats.built;
  if (objective === 'repair') return stats.repaired;
  return stats.survivedSeconds;
};

const createContract = (state: TideGameState, day: number): DailyContract => {
  const objectives: ContractObjective[] = ['collect', 'fish', 'survive', 'collect', 'repair'];
  const objective = day === 1 ? 'collect' : objectives[(day + state.world.seed) % objectives.length];
  const target = objective === 'collect'
    ? 5 + Math.min(day, 7)
    : objective === 'fish'
      ? 2 + Math.floor(day / 4)
      : objective === 'survive'
        ? 70
        : objective === 'repair'
          ? 1
          : 1;
  const labels: Record<ContractObjective, [string, string]> = {
    collect: ['清理漂流带', `再打捞 ${target} 件海上残骸。`],
    fish: ['补充蛋白质', `钓起 ${target} 条鱼。`],
    build: ['继续扩建', '完成一项新的木筏设施。'],
    survive: ['守住今天', '继续生存 70 秒。'],
    repair: ['维护船体', '完成一次木筏修理。'],
  };
  return {
    id: `contract-${day}-${objective}`,
    day,
    title: labels[objective][0],
    description: labels[objective][1],
    objective,
    baseline: statValue(state, objective),
    target,
    reward: day % 3 === 0 ? { parts: 1, scrap: 2 } : { wood: 2, plastic: 2, fiber: 1 },
    xp: 30 + day * 2,
    completed: false,
  };
};

export const getContractProgress = (state: TideGameState) => {
  const contract = state.progress.contract;
  return clamp(statValue(state, contract.objective) - contract.baseline, 0, contract.target);
};

const updateContract = (state: TideGameState) => {
  const contract = state.progress.contract;
  if (contract.completed || getContractProgress(state) < contract.target) return;
  contract.completed = true;
  addResources(state, contract.reward);
  awardXp(state, contract.xp);
  addNotice(state, `每日合约完成：${contract.title}。奖励已入箱。`, 'good');
};

const tutorialConditionMet = (state: TideGameState, step: number) => {
  if (step === 0) return state.progress.stats.distanceMoved >= 18;
  if (step === 1) return state.progress.stats.collected >= 2;
  if (step === 2) return state.progress.stats.fishCaught >= 1;
  if (step === 3) return state.progress.stats.consumed >= 1;
  if (step === 4) return state.raft.modules.deck;
  if (step === 5) return state.raft.modules.net || state.raft.modules.purifier;
  return false;
};

const updateTutorial = (state: TideGameState) => {
  const tutorial = state.progress.tutorial;
  if (tutorial.completed || !tutorialConditionMet(state, tutorial.step)) return;
  const completedStep = tutorial.step;
  if (completedStep === 0) addResources(state, { wood: 2 });
  if (completedStep === 1) addResources(state, { plastic: 2, fiber: 1 });
  if (completedStep === 2) addResources(state, { water: 2 });
  if (completedStep === 3) addResources(state, { scrap: 2 });
  if (completedStep === 4) addResources(state, { wood: 4, plastic: 4 });
  if (completedStep === 5) state.progress.techPoints += 1;
  tutorial.step += 1;
  awardXp(state, 18 + completedStep * 3);
  addNotice(state, `引导完成：${TUTORIAL_STEPS[completedStep].title}。${TUTORIAL_STEPS[completedStep].reward}`, 'good');
  if (tutorial.step >= TUTORIAL_STEPS.length) {
    tutorial.completed = true;
    state.progress.score += 500;
    addNotice(state, '新手航程完成。接下来，决定你自己的远航方式。', 'good');
  }
};

const achievementMet = (state: TideGameState, id: string) => {
  if (id === 'first-haul') return state.progress.stats.collected >= 1;
  if (id === 'first-catch') return state.progress.stats.fishCaught >= 1;
  if (id === 'combo-five') return state.progress.combo >= 5;
  if (id === 'day-three') return state.world.day >= 3;
  if (id === 'level-five') return state.progress.level >= 5;
  if (id === 'automation') return state.raft.modules.net && state.raft.modules.purifier && state.raft.modules.grill;
  if (id === 'big-raft') return state.raft.size >= 4;
  if (id === 'signal-four') return state.progress.signalFragments >= 4;
  if (id === 'beacon') return state.raft.modules.beacon;
  if (id === 'day-twelve') return state.world.day >= 12;
  return false;
};

const updateAchievements = (state: TideGameState) => {
  for (const achievement of ACHIEVEMENTS) {
    if (state.progress.achievements.includes(achievement.id) || !achievementMet(state, achievement.id)) continue;
    state.progress.achievements.push(achievement.id);
    state.progress.score += 250;
    awardXp(state, 24);
    addNotice(state, `成就解锁：${achievement.name}。`, 'good');
  }
};

const chapterMet = (state: TideGameState, id: string) => {
  const modules = state.raft.modules;
  if (id === 'survive') return modules.deck && (modules.net || modules.purifier);
  if (id === 'home') return modules.grill && modules.storage && modules.reinforcedDeck;
  if (id === 'navigate') return modules.workshop && modules.sail;
  if (id === 'signal') return modules.radio && state.progress.signalFragments >= 4;
  if (id === 'beyond') return modules.beacon && state.world.day >= 12;
  return false;
};

const updateChapters = (state: TideGameState) => {
  for (const chapter of CHAPTERS) {
    if (state.progress.completedChapters.includes(chapter.id) || !chapterMet(state, chapter.id)) continue;
    state.progress.completedChapters.push(chapter.id);
    state.progress.techPoints += 1;
    state.progress.score += 750;
    awardXp(state, 65);
    addNotice(state, `航海章节完成：${chapter.number} · ${chapter.title}。科技点 +1。`, 'good');
  }
  if (!state.progress.endlessUnlocked && state.raft.modules.beacon && state.world.day >= 12) {
    state.progress.endlessUnlocked = true;
    state.progress.score += 2000;
    addNotice(state, '潮线信标收到回应。无尽远航已经开启。', 'good');
  }
};

const finalize = (state: TideGameState) => {
  updateTutorial(state);
  updateContract(state);
  updateAchievements(state);
  updateChapters(state);
  state.updatedAt = Date.now();
  return state;
};

export const getCurrentChapter = (state: TideGameState) =>
  CHAPTERS.find((chapter) => !state.progress.completedChapters.includes(chapter.id)) ?? null;

export const createGuestId = () => makeId('guest');

const emptyModules = (): TideGameState['raft']['modules'] => ({
  deck: false,
  net: false,
  purifier: false,
  grill: false,
  storage: false,
  reinforcedDeck: false,
  workshop: false,
  sail: false,
  garden: false,
  radio: false,
  beacon: false,
});

export const createInitialGame = (
  guestId: string,
  seed = Math.floor(Date.now() % 2_147_483_647),
): TideGameState => {
  const now = Date.now();
  const state = {
    schemaVersion: 2,
    guestId,
    runId: makeId('run'),
    createdAt: now,
    updatedAt: now,
    player: {
      x: WORLD.centerX,
      y: WORLD.centerY,
      health: 100,
      hunger: 100,
      thirst: 100,
      facing: 'down',
    },
    inventory: { ...STARTING_INVENTORY },
    raft: { size: 2, integrity: 100, modules: emptyModules() },
    world: {
      seed,
      elapsedSeconds: 0,
      day: 1,
      timeOfDay: 0.28,
      weather: 'clear',
      route: 'salvage',
      nextDebrisAt: SPAWNING.baseIntervalSeconds,
      nextNetAt: SPAWNING.netIntervalSeconds,
      nextWaterAt: SPAWNING.purifierIntervalSeconds,
      nextCookAt: SPAWNING.grillIntervalSeconds,
      nextGardenAt: SPAWNING.gardenIntervalSeconds,
      nextStormHitAt: SPAWNING.stormHitIntervalSeconds,
      nextEventAt: 26,
    },
    progress: {
      level: 1,
      xp: 0,
      techPoints: 0,
      signalFragments: 0,
      combo: 0,
      comboExpiresAt: 0,
      score: 0,
      perks: { hook: 0, angler: 0, metabolism: 0, salvage: 0, automation: 0, hull: 0 },
      achievements: [],
      completedChapters: [],
      endlessUnlocked: false,
      tutorial: { step: 0, completed: false, minimized: false },
      contract: {} as DailyContract,
      stats: {
        collected: 0,
        fishCaught: 0,
        built: 0,
        consumed: 0,
        repaired: 0,
        crates: 0,
        events: 0,
        stormHits: 0,
        distanceMoved: 0,
        survivedSeconds: 0,
      },
    },
    debris: [],
    fishing: { active: false, marker: 0, direction: 1, targetStart: 40, targetWidth: 20 },
    event: null,
    rngStep: 0,
    notices: [
      { id: makeId('notice'), text: '物资潮正在靠近。先连捞几次，把木筏撑起来。', tone: 'info' },
    ],
    gameOver: false,
  } satisfies TideGameState;

  state.progress.contract = createContract(state, 1);
  for (let index = 0; index < SPAWNING.initialDebrisCount; index += 1) spawnDebris(state, true);
  return state;
};

export const restartGame = (state: TideGameState) =>
  createInitialGame(state.guestId, state.world.seed + 97);

export const movePlayer = (
  state: TideGameState,
  directionX: number,
  directionY: number,
  deltaSeconds: number,
) => {
  if (state.gameOver || (!directionX && !directionY)) return state;
  const next = cloneState(state);
  const magnitude = Math.hypot(directionX, directionY) || 1;
  const moveX = (directionX / magnitude) * WORLD.playerSpeed * deltaSeconds;
  const moveY = (directionY / magnitude) * WORLD.playerSpeed * deltaSeconds;
  const halfRaft = (next.raft.size * WORLD.tileSize) / 2;
  const padding = WORLD.playerRadius + 5;
  const previousX = next.player.x;
  const previousY = next.player.y;

  next.player.x = clamp(next.player.x + moveX, WORLD.centerX - halfRaft + padding, WORLD.centerX + halfRaft - padding);
  next.player.y = clamp(next.player.y + moveY, WORLD.centerY - halfRaft + padding, WORLD.centerY + halfRaft - padding);
  next.progress.stats.distanceMoved += Math.hypot(next.player.x - previousX, next.player.y - previousY);
  if (Math.abs(directionX) > Math.abs(directionY)) next.player.facing = directionX > 0 ? 'right' : 'left';
  else next.player.facing = directionY > 0 ? 'down' : 'up';
  return finalize(next);
};

const grantDebris = (state: TideGameState, item: DebrisItem, source: 'hook' | 'net') => {
  state.progress.stats.collected += 1;
  const sourceLabel = source === 'net' ? '收集网截获' : '钩索打捞';
  if (item.type === 'crate') {
    const workshopBonus = state.raft.modules.workshop ? 1 : 0;
    const salvageBonus = state.progress.perks.salvage;
    addResources(state, {
      wood: 2 + Math.floor(takeRandom(state) * 3),
      plastic: 2 + Math.floor(takeRandom(state) * 2),
      scrap: 1 + Math.floor(takeRandom(state) * 2),
      fiber: 1 + Math.floor(takeRandom(state) * 2),
      parts: 1 + (takeRandom(state) < 0.18 + workshopBonus * 0.18 + salvageBonus * 0.08 ? 1 : 0),
    });
    state.progress.stats.crates += 1;
    if (state.world.day >= 4 && takeRandom(state) < (state.raft.modules.radio ? 0.5 : 0.2)) {
      state.progress.signalFragments += 1;
      addNotice(state, `${sourceLabel}：货箱里夹着一枚信号碎片。`, 'good');
    } else {
      addNotice(state, `${sourceLabel}：补给货箱带来了一整包材料。`, 'good');
    }
    awardXp(state, 24);
    state.progress.score += 120;
  } else {
    state.inventory[item.type] += 1;
    const bonusChance = (state.raft.modules.storage ? 0.16 : 0) + state.progress.perks.salvage * 0.09;
    const bonus = takeRandom(state) < bonusChance;
    if (bonus) state.inventory[item.type] += 1;
    addNotice(state, `${sourceLabel}：${RESOURCE_LABELS[item.type]} +${bonus ? 2 : 1}`, 'good');
    awardXp(state, source === 'net' ? 5 : 8);
    state.progress.score += source === 'net' ? 12 : 20;
  }

  if (source === 'hook') {
    state.progress.combo = state.world.elapsedSeconds <= state.progress.comboExpiresAt
      ? state.progress.combo + 1
      : 1;
    state.progress.comboExpiresAt = state.world.elapsedSeconds + 8;
    if (state.progress.combo > 0 && state.progress.combo % 5 === 0) {
      addResources(state, { wood: 2, plastic: 2, fiber: 1 });
      awardXp(state, 20);
      addNotice(state, `${state.progress.combo} 连捞！海流奖励额外材料。`, 'good');
    }
  }
};

export const collectNearby = (state: TideGameState, requestedId?: string) => {
  if (state.gameOver || state.debris.length === 0) return state;
  const next = cloneState(state);
  const collectRange = WORLD.collectRange + next.progress.perks.hook * 28;
  const candidates = next.debris
    .map((item) => ({ item, distance: Math.hypot(item.x - next.player.x, item.y - next.player.y) }))
    .filter(({ item, distance }) => requestedId ? item.id === requestedId && distance <= collectRange : distance <= collectRange)
    .sort((a, b) => a.distance - b.distance);
  const target = candidates[0]?.item;
  if (!target) {
    addNotice(next, '钩索够不到。走到木筏边缘，或研究长臂钩索。', 'warning');
    return finalize(next);
  }
  grantDebris(next, target, 'hook');
  next.debris = next.debris.filter((item) => item.id !== target.id);
  return finalize(next);
};

export const startFishing = (state: TideGameState) => {
  if (state.gameOver || state.fishing.active) return state;
  const next = cloneState(state);
  const width = clamp(20 + next.progress.perks.angler * 5 + (next.world.route === 'fishing' ? 5 : 0), 20, 42);
  next.fishing = {
    active: true,
    marker: 0,
    direction: 1,
    targetStart: 12 + takeRandom(next) * (76 - width),
    targetWidth: width,
  };
  addNotice(next, '鱼线入水……在浮标进入亮区时收线。');
  return finalize(next);
};

export const resolveFishing = (state: TideGameState) => {
  if (!state.fishing.active || state.gameOver) return state;
  const next = cloneState(state);
  const { marker, targetStart, targetWidth } = next.fishing;
  const success = marker >= targetStart && marker <= targetStart + targetWidth;
  const targetCenter = targetStart + targetWidth / 2;
  const perfect = success && Math.abs(marker - targetCenter) <= targetWidth * 0.18;
  next.fishing.active = false;
  if (success) {
    const doubleChance = 0.28 + next.progress.perks.angler * 0.08;
    const fishCount = 1
      + (perfect ? 1 : 0)
      + (takeRandom(next) < doubleChance ? 1 : 0)
      + (next.world.route === 'fishing' ? 1 : 0);
    next.inventory.fish += fishCount;
    next.progress.stats.fishCaught += fishCount;
    awardXp(next, 12 + fishCount * 4 + (perfect ? 6 : 0));
    addNotice(next, perfect ? `完美收线：鲜鱼 +${fishCount}` : `普通收线：鲜鱼 +${fishCount}`, 'good');
    if (takeRandom(next) < 0.1 + next.progress.perks.salvage * 0.04) {
      next.inventory.parts += 1;
      addNotice(next, '鱼钩还带回了一枚精密零件。', 'good');
    }
  } else {
    addNotice(next, '鱼脱钩了。保持节奏，再试一次。', 'warning');
  }
  return finalize(next);
};

export const consumeResource = (state: TideGameState, resource: ConsumableId) => {
  if (state.gameOver) return state;
  const next = cloneState(state);
  if (next.inventory[resource] <= 0) {
    addNotice(next, resource === 'water' ? '水壶已经空了。' : '储物箱里没有这种食物。', 'warning');
    return finalize(next);
  }
  if (resource !== 'water' && next.player.hunger >= 99.5 && next.player.health >= 99.5) {
    addNotice(next, '现在还不饿，先把食物留着。');
    return finalize(next);
  }
  if (resource === 'water' && next.player.thirst >= 99.5) {
    addNotice(next, '现在还不渴，淡水很珍贵。');
    return finalize(next);
  }
  next.inventory[resource] -= 1;
  next.progress.stats.consumed += 1;
  if (resource === 'fish') {
    next.player.hunger = clamp(next.player.hunger + SURVIVAL.fishHungerRestore, 0, 100);
    addNotice(next, `吃下鲜鱼，饱食恢复 ${SURVIVAL.fishHungerRestore}。`, 'good');
  } else if (resource === 'meal') {
    next.player.hunger = clamp(next.player.hunger + SURVIVAL.mealHungerRestore, 0, 100);
    next.player.health = clamp(next.player.health + SURVIVAL.mealHealthRestore, 0, 100);
    addNotice(next, '热食让身体重新暖起来。', 'good');
  } else {
    next.player.thirst = clamp(next.player.thirst + SURVIVAL.waterThirstRestore, 0, 100);
    addNotice(next, `喝下淡水，口渴恢复 ${SURVIVAL.waterThirstRestore}。`, 'good');
  }
  awardXp(next, 4);
  return finalize(next);
};

export const canAfford = (state: TideGameState, cost: Partial<Record<ResourceId, number>>) =>
  Object.entries(cost).every(([resource, quantity]) => state.inventory[resource as ResourceId] >= (quantity ?? 0));

export const buildModule = (state: TideGameState, moduleId: RaftModuleId): BuildResult => {
  const next = cloneState(state);
  const definition = UPGRADES.find((upgrade) => upgrade.id === moduleId);
  if (!definition) return { ok: false, reason: '未知设施。', state: next };
  if (next.gameOver) return { ok: false, reason: '本次漂流已经结束。', state: next };
  if (next.raft.modules[moduleId]) return { ok: false, reason: '该设施已经建造。', state: next };
  if (next.progress.level < definition.unlockLevel) {
    const reason = `漂流等级 ${definition.unlockLevel} 解锁。`;
    addNotice(next, reason, 'warning');
    return { ok: false, reason, state: finalize(next) };
  }
  if (definition.requires && !next.raft.modules[definition.requires]) {
    const requirement = UPGRADES.find((upgrade) => upgrade.id === definition.requires)?.name ?? '前置设施';
    const reason = `先建造${requirement}。`;
    addNotice(next, reason, 'warning');
    return { ok: false, reason, state: finalize(next) };
  }
  if ((definition.signalRequired ?? 0) > next.progress.signalFragments) {
    const reason = `需要 ${definition.signalRequired} 枚信号碎片。`;
    addNotice(next, reason, 'warning');
    return { ok: false, reason, state: finalize(next) };
  }
  if (!canAfford(next, definition.cost)) {
    const reason = '材料不足，继续打捞、完成合约或处理海上事件。';
    addNotice(next, reason, 'warning');
    return { ok: false, reason, state: finalize(next) };
  }
  for (const [resource, quantity] of Object.entries(definition.cost) as [ResourceId, number][]) {
    next.inventory[resource] -= quantity;
  }
  next.raft.modules[moduleId] = true;
  next.progress.stats.built += 1;
  if (moduleId === 'deck') next.raft.size = 3;
  if (moduleId === 'reinforcedDeck') {
    next.raft.size = 4;
    next.raft.integrity = 100;
  }
  if (moduleId === 'net') next.world.nextNetAt = next.world.elapsedSeconds + SPAWNING.netIntervalSeconds;
  if (moduleId === 'purifier') next.world.nextWaterAt = next.world.elapsedSeconds + SPAWNING.purifierIntervalSeconds;
  if (moduleId === 'grill') next.world.nextCookAt = next.world.elapsedSeconds + SPAWNING.grillIntervalSeconds;
  if (moduleId === 'garden') next.world.nextGardenAt = next.world.elapsedSeconds + SPAWNING.gardenIntervalSeconds;
  if (moduleId === 'radio') next.world.nextEventAt = Math.min(next.world.nextEventAt, next.world.elapsedSeconds + 18);
  awardXp(next, 32 + definition.unlockLevel * 5);
  next.progress.score += 200 + definition.unlockLevel * 40;
  addNotice(next, `${definition.name}建造完成。木筏进入新的阶段。`, 'good');
  return { ok: true, state: finalize(next) };
};

export const repairRaft = (state: TideGameState) => {
  if (state.gameOver) return state;
  const next = cloneState(state);
  if (next.raft.integrity >= 99.5) {
    addNotice(next, '船体状态良好，不需要浪费木板。');
    return finalize(next);
  }
  if (next.inventory.wood < SURVIVAL.repairCost) {
    addNotice(next, `修理需要木板 ×${SURVIVAL.repairCost}。`, 'warning');
    return finalize(next);
  }
  next.inventory.wood -= SURVIVAL.repairCost;
  const amount = SURVIVAL.repairAmount + next.progress.perks.hull * 6;
  next.raft.integrity = clamp(next.raft.integrity + amount, 0, 100);
  next.progress.stats.repaired += 1;
  awardXp(next, 12);
  addNotice(next, `船体修复 +${amount}。`, 'good');
  return finalize(next);
};

export const upgradePerk = (state: TideGameState, perkId: PerkId) => {
  const next = cloneState(state);
  const definition = PERKS.find((perk) => perk.id === perkId);
  if (!definition) return next;
  const current = next.progress.perks[perkId];
  const cost = current + 1;
  if (current >= definition.maxLevel) {
    addNotice(next, `${definition.name}已经研究到最高级。`);
    return finalize(next);
  }
  if (next.progress.techPoints < cost) {
    addNotice(next, `研究下一级需要科技点 ×${cost}。`, 'warning');
    return finalize(next);
  }
  next.progress.techPoints -= cost;
  next.progress.perks[perkId] += 1;
  next.progress.score += 180 * cost;
  addNotice(next, `${definition.name}升级至 ${current + 1} 级。`, 'good');
  return finalize(next);
};

export const setRoute = (state: TideGameState, route: RouteMode) => {
  const next = cloneState(state);
  if (!next.raft.modules.sail && route !== 'salvage') {
    addNotice(next, '建造三角帆后才能主动选择航线。', 'warning');
    return finalize(next);
  }
  next.world.route = route;
  addNotice(next, route === 'salvage' ? '顺流进入残骸密集区。' : route === 'fishing' ? '帆面转向温暖渔场。' : '转入风浪较弱的避风航线。', 'good');
  return finalize(next);
};

export const setTutorialMinimized = (state: TideGameState, minimized: boolean) => {
  const next = cloneState(state);
  next.progress.tutorial.minimized = minimized;
  return finalize(next);
};

export const EVENT_PRESENTATIONS: Record<EventKind, {
  eyebrow: string;
  title: string;
  description: string;
  choices: { id: string; label: string; hint: string }[];
}> = {
  supply: {
    eyebrow: 'DRIFTING CACHE', title: '一只军用补给箱', description: '锁扣已经锈死，但箱体仍然完整。深水里似乎还挂着第二层货物。',
    choices: [
      { id: 'safe', label: '安全拆解', hint: '稳定材料，无风险' },
      { id: 'deep', label: '潜入深水', hint: '生命 -8，稀有物资更多' },
    ],
  },
  storm: {
    eyebrow: 'BAROMETER FALLING', title: '风墙正在逼近', description: '浪线变成了黑色。现在加固船体还来得及，也可以冒险收集风暴带来的废料。',
    choices: [
      { id: 'brace', label: '消耗 2 木板加固', hint: '船体恢复并免受冲击' },
      { id: 'ride', label: '迎浪收集', hint: '船体受损，废铁 +4' },
    ],
  },
  castaway: {
    eyebrow: 'WEAK RADIO PING', title: '远处有人挥动白布', description: '另一块小筏正在下沉。对方只需要一份水或食物，就愿意交换自己的航海记录。',
    choices: [
      { id: 'share', label: '分享补给', hint: '消耗 1 补给，获得信号与零件' },
      { id: 'pass', label: '保持航向', hint: '无消耗，少量经验' },
    ],
  },
  drone: {
    eyebrow: 'OLD WORLD MACHINE', title: '一架失控测绘无人机', description: '它仍在重复广播坐标。修好核心或拆成材料，都是有价值的选择。',
    choices: [
      { id: 'repair', label: '投入 2 零件修复', hint: '科技点与信号碎片' },
      { id: 'strip', label: '拆解外壳', hint: '废铁与零件' },
    ],
  },
  whale: {
    eyebrow: 'LIVING CURRENT', title: '巨鲸从木筏下方经过', description: '它身后拖着一整条富饶海流。跟随会颠簸船体，停下观察则可能记录到低频信号。',
    choices: [
      { id: 'follow', label: '跟随鲸群', hint: '大量漂浮物与鲜鱼' },
      { id: 'observe', label: '记录鲸歌', hint: '有机会获得信号碎片' },
    ],
  },
};

const resolveEventMutable = (state: TideGameState, choiceId: string, expired = false) => {
  const event = state.event;
  if (!event) return false;
  if (expired) {
    addNotice(state, '海上事件从视野中消失了。', 'warning');
    state.event = null;
    return true;
  }
  if (event.kind === 'supply') {
    if (choiceId === 'deep') {
      state.player.health = clamp(state.player.health - 8, 0, 100);
      addResources(state, { wood: 3, plastic: 3, scrap: 3, parts: 2 });
      awardXp(state, 30);
      addNotice(state, '你拖回了沉箱，手臂被划伤，但收获惊人。', 'good');
    } else {
      addResources(state, { wood: 3, plastic: 2, fiber: 2, scrap: 1 });
      awardXp(state, 18);
      addNotice(state, '补给箱被安全拆解。', 'good');
    }
  } else if (event.kind === 'storm') {
    if (choiceId === 'brace') {
      if (state.inventory.wood < 2) {
        addNotice(state, '至少需要 2 块木板才能加固。', 'warning');
        return false;
      }
      state.inventory.wood -= 2;
      state.raft.integrity = clamp(state.raft.integrity + 18, 0, 100);
      awardXp(state, 22);
      addNotice(state, '缆绳与木板锁住了船体，风墙擦身而过。', 'good');
    } else {
      state.raft.integrity = clamp(state.raft.integrity - 12, 0, 100);
      state.inventory.scrap += 4;
      awardXp(state, 28);
      addNotice(state, '你从巨浪中抢回废铁，木筏也付出了代价。', 'warning');
    }
  } else if (event.kind === 'castaway') {
    if (choiceId === 'share') {
      if (state.inventory.water > 0) state.inventory.water -= 1;
      else if (state.inventory.meal > 0) state.inventory.meal -= 1;
      else if (state.inventory.fish > 0) state.inventory.fish -= 1;
      else {
        addNotice(state, '你没有可以分享的水或食物。', 'warning');
        return false;
      }
      state.inventory.parts += 1;
      state.progress.signalFragments += 1;
      awardXp(state, 38);
      addNotice(state, '对方递来一张坐标残页和一枚零件。', 'good');
    } else {
      awardXp(state, 5);
      addNotice(state, '两块木筏在雾中错身而过。');
    }
  } else if (event.kind === 'drone') {
    if (choiceId === 'repair') {
      if (state.inventory.parts < 2) {
        addNotice(state, '修复无人机需要零件 ×2。', 'warning');
        return false;
      }
      state.inventory.parts -= 2;
      state.progress.techPoints += 1;
      state.progress.signalFragments += 1;
      awardXp(state, 42);
      addNotice(state, '无人机短暂复活，上传了坐标并解锁一项研究。', 'good');
    } else {
      addResources(state, { scrap: 3, parts: 1 });
      awardXp(state, 20);
      addNotice(state, '无人机外壳被拆成了可用材料。', 'good');
    }
  } else if (event.kind === 'whale') {
    if (choiceId === 'follow') {
      state.raft.integrity = clamp(state.raft.integrity - 3, 0, 100);
      state.inventory.fish += 2;
      for (let index = 0; index < 6; index += 1) spawnDebris(state, true);
      awardXp(state, 26);
      addNotice(state, '鲸群把木筏带入一条资源丰沛的海流。', 'good');
    } else {
      if (takeRandom(state) < 0.65) {
        state.progress.signalFragments += 1;
        addNotice(state, '鲸歌中混着规律脉冲：信号碎片 +1。', 'good');
      } else {
        state.progress.techPoints += 1;
        addNotice(state, '你记录了海流规律：科技点 +1。', 'good');
      }
      awardXp(state, 24);
    }
  }
  state.progress.stats.events += 1;
  state.progress.score += 180;
  state.event = null;
  return true;
};

export const resolveOceanEvent = (state: TideGameState, choiceId: string) => {
  if (!state.event || state.gameOver) return state;
  const next = cloneState(state);
  resolveEventMutable(next, choiceId);
  return finalize(next);
};

const createOceanEvent = (state: TideGameState): OceanEvent => {
  const roll = takeRandom(state);
  let kind: EventKind;
  if (state.world.weather === 'storm' && roll < 0.38) kind = 'storm';
  else if (state.world.day <= 2 || roll < 0.3) kind = 'supply';
  else if (roll < 0.5) kind = 'whale';
  else if (roll < 0.72) kind = 'castaway';
  else kind = 'drone';
  return {
    id: makeId(kind),
    kind,
    createdAt: state.world.elapsedSeconds,
    expiresAt: state.world.elapsedSeconds + 32,
  };
};

export const tickGame = (state: TideGameState, deltaSeconds: number) => {
  if (state.gameOver || deltaSeconds <= 0) return state;
  const next = cloneState(state);
  const dt = Math.min(deltaSeconds, 1);
  const previousDay = next.world.day;
  next.world.elapsedSeconds += dt;
  next.progress.stats.survivedSeconds += dt;
  next.world.day = Math.floor(next.world.elapsedSeconds / WORLD.dayDurationSeconds) + 1;
  next.world.timeOfDay = (0.24 + next.world.elapsedSeconds / WORLD.dayDurationSeconds) % 1;
  next.world.weather = weatherFor(next.world.seed, next.world.elapsedSeconds);

  if (next.world.day !== previousDay) {
    awardXp(next, 22 + next.world.day * 2);
    next.progress.contract = createContract(next, next.world.day);
    addNotice(next, `第 ${next.world.day} 天开始。新的每日合约已经送达。`, 'good');
  }

  const metabolism = 1 - next.progress.perks.metabolism * 0.08;
  const safeRoute = next.world.route === 'safe' ? 0.84 : 1;
  next.player.hunger = clamp(next.player.hunger - SURVIVAL.hungerDrainPerSecond * metabolism * safeRoute * dt, 0, 100);
  next.player.thirst = clamp(next.player.thirst - SURVIVAL.thirstDrainPerSecond * metabolism * safeRoute * dt, 0, 100);
  if (next.player.hunger <= 0 || next.player.thirst <= 0) {
    next.player.health = clamp(next.player.health - SURVIVAL.starvingDamagePerSecond * dt, 0, 100);
  }
  if (next.raft.integrity <= 0) {
    next.player.health = clamp(next.player.health - SURVIVAL.brokenRaftDamagePerSecond * dt, 0, 100);
  }

  if (next.fishing.active) {
    next.fishing.marker += next.fishing.direction * 58 * dt;
    if (next.fishing.marker >= 100) {
      next.fishing.marker = 100;
      next.fishing.direction = -1;
    } else if (next.fishing.marker <= 0) {
      next.fishing.marker = 0;
      next.fishing.direction = 1;
    }
  }

  next.debris = next.debris
    .map((item) => ({ ...item, x: item.x + item.vx * dt, y: item.y + item.vy * dt, ttl: item.ttl - dt }))
    .filter((item) => item.ttl > 0 && item.x > -90 && item.x < WORLD.width + 90 && item.y > -90 && item.y < WORLD.height + 90);

  if (next.world.elapsedSeconds >= next.world.nextDebrisAt) {
    spawnDebris(next);
    const earlyBoost = next.world.day <= 2 ? 0.72 : 1;
    const weatherBoost = next.world.weather === 'storm' ? 0.72 : 1;
    const routeBoost = next.world.route === 'salvage' ? 0.78 : next.world.route === 'safe' ? 1.16 : 1;
    next.world.nextDebrisAt = next.world.elapsedSeconds + SPAWNING.baseIntervalSeconds * earlyBoost * weatherBoost * routeBoost;
  }

  const automationFactor = 1 - next.progress.perks.automation * 0.1;
  if (next.raft.modules.net && next.world.elapsedSeconds >= next.world.nextNetAt) {
    const target = [...next.debris].sort((a, b) =>
      Math.hypot(a.x - WORLD.centerX, a.y - WORLD.centerY) - Math.hypot(b.x - WORLD.centerX, b.y - WORLD.centerY))[0];
    if (target) {
      grantDebris(next, target, 'net');
      next.debris = next.debris.filter((item) => item.id !== target.id);
    }
    next.world.nextNetAt = next.world.elapsedSeconds + SPAWNING.netIntervalSeconds * automationFactor;
  }

  if (next.raft.modules.purifier && next.world.elapsedSeconds >= next.world.nextWaterAt) {
    next.inventory.water += 1;
    addNotice(next, '过滤器凝结出一份淡水。', 'good');
    next.world.nextWaterAt = next.world.elapsedSeconds + SPAWNING.purifierIntervalSeconds * automationFactor;
  }
  if (next.raft.modules.grill && next.world.elapsedSeconds >= next.world.nextCookAt) {
    if (next.inventory.fish > 0) {
      next.inventory.fish -= 1;
      next.inventory.meal += 1;
      addNotice(next, '烤架完成一份热食。', 'good');
    }
    next.world.nextCookAt = next.world.elapsedSeconds + SPAWNING.grillIntervalSeconds * automationFactor;
  }
  if (next.raft.modules.garden && next.world.elapsedSeconds >= next.world.nextGardenAt) {
    next.inventory.meal += 1;
    addNotice(next, '盐雾菜圃收获一份海菜熟食。', 'good');
    next.world.nextGardenAt = next.world.elapsedSeconds + SPAWNING.gardenIntervalSeconds * automationFactor;
  }

  if (next.world.weather === 'storm' && next.world.day >= 3 && next.world.elapsedSeconds >= next.world.nextStormHitAt) {
    const hullReduction = 1 - next.progress.perks.hull * 0.15;
    const routeReduction = next.world.route === 'safe' ? 0.55 : 1;
    const deckReduction = next.raft.modules.reinforcedDeck ? 0.72 : 1;
    const damage = Math.max(1, Math.round(6 * hullReduction * routeReduction * deckReduction));
    next.raft.integrity = clamp(next.raft.integrity - damage, 0, 100);
    next.progress.stats.stormHits += 1;
    addNotice(next, `巨浪撞击船体：结构 -${damage}。`, 'warning');
    next.world.nextStormHitAt = next.world.elapsedSeconds + SPAWNING.stormHitIntervalSeconds;
  } else if (next.world.weather !== 'storm' && next.world.nextStormHitAt < next.world.elapsedSeconds) {
    next.world.nextStormHitAt = next.world.elapsedSeconds + SPAWNING.stormHitIntervalSeconds;
  }

  if (!next.event && next.world.elapsedSeconds >= next.world.nextEventAt) {
    next.event = createOceanEvent(next);
    const radioFactor = next.raft.modules.radio ? 0.68 : 1;
    next.world.nextEventAt = next.world.elapsedSeconds + SPAWNING.eventIntervalSeconds * radioFactor + takeRandom(next) * 18;
    addNotice(next, `海平线上出现新情况：${EVENT_PRESENTATIONS[next.event.kind].title}。`, 'info');
  }
  if (next.event && next.world.elapsedSeconds >= next.event.expiresAt) resolveEventMutable(next, 'ignore', true);

  if (next.progress.combo > 0 && next.world.elapsedSeconds > next.progress.comboExpiresAt) next.progress.combo = 0;
  if (next.player.health <= 0) {
    next.gameOver = true;
    next.fishing.active = false;
    addNotice(next, `第 ${next.world.day} 天，漂流中止。`, 'warning');
  }
  return finalize(next);
};

export const getNearestCollectableId = (state: TideGameState) => {
  const range = WORLD.collectRange + state.progress.perks.hook * 28;
  const nearest = state.debris
    .map((item) => ({ id: item.id, distance: Math.hypot(item.x - state.player.x, item.y - state.player.y) }))
    .filter((item) => item.distance <= range)
    .sort((a, b) => a.distance - b.distance)[0];
  return nearest?.id ?? null;
};

export const getStormWarningSeconds = (state: TideGameState) => {
  if (state.world.day < 3 || state.world.weather === 'storm') return null;
  const blockLength = 42;
  const currentBlock = Math.floor(state.world.elapsedSeconds / blockLength);
  const nextBlockAt = (currentBlock + 1) * blockLength;
  const nextWeather = weatherFor(state.world.seed, nextBlockAt + 0.01);
  const seconds = nextBlockAt - state.world.elapsedSeconds;
  return nextWeather === 'storm' && seconds <= 14 ? Math.max(0, seconds) : null;
};
