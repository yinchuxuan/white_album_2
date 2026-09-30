import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession, refreshDispatch, freePlan, patch } from './runtime-helper.mjs';

const success = 'plot.chapter.2#FixedPlot7', failure = 'plot.chapter.2#GameEnd1';
const dinner = 'plot.chapter.2#FixedPlot6', talk = 'plot.chapter.2#HiddenPlot5';
const prompt = request => request.messages.map(message => message.content).join('\n');
const times = { FixedPlot6: '2007.10.28: 21:00 星期日', FixedPlot7: '2007.10.28: 22:00 星期日',
  GameEnd1: '2012.10.28: 22:00 星期日' };
async function setup() {
  const calls = [];
  let failurePoint = '', protectedPatch = false;
  const session = await createSession(async (request, callbacks) => {
    calls.push(request);
    if (failurePoint === request.agentId) { failurePoint = ''; throw new Error('mock ending failure'); }
    if (request.agentId === 'director') callbacks.onToken(freePlan);
    else if (request.agentId === 'narrator') callbacks.onToken('本轮剧情正文。');
    else {
      const node = request.messages.find(message => message._meta?.source === 'wa2_settlement_node')
        .content.match(/节点：[^\n]+ \/ (\S+)/)[1];
      const time = times[node] || prompt(request).match(/timeline.currentTime: ([^\n]+)/)[1];
      callbacks.onToken('<summary><item priority="current_event" known_by="北原春希">无当前事项。</item></summary>\n' +
        patch({ 'timeline.currentTime': time, ...(protectedPatch ? { 'turn.previousPlotNode': dinner } : {}) }));
    }
  });
  session.subscribe((_view, detail) => { if (detail.type === 'display') session.advance(); });
  return { session, calls, failOnce: agentId => { failurePoint = agentId; },
    tamper: () => { protectedPatch = true; } };
}
async function setScenario(session, { lastNode = 'free', stalePrevious = '', setsuna = 20, touma = 30, proficiency = 0,
  memory = '雪菜尚未作出加入承诺。', time = '2007.10.28: 21:00 星期日', hits = [talk] } = {}) {
  session.setState(state => ({ ...state,
    PlotNode: lastNode, turn: { ...state.turn, previousPlotNode: stalePrevious },
    timeline: { ...state.timeline, currentTime: time, currentSlotEnd: '' },
    setsuna: { ...state.setsuna, affection: setsuna }, touma: { ...state.touma, affection: touma },
    performance: { ...state.performance, proficiency },
    story: { ...state.story, triggeredHiddenNodes: hits },
    memory: { ...state.memory, summary: { ...state.memory.summary,
      anchor: [{ knownBy: ['北原春希', '小木曾雪菜'], text: memory }], currentEvents: [] } }
  }));
  await refreshDispatch(session);
}

test('ending requires the immediately preceding dinner and both affection thresholds, bypassing director', async () => {
  for (const [scenario, selected] of [
    [{ lastNode: 'free', stalePrevious: dinner, setsuna: 100, touma: 100, proficiency: 100, memory: '雪菜已加入，三人已聚餐。' }, failure],
    [{ lastNode: dinner, setsuna: 19 }, failure], [{ lastNode: dinner, touma: 29 }, failure],
    [{ lastNode: dinner, setsuna: 19, touma: 29 }, failure],
    [{ lastNode: dinner, proficiency: 0, memory: '雪菜已退出同好会。' }, success],
    [{ lastNode: dinner, setsuna: 100, touma: 100 }, success],
    [{ lastNode: 'FixedPlot6' }, failure], [{ lastNode: 'plot.chapter.1#FixedPlot6' }, failure]
  ]) {
    const { session, calls } = await setup();
    try {
      await setScenario(session, scenario);
      const before = session.snapshot().state;
      assert.equal(before.temp.nextPlotNode, selected);
      assert.equal(before.story.chapter2SuccessReached, false, 'preview must not lock the ending');
      assert.equal(before.story.chapter2GameEnd1Reached, false);
      assert.equal(before.turn.previousPlotNode, scenario.stalePrevious || '', 'preview does not advance real turn state');
      await session.send('继续');
      assert.deepEqual(calls.map(request => request.agentId), ['narrator', 'settlement']);
      const state = session.snapshot().state;
      assert.equal(state.turn.previousPlotNode, scenario.lastNode);
      assert.equal(state.PlotNode, selected);
      assert.equal(state.temp.PlotType, selected === success ? 'FixedPlot7' : 'GameEnd1');
      assert.equal(state.story.chapter2SuccessReached, selected === success);
      assert.equal(state.story.chapter2GameEnd1Reached, selected === failure);
      assert.equal(state.timeline.currentSlotEnd, times[state.temp.PlotType]);
      assert.equal(state.PlotPlan, '');
      assert.ok(state.PlotWorldbookIndex.includes('冬马和纱'));
      assert.ok(prompt(calls[0]).includes(scenario.memory || '雪菜尚未作出加入承诺。'), 'memory still reaches narration');
      const saved = session.exportSession(), count = calls.length;
      await session.beginLoad(); session.restoreHistory({ runtimeSession: saved }); await session.start();
      assert.equal(calls.length, count, 'restore does not replay the ending');
      await session.send('继续后日谈');
      assert.deepEqual(calls.slice(count).map(request => request.agentId), ['director', 'narrator', 'settlement']);
      assert.equal(session.snapshot().state.temp.PlotType, selected === success ? 'Chapter2SuccessAfterstory' : 'GameEnd1Afterstory');
    } finally { await session.dispose(); }
  }
});

test('save after dinner preserves the next-turn success decision without a permanent prerequisite flag', async () => {
  const { session, calls } = await setup();
  try {
    await setScenario(session, { time: '2007.10.28: 13:00 星期日' });
    assert.equal(session.snapshot().state.temp.nextPlotNode, dinner);
    assert.equal(session.snapshot().state.PlotNode, 'free');
    await session.send('继续聚餐');
    assert.deepEqual(calls.map(request => request.agentId), ['narrator', 'settlement']);
    assert.equal(session.snapshot().state.PlotNode, dinner);
    assert.equal(session.snapshot().state.turn.previousPlotNode, 'free');
    assert.equal(session.snapshot().state.temp.nextPlotNode, success);
    assert.equal(session.snapshot().state.story.chapter2SuccessReached, false);
    const saved = session.exportSession();
    await session.beginLoad(); session.restoreHistory({ runtimeSession: saved }); await session.start();
    assert.equal(session.snapshot().state.PlotNode, dinner);
    await session.send('继续');
    assert.equal(session.snapshot().state.PlotNode, success);
    assert.equal(session.snapshot().state.turn.previousPlotNode, dinner);
    assert.deepEqual(calls.map(request => request.agentId), ['narrator', 'settlement', 'narrator', 'settlement']);
  } finally { await session.dispose(); }
});

test('ending failure keeps the published selection; retry reruns the fixed node from its baseline', async () => {
  for (const reached of [false, true]) {
    const { session, calls, failOnce } = await setup();
    let latest;
    session.subscribe(view => { latest = view; });
    try {
      await setScenario(session, { lastNode: reached ? dinner : 'free' });
      failOnce('settlement');
      await assert.rejects(session.send('继续'), /mock ending failure/);
      assert.equal(latest.state.PlotNode, reached ? success : failure);
      assert.equal(latest.state.story.chapter2SuccessReached, reached);
      assert.equal(latest.state.story.chapter2GameEnd1Reached, !reached);
      assert.throws(() => session.exportSession());
      await session.retry();
      assert.equal(session.snapshot().state.PlotNode, reached ? success : failure);
      assert.deepEqual(calls.map(request => request.agentId), ['narrator', 'settlement', 'narrator', 'settlement']);
    } finally { await session.dispose(); }
  }
});

test('a model cannot forge the dinner prerequisite during a free round', async () => {
  const { session, tamper } = await setup();
  try {
    await setScenario(session, { hits: [], time: '2007.10.28: 13:00 星期日' });
    tamper();
    await assert.rejects(session.send('继续'), /cannot write state.turn.previousPlotNode/);
    assert.equal(session.snapshot().state.turn.previousPlotNode, '');
    assert.throws(() => session.exportSession());
  } finally { await session.dispose(); }
});
