import type {
  Inventory,
  PerkId,
  RaftModuleId,
  ResourceId,
  RouteMode,
} from './types';

export const WORLD = {
  width: 960,
  height: 540,
  centerX: 480,
  centerY: 270,
  tileSize: 60,
  playerRadius: 15,
  playerSpeed: 122,
  collectRange: 178,
  dayDurationSeconds: 150,
} as const;

export const SURVIVAL = {
  hungerDrainPerSecond: 0.17,
  thirstDrainPerSecond: 0.26,
  starvingDamagePerSecond: 0.72,
  brokenRaftDamagePerSecond: 0.42,
  fishHungerRestore: 18,
  mealHungerRestore: 46,
  mealHealthRestore: 7,
  waterThirstRestore: 32,
  repairCost: 2,
  repairAmount: 22,
} as const;

export const SPAWNING = {
  initialDebrisCount: 8,
  maxDebrisCount: 18,
  baseIntervalSeconds: 4.2,
  netIntervalSeconds: 11,
  purifierIntervalSeconds: 17,
  grillIntervalSeconds: 15,
  gardenIntervalSeconds: 42,
  stormHitIntervalSeconds: 12,
  eventIntervalSeconds: 48,
  debrisLifetimeSeconds: 55,
  debrisMinSpeed: 18,
  debrisMaxSpeed: 26,
} as const;

export const COMBAT = {
  firstThreatDay: 2,
  nightStart: 0.7,
  dawnEnd: 0.14,
  maxEnemies: 4,
  firstSpawnDelaySeconds: 5,
  spawnIntervalSeconds: 15,
  stormSpawnMultiplier: 0.68,
  eliteBaseChance: 0.08,
  eliteStormChance: 0.3,
  cutlassDamage: 34,
  cutlassRange: 112,
  attackCooldownSeconds: 0.46,
  tideCrabHealth: 64,
  tideCrabSpeed: 24,
  tideCrabDamage: 6,
  lanternBeastHealth: 150,
  lanternBeastSpeed: 18,
  lanternBeastDamage: 11,
  enemyAttackRange: 43,
  enemyAttackIntervalSeconds: 1.45,
} as const;

export const EQUIPMENT_LABELS = {
  cutlass: { name: '水手弯刀', hint: '左键攻击登筏怪物' },
  salvageTool: { name: '斧锤工具', hint: '左键维修甲板或打捞' },
  fishingRod: { name: '旧式鱼竿', hint: '左键抛竿与收线' },
} as const;

export const STARTING_INVENTORY: Inventory = {
  wood: 4,
  plastic: 3,
  scrap: 1,
  fiber: 0,
  fish: 0,
  meal: 0,
  water: 0,
  parts: 0,
};

export interface UpgradeDefinition {
  id: RaftModuleId;
  name: string;
  eyebrow: string;
  description: string;
  category: 'foundation' | 'survival' | 'navigation';
  unlockLevel: number;
  requires?: RaftModuleId;
  signalRequired?: number;
  cost: Partial<Record<ResourceId, number>>;
}

export const UPGRADES: UpgradeDefinition[] = [
  {
    id: 'deck', name: '扩建甲板', eyebrow: 'LEVEL 02', category: 'foundation', unlockLevel: 1,
    description: '把 2×2 木筏扩成 3×3，获得第一片真正的生活区。',
    cost: { wood: 6, plastic: 4 },
  },
  {
    id: 'net', name: '漂浮收集网', eyebrow: 'AUTO COLLECT', category: 'survival', unlockLevel: 2, requires: 'deck',
    description: '自动截获最近的漂浮物，研究可以继续提高速度。',
    cost: { wood: 4, plastic: 6, scrap: 1 },
  },
  {
    id: 'purifier', name: '海水过滤器', eyebrow: 'FRESH WATER', category: 'survival', unlockLevel: 2, requires: 'deck',
    description: '定时凝结淡水，稳定解决最危险的口渴问题。',
    cost: { wood: 8, plastic: 4, scrap: 2 },
  },
  {
    id: 'grill', name: '风干烤架', eyebrow: 'HOT MEAL', category: 'survival', unlockLevel: 3, requires: 'deck',
    description: '自动把鲜鱼烹成高恢复熟食，熟食还能治疗生命。',
    cost: { wood: 6, plastic: 2, scrap: 3, fiber: 2 },
  },
  {
    id: 'storage', name: '加固储物箱', eyebrow: 'BONUS LOOT', category: 'survival', unlockLevel: 3, requires: 'deck',
    description: '打捞普通资源时有机会额外保留一份材料。',
    cost: { wood: 8, plastic: 4, scrap: 2, fiber: 4 },
  },
  {
    id: 'reinforcedDeck', name: '加固外环', eyebrow: 'LEVEL 03', category: 'foundation', unlockLevel: 4, requires: 'deck',
    description: '扩成 4×4 大型木筏，并让结构更能抵御风暴。',
    cost: { wood: 14, plastic: 8, scrap: 5, fiber: 6 },
  },
  {
    id: 'workshop', name: '精密工坊', eyebrow: 'ADVANCED TECH', category: 'foundation', unlockLevel: 5, requires: 'reinforcedDeck',
    description: '解锁远航设施，并提高从货箱中拆出精密零件的概率。',
    cost: { wood: 12, plastic: 8, scrap: 6, fiber: 4 },
  },
  {
    id: 'sail', name: '三角帆', eyebrow: 'CHOOSE COURSE', category: 'navigation', unlockLevel: 5, requires: 'reinforcedDeck',
    description: '可选择打捞、渔场或避风航线，改变整局资源节奏。',
    cost: { wood: 10, plastic: 6, scrap: 4, fiber: 8 },
  },
  {
    id: 'garden', name: '盐雾菜圃', eyebrow: 'PASSIVE FOOD', category: 'survival', unlockLevel: 6, requires: 'workshop',
    description: '定时收获一份海菜熟食，构成稳定的食物自动化。',
    cost: { wood: 12, plastic: 8, scrap: 5, fiber: 10 },
  },
  {
    id: 'radio', name: '短波电台', eyebrow: 'TRACE SIGNAL', category: 'navigation', unlockLevel: 7, requires: 'workshop',
    description: '放大海上信号并加快事件出现，开始追踪潮线之外的坐标。',
    cost: { wood: 18, plastic: 12, scrap: 10, parts: 6 },
  },
  {
    id: 'beacon', name: '潮线信标', eyebrow: 'ENDLESS VOYAGE', category: 'navigation', unlockLevel: 9, requires: 'radio', signalRequired: 4,
    description: '广播你的坐标。坚持到第 12 天后，开启无尽远航与每日合约。',
    cost: { wood: 26, plastic: 18, scrap: 16, parts: 12 },
  },
];

export interface PerkDefinition {
  id: PerkId;
  name: string;
  glyph: string;
  description: string;
  maxLevel: number;
}

export const PERKS: PerkDefinition[] = [
  { id: 'hook', name: '长臂钩索', glyph: '↗', maxLevel: 3, description: '每级增加 28 像素打捞距离。' },
  { id: 'angler', name: '潮汐手感', glyph: '≈', maxLevel: 3, description: '每级扩大钓鱼成功区，并提高双鱼概率。' },
  { id: 'metabolism', name: '漂流体质', glyph: '◇', maxLevel: 3, description: '每级降低 8% 饥饿与口渴消耗。' },
  { id: 'salvage', name: '拆解直觉', glyph: '✦', maxLevel: 3, description: '每级增加额外材料与零件概率。' },
  { id: 'automation', name: '机械校准', glyph: '⌁', maxLevel: 3, description: '每级让收集、净水、烹饪和种植快 10%。' },
  { id: 'hull', name: '船体工程', glyph: '▦', maxLevel: 3, description: '每级降低风暴伤害并提高修理量。' },
];

export const RESOURCE_LABELS: Record<ResourceId, string> = {
  wood: '木板', plastic: '塑料', scrap: '废铁', fiber: '纤维',
  fish: '鲜鱼', meal: '熟食', water: '淡水', parts: '零件',
};

export const ROUTE_LABELS: Record<RouteMode, { name: string; description: string }> = {
  salvage: { name: '残骸航线', description: '漂浮物更多，适合集中扩建。' },
  fishing: { name: '渔场航线', description: '钓鱼更容易，并可能多钓一条。' },
  safe: { name: '避风航线', description: '生存消耗与风暴伤害降低。' },
};

export const TUTORIAL_STEPS = [
  { title: '试着走动', description: '使用 WASD、方向键或触控方向键移动。', reward: '奖励：木板 ×2' },
  { title: '完成两次打捞', description: '靠近残骸并按 E，或直接点击发光目标。', reward: '奖励：塑料 ×2、纤维 ×1' },
  { title: '钓到第一条鱼', description: '按空格开始钓鱼，在亮区再次收线。', reward: '奖励：淡水 ×2' },
  { title: '补充一次状态', description: '在下方背包中吃鱼、吃熟食或喝水。', reward: '奖励：废铁 ×2' },
  { title: '扩建 3×3 甲板', description: '在工坊中建造“扩建甲板”。', reward: '奖励：木板 ×4、塑料 ×4' },
  { title: '建造自动设施', description: '建造收集网或海水过滤器。', reward: '奖励：科技点 ×1' },
] as const;

export const ACHIEVEMENTS = [
  { id: 'first-haul', name: '海上拾荒者', description: '完成第一次打捞。' },
  { id: 'first-catch', name: '今晚有鱼', description: '钓到第一条鱼。' },
  { id: 'combo-five', name: '浪尖连捞', description: '达成 5 连捞。' },
  { id: 'day-three', name: '风暴老手', description: '活到第 3 天。' },
  { id: 'level-five', name: '漂流工程师', description: '达到 5 级。' },
  { id: 'automation', name: '木筏会照顾自己', description: '拥有三种自动生产设施。' },
  { id: 'big-raft', name: '漂浮之家', description: '把木筏扩成 4×4。' },
  { id: 'signal-four', name: '有人在听', description: '收集 4 枚信号碎片。' },
  { id: 'beacon', name: '越过潮线', description: '建成潮线信标。' },
  { id: 'day-twelve', name: '远航者', description: '活到第 12 天。' },
] as const;

export const CHAPTERS = [
  { id: 'survive', number: '01', title: '先活下来', description: '扩建甲板，并获得净水或自动打捞。' },
  { id: 'home', number: '02', title: '把木筏变成家', description: '建造烤架、储物箱和加固外环。' },
  { id: 'navigate', number: '03', title: '学会逆流', description: '建成工坊与三角帆，主动选择航线。' },
  { id: 'signal', number: '04', title: '追踪陌生信号', description: '建成电台并收集 4 枚信号碎片。' },
  { id: 'beyond', number: '05', title: '越过潮线', description: '建成信标并坚持到第 12 天。' },
] as const;
