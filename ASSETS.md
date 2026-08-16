# 素材、来源与使用边界

## 公开版本的原创素材

公开构建只使用本项目原创内容：

- public/assets/tide-original/diver-directions.png：64×64、下/左/右/上四向潜水工运行时图集。
- public/assets/tide-original/diver-portrait.png：开场页潜水工肖像。
- public/assets/tide-original/tide-icon-atlas.png：8 类资源、4 类特效和 11 类设施的透明像素图集。
- art-source/tide-original/diver-concept.png：透明背景四向角色概念源图，不会被 Vite 复制进生产包。
- 海面、三层浪纹、雨幕、木筏厚度、泡沫、漂浮物、设施、钩索、鱼线、工具和粒子：由本项目 Canvas 代码原创绘制。
- 铜制仪表、帆布/木板抽屉、快捷栏与动作轮：由本项目 CSS 原创绘制。

### 潜水工生成与处理记录

初稿使用 Codex 内置图片生成工具生成，属于为本项目创建的原创素材。没有使用 Terraria、Raft 或其他游戏图片作为输入参考。

最终生成提示词要点：

> Original heavy ocean salvage diver for a top-down 2.5D web survival game; four directional views; aged-copper rounded diving helmet, blue-green glass, deep navy pressure suit, brass tank, hose, tool pouch, separate heavy boots and one orange identification cloth; handcrafted pixel art; no copyrighted character, logo, text or watermark.

生成器第一次没有遵守纯色背景要求，因此第二次编辑只将背景替换为统一 #ff00ff。随后使用 imagegen 技能自带的 remove_chroma_key.py 进行透明化，再由 scripts/prepare_diver_assets.py：

1. 按四象限裁切下、上、左、右方向；
2. 统一锚点到脚底；
3. 缩放到约 54×62 可见体积；
4. 输出 256×64 四向透明 PNG 图集和紧凑肖像。

运行时的步行摇摆、动作倾斜、工具、绳索和受伤闪烁由代码叠加，不修改游戏坐标。

资源、特效和设施图集由 scripts/prepare_tide_icon_atlas.py 以项目自有像素图形生成，不包含第三方图片。

## 本地参考模式

C:/Users/hzy/Desktop/Content 仅可作为开发机上的只读参考目录：

- 不复制到仓库；
- 不进入 public；
- 不进入生产构建；
- 不用横版人物精灵替代本项目主角；
- 只允许开发服务器读取白名单中的 Tiles_30.png、Tiles_19.png 和 UI/DisplaySlots_5.png。

Terraria 官方材料不是开源素材，仍由 Re-Logic 持有版权。参考：[Terraria Legal](https://terraria.org/terms) 与 [官方 Wiki 版权文件分类](https://terraria.wiki.gg/wiki/Category:Files_under_copyright_by_Re-Logic)。

本地启用方式：

    VITE_TIDE_ART_MODE=reference
    TIDE_REFERENCE_ASSET_ROOT=C:/Users/your-name/Desktop/Content

Vite 只通过 /__tide-reference/* 的固定白名单提供文件，不向前端暴露绝对路径。目录或文件缺失时，运行时会回退到 original 并只显示一次开发警告。

当 VITE_TIDE_ART_MODE=reference 时，npm run build 会直接失败。正常生产构建后可运行：

    npm run verify:assets

该审计会检查 dist 中是否出现参考路由、桌面目录、Terraria 或 Re-Logic 字样。

## 上游资源

上游仓库的历史图片仍在旧资源目录和 Git 历史中，但当前 App 入口与生产构建不引用它们。若以后重新启用任何上游素材，需要逐项确认来源和许可证。

## 明确未使用

- 未使用 echosoar/raft 中许可证不明确的图片。
- 未使用 SeloSlav 项目的角色、美术、故事或 Babushka 世界观内容。
- 未使用商业游戏《Raft》的标志、角色、航图、音效或纹理。
- 未使用 Terraria 的人物、故事、图标或贴图进入公开构建。
