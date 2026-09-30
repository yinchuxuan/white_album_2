import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession, refreshDispatch, freePlan, patch, read } from './runtime-helper.mjs';

const park = 'plot.chapter.2#HiddenPlot2', ktv = 'plot.chapter.2#HiddenPlot3';
const prompt = request => request.messages.map(message => message.content).join('\n');
const choices = '<choices><item>赴约</item><item>回家</item><item>练习</item><item>休息</item></choices>';
async function setup() {
  const calls = [];
  let selected = '', requested = '';
  const session = await createSession(async (request, callbacks) => {
    calls.push(request);
    if (request.agentId === 'director') {
      selected = requested;
      callbacks.onToken(selected ? patch({ PlotNode: selected }) : freePlan);
    } else if (request.agentId === 'narrator') {
      const text = selected === park ? '雪菜请春希替打工保密，并约他一小时后见面。'
        : selected === ktv ? '雪菜唱完歌，明确同意担任轻音乐同好会主唱。' : '春希继续自己的行动。';
      callbacks.onToken(text + '\n\n' + choices);
    } else {
      const previousTime = prompt(request).match(/timeline.currentTime: ([^\n]+)/)[1];
      const day = previousTime.split(':')[0], weekday = previousTime.match(/星期./)[0];
      const time = selected === park ? `${day}: 17:00 ${weekday}`
        : selected === ktv ? `${day}: 20:00 ${weekday}` : previousTime;
      const memory = selected === park
        ? '<item priority="anchor" known_by="北原春希,小木曾雪菜">当天傍晚｜公园：雪菜袒露打工秘密，春希答应保密。</item>' +
          `<item priority="current_event" known_by="北原春希,小木曾雪菜">约定 ${day}: 18:00 在 KTV 见面；雪菜尚未加入同好会。</item>`
        : selected === ktv
          ? '<item priority="anchor" known_by="北原春希,小木曾雪菜">当天晚上｜KTV：雪菜袒露唱歌秘密并明确同意担任同好会主唱。</item>' +
            '<item priority="current_event" known_by="北原春希,小木曾雪菜">雪菜已加入同好会，担任主唱。</item>'
          : '<item priority="current_event" known_by="北原春希">雪菜尚未加入同好会。</item>';
      callbacks.onToken(`<summary>${memory}</summary>\n${patch({ 'timeline.currentTime': time })}`);
    }
  });
  session.subscribe((_view, detail) => { if (detail.type === 'display') session.advance(); });
  return { session, calls, choose: node => { requested = node; } };
}
async function setTime(session, time, affection = 15) {
  session.setState(state => ({ ...state, timeline: { ...state.timeline, currentTime: time, currentSlotEnd: '' },
    setsuna: { ...state.setsuna, affection } }));
  await refreshDispatch(session);
}

test('park scene requires affinity throughout the shared chapter-two window', async () => {
  const { session, calls } = await setup();
  try {
    for (const [time, affection, offered] of [
      ['2007.10.24: 07:59 星期三', 15, false], ['2007.10.24: 08:00 星期三', 15, true],
      ['2007.10.24: 15:59 星期三', 15, true], ['2007.10.24: 16:00 星期三', 14, false],
      ['2007.10.24: 16:00 星期三', 15, true], ['2007.10.24: 17:59 星期三', 15, true],
      ['2007.10.24: 18:00 星期三', 15, true], ['2007.10.25: 16:00 星期四', 15, true],
      ['2007.10.26: 12:00 星期五', 15, true], ['2007.10.27: 09:00 星期六', 15, true],
      ['2007.10.28: 13:59 星期日', 15, true], ['2007.10.28: 14:00 星期日', 15, false]
    ]) {
      await setTime(session, time, affection);
      const start = calls.length;
      await session.send('继续自己的行动');
      assert.equal(calls[start].agentId, 'director', time);
      const text = prompt(calls[start]);
      assert.equal(text.includes(`"plotNode":"${park}"`), offered, time);
      assert.equal(text.includes(`"plotNode":"${ktv}"`), false, 'KTV cannot open without the previous park round');
      assert.doesNotMatch(text, /"condition"/);
      assert.deepEqual(session.snapshot().state.story.triggeredHiddenNodes, []);
    }
  } finally { await session.dispose(); }
});

test('park → next-turn KTV preserves preset content, worldbook, settlement, save and memory', async () => {
  const { session, calls, choose } = await setup();
  try {
    await setTime(session, '2007.10.24: 16:00 星期三');
    choose(park);
    await session.send('去便利店找雪菜');
    let state = session.snapshot().state;
    assert.equal(state.temp.PlotType, 'HiddenPlot2');
    assert.equal(state.PlotPlan, '');
    assert.match(prompt(calls.at(-2)), /visual.scene: `park`/);
    assert.match(prompt(calls.at(-1)), /此节点本身不代表雪菜已加入/);
    assert.deepEqual(state.story.triggeredHiddenNodes, [park]);
    assert.ok(state.memory.summary.currentEvents.some(item => item.text.includes('18:00')));
    assert.ok(!state.memory.summary.anchor.some(item => item.text.includes('同意担任')));
    const saved = session.exportSession();
    await session.beginLoad(); session.restoreHistory({ runtimeSession: saved }); await session.start();
    assert.equal(calls.length, 3);
    session.setState(state => ({ ...state, setsuna: { ...state.setsuna, affection: 14 } }));
    choose(ktv);
    await session.send('接受邀约，一小时后赴约');
    state = session.snapshot().state;
    assert.equal(state.turn.previousPlotNode, park);
    assert.equal(state.PlotNode, ktv);
    assert.equal(state.temp.PlotType, 'HiddenPlot3');
    assert.deepEqual(state.story.triggeredHiddenNodes, [park, ktv]);
    assert.deepEqual(state.PlotWorldbookIndex, ['北原春希', '小木曾雪菜']);
    assert.match(prompt(calls.at(-2)), /audio.bgm: `WA_formal`/);
    assert.match(prompt(calls.at(-1)), /根据实际正文新增一条 anchor/);
    assert.ok(state.memory.summary.anchor.some(item => item.text.includes('同意担任同好会主唱')));
    assert.ok(!state.memory.summary.currentEvents.some(item => item.text.includes('约定')));
    choose('');
    await session.send('继续练习');
    assert.doesNotMatch(prompt(calls.at(-3)), /"plotNode":"plot.chapter.2#HiddenPlot[23]"/);
  } finally { await session.dispose(); }
});

test('declining the next-turn invitation expires KTV without a forced joining fallback', async () => {
  const { session, calls, choose } = await setup();
  try {
    await setTime(session, '2007.10.25: 16:00 星期四');
    choose(park);
    await session.send('去便利店找雪菜');
    choose('');
    await session.send('放弃邀约，回家');
    assert.match(prompt(calls.at(-3)), /"plotNode":"plot.chapter.2#HiddenPlot3"/);
    choose(ktv);
    await assert.rejects(session.send('现在再去赴约'), /hidden candidates/);
    assert.doesNotMatch(prompt(calls.at(-1)), /"plotNode":"plot.chapter.2#HiddenPlot3"/);
    const state = session.snapshot().state;
    assert.deepEqual(state.story.triggeredHiddenNodes, [park]);
    assert.ok(!state.memory.summary.anchor.some(item => item.text.includes('同意担任')));
  } finally { await session.dispose(); }
});

test('next-turn KTV shares the chapter window instead of closing at 19:00', async () => {
  const { session, calls } = await setup();
  try {
    for (const [time, offered] of [
      ['2007.10.24: 18:59 星期三', true], ['2007.10.24: 19:00 星期三', true],
      ['2007.10.24: 19:01 星期三', true], ['2007.10.25: 19:00 星期四', true],
      ['2007.10.25: 19:01 星期四', true], ['2007.10.26: 20:00 星期五', true],
      ['2007.10.27: 10:00 星期六', true], ['2007.10.28: 13:59 星期日', true],
      ['2007.10.28: 14:00 星期日', false]
    ]) {
      session.setState(state => ({ ...state, PlotNode: park,
        story: { ...state.story, triggeredHiddenNodes: [park] } }));
      await setTime(session, time, 0);
      await session.send('继续');
      assert.equal(prompt(calls.at(-3)).includes(`"plotNode":"${ktv}"`), offered, time);
    }
  } finally { await session.dispose(); }
});

test('actual joining is recorded even if the model ignores the prompt restriction, and passed to later hidden narration', async () => {
  const calls = [];
  let requested = '';
  const commitment = '2007.10.25下午｜学校：雪菜明确同意担任轻音乐同好会主唱。';
  const session = await createSession(async (request, callbacks) => {
    calls.push(request);
    if (request.agentId === 'director') {
      callbacks.onToken(requested ? patch({ PlotNode: requested }) : patch({ PlotNode: 'free', PlotPlan: '春希在校门口再次邀请雪菜，她经过思考后明确同意担任主唱。',
        PlotWorldbookIndex: ['北原春希', '小木曾雪菜'] }));
    } else if (request.agentId === 'narrator') {
      callbacks.onToken('雪菜明确同意担任轻音乐同好会主唱。\n\n' + choices);
    } else {
      const time = prompt(request).match(/timeline.currentTime: ([^\n]+)/)[1];
      callbacks.onToken(`<summary><item priority="anchor" known_by="北原春希,小木曾雪菜">${commitment}</item>` +
        '<item priority="current_event" known_by="北原春希,小木曾雪菜">雪菜已加入同好会，担任主唱。</item></summary>\n' +
        patch({ 'timeline.currentTime': time }));
    }
  });
  session.subscribe((_view, detail) => { if (detail.type === 'display') session.advance(); });
  try {
    await setTime(session, '2007.10.25: 12:00 星期四', 5);
    await session.send('邀请雪菜担任主唱');
    for (const request of calls.slice(0, 2)) assert.match(prompt(request), /本轮不得让雪菜新作出加入/);
    assert.deepEqual(session.snapshot().state.story.triggeredHiddenNodes, []);
    assert.ok(session.snapshot().state.memory.summary.anchor.some(item => item.text === commitment));
    await setTime(session, '2007.10.26: 16:00 星期五', 5);
    requested = 'plot.chapter.2#HiddenPlot4';
    await session.send('继续寻找钢琴手');
    const narrator = calls.at(-2);
    assert.equal(narrator.agentId, 'narrator');
    assert.ok(prompt(narrator).includes(commitment));
    assert.match(prompt(narrator), /雪菜是否已同意担当主唱按 memory 承接/);
    assert.deepEqual(session.snapshot().state.story.triggeredHiddenNodes, [requested]);
  } finally { await session.dispose(); }
});
