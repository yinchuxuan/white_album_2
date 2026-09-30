# 白色相簿 2 · 世界站同人游戏卡

隔壁音乐室的钢琴声，天台上传来的歌声，还有你手中尚不熟练的吉他。

这个秋天，能不能让三个人一起站上舞台？

## 这是一张什么样的卡？

这是一张以《白色相簿 2》为背景、运行于 [World Card Station（世界站）](https://github.com/yinchuxuan/WorldCardStation)的非官方同人游戏卡。

你将扮演北原春希，回到峰城大附属中学，在校园日常、音乐练习和人物互动中推进故事。游戏以原作 IC 篇为基础，将预设剧情节点与 AI 生成的自由行动结合，并配合背景、人物立绘、剧情 CG 和 BGM 呈现演出。

当前版本包含IC篇前两章，主要围绕轻音乐同好会的成员招募与重建展开，并有不同结果及后续自由剧情引导。**不是完整 IC / CC / Coda 篇复刻，也不保证重现原作的全部情节与结局。** 内容涉及原作前期剧透。

## 开始游玩

当前源码采用世界站 formatVersion 1（main.js + director / narrator / settlement 三 Agent），需要支持该协议的客户端或 Web 播放器；
旧版客户端和已发布的旧卡包不能与这份源码混用。旧存档不自动迁移。
开发测试可直接导入本仓库的 card.json；新建 Session 时先执行 Agent 的 init，再由 onStart 分段展示开场，不请求模型。
agents/narrator/prompts/first_msg.md 只包含开场正文、选项和演出，由 narrator 的 init 写入 Messages，onStart 直接展示。初始记忆由 settlement 的 init 从 agents/settlement/initial-memory.json 加载，初始剧情时间采用 State schema 默认值；读档不重复初始化或播放开场。

三 Agent 通过共享 State 的 `PlotNode`、`PlotPlan`、`PlotWorldbookIndex` 协作。每轮先清空规划和条目列表；固定节点由脚本设置 PlotNode（如 `plot.chapter.1#FixedPlot2`），跳过 director。其他轮次 director 通过普通 `<state_patch>` 写入：隐藏剧情只设置 PlotNode；自由剧情设置 PlotNode 为 `free`，并填写另外两个变量。

narrator 的 tail-timeline-guide 统一拼接可选的 PlotPlan 与节点 Markdown 描述。自由节点只有节点剧情限制，director 读取限制后生成 PlotPlan；固定和隐藏节点的 PlotPlan 保持为空，Markdown 自带本轮剧情规划、可选的本节点特殊演出资源和节点剧情限制，脚本只填充预设 PlotWorldbookIndex。节点剧情限制保留在章节描述中；章节通用限制、日后谈通用限制和动态限制集中在 [plot-restrictions.md](agents/shared/prompts/plot-restrictions.md)，由 director/narrator 共用的 Content DSL 按当前章节和 State 条件注入。人物态度和角色扮演规则仍独立注入。narrator 仅将 PlotWorldbookIndex 中的召回词与 worldbook/config.json 中已启用条目的 keys 做不区分大小写的包含匹配，命中条目去重后读取正文；未命中项直接跳过，全部未命中或空数组也不报错。不扫描正文、不自动注入常驻条目、不引入世界书 lib，完整世界书索引仍单独提供。director 不得修改时间、关系或演出；剧情节点、规划和召回列表的格式仍须通过校验。不再解析 director 回复中的独立 JSON 对象。

narrator 负责正文、选项和分段演出；正文生成完成后，settlement 在玩家继续阅读时生成摘要并结算时间、好感度和熟练度，不展示结算回复。下一轮和存档必须等待阅读与结算均完成；失败可整轮重试。固定节点和结局轮调用两次模型，其他轮调用三次。
此版本为 1.3.0，新增 director 后须重新导入并新建 Session，旧版存档不自动迁移。

隐藏节点独立注册在 [agents/director/hidden-nodes.json](agents/director/hidden-nodes.json)，定义为 plotNode、condition、summary、trigger、exclude；condition 仅在脚本中执行，模型只收到其余四个字段。

condition 使用 `{ "state": { ... } }` 条件；需要对同一数组同时检查多个命中记录时，可用 `{ "all": [条件, 条件] }` 要求全部满足。all 是卡内隐藏节点解析器的组合语法，不是平台规则 when 的新增操作符。

第一章 HiddenPlot1 的唯一标识是 plot.chapter.1#HiddenPlot1：周六（2007.10.20）至周一（2007.10.22）内，玩家实际选择在第三音乐教室练琴时，由 director 判断是否适合首次隔墙合奏。只讨论、计划或在家练琴不触发。错过不补播，周二三人合奏仍可正常发生；其他固定节点优先级不变。

所有隐藏节点按 plotNode 一次性触发：director 的 PlotNode 通过校验后，脚本立即将其记入只读变量 story.triggeredHiddenNodes，后续注册候选时排除已命中节点，不影响其他隐藏节点。记录随 Session 保存；后续生成或结算失败不撤销命中，主动 retry 则沿用平台语义恢复到本轮开始前的快照，允许重新尝试。

第一章 HiddenPlot2 的唯一标识是 plot.chapter.1#HiddenPlot2：在 FixedPlot2 与 FixedPlot4 之间的 FreePlot3、FreePlot4 时段，玩家与依绪聊起雪菜时可触发。中间的 FixedPlot3 仍优先执行；固定时段不调用 director，不会触发该隐藏节点。节点召回春希、依绪、雪菜和学校条目，没有额外数值奖励。

第二章所有隐藏节点和两种弱引导共用 FixedPlot1 与 FixedPlot6 之间的窗口：周三 2007.10.24 08:00（含）至周日 2007.10.28 14:00（不含）。不再按星期或 16:00～18:00 等小时范围硬编码分开注册；固定节点优先，进入 FixedPlot6 的轮次不调用 director。上课、深夜、邀约是否仍有效等场景合理性继续由 director 结合 trigger/exclude 和 memory 判断。

第二章 HiddenPlot2/3 是可错过的便利店、公园与 KTV 剧情链。雪菜好感度至少 15 时，可以通过实际接触她触发 HiddenPlot2；HiddenPlot3 仅在下一轮接受邀约时可选，不再以当天 19:00 为硬截止。错过不自动补播或切换低好感度版本。在第二章未命中 KTV 节点时，动态限制禁止本轮新增雪菜的入会承诺；命中当轮 narrator 即解除此限制。雪菜是否已经加入仍由 memory 中的实际承诺决定，节点命中不等于加入，也不否定已有的真实承诺；不使用独立入会或 secret/reserved 标记。

第二章 HiddenPlot4 在共用窗口内，由玩家实际追查琴声并尝试翻窗触发，不要求好感度或雪菜线进度。未命中时动态注入冬马身份限制，命中当轮 narrator 解除。HiddenPlot5 仅在 HiddenPlot3、HiddenPlot4 都已命中时注册，由玩家实际向雪菜讲述冬马的行动触发；不限制下一轮，不重复演出。

第二章 FixedPlot1 之后至周日聚餐之前统一使用 FreePlot1，自由剧情不再在周五拆分节点。共用窗口内保留原 50% 弱引导抽取概率，命中时同时提供雪菜和冬马两种候选，由 director 每轮最多选择一种，也可都不使用。周日 FixedPlot6 的窗口仍为 12:00 之后至 14:00（含），仅在 HiddenPlot5 已命中时执行并跳过 director；依赖不足时继续 FreePlot1，窗口内补齐后下一轮可进入聚餐。未满足条件而到达 14:00 时，该轮自由剧情最多可推进至 21:00；一旦结算时间超过 14:00，下一轮即进入结局判定，不补演聚餐，并非必须等到 21:00 才判定。

第二章结局由脚本直接选择，跳过 director：turn.previousPlotNode 为 plot.chapter.2#FixedPlot6，且雪菜好感度至少 20、冬马好感度至少 30 时进入 FixedPlot7，否则进入 GameEnd1。成功节点必须紧接聚餐的下一轮；熟练度和 memory 不参与结局判定，memory 继续用于叙事承接。调度预判在状态副本中用本轮 PlotNode 模拟下一轮的 previousPlotNode，不提前修改真实轮次或锁定结局。读档和 retry 沿用现有 PlotNode 与 turn.previousPlotNode 的恢复；成功与失败结局之后分别进入对应日后谈。

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
- `agents/director/`：规划提示词、state_patch 校验、hidden-nodes.json（隐藏节点注册定义）及 catalog.json（预设世界书召回词和条目路径白名单）。预设剧情正文仍在 narrator/plot 的 Markdown 中。
- `agents/director/rules/tail-timeline-guide.json`：用 DSL 的 include/when 注入章节大纲、节点、弱引导、随机情绪/事件、人物态度及剧情限制。JS 只计算选择变量，不拼装这些提示词。
- `agents/narrator/rules/tail-timeline-guide.json`：在用户消息尾部拼接自由剧情的 PlotPlan 与当前节点描述，再注入冬马与雪菜的人物态度、章节剧情限制和角色扮演规则；固定/隐藏节点不生成或填充 PlotPlan。
- `agents/shared/prompts/plot-restrictions.md`：统一维护章节、日后谈通用限制和动态限制的正文；节点专属限制仍在各节点描述中。
- `agents/shared/content/plot-restrictions.json`：两个 Agent 共用的 Content DSL，每次 pre_send 根据当前章节和隐藏节点命中记录选择限制。
- `agents/narrator/scripts/`：剧情调度与章节逻辑。
- `agents/narrator/plot/`：章节正文和时间线配置。
- `agents/narrator/rules/`：narrator 专属规则。
- 各 Agent 目录中的 `agent.json` 和 `response-validation.json`：定义及回复校验。
- `agents/settlement/initial-memory.json`：settlement 初始化记忆。
- `agents/settlement/prompts/`：摘要和数值结算提示词。
- `agents/shared/scripts/`：记忆处理、plan 目录读取与校验及下一轮调度预判。初始化和结算后只预判下一轮是否为固定剧情，不提前提交分支或结局。

Agent 定义位于 `agents/director/agent.json`、`agents/narrator/agent.json` 和 `agents/settlement/agent.json`。章节内容位于 `agents/narrator/plot/`；世界书和通用库仍位于 `worldbook/`、`lib/`。worldbook/config.json 的 keys 用于当前召回；lib/worldbook 暂留作旧实现参考，不参与当前召回。

预设节点的摘要与数值要求位于 `agents/settlement/plot/`，通过 `rules/node-settlement.json` 按本轮 `temp.plotFile` 和 `temp.PlotType` 注入。narrator 的 plot 只保留剧情与演出引导；自由剧情与后日谈也提供同名节点，结算要求明确为“无”，统一按 PlotType 读取并使用通用结算规则。加入和秘密事实只按实际正文记录，不凭节点命中虚构。
