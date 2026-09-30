import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession, refreshDispatch, freePlan, freePlanState, patch, read } from './runtime-helper.mjs';

const hidden = patch({ PlotNode: 'plot.chapter.1#HiddenPlot1' });
const choices = '<choices><item>留在第三音乐教室练琴</item><item>回家</item><item>找武也</item><item>休息</item></choices>';
async function setup(reply = hidden) {
  const calls = [];
  let failSettlement = false;
  const session = await createSession(async (req, cb) => {
    calls.push(req);
    if (req.agentId === 'director') { cb.onToken(typeof reply === 'function' ? reply(req) : reply); return; }
    if (req.agentId === 'narrator') {
      cb.onToken('<state_patch_stream>{"visual.scene":"musical_classroom3"}</state_patch_stream>\n' +
        '【时间地点】2007.10.20: 16:10 星期六｜第三音乐教室\n\n春希与隔壁完成合奏。\n\n' + choices);
      return;
    }
    if (failSettlement) throw new Error('settlement failed');
    const time = req.messages.map(m => m.content).join('\n').match(/timeline.currentTime: ([^\n]+)/)[1];
    cb.onToken('<summary><item priority="current_event" known_by="北原春希">继续寻找队友。</item></summary>\n' +
      `<state_patch>${JSON.stringify({ 'timeline.currentTime': time })}</state_patch>`);
  });
  session.subscribe((_view, detail) => { if (detail.type === 'display') session.advance(); });
  return { session, calls, fail: value => { failSettlement = value; } };
}
async function setTime(session, time) {
  session.setState(state => ({ ...state, timeline: { ...state.timeline, currentTime: time, currentSlotEnd: '' } }));
  await refreshDispatch(session);
}
const prompt = req => req.messages.map(m => m.content).join('\n');
function section(fileId, heading) {
  const files = JSON.parse(read('files.json'));
  const lines = read(files[fileId]).split(/\r?\n/);
  const start = lines.findIndex(line => /^#{1,6}\s+/.test(line) && line.replace(/^#+\s+/, '').trim() === heading);
  assert.ok(start >= 0, heading);
  const level = lines[start].match(/^#+/)[0].length;
  const end = lines.findIndex((line, index) => index > start && /^#{1,6}\s+/.test(line) && line.match(/^#+/)[0].length <= level);
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
}
function assertTail(request, state) {
  const tail = request.messages.filter(m => m.role === 'user').at(-1).content;
  const { plotFile, toumaAttitudeSection, setsunaAttitudeSection } = state.temp;
  const commonHeading = plotFile === 'plot.chapter.1' ? '第一章通用限制' : '第二章通用限制';
  for (const [fileId, heading] of [[plotFile, toumaAttitudeSection], [plotFile, setsunaAttitudeSection],
    ['plot.restrictions', commonHeading]]) {
    const content = section(fileId, heading);
    assert.ok(content.length > 0);
    assert.equal(tail.split(content).length - 1, 1, heading);
  }
  const node = section(plotFile, state.temp.PlotType);
  assert.equal(tail.split(node).length - 1, 1, 'complete node description appears once');
  if (state.PlotNode !== 'free') assert.equal(state.PlotPlan, '');
  else assert.equal(tail.split(`本轮剧情规划：${state.PlotPlan}`).length - 1, 1, 'free plan appears once');
}
function assertWorldbook(request, ids) {
  const messages = request.messages.filter(m => m._meta?.source === 'wa2_worldbook');
  assert.equal(messages.length, 1, 'each turn replaces the preceding worldbook context');
  const text = messages[0].content;
  const index = read('worldbook/entries/世界书索引.md').trim();
  assert.equal(text.split(index).length - 1, 1, 'complete index appears exactly once');
  const entries = text.split('# 本轮召回的世界书条目\n')[1];
  const catalog = JSON.parse(read('agents/director/catalog.json'));
  for (const [id, file] of Object.entries(catalog.worldbook)) {
    assert.equal(entries.includes(`## ${id}\n`), ids.includes(id), id);
    if (ids.includes(id)) assert.ok(entries.includes(read(`worldbook/${file}`).trim()), id);
  }
}

test('hidden plan resolves preset content and exact worldbook; success is saved and cannot repeat', async () => {
  let count = 0;
  const { session, calls } = await setup(() => count++ === 0 ? hidden : freePlan);
  try {
    await session.send('在第三音乐教室练习吉他');
    assert.deepEqual(calls.map(req => req.agentId), ['director', 'narrator', 'settlement']);
    const state = session.snapshot().state;
    assert.deepEqual(state.story.triggeredHiddenNodes, ['plot.chapter.1#HiddenPlot1']);
    assert.equal(state.temp.PlotType, 'HiddenPlot1');
    assert.equal(state.PlotNode, 'plot.chapter.1#HiddenPlot1');
    assert.equal(state.PlotPlan, '');
    assert.match(prompt(calls[1]), /隔墙合奏/);
    assert.deepEqual(state.PlotWorldbookIndex, ['北原春希', '冬马和纱', '第二音乐教室', '第三音乐教室']);
    assertWorldbook(calls[1], state.PlotWorldbookIndex);
    assertTail(calls[1], state);
    assert.match(prompt(calls[2]), /冬马和纱\+2/);
    const saved = session.exportSession();
    await session.beginLoad(); session.restoreHistory({ runtimeSession: saved }); await session.start();
    assert.equal(calls.length, 3);
    await session.send('A');
    const context = calls[3].messages.find(m => m._meta?.source === 'wa2_director_context').content;
    assert.equal(session.snapshot().state.turn.previousPlotNode, 'plot.chapter.1#HiddenPlot1');
    assert.ok(!context.includes('"condition"'), 'registration conditions are not sent to the model');
    assert.ok(!context.includes('"plotNode":"plot.chapter.1#HiddenPlot1"'));
    assert.ok(prompt(calls[3]).includes(choices), 'director receives actual preceding choices');
    for (const [key, value] of Object.entries(freePlanState)) assert.deepEqual(session.snapshot().state[key], value);
    assertWorldbook(calls[4], freePlanState.PlotWorldbookIndex);
    const next = calls[4].messages.filter(m => m.role === 'user');
    assert.equal(next.length, 1, 'old user turn and its plan expire');
    assert.ok(next[0].content.startsWith('A\n\n<wa2_turn_context>\n\n本轮剧情规划：' + freePlanState.PlotPlan));
    assert.equal(prompt(calls[4]).split('本轮剧情规划：').length - 1, 1, 'plan is injected once');
    assert.ok(context.includes(section('plot.chapter.1', 'FreePlot1')), 'director receives free-node restrictions');
    assertTail(calls[4], session.snapshot().state);
    assert.ok(context.includes('剧情限制：'), 'director receives chapter restrictions through DSL');
    assert.ok(!calls[1].messages.some(m => m._meta?.source === 'wa2_preset_plan'), 'preset assembly message is removed');
  } finally { await session.dispose(); }
});

test('Saturday through Monday includes Monday night; outside window is rejected', async () => {
  for (const [time, allowed] of [
    ['2007.10.19: 23:59 星期五', false], ['2007.10.20: 00:00 星期六', true],
    ['2007.10.21: 16:00 星期日', true], ['2007.10.22: 23:59 星期一', true],
    ['2007.10.23: 00:00 星期二', false]
  ]) {
    const { session } = await setup();
    try {
      await setTime(session, time);
      if (allowed) {
        await session.send('在音乐教室练琴');
        assert.deepEqual(session.snapshot().state.story.triggeredHiddenNodes, ['plot.chapter.1#HiddenPlot1']);
      } else {
        await assert.rejects(session.send('练琴'), /PlotNode/);
        assert.deepEqual(session.snapshot().state.story.triggeredHiddenNodes, []);
        assert.throws(() => session.exportSession());
      }
    } finally { await session.dispose(); }
  }
});

test('Monday fixed node bypasses director; missing hidden event does not block Tuesday ensemble', async () => {
  const { session, calls } = await setup();
  try {
    for (const time of ['2007.10.22: 08:00 星期一', '2007.10.23: 15:00 星期二']) {
      await setTime(session, time);
      await session.send('继续');
      assert.deepEqual(calls.slice(-2).map(req => req.agentId), ['narrator', 'settlement']);
      assertWorldbook(calls.at(-2), session.snapshot().state.PlotWorldbookIndex);
      assertTail(calls.at(-2), session.snapshot().state);
    }
    assert.equal(calls.length, 4);
    assert.deepEqual(session.snapshot().state.story.triggeredHiddenNodes, []);
    assert.equal(session.snapshot().state.PlotPlan, '');
    assert.match(prompt(calls.at(-2)), /三人一起演奏/);
  } finally { await session.dispose(); }
});

test('invalid plans do not record a hit; downstream failure keeps the hit and retry restores the baseline', async () => {
  for (const reply of ['{"PlotNode":"free"}',
    patch({ PlotNode: 'unknown' }),
    patch({ PlotNode: 'plot.chapter.1#FixedPlot2' }),
    patch({ ...freePlanState, PlotNode: 'plot.chapter.1#HiddenPlot1' }),
    patch({ PlotNode: 'free' }),
    patch({ ...freePlanState, PlotWorldbookIndex: [123] }),
    patch({ ...freePlanState, 'timeline.currentTime': '2007.10.21: 17:00 星期日' }),
    patch({ ...freePlanState, 'visual.portraits.touma': 'normal' })]) {
    const { session, calls } = await setup(reply);
    try {
      await assert.rejects(session.send('练琴'), /director/);
      assert.deepEqual(calls.map(req => req.agentId), ['director']);
      assert.deepEqual(session.snapshot().state.story.triggeredHiddenNodes, []);
    } finally { await session.dispose(); }
  }
  const { session, calls, fail } = await setup();
  let latest;
  session.subscribe(view => { latest = view; });
  try {
    fail(true);
    await assert.rejects(session.send('练琴'), /settlement failed/);
    assert.deepEqual(latest.state.story.triggeredHiddenNodes, ['plot.chapter.1#HiddenPlot1']);
    fail(false);
    await session.retry();
    assert.deepEqual(session.snapshot().state.story.triggeredHiddenNodes, ['plot.chapter.1#HiddenPlot1']);
    assert.deepEqual(calls.map(req => req.agentId), ['director', 'narrator', 'settlement', 'director', 'narrator', 'settlement']);
  } finally { await session.dispose(); }
});

test('a hidden node after a free round does not inherit the old plan or worldbook', async () => {
  let count = 0;
  const { session } = await setup(() => count++ === 0 ? freePlan : hidden);
  try {
    await session.send('整理招募启事');
    assert.equal(session.snapshot().state.PlotPlan, freePlanState.PlotPlan);
    await session.send('在第三音乐教室练琴');
    const state = session.snapshot().state;
    assert.equal(state.PlotNode, 'plot.chapter.1#HiddenPlot1');
    assert.equal(state.PlotPlan, '');
    assert.ok(state.PlotWorldbookIndex.includes('第二音乐教室'));
    assert.deepEqual(state.story.triggeredHiddenNodes, ['plot.chapter.1#HiddenPlot1']);
  } finally { await session.dispose(); }
});
