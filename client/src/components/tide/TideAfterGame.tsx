import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  ACHIEVEMENTS,
  CHAPTERS,
  PERKS,
  RESOURCE_LABELS,
  ROUTE_LABELS,
  SURVIVAL,
  UPGRADES,
  WORLD,
} from '../../tide/config';
import {
  canAfford,
  EVENT_PRESENTATIONS,
  getContractProgress,
  getStormWarningSeconds,
  getXpToNext,
} from '../../tide/game';
import { getPrimaryAction } from '../../tide/guidance';
import type {
  PerkId,
  RaftModuleId,
  ResourceId,
  RouteMode,
  TideGameState,
} from '../../tide/types';
import { useTideGame } from '../../tide/useTideGame';
import { loadTideVisualAssets } from '../../tide/visual/assets';
import {
  createTideRendererMemory,
  renderTideScene,
  type TideRendererMemory,
} from '../../tide/visual/renderer';
import type {
  LoadedTideAssets,
  PlayerVisualState,
  VisualEffect,
} from '../../tide/visual/types';
import { useTideVisualActions } from '../../tide/visual/useTideVisualActions';
import './tide-after.css';

const RESOURCE_GLYPHS: Record<ResourceId, string> = {
  wood: '▰',
  plastic: '◒',
  scrap: '✦',
  fiber: '≋',
  fish: '◖',
  meal: '●',
  water: '◆',
  parts: '⚙',
};

const WEATHER_LABELS = { clear: '晴朗', cloudy: '阴潮', storm: '风暴' } as const;
const PANEL_TABS = [
  { id: 'build', label: '建造', glyph: '⚒' },
  { id: 'research', label: '研究', glyph: '⌬' },
  { id: 'voyage', label: '航海志', glyph: '⌖' },
] as const;
type PanelTab = (typeof PANEL_TABS)[number]['id'];

const EMPTY_ASSETS: LoadedTideAssets = {
  mode: 'original',
  diver: null,
  woodTile: null,
  platformEdge: null,
  slotFrame: null,
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const formatTime = (progress: number) => {
  const totalMinutes = Math.floor(progress * 24 * 60);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return hours.toString().padStart(2, '0') + ':' + minutes.toString().padStart(2, '0');
};

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return minutes
    ? minutes + ' 分 ' + Math.floor(seconds % 60) + ' 秒'
    : Math.floor(seconds) + ' 秒';
};

function OceanCanvas({
  state,
  visualRef,
  effectsRef,
  onCollect,
}: {
  state: TideGameState;
  visualRef: MutableRefObject<PlayerVisualState>;
  effectsRef: MutableRefObject<VisualEffect[]>;
  onCollect: (id?: string) => boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(state);
  const assetsRef = useRef<LoadedTideAssets>(EMPTY_ASSETS);
  const memoryRef = useRef<TideRendererMemory | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let active = true;
    void loadTideVisualAssets().then((assets) => {
      if (active) assetsRef.current = assets;
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.imageSmoothingEnabled = false;
    if (!memoryRef.current) memoryRef.current = createTideRendererMemory(stateRef.current);
    let frame = 0;
    let frames = 0;
    let sampledAt = performance.now();
    const render = (now: number) => {
      const memory = memoryRef.current;
      if (!memory) return;
      renderTideScene(
        context,
        stateRef.current,
        visualRef.current,
        assetsRef.current,
        effectsRef.current,
        now,
        memory,
      );
      frames += 1;
      if (now - sampledAt >= 1_000) {
        canvas.dataset.fps = String(Math.round(frames * 1_000 / (now - sampledAt)));
        canvas.dataset.particles = String(memory.particles.length);
        canvas.dataset.assetMode = assetsRef.current.mode;
        frames = 0;
        sampledAt = now;
      }
      frame = window.requestAnimationFrame(render);
    };
    frame = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(frame);
  }, [effectsRef, visualRef]);

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const scale = Math.max(bounds.width / WORLD.width, bounds.height / WORLD.height);
    const renderedWidth = WORLD.width * scale;
    const renderedHeight = WORLD.height * scale;
    const offsetX = (bounds.width - renderedWidth) / 2;
    const offsetY = (bounds.height - renderedHeight) / 2;
    const x = (event.clientX - bounds.left - offsetX) / scale;
    const y = (event.clientY - bounds.top - offsetY) / scale;
    const target = state.debris
      .map((item) => ({ item, distance: Math.hypot(item.x - x, item.y - y) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (target && target.distance < 96) onCollect(target.item.id);
  };

  return (
    <canvas
      ref={canvasRef}
      className="ocean-canvas"
      width={WORLD.width}
      height={WORLD.height}
      onPointerDown={onPointerDown}
      aria-label="俯视角海上木筏场景，点击漂浮物可自动锁定打捞"
    />
  );
}

function Gauge({
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
    <div className={'brass-gauge brass-gauge--' + tone}>
      <span className="brass-gauge__icon">{glyph}</span>
      <div>
        <span>{label}</span>
        <i><b style={{ width: clamp(value, 0, 100) + '%' }} /></i>
      </div>
      <strong>{Math.round(value)}</strong>
    </div>
  );
}

function MiniProgress({ value, max }: { value: number; max: number }) {
  const percent = max <= 0 ? 100 : clamp(value / max * 100, 0, 100);
  return <span className="mini-progress"><i style={{ width: percent + '%' }} /></span>;
}

function BuildPanel({
  state,
  build,
  busy,
}: {
  state: TideGameState;
  build: (id: RaftModuleId) => boolean;
  busy: boolean;
}) {
  return (
    <div className="drawer-scroll build-list">
      {UPGRADES.map((upgrade) => {
        const built = state.raft.modules[upgrade.id];
        const levelLocked = state.progress.level < upgrade.unlockLevel;
        const dependencyLocked = Boolean(upgrade.requires && !state.raft.modules[upgrade.requires]);
        const signalLocked = (upgrade.signalRequired ?? 0) > state.progress.signalFragments;
        const affordable = canAfford(state, upgrade.cost);
        const missing = (Object.entries(upgrade.cost) as [ResourceId, number][])
          .filter(([resource, amount]) => state.inventory[resource] < amount)
          .map(([resource, amount]) => RESOURCE_LABELS[resource] + ' ' + (amount - state.inventory[resource]))
          .join(' · ');
        const disabled = busy || built || levelLocked || dependencyLocked || signalLocked || !affordable;
        return (
          <article key={upgrade.id} className={'build-card ' + (built ? 'is-built' : '')}>
            <div className="build-card__icon">
              <span className={'module-icon module-icon--' + upgrade.id} />
            </div>
            <div className="build-card__body">
              <header>
                <span>{upgrade.eyebrow}</span>
                <small>{built ? '已建成' : 'LV ' + upgrade.unlockLevel}</small>
              </header>
              <h3>{upgrade.name}</h3>
              <p>{upgrade.description}</p>
              <div className="material-row">
                {(Object.entries(upgrade.cost) as [ResourceId, number][]).map(([resource, amount]) => (
                  <span
                    key={resource}
                    className={state.inventory[resource] < amount ? 'is-missing' : ''}
                  >
                    {RESOURCE_GLYPHS[resource]} {amount}
                  </span>
                ))}
              </div>
              {!built && missing && <em>还缺：{missing}</em>}
              <button type="button" disabled={disabled} onClick={() => build(upgrade.id)}>
                {built ? '结构稳定' : affordable ? '开始敲击' : '继续打捞'}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ResearchPanel({
  state,
  research,
}: {
  state: TideGameState;
  research: (id: PerkId) => void;
}) {
  return (
    <div className="drawer-scroll research-grid">
      <div className="research-balance">
        <span>可用科技点</span><strong>{state.progress.techPoints}</strong>
        <small>每级研究成本等于下一等级</small>
      </div>
      {PERKS.map((perk) => {
        const level = state.progress.perks[perk.id];
        const cost = level + 1;
        const maxed = level >= perk.maxLevel;
        return (
          <article key={perk.id} className="research-card">
            <div className="research-card__glyph">{perk.glyph}</div>
            <div>
              <small>LV {level} / {perk.maxLevel}</small>
              <h3>{perk.name}</h3>
              <p>{perk.description}</p>
              <div className="perk-pips">
                {Array.from({ length: perk.maxLevel }).map((_, index) => (
                  <i key={index} className={index < level ? 'is-on' : ''} />
                ))}
              </div>
              <button
                type="button"
                disabled={maxed || state.progress.techPoints < cost}
                onClick={() => research(perk.id)}
              >
                {maxed ? '研究完成' : '投入 ' + cost + ' 点'}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function VoyagePanel({
  state,
  chooseRoute,
}: {
  state: TideGameState;
  chooseRoute: (route: RouteMode) => void;
}) {
  const contract = state.progress.contract;
  const progress = getContractProgress(state);
  return (
    <div className="drawer-scroll voyage-panel">
      <section className={'contract-card ' + (contract.completed ? 'is-complete' : '')}>
        <small>DAY {contract.day.toString().padStart(2, '0')} · 每日合约</small>
        <h3>{contract.title}</h3>
        <p>{contract.description}</p>
        <MiniProgress value={progress} max={contract.target} />
        <strong>{progress} / {contract.target}</strong>
      </section>

      {state.raft.modules.sail && (
        <section className="route-board">
          <header><span>选择漂流区域</span><small>风险与收益即时生效</small></header>
          {(Object.keys(ROUTE_LABELS) as RouteMode[]).map((route) => (
            <button
              type="button"
              key={route}
              className={state.world.route === route ? 'is-active' : ''}
              onClick={() => chooseRoute(route)}
            >
              <strong>{ROUTE_LABELS[route].name}</strong>
              <small>{ROUTE_LABELS[route].description}</small>
            </button>
          ))}
        </section>
      )}

      <section className="voyage-section">
        <header><span>航海章节</span><small>{state.progress.completedChapters.length}/{CHAPTERS.length}</small></header>
        {CHAPTERS.map((chapter) => (
          <article
            key={chapter.id}
            className={state.progress.completedChapters.includes(chapter.id) ? 'is-complete' : ''}
          >
            <b>{chapter.number}</b>
            <div><strong>{chapter.title}</strong><small>{chapter.description}</small></div>
          </article>
        ))}
      </section>

      <section className="voyage-section achievements">
        <header><span>已发现记录</span><small>{state.progress.achievements.length}/{ACHIEVEMENTS.length}</small></header>
        {ACHIEVEMENTS.map((achievement) => (
          <article
            key={achievement.id}
            className={state.progress.achievements.includes(achievement.id) ? 'is-complete' : ''}
          >
            <b>✦</b>
            <div><strong>{achievement.name}</strong><small>{achievement.description}</small></div>
          </article>
        ))}
      </section>
    </div>
  );
}

function Hotbar({
  state,
  consume,
}: {
  state: TideGameState;
  consume: (resource: 'fish' | 'meal' | 'water') => boolean;
}) {
  const previous = useRef(state.inventory);
  const [gained, setGained] = useState<ResourceId | null>(null);
  useEffect(() => {
    const resource = (Object.keys(state.inventory) as ResourceId[])
      .find((id) => state.inventory[id] > previous.current[id]);
    previous.current = { ...state.inventory };
    if (!resource) return;
    setGained(resource);
    const timer = window.setTimeout(() => setGained(null), 760);
    return () => window.clearTimeout(timer);
  }, [state.inventory]);

  return (
    <div className="hotbar" aria-label="资源快捷栏">
      {(Object.keys(state.inventory) as ResourceId[]).map((resource, index) => {
        const consumable = resource === 'fish' || resource === 'meal' || resource === 'water';
        return (
          <button
            type="button"
            key={resource}
            className={'hotbar-slot ' + (gained === resource ? 'is-gained' : '')}
            disabled={consumable && state.inventory[resource] <= 0}
            onClick={() => {
              if (consumable) consume(resource);
            }}
            title={consumable ? '点击使用' : RESOURCE_LABELS[resource]}
          >
            <small>{index + 1}</small>
            <span className={'resource-icon resource-icon--' + resource} />
            <strong>{state.inventory[resource]}</strong>
            <em>{RESOURCE_LABELS[resource]}</em>
          </button>
        );
      })}
    </div>
  );
}

function TideAfterGame() {
  const { state, hadSave, lastSavedAt, cloudStatus, actions } = useTideGame();
  const visual = useTideVisualActions(state, actions);
  const [showIntro, setShowIntro] = useState(true);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>('build');
  const guidance = useMemo(() => getPrimaryAction(state), [state]);
  const stormWarning = getStormWarningSeconds(state);
  const xpNeeded = getXpToNext(state.progress.level);
  const cloudConnected = cloudStatus === 'connected';

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('button, input, textarea, select')) return;
      const key = event.key.toLowerCase();
      if (key === 'e' && !event.repeat) {
        visual.actions.collect();
        event.preventDefault();
      }
      if ((key === ' ' || key === 'f') && !event.repeat) {
        visual.actions.fish();
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visual.actions]);

  const openDrawer = useCallback((tab: PanelTab) => {
    setActiveTab(tab);
    setDrawerOpen(true);
  }, []);

  const commitRestart = () => {
    actions.restart();
    setConfirmRestart(false);
    setShowIntro(false);
    setDrawerOpen(false);
  };

  const beginMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
    x: number,
    y: number,
  ) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    actions.startMove(x, y);
  };
  const stopMove = () => actions.stopMove();

  const contextAction = () => {
    if (state.fishing.active) return visual.actions.fish();
    const nearest = state.debris
      .map((item) => ({
        item,
        distance: Math.hypot(item.x - state.player.x, item.y - state.player.y),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (nearest && nearest.distance <= 206) return visual.actions.collect(nearest.item.id);
    if (state.player.thirst < 50 && state.inventory.water > 0) return visual.actions.consume('water');
    if (state.player.hunger < 50 && state.inventory.meal > 0) return visual.actions.consume('meal');
    if (state.player.hunger < 50 && state.inventory.fish > 0) return visual.actions.consume('fish');
    return visual.actions.fish();
  };
  const contextLabel = state.fishing.active
    ? '收线'
    : state.debris.some((item) => Math.hypot(item.x - state.player.x, item.y - state.player.y) <= 206)
      ? '打捞'
      : state.player.thirst < 50 && state.inventory.water > 0
        ? '喝水'
        : state.player.hunger < 50 && (state.inventory.meal > 0 || state.inventory.fish > 0)
          ? '进食'
          : '钓鱼';

  return (
    <main
      className={'tide-app tide-app--immersive weather--' + state.world.weather}
      data-visual-action={visual.visual.action}
    >
      <section className="world-stage">
        <OceanCanvas
          state={state}
          visualRef={visual.visualRef}
          effectsRef={visual.effectsRef}
          onCollect={visual.actions.collect}
        />

        <header className="brand-chip">
          <span>潮</span>
          <div><small>AFTER THE TIDELINE</small><strong>潮线之后</strong></div>
        </header>

        <section className="survival-cluster" aria-label="生存状态">
          <header>
            <span>潜水工 · LV.{state.progress.level.toString().padStart(2, '0')}</span>
            <small>{state.progress.xp}/{xpNeeded} XP</small>
          </header>
          <MiniProgress value={state.progress.xp} max={xpNeeded} />
          <Gauge label="生命" value={state.player.health} tone="health" glyph="+" />
          <Gauge label="饱食" value={state.player.hunger} tone="hunger" glyph="▰" />
          <Gauge label="口渴" value={state.player.thirst} tone="thirst" glyph="◆" />
          <Gauge label="船体" value={state.raft.integrity} tone="integrity" glyph="◇" />
          <button
            type="button"
            className="repair-quick"
            disabled={visual.busy || state.inventory.wood < SURVIVAL.repairCost || state.raft.integrity >= 100}
            onClick={visual.actions.repair}
          >
            ⚒ 维修
          </button>
        </section>

        <section className="compass-cluster">
          <div className="compass-rose"><i /><span>N</span><b>{state.world.route === 'safe' ? 'S' : state.world.route === 'fishing' ? 'F' : 'R'}</b></div>
          <div>
            <small>DAY {state.world.day.toString().padStart(2, '0')}</small>
            <strong>{formatTime(state.world.timeOfDay)}</strong>
            <span>{WEATHER_LABELS[state.world.weather]} · {ROUTE_LABELS[state.world.route].name}</span>
          </div>
          <button type="button" onClick={actions.saveNow} title="保存当前进度">
            {cloudConnected ? '云存档' : '本地存档'}
            <small>{new Date(lastSavedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</small>
          </button>
        </section>

        <section className={'primary-guidance primary-guidance--' + guidance.kind}>
          <small>{guidance.eyebrow}</small>
          <strong>{guidance.title}</strong>
          <span>{guidance.detail}</span>
          {guidance.progress && <b>{guidance.progress}</b>}
        </section>

        {stormWarning !== null && (
          <div className="storm-warning">
            <span>⚠ 风暴前沿</span>
            <strong>{Math.ceil(stormWarning)} 秒后抵达</strong>
            <small>维修、切换避风航线，或冒险留在残骸带</small>
          </div>
        )}

        {visual.feedback && <div className="action-feedback">{visual.feedback}</div>}

        <div className="notice-stack" aria-live="polite">
          {state.notices.slice(-3).map((notice) => (
            <div key={notice.id} className={'notice notice--' + notice.tone}>
              <span />{notice.text}
            </div>
          ))}
        </div>

        {state.progress.combo >= 2 && (
          <div className="combo-token"><small>连捞</small><strong>×{state.progress.combo}</strong></div>
        )}

        <nav className="drawer-rail" aria-label="木筏控制抽屉">
          {PANEL_TABS.map((tab) => (
            <button
              type="button"
              key={tab.id}
              className={drawerOpen && activeTab === tab.id ? 'is-active' : ''}
              onClick={() => drawerOpen && activeTab === tab.id ? setDrawerOpen(false) : openDrawer(tab.id)}
            >
              <span>{tab.glyph}</span><small>{tab.label}</small>
            </button>
          ))}
        </nav>

        <aside className={'control-drawer ' + (drawerOpen ? 'is-open' : '')}>
          <header className="control-drawer__header">
            <div>
              <small>RAFT WORK DESK</small>
              <h2>{PANEL_TABS.find((tab) => tab.id === activeTab)?.label}</h2>
            </div>
            <span>{state.raft.size}×{state.raft.size}</span>
            <button type="button" onClick={() => setDrawerOpen(false)} aria-label="关闭抽屉">×</button>
          </header>
          <nav className="drawer-tabs">
            {PANEL_TABS.map((tab) => (
              <button
                type="button"
                key={tab.id}
                className={activeTab === tab.id ? 'is-active' : ''}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          {activeTab === 'build' && (
            <BuildPanel state={state} build={visual.actions.build} busy={visual.busy} />
          )}
          {activeTab === 'research' && (
            <ResearchPanel state={state} research={actions.research} />
          )}
          {activeTab === 'voyage' && (
            <VoyagePanel state={state} chooseRoute={actions.chooseRoute} />
          )}
          <button type="button" className="restart-run" onClick={() => setConfirmRestart(true)}>
            放弃本次漂流并重开
          </button>
        </aside>

        <div className="desktop-hints">
          <span><kbd>WASD</kbd> 移动</span>
          <span><kbd>E</kbd> 打捞</span>
          <span><kbd>SPACE</kbd> 抛竿 / 收线</span>
        </div>

        <Hotbar state={state} consume={visual.actions.consume} />

        <div className="mobile-controls" aria-label="移动端控制">
          <div className="touch-dpad">
            <button
              type="button"
              aria-label="向上移动"
              onPointerDown={(event) => beginMove(event, 0, -1)}
              onPointerUp={stopMove}
              onPointerCancel={stopMove}
              onLostPointerCapture={stopMove}
            >↑</button>
            <button
              type="button"
              aria-label="向左移动"
              onPointerDown={(event) => beginMove(event, -1, 0)}
              onPointerUp={stopMove}
              onPointerCancel={stopMove}
              onLostPointerCapture={stopMove}
            >←</button>
            <i />
            <button
              type="button"
              aria-label="向右移动"
              onPointerDown={(event) => beginMove(event, 1, 0)}
              onPointerUp={stopMove}
              onPointerCancel={stopMove}
              onLostPointerCapture={stopMove}
            >→</button>
            <button
              type="button"
              aria-label="向下移动"
              onPointerDown={(event) => beginMove(event, 0, 1)}
              onPointerUp={stopMove}
              onPointerCancel={stopMove}
              onLostPointerCapture={stopMove}
            >↓</button>
          </div>
          <div className={'action-wheel ' + (visual.busy ? 'is-busy' : '')}>
            <button type="button" className="action-wheel__secondary" onClick={() => visual.actions.collect()}>钩</button>
            <button
              type="button"
              className="action-wheel__main"
              disabled={visual.busy}
              onClick={contextAction}
            >
              <span>{contextLabel}</span>
              <small>{visual.busy ? '动作中' : 'ACTION'}</small>
            </button>
            <button type="button" className="action-wheel__secondary" onClick={visual.actions.fish}>竿</button>
          </div>
        </div>

        {state.fishing.active && (
          <div className="fishing-panel">
            <header><span>潮汐判定</span><strong>中心区域 = 完美收线</strong></header>
            <div className="fishing-meter">
              <i
                className="fishing-meter__target"
                style={{
                  left: state.fishing.targetStart + '%',
                  width: state.fishing.targetWidth + '%',
                }}
              />
              <i
                className="fishing-meter__perfect"
                style={{
                  left: state.fishing.targetStart + state.fishing.targetWidth * 0.32 + '%',
                  width: state.fishing.targetWidth * 0.36 + '%',
                }}
              />
              <b style={{ left: state.fishing.marker + '%' }} />
            </div>
            <button type="button" onClick={visual.actions.fish}>收线 · SPACE</button>
          </div>
        )}

        {state.event && (
          <div className="event-overlay">
            <section className={'event-card event-card--' + state.event.kind}>
              <small>{EVENT_PRESENTATIONS[state.event.kind].eyebrow}</small>
              <h2>{EVENT_PRESENTATIONS[state.event.kind].title}</h2>
              <p>{EVENT_PRESENTATIONS[state.event.kind].description}</p>
              <div className="event-choices">
                {EVENT_PRESENTATIONS[state.event.kind].choices.map((choice) => (
                  <button type="button" key={choice.id} onClick={() => actions.resolveEvent(choice.id)}>
                    <strong>{choice.label}</strong><small>{choice.hint}</small>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        {state.gameOver && (
          <div className="full-overlay">
            <section className="ending-card">
              <small>THE SEA REMEMBERS</small>
              <h2>漂流中止</h2>
              <p>你坚持到第 {state.world.day} 天，完成 {state.progress.stats.collected} 次打捞，最高连捞记录留在这片海上。</p>
              <div className="ending-stats">
                <span><small>航行时间</small><strong>{formatDuration(state.progress.stats.survivedSeconds)}</strong></span>
                <span><small>建造设施</small><strong>{state.progress.stats.built}</strong></span>
                <span><small>最终得分</small><strong>{state.progress.score.toLocaleString('zh-CN')}</strong></span>
              </div>
              <button type="button" onClick={commitRestart}>生成新的漂流</button>
            </section>
          </div>
        )}
      </section>

      {showIntro && !state.gameOver && (
        <div className="full-overlay intro-overlay">
          <section className="intro-card">
            <div className="intro-copy">
              <small>YEAR 07 · SEA LEVEL +68M</small>
              <h1>潮线之后</h1>
              <h2>最后一块木筏，<br />和一个还没放弃的人。</h2>
              <p>打捞海上残骸，钓鱼维生，把 2×2 木筏建成能穿越风暴的家。首局只追踪一个当前目标，让每一步都清楚可见。</p>
              <div>
                <span>厚重潜水工</span><span>2.5D 深度遮挡</span><span>完整交互动作</span>
              </div>
              <button type="button" onClick={() => setShowIntro(false)}>
                {hadSave ? '继续漂流' : '踏上木筏'}
              </button>
              {hadSave && (
                <button type="button" className="intro-reset" onClick={() => setConfirmRestart(true)}>
                  建立新的漂流记录
                </button>
              )}
            </div>
            <div className="diver-portrait">
              <img src="/assets/tide-original/diver-portrait.png" alt="原创厚重潜水工角色" />
              <span>HEAVY SALVAGE SUIT · 07</span>
            </div>
          </section>
        </div>
      )}

      {confirmRestart && (
        <div className="full-overlay confirm-overlay">
          <section className="confirm-card" role="dialog" aria-modal="true">
            <small>RESET RUN</small>
            <h2>放弃这次漂流？</h2>
            <p>游客身份会保留；木筏、背包、等级和本局天数会重置，并生成新的 runId。</p>
            <div>
              <button type="button" onClick={() => setConfirmRestart(false)}>返回木筏</button>
              <button type="button" className="danger" onClick={commitRestart}>确认重开</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default TideAfterGame;
