import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession, read } from './runtime-helper.mjs';

const configs = [1, 2].map(chapter => JSON.parse(read(`agents/narrator/plot/chapter-${chapter}.json`)));
const section = (chapter, node) => read(JSON.parse(read('files.json'))[`settlement.plot.chapter.${chapter}`])
  .split(`## ${node}\n`)[1].split('\n## ')[0].trim();
const choices = '<choices><item>继续</item><item>等待</item><item>交谈</item><item>休息</item></choices>';
function setScenario(session, chapter, slotId, overrides = {}) {
  const slot = configs[chapter - 1].slots.find(item => item.id === slotId);
  session.setState(state => ({ ...state,
    timeline: { ...state.timeline, currentTime: slot.range.lte, currentSlotEnd: slot.end },
    story: { ...state.story, chapter2SetsunaBranch: 'secret', ...overrides.story },
    touma: { ...state.touma, affection: overrides.touma ?? 18 },
    setsuna: { ...state.setsuna, affection: overrides.setsuna ?? 20 },
    performance: { ...state.performance, proficiency: overrides.proficiency ?? 2 }
  }));
}
async function setup() {
  const requests = [];
  const session = await createSession(async (req, cb) => {
    requests.push(req);
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
  assert.doesNotMatch(narration, /记忆要求[：:]|好感度变化[：:]|演出熟练度(?:变化)?[：:]/);
  const guides = settlement.messages.filter(m => m._meta?.source === 'wa2_settlement_node');
  assert.equal(guides.length, 1);
  assert.equal(guides[0].role, 'system');
  assert.equal(guides[0].content.trim(),
    `# 本轮节点结算要求\n节点：plot.chapter.${chapter} / ${node}\n\n${section(chapter, node)}`);
  assert.ok(settlement.messages.indexOf(guides[0]) < settlement.messages.findIndex(m => m.role === 'user'));
}
const cases = [
  ...configs.flatMap((config, index) => config.slots.filter(slot => slot.data.plotKind === 'free')
    .map(slot => [index + 1, slot.id, slot.id, {}])),
  ...['FixedPlot1', 'FixedPlot2', 'FixedPlot3', 'FixedPlot4'].map(node => [1, node, node, {}]),
  ...['FixedPlot1', 'FixedPlot2', 'FixedPlot3', 'FixedPlot4', 'FixedPlot5', 'FixedPlot6', 'GameEnd1']
    .map(node => [2, node, node, {}]),
  [2, 'FixedPlot2', 'FixedPlot2Low', { setsuna: 5, story: { chapter2SetsunaBranch: 'reserved' } }],
  [2, 'GameEnd1', 'FixedPlot7', { touma: 30, setsuna: 20, proficiency: 20 }]
];
for (const [chapter, slot, node, overrides] of cases) {
  test(`node context routes chapter ${chapter} ${slot} → ${node}`, { timeout: 20000 }, async () => {
    const { session, requests } = await setup();
    try {
      setScenario(session, chapter, slot, overrides);
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

test('free and low-affection fallback rounds do not reuse the preceding fixed-node guide', { timeout: 20000 }, async () => {
  const { session, requests } = await setup();
  try {
    setScenario(session, 2, 'FixedPlot2', { setsuna: 5, story: { chapter2SetsunaBranch: 'reserved' } });
    await session.send('继续');
    assertContext(requests, 2, 'FixedPlot2Low');
    setScenario(session, 2, 'FixedPlot3', { setsuna: 5, story: { chapter2SetsunaBranch: 'reserved' } });
    await session.send('继续');
    assert.equal(session.snapshot().state.temp.PlotType, 'FixedPlot3Low');
    assertContext(requests, 2, 'FixedPlot3Low');
    assert.equal(section(2, 'FixedPlot3Low'), '无。');
    setScenario(session, 1, 'FreePlot1');
    await session.send('自由行动');
    assertContext(requests, 1, 'FreePlot1');
    assert.equal(section(1, 'FreePlot1'), '无。');
  } finally { await session.dispose(); }
});
