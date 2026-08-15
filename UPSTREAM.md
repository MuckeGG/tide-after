# 上游来源与改造边界

## 技术底座

- 仓库：[ThinkTidevibes/2D-Survival-Multiplayer-Game](https://github.com/thinktidevibes/2D-Survival-Multiplayer-Game)
- 导入基线提交：`58e47ad`
- 许可证：MIT，原始 `LICENSE` 与 Git 历史完整保留。
- 当前开发分支：`feat/tide-after-web`

本改造保留了 React、Vite、TypeScript、SpacetimeDB、生成绑定目录和模块化工程结构。当前游戏入口只加载 `client/src/tide` 与 `client/src/components/tide`，上游 MMORPG、战斗、社交、AI 和大型地图代码仍留在仓库中作为后续可选参考，但首版不运行这些模块。

## 仅作玩法研究的参考

- [SeloSlav/2d-multiplayer-survival-mmorpg](https://github.com/SeloSlav/2d-multiplayer-survival-mmorpg)：仅研究生存状态、背包、制作、建造和天气的系统拆分。
- [echosoar/raft](https://github.com/echosoar/raft)：仅研究漂浮物、钩取、扩建和多层建造的循环。
- [sofmeireles/RAFT](https://github.com/sofmeireles/RAFT)：仅研究 Phaser 网页交互方式。

没有复制这些参考仓库的代码、图片、地图、角色、故事或世界观，也没有使用许可证不明确的素材。尤其没有使用 SeloSlav 项目的 Babushka 世界观与受保护内容。

## 原创改造

“潮线之后”名称、海上生存设定表达、界面布局、Canvas 绘制、玩法数值、中文文本和新增 SpacetimeDB 数据模型均为本项目新增内容。通用的“木筏求生”玩法概念不等同于复制任何具体作品的表现内容。
