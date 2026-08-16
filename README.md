# 潮线之后 / Tide After

一款可直接游玩的 **2.5D 俯视角、像素风、单人海上木筏生存 Web 游戏垂直切片**。

玩家扮演一名厚重潜水工，在被海洋淹没的世界里打捞漂浮物、钓鱼维生、建造设施、扩张木筏，并在昼夜与风暴之间决定何时冒险、何时返航。

本项目基于 MIT 许可的 [ThinkTidevibes/2D-Survival-Multiplayer-Game](https://github.com/thinktidevibes/2D-Survival-Multiplayer-Game) 改造，保留上游 Git 历史、React/Vite/TypeScript 工程与 SpacetimeDB 架构。当前玩法、世界观、界面与公开版本美术均为重新设计或原创内容。

![潮线之后 2.5D 桌面端运行画面](./preview-tide-after-25d.png)

## 核心循环

```text
移动探索 → 打捞与钓鱼 → 维持生命/饱食/口渴 → 制作设施
         → 扩建木筏 → 选择高风险航线 → 保存并继续远航
```

- 从 **2×2 木筏**起步，逐步扩建为 3×3、4×4，并放置 11 种可见设施。
- 管理生命、饱食、口渴与船体耐久；任一关键状态失控都可能终结本局。
- 收集木板、塑料、废铁、纤维、鱼、熟食、淡水与零件等 8 类资源。
- 通过收集网、过滤器、烤架和盐雾菜圃建立自动化生产链。
- 在残骸带、渔场与避风航线之间选择不同资源结构和风险回报。
- 经历昼夜、晴浪、阴潮、风暴预警、船体损伤与随机海上事件。
- 完成 6 步新手航程、每日合约、研究路线、章节、成就与信标目标。

所有难度、消耗、产出、设施和研究定义集中在 `client/src/tide/config.ts`，调节平衡无需修改核心循环。

## 2.5D 视觉与动作

- Canvas 使用独立 `requestAnimationFrame` 循环渲染，游戏规则仍以 100 ms 固定步长更新。
- 木筏具有侧面厚度、错位木板、磨损边缘、软阴影、绳结与近筏泡沫，不再是平铺方格。
- 海面包含三层不同速度的浪纹、水下明暗、昼夜高光、漂浮物投影与风暴雨幕。
- 场景对象按人物脚底或设施底边排序，潜水工可被帆、工作台和储物箱自然遮挡。
- 原创厚重潜水工使用 64×64 四向精灵图集，具有铜质头盔、玻璃高光、气瓶、软管和工具包。
- 支持待机、行走、抛钩、回收、抛竿、收线、建造、进食、维修与受伤动作。
- 动作在关键帧通过唯一 `commitToken` 提交一次操作，避免连点导致重复领取或重复扣料。
- HUD 收拢为左上铜制仪表、右上罗盘、底部 8 格快捷栏和右侧滑出抽屉。
- 手机端提供长按连续移动、自动锁定漂浮物、上下文动作按钮与全宽抽屉。

## 快速开始

需要 [Node.js](https://nodejs.org/) 20 或更高版本。

```bash
npm install
npm run dev
```

打开 Vite 输出的本地地址即可开始。默认不要求登录或数据库，游戏使用浏览器 `localStorage` 自动保存游客身份和本局进度。

生产构建：

```bash
npm run build
npm run preview
```

## 控制方式

| 操作 | 桌面端 | 手机端 |
| --- | --- | --- |
| 移动 | WASD / 方向键 | 按住左下方向盘连续移动 |
| 打捞 | E / 点击漂浮物自动锁定 | 右下上下文按钮 / “钩”按钮 |
| 钓鱼与收线 | 空格 / F | 右下上下文按钮 / “竿”按钮 |
| 食用与饮水 | 点击底部快捷栏 | 点击底部快捷栏 / 上下文按钮 |
| 维修 | 点击左上船体仪表 | 上下文按钮 |
| 建造、研究、航海志 | 打开右侧抽屉 | 打开底部全宽抽屉 |

打捞、建造、维修和收线期间会短暂锁定移动；受伤动作可以中断其他动作。超出交互范围时，场景会显示距离反馈。

## 引导、风险与长期目标

- `getPrimaryAction(state)` 始终只派生一个最重要的当前目标，避免教程、合约和章节同时争抢注意力。
- 首局优先引导第一次打捞、第一次进食或饮水，以及第一次扩建。
- 钓鱼提供“完美 / 普通 / 脱钩”三级结果，而不是简单的成功或失败。
- 第 3 天起出现风暴预警窗口，玩家可以维修、避风，或冒险争取特殊收益。
- 三角帆解锁漂流区域选择；信号碎片和信标构成可追踪的中长期目标。
- 生命归零后可查看本局数据并创建新的 `runId`，游客身份和个人记录保持不变。

## 存档与可选云快照

本地 `TideGameState` 是当前单人玩法的运行时状态。存档使用 `schemaVersion: 2`，支持旧版本迁移、每 1.8 秒自动检查点和页面离开保存。

SpacetimeDB 只用于可选云快照；服务端不可用时，游戏仍可离线完整运行。要启用本地服务端，需要 Rust 与 SpacetimeDB CLI：

```bash
spacetime start
spacetime publish -s local --module-path server tide-after
spacetime generate --lang typescript --out-dir client/src/tide/generated --module-path server
```

也可以使用仓库脚本：

```bash
npm run spacetime:build
npm run spacetime:generate
```

复制 `.env.example` 为 `.env.local`，并配置：

```dotenv
VITE_SPACETIME_HOST=http://127.0.0.1:3000
VITE_SPACETIME_MODULE=tide-after
```

客户端会匿名连接；Reducer 负责校验身份、位置、资源、设施依赖、状态上限和重复领取，版本化快照负责恢复完整长局状态。

## 本地参考素材模式

默认开发与生产构建只使用原创素材。本地参考模式仅用于比较木材和 UI 纹理，不会把参考文件复制进 Git 或生产产物。

在 `.env.local` 中显式配置：

```dotenv
VITE_TIDE_ART_MODE=reference
TIDE_REFERENCE_ASSET_ROOT=C:/Users/your-name/Desktop/Content
```

开发服务器只读提供以下白名单文件：

- `Tiles_30.png`
- `Tiles_19.png`
- `UI/DisplaySlots_5.png`

文件缺失时会自动回退到原创素材并显示一次开发警告。若生产构建检测到参考模式，会直接失败；`npm run verify:assets` 还会检查 `dist` 中是否存在参考路由、桌面绝对路径或受保护素材标识。

Terraria 官方素材并非开源素材，版权仍属于 Re-Logic。项目不会把这些文件带入公开构建，具体边界与生成记录见 [ASSETS.md](./ASSETS.md)、[Terraria Legal](https://terraria.org/terms) 和 [官方 Wiki 版权文件分类](https://terraria.wiki.gg/wiki/Category:Files_under_copyright_by_Re-Logic)。

## 质量检查

```bash
npm test
npm run lint
npm run build
npm run verify:assets
npm audit --omit=dev
```

当前基线：

| 检查项 | 结果 |
| --- | --- |
| 游戏规则与视觉动作测试 | 28/28 通过 |
| TypeScript 与 Vite 生产构建 | 通过 |
| ESLint | 通过 |
| 生产素材审计 | 通过 |
| `npm audit --omit=dev` | 0 个已知漏洞 |
| SpacetimeDB WASM 与 bindings | 构建、生成通过 |
| 桌面端 1440×900 | 操作闭环通过，无横向溢出或控制台异常 |
| 手机端 390×844 | 长按移动、动作轮和抽屉通过，无横向溢出或控制台异常 |
| 渲染性能 | 实测 60 FPS，活动粒子不超过 200 |

![潮线之后 2.5D 手机端运行画面](./preview-tide-after-25d-mobile.png)

## 项目结构

```text
client/src/tide/                 状态、配置、规则、引导、测试、存档与云桥
client/src/tide/visual/          素材清单、动画定义、动作控制器与 2.5D 渲染器
client/src/tide/generated/       SpacetimeDB TypeScript bindings
client/src/components/tide/      Canvas 场景、沉浸式 HUD 与滑出抽屉
public/assets/tide-original/     公开版本原创运行时素材
art-source/tide-original/        原创美术源文件与处理前素材
scripts/                         素材处理与生产构建审计脚本
server/src/tide_after.rs         SpacetimeDB 数据表与 Reducer
ASSETS.md                        素材来源、生成过程与许可证边界
UPSTREAM.md                      上游项目来源与改造边界
```

## 当前范围

当前版本聚焦单人 Web 生存体验，暂不包含多人联机、复杂战斗、敌人/NPC、大型岛屿地图、完整账号体系和微信小程序打包。上游旧模块仍保留在仓库与 Git 历史中，但不进入当前 `App` 入口。

## 许可与来源

项目继续保留上游 [MIT License](./LICENSE)。原创新增代码沿用本仓库许可证；第三方来源、参考边界与素材说明见 [UPSTREAM.md](./UPSTREAM.md) 和 [ASSETS.md](./ASSETS.md)。
