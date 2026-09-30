import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession, read, freePlan, refreshDispatch } from './runtime-helper.mjs';

const configs = [1, 2].map(chapter => JSON.parse(read(`agents/narrator/plot/chapter-${chapter}.json`)));
const section = (chapter, node) => read(JSON.parse(read('files.json'))[`settlement.plot.chapter.${chapter}`])
  .split(`## ${node}\n`)[1].split('\n## ')[0].trim();
const choices = '<choices><item>继续</item><item>等待</item><item>交谈</item><item>休息</item></choices>';
async function setScenario(session, chapter, slotId, overrides = {}) {
  const slot = configs[chapter - 1].slots.find(item => item.id === slotId);
  session.setState(state => ({ ...state,
    PlotNode: overrides.previousNode || 'free',
    timeline: { ...state.timeline, currentTime: slot.range.lte, currentSlotEnd: slot.end },
    memory: { ...state.memory, summary: { ...state.memory.summary, anchor: overrides.joined
      ? [{ knownBy: ['北原春希', '小木曾雪菜'], text: '2007.10.25下午｜学校：雪菜明确同意担任同好会主唱。' }] : [] } },
    touma: { ...state.touma, affection: overrides.touma ?? 18 },
    setsuna: { ...state.setsuna, affection: overrides.setsuna ?? 20 },
    performance: { ...state.performance, proficiency: overrides.proficiency ?? 2 },
    story: { ...state.story, triggeredHiddenNodes: overrides.hits || [] }
  }));
  await refreshDispatch(session);
}
async function setup() {
  const requests = [];
  const session = await createSession(async (req, cb) => {
    requests.push(req);
    if (req.agentId === 'director') {
      cb.onToken(freePlan);
      return;
    }
    if (req.agentId === 'narrator') {
      cb.onToken('<state_patch_stream>{"visual.scene":"school_afternoon"}</state_patch_stream>\n' +
        '【时间地点】2007.10.20: 16:10 星期六｜学校\n\n本轮剧情正文。\n\n' + choices);
    } else {
      const time = req.messages.map(m => m.content).join('\n').match(/timeline.currentTime: ([^\n]+)/)[1];
      cb.onToken('<summary><item priority="current_event" known_by="北原春希">等待下一次练习。</item></summary>\n' +
        `<state_patch>${JSON.stringify({ 'timeline.currentTime': time })}</state_patch>`);
    }
  });
  session.subscribe((_view, detail) => { if (detail.type === 'display') session.advance(); });
  return { session, requests };
}
function assertContext(requests, chapter, node) {
  const [narrator, settlement] = requests.slice(-2);
  assert.equal(narrator.agentId, 'narrator');
  assert.equal(settlement.agentId, 'settlement');
  const narration = narrator.messages.map(m => m.content).join('\n');
  const nodeText = read(JSON.parse(read('files.json'))[`plot.chapter.${chapter}`])
    .split(`## ${node}\n`)[1].split('\n## ')[0].trim();
  const tail = narrator.messages.filter(m => m.role === 'user').at(-1).content;
  assert.equal(tail.split(nodeText).length - 1, 1, 'node plan, optional resources and restrictions are preserved together');
  assert.doesNotMatch(narration, /记忆要求[：:]|好感度变化[：:]|演出熟练度(?:变化)?[：:]/);
  const guides = settlement.messages.filter(m => m._meta?.source === 'wa2_settlement_node');
  assert.equal(guides.length, 1);
  assert.equal(guides[0].role, 'system');
  assert.equal(guides[0].content.trim(),
    `# 本轮节点结算要求\n节点：plot.chapter.${chapter} / ${node}\n\n${section(chapter, node)}`);
  assert.ok(settlement.messages.indexOf(guides[0]) < settlement.messages.findIndex(m => m.role === 'user'));
}
const cases = [
  ...configs.flatMap((config, index) => config.slots.filter(slot => slot.data.plotKind === 'free' && !slot.data.plotType)
    .map(slot => [index + 1, slot.id, slot.id, {}])),
  ...['FixedPlot2', 'FixedPlot3', 'FixedPlot4'].map(node => [1, node, node, {}]),
  ...['FixedPlot1', 'GameEnd1']
    .map(node => [2, node, node, {}]),
  [2, 'FixedPlot6', 'FixedPlot6', { hits: ['plot.chapter.2#HiddenPlot5'] }],
  [2, 'GameEnd1', 'FixedPlot7', { touma: 30, setsuna: 20, proficiency: 0, joined: true, previousNode: 'plot.chapter.2#FixedPlot6',
    hits: ['plot.chapter.2#HiddenPlot5'] }]
];
for (const [chapter, slot, node, overrides] of cases) {
  test(`node context routes chapter ${chapter} ${slot} → ${node}`, { timeout: 20000 }, async () => {
    const { session, requests } = await setup();
    try {
      await setScenario(session, chapter, slot, overrides);
      await session.send('继续');
      assertContext(requests, chapter, node);
      if (node.startsWith('FreePlot')) assert.equal(section(chapter, node), '无。');
      if (slot === 'GameEnd1') {
        // The resolver marks the ending before settlement: keep this round's selected node.
        // Only the next round becomes an afterstory and drops the old node instructions.
        await session.send('继续后日谈');
        assertContext(requests, node === 'GameEnd1' ? '2.gameEnd1Afterstory' : '2.successAfterstory',
          node === 'GameEnd1' ? 'GameEnd1Afterstory' : 'Chapter2SuccessAfterstory');
      }
    } finally { await session.dispose(); }
  });
}

test('free rounds after a fixed event do not inherit its guide or force low-affection joining', { timeout: 20000 }, async () => {
  const { session, requests } = await setup();
  try {
    await setScenario(session, 2, 'FixedPlot1', { setsuna: 5 });
    await session.send('继续');
    assertContext(requests, 2, 'FixedPlot1');
    await setScenario(session, 2, 'FreePlot1', { setsuna: 5 });
    await session.send('自由行动');
    assertContext(requests, 2, 'FreePlot1');
    assert.equal(section(2, 'FreePlot1'), '无。');
    const narration = requests.at(-2).messages.at(-1).content;
    assert.match(narration, /以 memory 中的明确承诺为准/);
    assert.match(narration, /未明确同意、拒绝或待考虑都不能当作已经加入/);
    assert.equal(Object.hasOwn(session.snapshot().state.story, 'chapter2SetsunaBranch'), false);
    await setScenario(session, 1, 'FreePlot1');
    await session.send('自由行动');
    assertContext(requests, 1, 'FreePlot1');
    assert.equal(section(1, 'FreePlot1'), '无。');
  } finally { await session.dispose(); }
});
