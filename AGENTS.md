# AGENTS.md

本文件是《潮线之后 / Tide After》仓库级 Agent 工作指南。任何代码 Agent 开始任务前都应先阅读本文件，再阅读与任务相关的 README、测试和源码。

## 项目概况

《潮线之后》是 React 19、Vite 和 TypeScript 构建的单人 2.5D 等距像素风木筏生存 Web 游戏。游戏默认完全在浏览器中运行，使用 `localStorage` 保存游客身份和本局进度；SpacetimeDB 目前只承担可选云快照，不是本地试玩的必要依赖。

当前主要玩法状态是本地 `TideGameState`，存档版本为 `schemaVersion: 2`。除非任务明确要求迁移，否则不得修改存档版本、SpacetimeDB 表或 Reducer 接口。

## 工作目录与环境

所有 npm 命令都必须在仓库根目录执行。根目录包含 `package.json`，`client/` 下没有独立的 `package.json`。

环境要求：

- Node.js 20 或更高版本。
- npm 使用仓库中的 `package-lock.json`。
- 不需要登录、数据库或私钥即可运行默认单人模式。
- 不要提交 `.env.local`、密钥、日志、缓存、`node_modules/` 或 `dist/`。

首次运行：

```bash
npm install
npm run dev
```

打开 Vite 输出的本地地址，通常为 `http://127.0.0.1:5173/`。

生产构建与本地预览：

```bash
npm run build
npm run verify:assets
npm run preview
```

## 可选 SpacetimeDB 云快照

不配置数据库时必须保持游戏可正常运行。需要验证云快照时才启动本地 SpacetimeDB：

```bash
spacetime start
spacetime publish -s local --module-path server tide-after
spacetime generate --lang typescript --out-dir client/src/tide/generated --module-path server
```

在未提交的 `.env.local` 中配置：

```dotenv
VITE_SPACETIME_HOST=http://127.0.0.1:3000
VITE_SPACETIME_MODULE=tide-after
```

`client/src/tide/generated/` 是生成代码。只有在服务端接口确实改变并重新生成 bindings 时才更新，不要手工修改其中的文件。

## 代码结构

- `client/src/tide/`：状态类型、配置、游戏规则、引导、存档和云桥。
- `client/src/tide/visual/`：等距投影、水面、素材清单、动画、输入事务和 Canvas 渲染器。
- `client/src/components/tide/`：游戏场景、HUD、抽屉和响应式样式。
- `public/assets/tide-original/`：公开版本可使用的原创运行时素材。
- `art-source/tide-original/`：原创美术源文件、中间稿和旧角色归档。
- `server/src/tide_after.rs`：潮线玩法的 SpacetimeDB 表与 Reducer。
- `ASSETS.md`：素材来源、生成流程、版权与使用边界。
- `UPSTREAM.md`：上游项目来源和保留范围。

## 实施约束

- 不使用 `frontend-design`。
- 保持单人 Web 游戏为当前主线，不擅自接回上游多人 MMORPG 系统。
- 不复制 Terraria、Raft 或其他游戏的角色、贴图、故事和受保护素材。
- `C:/Users/hzy/Desktop/Content` 只能通过显式参考模式在本机只读使用，不得复制进 Git 或生产构建。
- 默认和生产构建只能使用原创素材；新增或替换素材时同步更新 `ASSETS.md`。
- 保持 `TideGameState`、`schemaVersion: 2` 和现有 `useTideGame.actions` 兼容，除非任务明确批准接口迁移。
- 游戏规则更新节奏与 `requestAnimationFrame` 渲染循环相互独立；不要把视觉摆动写回碰撞或存档坐标。
- 输入必须经过统一事务或关键帧提交机制，避免重复攻击、重复钓鱼、重复领取和重复扣料。
- 保持等距投影、脚底/设施底边深度排序、八向移动及键盘、鼠标、触控兼容。
- 活动粒子总数不得超过 200；常规目标为桌面接近 60 FPS、手机不少于 30 FPS。
- 桌面验收尺寸为 1440×900，移动端验收尺寸为 390×844，页面不得横向溢出。
- 尊重现有未提交修改，不覆盖与当前任务无关的文件；禁止使用 `git reset --hard`、强制检出覆盖或其他破坏性 Git 命令。

## 修改流程

1. 执行 `git status --short --branch`，确认分支和用户已有修改。
2. 阅读相关源码、测试、README 和素材说明，先确定真实实现再修改。
3. 只修改完成当前任务所需的最小范围，不顺带重构无关上游代码。
4. 对规则、存档、输入、投影或动作变化补充对应自动化测试。
5. 功能或运行方式变化时更新 `README.md`；素材变化时同时更新 `ASSETS.md`。
6. 运行完整质量检查。
7. 检查差异中不存在密钥、本地绝对桌面路径、Terraria 资源或意外生成文件。
8. 在当前功能分支创建清晰提交并推送到 `origin`。
9. 向用户报告改动、检查结果、提交哈希和本地运行方式。

除非用户明确要求，不要向 `upstream` 推送，不要重写远端历史，也不要自动合并到默认分支。当前长期开发分支为 `feat/visual-depth-overhaul`。

## 必做质量检查

提交前必须从仓库根目录依次运行：

```bash
npm test
npm run lint
npm run build
npm run verify:assets
```

当前基线为 55 项测试通过。测试数量以后可以增加，但现有测试不得无解释地删除或跳过。若任何检查失败，应修复后重新运行；如果失败与当前任务无关且无法安全修复，应停止提交并向用户说明证据。

文档专用修改仍应执行以上四项检查，以确认说明中的命令与当前仓库保持一致。

## 交付与 GitHub

用户要求每次完成更新后同步维护 README，并推送 GitHub。标准交付命令为：

```bash
git status --short
git diff --check
git add <本次修改的文件>
git commit -m "<清晰描述本次更新>"
git push origin feat/visual-depth-overhaul
```

只暂存本次任务涉及的文件。推送前再次检查 `git diff --cached`，避免把用户的其他工作或本地参考素材带入提交。
