import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ACHIEVEMENTS,
  CHAPTERS,
  PERKS,
  RESOURCE_LABELS,
  ROUTE_LABELS,
  SURVIVAL,
  TUTORIAL_STEPS,
  UPGRADES,
  WORLD,
} from '../../tide/config';
import {
  canAfford,
  EVENT_PRESENTATIONS,
  getContractProgress,
  getCurrentChapter,
  getNearestCollectableId,
  getXpToNext,
} from '../../tide/game';
import type {
  DebrisItem,
  PerkId,
  RaftModuleId,
  ResourceId,
  RouteMode,
  TideGameState,
} from '../../tide/types';
import { useTideGame } from '../../tide/useTideGame';
import './tide-after.css';

const RESOURCE_GLYPHS: Record<ResourceId, string> = {
  wood: '▰',
  plastic: '⬡',
  scrap: '✦',
  fiber: '≈',
  fish: '◀',
  meal: '◆',
  water: '●',
  parts: '⚙',
};

const MODULE_GLYPHS: Record<RaftModuleId, string> = {
  deck: '▦',
  net: '⌗',
  purifier: '◉',
  grill: '≋',
  storage: '▣',
  reinforcedDeck: '▤',
  workshop: '⚒',
  sail: '◢',
  garden: '♣',
  radio: '⌁',
  beacon: '⌃',
};

const WEATHER_LABELS = { clear: '晴浪', cloudy: '阴潮', storm: '风暴' } as const;
const PANEL_TABS = [
  { id: 'build', label: '建造' },
  { id: 'research', label: '研究' },
  { id: 'voyage', label: '航海志' },
] as const;
type PanelTab = (typeof PANEL_TABS)[number]['id'];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const formatTime = (progress: number) => {
  const totalMinutes = Math.floor(progress * 24 * 60);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes} 分 ${Math.floor(seconds % 60)} 秒` : `${Math.floor(seconds)} 秒`;
};

const formatSavedTime = (timestamp: number) =>
  new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(timestamp);

function drawPixelPlayer(context: CanvasRenderingContext2D, state: TideGameState) {
  const { x, y, facing } = state.player;
  const bob = Math.sin(state.world.elapsedSeconds * 5) * 1.5;
  context.save();
  context.translate(Math.round(x), Math.round(y + bob));
  context.fillStyle = 'rgba(0, 17, 24, 0.38)';
  context.fillRect(-12, 15, 24, 7);
  context.fillStyle = '#f2c38c';
  context.fillRect(-7, -20, 14, 12);
  context.fillStyle = '#18242c';
  context.fillRect(-8, -22, 16, 5);
  context.fillStyle = '#d85c3a';
  context.fillRect(-10, -8, 20, 20);
  context.fillStyle = '#f4d35e';
  context.fillRect(-7, -4, 14, 5);
  context.fillStyle = '#233846';
  context.fillRect(-9, 12, 7, 12);
  context.fillRect(2, 12, 7, 12);
  context.fillStyle = '#f2c38c';
  if (facing === 'left') context.fillRect(-15, -5, 6, 13);
  else if (facing === 'right') context.fillRect(9, -5, 6, 13);
  else {
    context.fillRect(-14, -5, 5, 12);
    context.fillRect(9, -5, 5, 12);
  }
  context.restore();
}

function drawDebris(context: CanvasRenderingContext2D, item: DebrisItem, elapsed: number) {
  const bob = Math.sin(elapsed * 2.8 + item.x * 0.03) * 2;
  context.save();
  context.translate(Math.round(item.x), Math.round(item.y + bob));
  context.rotate(Math.sin(elapsed + item.y) * 0.08);
  context.fillStyle = 'rgba(0, 20, 30, 0.24)';
  context.fillRect(-15, 9, 30, 5);

  if (item.type === 'wood') {
    context.fillStyle = '#8f5835';
    context.fillRect(-17, -6, 34, 12);
    context.fillStyle = '#d39a5b';
    context.fillRect(-14, -4, 27, 3);
    context.fillStyle = '#5c3728';
    context.fillRect(-4, -6, 3, 12);
  } else if (item.type === 'plastic') {
    context.fillStyle = '#b6e8e7';
    context.fillRect(-8, -11, 16, 21);
    context.fillStyle = '#5eb7c4';
    context.fillRect(-5, -15, 10, 5);
    context.fillRect(-6, 2, 12, 4);
  } else if (item.type === 'fiber') {
    context.strokeStyle = '#d7c78a';
    context.lineWidth = 4;
    for (let index = -10; index <= 10; index += 5) {
      context.beginPath();
      context.moveTo(index, -10);
      context.lineTo(index + 7, 10);
      context.stroke();
    }
  } else if (item.type === 'crate') {
    context.fillStyle = '#6f4129';
    context.fillRect(-17, -15, 34, 30);
    context.fillStyle = '#c68a4f';
    context.fillRect(-13, -11, 26, 22);
    context.fillStyle = '#4b2b21';
    context.fillRect(-3, -11, 6, 22);
    context.fillRect(-13, -3, 26, 6);
    context.fillStyle = '#f3cf6a';
    context.fillRect(-3, -3, 6, 6);
  } else {
    context.fillStyle = '#a4a29a';
    context.fillRect(-12, -10, 24, 20);
    context.fillStyle = '#4d5d61';
    context.fillRect(-8, -6, 16, 4);
    context.fillRect(-5, 2, 11, 5);
    context.fillStyle = '#d97745';
    context.fillRect(7, -10, 5, 20);
  }
  context.restore();
}

function drawRaftModules(
  context: CanvasRenderingContext2D,
  state: TideGameState,
  startX: number,
  startY: number,
  width: number,
) {
  const modules = state.raft.modules;
  if (modules.reinforcedDeck) {
    context.strokeStyle = '#64747a';
    context.lineWidth = 7;
    context.strokeRect(startX - 2, startY - 2, width + 4, width + 4);
  }
  if (modules.net) {
    const netY = startY + width + 5;
    context.strokeStyle = '#e2c993';
    context.lineWidth = 2;
    context.strokeRect(startX + 9, netY, width - 18, 24);
    for (let x = startX + 10; x < startX + width - 10; x += 14) {
      context.beginPath();
      context.moveTo(x, netY);
      context.lineTo(x + 14, netY + 24);
      context.stroke();
    }
  }
  if (modules.purifier) {
    context.fillStyle = '#253c43';
    context.fillRect(startX + 14, startY + 14, 34, 35);
    context.fillStyle = '#b9e9e4';
    context.fillRect(startX + 21, startY + 21, 20, 17);
    context.fillStyle = '#e0b653';
    context.fillRect(startX + 26, startY + 6, 10, 12);
  }
  if (modules.grill) {
    const x = startX + width - 48;
    context.fillStyle = '#26363a';
    context.fillRect(x, startY + 16, 34, 27);
    context.fillStyle = '#e7683f';
    context.fillRect(x + 6, startY + 31, 22, 6);
    context.fillStyle = '#c6bca2';
    context.fillRect(x + 3, startY + 13, 28, 4);
  }
  if (modules.storage) {
    const y = startY + width - 48;
    context.fillStyle = '#4a2f22';
    context.fillRect(startX + 15, y, 39, 33);
    context.fillStyle = '#bd7d42';
    context.fillRect(startX + 19, y + 4, 31, 25);
    context.fillStyle = '#ead16d';
    context.fillRect(startX + 32, y + 12, 6, 9);
  }
  if (modules.workshop) {
    const x = startX + width / 2 - 25;
    const y = startY + width / 2 - 19;
    context.fillStyle = '#33464a';
    context.fillRect(x, y, 50, 38);
    context.fillStyle = '#d6a353';
    context.fillRect(x + 5, y + 5, 40, 7);
    context.fillStyle = '#9fbdba';
    context.fillRect(x + 10, y + 19, 9, 13);
    context.fillRect(x + 30, y + 17, 12, 15);
  }
  if (modules.garden) {
    const x = startX + width - 58;
    const y = startY + width - 49;
    context.fillStyle = '#4f3024';
    context.fillRect(x, y, 43, 34);
    context.fillStyle = '#315b44';
    for (let index = 0; index < 3; index += 1) {
      context.fillRect(x + 7 + index * 12, y + 7, 5, 18);
      context.fillRect(x + 3 + index * 12, y + 8, 8, 5);
    }
  }
  if (modules.sail) {
    const x = startX + width * 0.72;
    const y = startY + width * 0.48;
    context.fillStyle = '#302d2a';
    context.fillRect(x, y - 55, 5, 78);
    context.fillStyle = '#e7d9b7';
    context.beginPath();
    context.moveTo(x + 6, y - 51);
    context.lineTo(x + 6, y + 3);
    context.lineTo(x + 43, y - 5);
    context.closePath();
    context.fill();
    context.fillStyle = '#d45d3b';
    context.fillRect(x + 6, y - 13, 30, 6);
  }
  if (modules.radio) {
    const x = startX + 18;
    const y = startY + width * 0.48;
    context.fillStyle = '#27383f';
    context.fillRect(x, y, 35, 29);
    context.fillStyle = '#77d2cc';
    context.fillRect(x + 6, y + 6, 13, 8);
    context.fillStyle = '#e4c25f';
    context.fillRect(x + 25, y + 17, 5, 5);
    context.strokeStyle = '#d9e1d3';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x + 26, y);
    context.lineTo(x + 36, y - 25);
    context.stroke();
  }
  if (modules.beacon) {
    const x = startX + width / 2;
    context.fillStyle = '#303d43';
    context.fillRect(x - 8, startY - 42, 16, 47);
    context.fillStyle = '#f1d45f';
    context.fillRect(x - 12, startY - 51, 24, 12);
    context.fillStyle = 'rgba(248, 218, 91, 0.19)';
    context.beginPath();
    context.arc(x, startY - 45, 42, 0, Math.PI * 2);
    context.fill();
  }
}

function drawOceanScene(context: CanvasRenderingContext2D, state: TideGameState) {
  const daylight = 0.25 + Math.sin(state.world.timeOfDay * Math.PI) * 0.75;
  const top = state.world.weather === 'storm' ? '#123644' : '#0a6478';
  const bottom = state.world.timeOfDay > 0.72 ? '#06303e' : '#0f8fa0';
  const ocean = context.createLinearGradient(0, 0, 0, WORLD.height);
  ocean.addColorStop(0, top);
  ocean.addColorStop(1, bottom);
  context.fillStyle = ocean;
  context.fillRect(0, 0, WORLD.width, WORLD.height);

  const waveOffset = (state.world.elapsedSeconds * 17) % 58;
  context.lineWidth = 3;
  for (let row = -1; row < 12; row += 1) {
    const y = row * 54 + waveOffset;
    for (let column = -1; column < 17; column += 1) {
      const x = column * 64 + (row % 2) * 24;
      context.strokeStyle = `rgba(155, 231, 225, ${0.09 + daylight * 0.08})`;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + 16, y - 5);
      context.lineTo(x + 31, y);
      context.stroke();
    }
  }

  if (state.world.weather === 'storm') {
    context.strokeStyle = 'rgba(210, 239, 240, 0.2)';
    context.lineWidth = 2;
    for (let index = 0; index < 38; index += 1) {
      const x = (index * 79 + state.world.elapsedSeconds * 110) % (WORLD.width + 100) - 50;
      const y = (index * 43 + state.world.elapsedSeconds * 190) % (WORLD.height + 100) - 50;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x - 11, y + 25);
      context.stroke();
    }
  }

  state.debris.forEach((item) => drawDebris(context, item, state.world.elapsedSeconds));

  const size = state.raft.size;
  const tile = WORLD.tileSize;
  const raftStartX = WORLD.centerX - (size * tile) / 2;
  const raftStartY = WORLD.centerY - (size * tile) / 2;
  const raftWidth = size * tile;
  context.fillStyle = 'rgba(0, 18, 25, 0.35)';
  context.fillRect(raftStartX + 10, raftStartY + 14, raftWidth, raftWidth);

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const x = Math.round(raftStartX + column * tile);
      const y = Math.round(raftStartY + row * tile);
      context.fillStyle = (row + column) % 2 ? '#9e643d' : '#aa7146';
      context.fillRect(x + 2, y + 2, tile - 4, tile - 4);
      context.fillStyle = '#d39a5b';
      context.fillRect(x + 6, y + 8, tile - 12, 4);
      context.fillStyle = '#68412d';
      context.fillRect(x + tile - 8, y + 3, 4, tile - 7);
      context.fillStyle = '#2a3331';
      context.fillRect(x + 7, y + 7, 4, 4);
      context.fillRect(x + tile - 13, y + tile - 13, 4, 4);
    }
  }

  drawRaftModules(context, state, raftStartX, raftStartY, raftWidth);

  const nearestId = getNearestCollectableId(state);
  const nearest = nearestId ? state.debris.find((item) => item.id === nearestId) : null;
  if (nearest) {
    context.save();
    context.strokeStyle = 'rgba(245, 218, 123, 0.58)';
    context.setLineDash([7, 7]);
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(state.player.x, state.player.y);
    context.lineTo(nearest.x, nearest.y);
    context.stroke();
    context.restore();
  }

  drawPixelPlayer(context, state);

  if (state.world.timeOfDay > 0.68 || state.world.timeOfDay < 0.18) {
    const nightAlpha = state.world.timeOfDay > 0.68
      ? clamp((state.world.timeOfDay - 0.68) * 1.8, 0, 0.52)
      : clamp((0.18 - state.world.timeOfDay) * 1.8, 0, 0.52);
    context.fillStyle = `rgba(1, 16, 36, ${nightAlpha})`;
    context.fillRect(0, 0, WORLD.width, WORLD.height);
  }

  const vignette = context.createRadialGradient(
    WORLD.centerX,
    WORLD.centerY,
    120,
    WORLD.centerX,
    WORLD.centerY,
    570,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,10,18,0.34)');
  context.fillStyle = vignette;
  context.fillRect(0, 0, WORLD.width, WORLD.height);
}

function OceanCanvas({
  state,
  onCollect,
}: {
  state: TideGameState;
  onCollect: (id?: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.imageSmoothingEnabled = false;
    drawOceanScene(context, state);
  }, [state]);

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * WORLD.width;
    const y = ((event.clientY - bounds.top) / bounds.height) * WORLD.height;
    const target = [...state.debris]
      .map((item) => ({ item, distance: Math.hypot(item.x - x, item.y - y) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (target && target.distance < 36) onCollect(target.item.id);
  };

  return (
    <canvas
      ref={canvasRef}
      className="ocean-canvas"
      width={WORLD.width}
      height={WORLD.height}
      onPointerDown={onPointerDown}
      aria-label="俯视角海上木筏场景。点击附近漂浮物可以尝试打捞。"
    />
  );
}

function StatusBar({
  label,
  value,
  tone,
  glyph,
}: {
  label: string;
  value: number;
  tone: 'health' | 'hunger' | 'thirst' | 'integrity';
  glyph: string;
}) {
  return (
    <div className={`status-bar status-bar--${tone}`}>
      <span className="status-bar__glyph">{glyph}</span>
      <div className="status-bar__body">
        <div className="status-bar__meta">
          <span>{label}</span>
          <strong>{Math.round(value)}</strong>
        </div>
        <div className="status-bar__track"><span style={{ width: `${clamp(value, 0, 100)}%` }} /></div>
      </div>
    </div>
  );
}

function ResourcePill({ id, count }: { id: ResourceId; count: number }) {
  return (
    <div className={`resource-pill resource-pill--${id}`} title={`${RESOURCE_LABELS[id]}：${count}`}>
      <span>{RESOURCE_GLYPHS[id]}</span>
      <div><small>{RESOURCE_LABELS[id]}</small><strong>{count.toString().padStart(2, '0')}</strong></div>
    </div>
  );
}

function MiniProgress({ value, max }: { value: number; max: number }) {
  const percent = max <= 0 ? 100 : clamp((value / max) * 100, 0, 100);
  return <span className="mini-progress"><i style={{ width: `${percent}%` }} /></span>;
}

function BuildPanel({ state, build }: { state: TideGameState; build: (id: RaftModuleId) => void }) {
  return (
    <div className="panel-scroll build-list">
      {UPGRADES.map((upgrade) => {
        const built = state.raft.modules[upgrade.id];
        const levelLocked = state.progress.level < upgrade.unlockLevel;
        const dependencyLocked = Boolean(upgrade.requires && !state.raft.modules[upgrade.requires]);
        const signalLocked = (upgrade.signalRequired ?? 0) > state.progress.signalFragments;
        const affordable = canAfford(state, upgrade.cost);
        const disabled = built || levelLocked || dependencyLocked || signalLocked || !affordable;
        const lockText = levelLocked
          ? `需要漂流等级 ${upgrade.unlockLevel}`
          : dependencyLocked
            ? `需要先建造 ${UPGRADES.find((item) => item.id === upgrade.requires)?.name ?? '前置设施'}`
            : signalLocked
              ? `需要信号碎片 ${upgrade.signalRequired}`
              : affordable ? '材料齐全' : '材料不足';
        return (
          <article key={upgrade.id} className={`upgrade-card ${built ? 'is-built' : ''}`}>
            <div className="upgrade-card__icon">{MODULE_GLYPHS[upgrade.id]}</div>
            <div className="upgrade-card__content">
              <div className="upgrade-card__topline">
                <span>{upgrade.eyebrow}</span>
                <strong>{built ? '已完成' : lockText}</strong>
              </div>
              <h3>{upgrade.name}</h3>
              <p>{upgrade.description}</p>
              <div className="cost-row">
                {(Object.entries(upgrade.cost) as [ResourceId, number][]).map(([resource, quantity]) => (
                  <span key={resource} className={state.inventory[resource] < quantity ? 'is-missing' : ''}>
                    {RESOURCE_GLYPHS[resource]} {quantity}
                  </span>
                ))}
              </div>
              <button type="button" disabled={disabled} onClick={() => build(upgrade.id)}>
                {built ? '结构稳定' : '开始建造'}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ResearchPanel({ state, research }: { state: TideGameState; research: (id: PerkId) => void }) {
  return (
    <div className="panel-scroll research-panel">
      <div className="research-balance">
        <span>可用科技点</span><strong>{state.progress.techPoints}</strong>
        <small>升级所需科技点等于下一等级</small>
      </div>
      <div className="perk-grid">
        {PERKS.map((perk) => {
          const level = state.progress.perks[perk.id];
          const maxed = level >= perk.maxLevel;
          const cost = level + 1;
          return (
            <article key={perk.id} className={`perk-card ${maxed ? 'is-maxed' : ''}`}>
              <div className="perk-card__glyph">{perk.glyph}</div>
              <div><small>LV {level} / {perk.maxLevel}</small><h3>{perk.name}</h3></div>
              <p>{perk.description}</p>
              <div className="perk-pips">
                {Array.from({ length: perk.maxLevel }).map((_, index) => <i key={index} className={index < level ? 'is-on' : ''} />)}
              </div>
              <button type="button" disabled={maxed || state.progress.techPoints < cost} onClick={() => research(perk.id)}>
                {maxed ? '研究完成' : `投入 ${cost} 科技点`}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function VoyagePanel({ state }: { state: TideGameState }) {
  const progress = getContractProgress(state);
  const contract = state.progress.contract;
  return (
    <div className="panel-scroll voyage-panel">
      <section className={`contract-card ${contract.completed ? 'is-complete' : ''}`}>
        <div><small>DAY {contract.day.toString().padStart(2, '0')} · 每日合约</small><strong>{contract.title}</strong></div>
        <p>{contract.description}</p>
        <div className="contract-progress"><MiniProgress value={progress} max={contract.target} /><span>{progress} / {contract.target}</span></div>
        <footer>
          <span>奖励</span>
          {(Object.entries(contract.reward) as [ResourceId, number][]).map(([resource, amount]) => (
            <b key={resource}>{RESOURCE_GLYPHS[resource]} {amount}</b>
          ))}
          <b>XP {contract.xp}</b>
        </footer>
      </section>

      <div className="section-label"><span>航海章节</span><small>{state.progress.completedChapters.length} / {CHAPTERS.length}</small></div>
      <div className="chapter-list">
        {CHAPTERS.map((chapter) => {
          const complete = state.progress.completedChapters.includes(chapter.id);
          return (
            <article key={chapter.id} className={complete ? 'is-complete' : ''}>
              <span>{chapter.number}</span><div><strong>{chapter.title}</strong><p>{chapter.description}</p></div><i>{complete ? '✓' : '·'}</i>
            </article>
          );
        })}
      </div>

      <div className="section-label"><span>成就记录</span><small>{state.progress.achievements.length} / {ACHIEVEMENTS.length}</small></div>
      <div className="achievement-grid">
        {ACHIEVEMENTS.map((achievement) => {
          const unlocked = state.progress.achievements.includes(achievement.id);
          return (
            <article key={achievement.id} className={unlocked ? 'is-unlocked' : ''} title={achievement.description}>
              <i>{unlocked ? '◆' : '◇'}</i><div><strong>{achievement.name}</strong><small>{achievement.description}</small></div>
            </article>
          );
        })}
      </div>

      <div className="run-stats">
        <div><small>打捞</small><strong>{state.progress.stats.collected}</strong></div>
        <div><small>钓获</small><strong>{state.progress.stats.fishCaught}</strong></div>
        <div><small>建造</small><strong>{state.progress.stats.built}</strong></div>
        <div><small>航行</small><strong>{formatDuration(state.progress.stats.survivedSeconds)}</strong></div>
      </div>
    </div>
  );
}

function TideAfterGame() {
  const { state, hadSave, lastSavedAt, cloudStatus, actions } = useTideGame();
  const [showIntro, setShowIntro] = useState(true);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>('build');
  const cloudConnected = cloudStatus === 'connected';
  const saveModeLabel = cloudStatus === 'connected'
    ? 'SPACETIMEDB ONLINE'
    : cloudStatus === 'connecting'
      ? 'CONNECTING DATABASE'
      : cloudStatus === 'error'
        ? 'LOCAL · CLOUD OFFLINE'
        : 'LOCAL CHECKPOINT';
  const nearestCollectable = useMemo(() => getNearestCollectableId(state), [state]);
  const currentChapter = getCurrentChapter(state);
  const contractProgress = getContractProgress(state);
  const xpNeeded = getXpToNext(state.progress.level);
  const tutorialStep = TUTORIAL_STEPS[state.progress.tutorial.step];

  const beginRestart = () => setConfirmRestart(true);
  const commitRestart = () => {
    actions.restart();
    setConfirmRestart(false);
    setShowIntro(false);
    setActiveTab('build');
  };

  return (
    <main className={`tide-app weather--${state.world.weather}`}>
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-lockup__mark">潮</span>
          <div><p>AFTER THE TIDELINE</p><h1>潮线之后</h1></div>
        </div>
        <div className="world-readout">
          <div><small>漂流日</small><strong>DAY {state.world.day.toString().padStart(2, '0')}</strong></div>
          <div><small>海上时间</small><strong>{formatTime(state.world.timeOfDay)}</strong></div>
          <div><small>天气</small><strong>{WEATHER_LABELS[state.world.weather]}</strong></div>
          <div><small>航线</small><strong>{ROUTE_LABELS[state.world.route].name}</strong></div>
        </div>
        <div className={`save-readout ${cloudConnected ? 'is-cloud' : ''}`}>
          <span className="save-readout__dot" />
          <div><strong>{saveModeLabel}</strong><small>保存于 {formatSavedTime(lastSavedAt)}</small></div>
          <button type="button" onClick={actions.saveNow}>保存</button>
        </div>
      </header>

      <section className="game-layout">
        <div className="stage-column">
          <div className="stage-frame">
            <OceanCanvas state={state} onCollect={actions.collect} />

            <div className="survival-hud" aria-label="生存状态">
              <StatusBar label="生命" value={state.player.health} tone="health" glyph="+" />
              <StatusBar label="饱食" value={state.player.hunger} tone="hunger" glyph="▰" />
              <StatusBar label="口渴" value={state.player.thirst} tone="thirst" glyph="●" />
              <StatusBar label="船体" value={state.raft.integrity} tone="integrity" glyph="◇" />
            </div>

            <div className="level-card">
              <div><small>漂流等级</small><strong>LV.{state.progress.level.toString().padStart(2, '0')}</strong></div>
              <MiniProgress value={state.progress.xp} max={xpNeeded} />
              <span>{state.progress.xp} / {xpNeeded} XP</span>
              <b>{state.progress.score.toLocaleString('zh-CN')} 分</b>
            </div>

            <div className="objective-card">
              <small>{currentChapter ? `航海章节 ${currentChapter.number}` : '无尽远航'}</small>
              <strong>{currentChapter?.title ?? '信标已经回应，继续活下去'}</strong>
              <span>{nearestCollectable ? '附近有漂浮物 · 按 E 打捞' : currentChapter?.description ?? '完成每日合约，刷新最高分'}</span>
            </div>

            <div className="contract-chip" onClick={() => setActiveTab('voyage')} role="button" tabIndex={0}>
              <small>每日合约</small><strong>{state.progress.contract.title}</strong>
              <MiniProgress value={contractProgress} max={state.progress.contract.target} />
              <span>{contractProgress}/{state.progress.contract.target}</span>
            </div>

            {state.progress.combo >= 2 && (
              <div className="combo-badge"><small>SALVAGE CHAIN</small><strong>×{state.progress.combo}</strong></div>
            )}

            <div className="notice-stack" aria-live="polite">
              {state.notices.map((notice) => <div key={notice.id} className={`notice notice--${notice.tone}`}><span />{notice.text}</div>)}
            </div>

            {!state.progress.tutorial.completed && tutorialStep && !state.progress.tutorial.minimized && (
              <section className="tutorial-card">
                <header><span>新手航程 {state.progress.tutorial.step + 1}/{TUTORIAL_STEPS.length}</span><button type="button" onClick={() => actions.minimizeTutorial(true)}>—</button></header>
                <strong>{tutorialStep.title}</strong><p>{tutorialStep.description}</p><small>{tutorialStep.reward}</small>
              </section>
            )}
            {!state.progress.tutorial.completed && state.progress.tutorial.minimized && (
              <button type="button" className="tutorial-restore" onClick={() => actions.minimizeTutorial(false)}>新手指引 {state.progress.tutorial.step + 1}/{TUTORIAL_STEPS.length}</button>
            )}

            <div className="desktop-controls">
              <span><kbd>WASD</kbd> 移动</span><span><kbd>E</kbd> 打捞</span><span><kbd>SPACE</kbd> 钓鱼 / 收线</span>
            </div>

            <div className="mobile-controls" aria-label="移动端控制">
              <div className="dpad">
                <button type="button" onPointerDown={() => actions.move(0, -1)}>↑</button>
                <button type="button" onPointerDown={() => actions.move(-1, 0)}>←</button>
                <button type="button" onPointerDown={() => actions.move(0, 1)}>↓</button>
                <button type="button" onPointerDown={() => actions.move(1, 0)}>→</button>
              </div>
              <div className="mobile-actions"><button type="button" onClick={() => actions.collect()}>钩</button><button type="button" onClick={actions.fish}>鱼</button></div>
            </div>

            {state.fishing.active && (
              <div className="fishing-panel">
                <div className="fishing-panel__header"><span>FISHING SIGNAL</span><strong>看准潮汐，立即收线</strong></div>
                <div className="fishing-meter">
                  <div className="fishing-meter__target" style={{ left: `${state.fishing.targetStart}%`, width: `${state.fishing.targetWidth}%` }} />
                  <div className="fishing-meter__marker" style={{ left: `${state.fishing.marker}%` }} />
                </div>
                <button type="button" onClick={actions.fish}>收线 · SPACE</button>
              </div>
            )}

            {state.event && (
              <div className="event-overlay">
                <section className={`event-card event-card--${state.event.kind}`}>
                  <small>{EVENT_PRESENTATIONS[state.event.kind].eyebrow}</small>
                  <h2>{EVENT_PRESENTATIONS[state.event.kind].title}</h2>
                  <p>{EVENT_PRESENTATIONS[state.event.kind].description}</p>
                  <div className="event-timer"><i style={{ animationDuration: `${Math.max(1, state.event.expiresAt - state.event.createdAt)}s` }} /></div>
                  <div className="event-choices">
                    {EVENT_PRESENTATIONS[state.event.kind].choices.map((choice) => (
                      <button type="button" key={choice.id} onClick={() => actions.resolveEvent(choice.id)}><strong>{choice.label}</strong><small>{choice.hint}</small></button>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {state.gameOver && (
              <div className="full-overlay full-overlay--danger">
                <div className="overlay-panel">
                  <span className="overlay-panel__eyebrow">THE SEA REMEMBERS</span><h2>漂流中止</h2>
                  <p>你坚持到了第 {state.world.day} 天，得分 {state.progress.score.toLocaleString('zh-CN')}。海面仍在上涨，但下一块木板也许就在浪后。</p>
                  <button type="button" className="primary-button" onClick={commitRestart}>重新开始</button>
                </div>
              </div>
            )}
          </div>

          <div className="inventory-dock">
            <div className="inventory-dock__label"><span>储物箱</span><small>8 类资源</small></div>
            <div className="inventory-dock__items">
              {(Object.keys(state.inventory) as ResourceId[]).map((resource) => <ResourcePill key={resource} id={resource} count={state.inventory[resource]} />)}
            </div>
            <div className="inventory-dock__consume">
              <button type="button" onClick={() => actions.consume('fish')} disabled={!state.inventory.fish}>吃鱼 +{SURVIVAL.fishHungerRestore}</button>
              <button type="button" onClick={() => actions.consume('meal')} disabled={!state.inventory.meal}>热食 +{SURVIVAL.mealHungerRestore}</button>
              <button type="button" onClick={() => actions.consume('water')} disabled={!state.inventory.water}>喝水 +{SURVIVAL.waterThirstRestore}</button>
              <button type="button" className="repair-button" onClick={actions.repair} disabled={state.inventory.wood < SURVIVAL.repairCost || state.raft.integrity >= 100}>维修船体</button>
            </div>
          </div>
        </div>

        <aside className="upgrade-panel">
          <div className="upgrade-panel__header">
            <div><small>RAFT CONTROL DESK</small><h2>木筏控制台</h2></div>
            <div className="raft-level">{state.raft.size}×{state.raft.size}</div>
          </div>

          <div className="raft-summary">
            <div className={`raft-miniature raft-miniature--${state.raft.size}`} aria-label={`${state.raft.size} 乘 ${state.raft.size} 木筏结构图`}>
              {Array.from({ length: state.raft.size * state.raft.size }).map((_, index) => <span key={index} />)}
              {state.raft.modules.net && <i className="module-flag module-flag--net">NET</i>}
              {state.raft.modules.purifier && <i className="module-flag module-flag--water">H₂O</i>}
              {state.raft.modules.radio && <i className="module-flag module-flag--radio">RAD</i>}
            </div>
            <div className="signal-readout"><small>信号碎片</small><strong>{state.progress.signalFragments} / 4</strong><MiniProgress value={state.progress.signalFragments} max={4} /></div>
          </div>

          <nav className="panel-tabs" aria-label="木筏控制台页面">
            {PANEL_TABS.map((tab) => <button type="button" key={tab.id} className={activeTab === tab.id ? 'is-active' : ''} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
          </nav>

          {activeTab === 'build' && <BuildPanel state={state} build={actions.build} />}
          {activeTab === 'research' && <ResearchPanel state={state} research={actions.research} />}
          {activeTab === 'voyage' && <VoyagePanel state={state} />}

          {state.raft.modules.sail && (
            <section className="route-selector">
              <div className="section-label"><span>三角帆航向</span><small>实时生效</small></div>
              <div>
                {(Object.keys(ROUTE_LABELS) as RouteMode[]).map((route) => (
                  <button type="button" key={route} className={state.world.route === route ? 'is-active' : ''} onClick={() => actions.chooseRoute(route)} title={ROUTE_LABELS[route].description}>{ROUTE_LABELS[route].name}</button>
                ))}
              </div>
            </section>
          )}

          <button type="button" className="restart-link" onClick={beginRestart}>放弃本次漂流并重开</button>
        </aside>
      </section>

      {showIntro && !state.gameOver && (
        <div className="full-overlay intro-overlay">
          <div className="intro-panel">
            <div className="intro-panel__stamp">YEAR 07 · SEA LEVEL +68M</div>
            <p className="intro-panel__kicker">一切陆地都已沉入潮线之下</p>
            <h2>只剩一块木筏，<br />和一个还没放弃的人。</h2>
            <p className="intro-panel__copy">收集海上的残骸，钓鱼维生，把木筏建成能够穿越风暴的家。先完成六步新手航程，再追踪潮线之外的信号。</p>
            <div className="intro-panel__features"><span>11 项建造</span><span>6 条研究</span><span>5 章航程</span><span>随机海上事件</span></div>
            <div className="intro-panel__meta">
              <span>游客编号<br /><strong>{state.guestId.slice(-8).toUpperCase()}</strong></span>
              <span>当前进度<br /><strong>DAY {state.world.day.toString().padStart(2, '0')}</strong></span>
              <span>存档方式<br /><strong>{cloudConnected ? 'SPACETIMEDB' : 'LOCAL'}</strong></span>
            </div>
            <button type="button" className="primary-button" onClick={() => setShowIntro(false)}>{hadSave ? '继续漂流' : '踏上木筏'}</button>
            {hadSave && <button type="button" className="text-button" onClick={beginRestart}>建立新的漂流记录</button>}
          </div>
        </div>
      )}

      {confirmRestart && (
        <div className="full-overlay confirm-overlay">
          <div className="confirm-card" role="dialog" aria-modal="true" aria-label="确认重新开始">
            <small>RESET RUN</small><h2>真的要放弃这次漂流吗？</h2>
            <p>玩家身份会保留，但木筏、背包、等级和本局天数都会重新开始，并生成新的 runId。</p>
            <div><button type="button" className="secondary-button" onClick={() => setConfirmRestart(false)}>返回木筏</button><button type="button" className="danger-button" onClick={commitRestart}>确认重开</button></div>
          </div>
        </div>
      )}
    </main>
  );
}

export default TideAfterGame;
