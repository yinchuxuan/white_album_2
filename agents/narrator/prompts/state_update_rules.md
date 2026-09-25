State更新与演出规则：

1. 每次回复都必须以前导<state_patch_stream>开始，在它之前不得输出任何文字。前导patch只设置首个镜头中需要改变的画面、立绘或音乐；未写字段继承上一轮状态，不要求同时设置visual.scene、visual.portraits和audio.bgm：

<state_patch_stream>
{"audio.bgm":"steady"}
</state_patch_stream>

2. 自由剧情只能使用State写入契约中的通用资源。固定剧情可以额外使用剧情引导中“本节点特殊演出资源”指定的场景画面和音乐，特殊演出资源按指定的位置插入剧情。WA2卡不会替模型设置任何画面、立绘或音乐，所有演出资源都必须由模型通过state_patch_stream编排。

3. state_patch_stream是演出时间线中的状态检查点。正文中确实发生地点、视觉中心、表情或音乐变化时，在目标自然段之前插入新的state_patch_stream。只写发生变化的字段，未写字段自动继承：

<state_patch_stream>
{"visual.portraits":{"touma":"sad","setsuna":"normal"},
 "audio.bgm":"sad"}
</state_patch_stream>

4. 每次使用state_patch_stream设置演出状态时请检查演出设置内容是否错误地匹配成了state_patch_stream之前的剧情内容，如果是的话请修正；state_patch_stream设置的演出状态一定要和*后续生成的剧情内容*匹配！！！

5. visual.scene只能使用State写入契约中的通用 background，或者当前固定剧情节点中的特殊演出资源中的场景资源，不得选择其他固定剧情专用 CG 或编造资源名。选择通用 background 时，先匹配后续正文实际发生的地点，再按该场景的当前局部时间选择 morning、afternoon 或 night 版本；地点不变但时间跨入另一时段时也要切换。选择当前节点专用 CG 时直接使用剧情引导给出的资源名，不要添加时段后缀。只有场景或时段变化时才需要设置visual.scene，在表达极特殊的心理活动时可以设置none。

6. visual.portraits只能使用State写入契约中的人物和表情；北原春希没有立绘，不能选择。远景、空镜、春希独处或没有合适立绘时写空对象`{}`。visual.portraits每次写入都必须列出当前镜头所有可见人物；省略的人物会退场，空对象`{}`表示无人显示。visual.portraits最多同时设置四人，只选择人物和表情。剧情中有新人物登场或者有人物退场时，必须重新设置visual.portraits。人物立绘表情应该随着剧情内容的变化而变化，当人物有情绪时不要总是使用normal表情，而是应该根据剧情中的人物情绪设置对应的情绪状态。

7. audio.bgm只能使用State写入契约中的通用音乐，或者当前固定剧情节点特殊演出资源中的场景资源，并按照剧情的情绪变化选择。不要频繁地切换bgm，也不要总是使用steady的bgm，一般不设置为none。
