# 素材、来源与使用边界

## 公开版本原创素材

公开构建只使用本项目原创内容：

- `public/assets/tide-original/fisherman-motion.png`：512×512 RGBA 透明角色图集。
  - 八行依次为南、西南、西、西北、北、东北、东、东南。
  - 每行八帧：2 帧待机、6 帧行走。
  - 每格 64×64，脚底锚点统一。
- `public/assets/tide-original/fisherman-portrait.png`：开场页落魄渔夫大叔透明肖像。
- `public/assets/tide-original/tide-icon-atlas.png`：资源、特效和设施的原创透明像素图集。
- `public/assets/tide-original/tide-combat-atlas.png`：640×256 RGBA 怪物、装备与漂浮物图集；上排为潮汐蟹、深渊灯兽、弯刀、斧锤、鱼竿，下排为木板、塑料、废铁、纤维和货箱。
- 海面、多向浪纹、雨幕、木筏水线、泡沫、气泡、尾流、钩索、鱼线和粒子：由项目 Canvas 代码原创绘制。
- 铜制仪表、帆布/木板抽屉、快捷栏和动作轮：由项目 CSS 原创绘制。

生产素材审计会验证角色图集为 512×512 RGBA PNG，并扫描 `dist`，阻止参考路径、桌面目录和受保护素材标识进入构建。

## 渔夫大叔生成与处理记录

角色初稿通过 Codex 内置图片生成工具为本项目原创生成，没有使用 Terraria、Raft 或其他游戏图片作为输入参考。

身份概念图提示词要点：

> Original weathered middle-aged fisherman uncle for an isometric pixel survival game; salt-and-pepper beard, visible friendly tired face, burgundy knit cap, worn yellow raincoat, faded teal life vest, dark rubber boots, compact readable silhouette, restrained 8–10 color palette, no helmet, tank, logo, text or copyrighted character.

八方向周转图以本项目概念图作为身份参考，提示词要点：

> Create an original handcrafted pixel-art 4×2 direction turnaround of the same fisherman on a pure #ff00ff background; directions south, southwest, west, northwest, north, northeast, east and southeast; consistent proportions, visible face where appropriate, stable boots and foot anchor, no shadows, text, logo or extra objects.

生成与整理流程：

1. 生成身份概念图 `art-source/tide-original/fisherman-uncle-concept.png`。
2. 使用概念图生成 4×2 八方向周转图 `fisherman-uncle-turnaround.png`。
3. 使用 imagegen 技能的 `remove_chroma_key.py` 去除纯洋红背景，得到 `fisherman-uncle-turnaround-alpha.png`。
4. 使用 `scripts/prepare_fisherman_assets.py` 按八方向裁切、统一脚底锚点和像素尺寸。
5. 输出运行时 512×512 图集和开场肖像，并逐帧检查透明角、轮廓和朝向。
6. 行走周期由每行 6 帧驱动；轻微身体起伏只作用于显示，不改变碰撞或存档坐标。

旧潜水工运行时文件已从 `public` 移至 `art-source/tide-original/archive-diver/`，仅作为本项目美术迭代记录，不再进入默认素材清单或生产构建。旧处理脚本保留用于复现历史美术源。

## 夜战、装备和漂浮物生成记录

怪物、装备与漂浮物接触表通过 Codex 内置图片生成工具为本项目原创生成，没有输入其他游戏图片。源文件保存在 `art-source/tide-original/combat-source-sheet.png`，透明处理版本为 `combat-source-sheet-alpha.png`，运行时图集由 `scripts/prepare_combat_assets.py` 生成。

提示词要点：

> Original handcrafted pixel-art contact sheet for an isometric ocean survival game; weathered tide crab, elite bioluminescent abyss lantern beast, sailor cutlass, salvage axe-hammer, fishing rod, floating wood, plastic bottle, rusty scrap, rope fiber and cargo crate; readable silhouettes, restrained teal/copper/rust palette, pure magenta background, no logo, text or copyrighted character.

运行时海面不会直接平铺生成图。水面由确定性的低频涌浪、交叉浪、白色破浪（浪尖形成 → 展开 → 破碎白沫 → 消失）组成，木筏、漂浮物、浮标与游泳怪物共享同一水面采样。

2026-08 简化重构：人物手持的弯刀、斧锤和鱼竿改为 Canvas 程序化绘制的 24×24 风格简洁像素工具，按八方向手部锚点跟随人物，不新增位图素材；漂浮物水下部分改为真正的画布裁切（默认隐藏约 45%，木板 35%、废铁 55%），仅保留淡色水下轮廓。素材清单与许可边界不变。

## 本地参考模式

`C:/Users/hzy/Desktop/Content` 只能作为开发机上的只读参考目录：

- 不复制到仓库；
- 不进入 `public`；
- 不进入生产构建；
- 不使用横版人物精灵替代本项目主角；
- 开发服务器只允许读取 `Tiles_30.png`、`Tiles_19.png` 和 `UI/DisplaySlots_5.png`。

Terraria 官方材料不是开源素材，版权仍由 Re-Logic 持有。参考：[Terraria Legal](https://terraria.org/terms) 和 [官方 Wiki 版权文件分类](https://terraria.wiki.gg/wiki/Category:Files_under_copyright_by_Re-Logic)。

本地启用方式：

```dotenv
VITE_TIDE_ART_MODE=reference
TIDE_REFERENCE_ASSET_ROOT=C:/Users/your-name/Desktop/Content
```

Vite 只通过 `/__tide-reference/*` 白名单路由提供文件，不向前端暴露绝对路径。目录或文件缺失时，运行时自动回退到 `original` 并只显示一次开发警告。

设置 `VITE_TIDE_ART_MODE=reference` 时，`npm run build` 会直接失败。正常生产构建后运行：

```bash
npm run verify:assets
```

## 上游与明确未使用内容

上游仓库的历史图片仍可能存在于 Git 历史中，但当前 App 入口和生产素材清单不引用它们。若以后重新启用，必须逐项确认来源与许可证。

- 未使用 `echosoar/raft` 中许可证不明确的图片。
- 未使用 SeloSlav 项目的角色、美术、故事或 Babushka 世界观。
- 未使用商业游戏《Raft》的标志、角色、航图、音效或纹理。
- 未使用 Terraria 的人物、故事、图标或贴图进入公开构建。
