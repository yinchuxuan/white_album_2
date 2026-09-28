# 白色相簿 2 · 世界站同人游戏卡

隔壁音乐室的钢琴声，天台上传来的歌声，还有你手中尚不熟练的吉他。

这个秋天，能不能让三个人一起站上舞台？

## 这是一张什么样的卡？

这是一张以《白色相簿 2》为背景、运行于 [World Card Station（世界站）](https://github.com/yinchuxuan/WorldCardStation)的非官方同人游戏卡。

你将扮演北原春希，回到峰城大附属中学，在校园日常、音乐练习和人物互动中推进故事。游戏以原作 IC 篇为基础，将预设剧情节点与 AI 生成的自由行动结合，并配合背景、人物立绘、剧情 CG 和 BGM 呈现演出。

当前版本包含IC篇前两章，主要围绕轻音乐同好会的成员招募与重建展开，并有不同结果及后续自由剧情引导。**不是完整 IC / CC / Coda 篇复刻，也不保证重现原作的全部情节与结局。** 内容涉及原作前期剧透。

## 开始游玩

当前源码已迁移到世界站 formatVersion 1（main.js + director / narrator / settlement 三 Agent），需要支持该协议的客户端或 Web 播放器；
旧版客户端和已发布的旧卡包不能与这份源码混用。旧存档不自动迁移。
开发测试可直接导入本仓库的 card.json；新建 Session 时先执行 Agent 的 init，再由 onStart 分段展示开场，不请求模型。
agents/narrator/prompts/first_msg.md 只包含开场正文、选项和演出，由 narrator 的 init 写入 Messages，onStart 直接展示。初始记忆由 settlement 的 init 从 agents/settlement/initial-memory.json 加载，初始剧情时间采用 State schema 默认值；读档不重复初始化或播放开场。

director 先识别玩家意图，结合上轮剧情与选项、历史记忆、人物索引、当前状态和节点约束，生成“玩家意图 / 剧情节拍 / 本轮边界”计划。narrator 消费本轮 plan，流式生成剧情、选项和分段演出；正文生成完成后，settlement 在玩家继续阅读时生成摘要并结算时间、好感度和熟练度，不展示结算回复。下一轮和存档必须等待阅读与结算均完成；失败可整轮重试。每轮通常调用三次模型，首屏等待简短 plan 后即可随 narrator 流式展示，不等待整篇正文生成完成。
此版本为 1.3.0，新增 Agent 后须重新导入并新建 Session，此前版本存档不自动迁移。

以下是旧版已发布卡包的获取方式；新协议卡包需随兼容的平台版本重新发布：

1. 安装[世界站客户端](https://github.com/yinchuxuan/WorldCardStation/releases/latest)，配置自己的模型服务地址、API Key 和模型名称，确认所下载卡包与平台协议匹配。
2. 在[游戏卡发布页](https://github.com/yinchuxuan/white_album_2/releases/latest)的 Assets 中下载 `white-album-2-1.0.1.png`。
3. 在世界站点击“导入卡片”，选择下载的原始 PNG，阅读开场后开始行动。

PNG 内含完整游戏资源，约 108 MiB，无需解压或 `git clone`。请勿将截图、压缩或重编码后的图片用于导入；GitHub 自动提供的 Source code 是开发源码，不是 PNG 卡包。

## 怎么玩？

### 选择行动，也可以自己写

每轮剧情末尾会提供 A—D 四个行动选项。你可以选择其中一个，也可以在输入框里写下春希接下来想说的话、想做的事，再发送给模型。例如：

> 放学后留在第三音乐室，练习今天总是弹错的那段副歌。如果隔壁又传来琴声，就试着跟上它的节奏。

行动越具体，模型越容易接续。尽量说明人物、地点和打算做的事，把其他角色如何回应留给故事。

### 阅读与重新演绎

- 使用 **← / →** 回看或继续当前回复的分段演出，背景、立绘和音乐会随阅读推进。
- 在非输入状态下按 **空格**，或在剧情区域**右键**，可以打开或关闭暂停面板。
- 暂停面板中可以修改上一次行动，再点击“重新生成”。这会重新调用模型，适合调整表达或重试不合预期的演绎。

AI 生成的对白、细节和演出可能偏离设定，剧情效果取决于模型，也可能出现时间、人物认知或画面不一致。静态检查通过不代表完整剧情已无误；模型调用及重试可能产生服务商费用。

## 同人说明

本项目是爱好者制作的非官方同人作品，与原作制作方无隶属或授权关系。原作名称、角色及相关素材的权利归各自权利人所有；本仓库的公开不代表相关素材可任意再分发或商用。

欢迎支持原作。遇到问题可在 [Issues](https://github.com/yinchuxuan/white_album_2/issues) 中提供平台版本、卡片版本、所用模型和复现步骤，请勿公开 API Key 或未经检查的私人对话日志。

## 开发验证

运行 `node --test tests/*.test.mjs`。运行时测试使用相邻 WorldCardStation 仓库中已安装的依赖和真实 Worker；平台路径不同时通过 `WCS_ROOT` 指定。模型回复使用固定测试数据，不访问外部模型服务。

### Agent 文件布局

- `agents/narrator/prompts/`：叙事、开场、角色扮演与演出提示词。
- `agents/director/scripts/`：剧情调度与章节逻辑，仅在规划前解析一次本轮节点。
- `agents/director/`：剧情规划 Agent、提示词、上下文规则与回复校验。
- `agents/shared/plot-context.json`：director 与 narrator 共享的本轮节点约束；narrator 不重复解析节点或抽取随机事件。
- `agents/narrator/plot/`：章节正文和时间线配置。
- `agents/narrator/rules/`：narrator 专属规则。
- 各 Agent 目录中的 `agent.json` 和 `response-validation.json`：定义及回复校验。
- `agents/settlement/initial-memory.json`：settlement 初始化记忆。
- `agents/settlement/prompts/`：摘要和数值结算提示词。
- `agents/shared/scripts/`：两个 Agent 共用的记忆处理脚本。

Agent 定义位于 `agents/director/agent.json`、`agents/narrator/agent.json` 和 `agents/settlement/agent.json`；`files.json` 保持原有资源 ID，映射到新路径。章节内容位于 `agents/narrator/plot/`；世界书和通用库仍位于 `worldbook/`、`lib/`。

固定节点的摘要与数值要求位于 `agents/settlement/plot/`，通过 `rules/node-settlement.json` 按本轮 `temp.plotFile` 和 `temp.PlotType` 注入。narrator 的 plot 只保留剧情与演出引导；自由剧情、低好感回退与后日谈也提供同名节点，结算要求明确为“无”，统一按 PlotType 读取并使用通用结算规则。

director 的计划只供 narrator 写作，不进入玩家可见记录，也不作为 settlement 的已发生事实。settlement 始终根据实际生成的 narrator 原文结算。规划失败时不调用 narrator，整轮可重试；取消恢复轮前状态。
