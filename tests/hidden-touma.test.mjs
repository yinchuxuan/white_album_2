import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession, refreshDispatch, freePlan, patch, read } from './runtime-helper.mjs';

const ktv = 'plot.chapter.2#HiddenPlot3', reveal = 'plot.chapter.2#HiddenPlot4', talk = 'plot.chapter.2#HiddenPlot5';
const dinner = 'plot.chapter.2#FixedPlot6';
const prompt = request => request.messages.map(message => message.content).join('\n');
const choices = '<choices><item>继续</item><item>等待</item><item>交谈</item><item>休息</item></choices>';
const identityRestriction = read('agents/shared/prompts/plot-restrictions.md')
  .split('## 冬马身份限制\n')[1].split('\n## ')[0].trim();
const tail = request => request.agentId === 'director'
  ? request.messages.find(message => message._meta?.source === 'wa2_director_context').content
  : request.messages.filter(message => message.role === 'user').at(-1).content;
async function setup() {
  const calls = [];
  let requested = '', finish = '', fail = false;
  const session = await createSession(async (request, callbacks) => {
    calls.push(request);
    if (request.agentId === 'director') {
      callbacks.onToken(requested ? patch({ PlotNode: requested }) : freePlan);
    } else if (request.agentId === 'narrator') {
      if (fail) { fail = false; throw new Error('mock reveal failed'); }
      callbacks.onToken((requested === reveal ? '冬马救下春希，春希确认了钢琴手的身份。'
        : requested === talk ? '春希向雪菜讲述冬马就是钢琴手，雪菜察觉两人十分熟悉。'
          : '春希继续当前剧情。') + '\n\n' + choices);
    } else {
      const time = finish || prompt(request).match(/timeline.currentTime: ([^\n]+)/)[1];
      callbacks.onToken('<summary><item priority="current_event" known_by="北原春希">继续寻找队友。</item></summary>\n' +
        patch({ 'timeline.currentTime': time }));
    }
  });
  session.subscribe((_view, detail) => { if (detail.type === 'display') session.advance(); });
  return { session, calls, choose: (node = '', time = '') => { requested = node; finish = time; },
    failOnce: () => { fail = true; } };
}
async function setScene(session, time, hits = session.snapshot().state.story.triggeredHiddenNodes) {
  session.setState(state => ({ ...state, PlotNode: 'free',
    timeline: { ...state.timeline, currentTime: time, currentSlotEnd: '' },
    story: { ...state.story, triggeredHiddenNodes: hits },
    touma: { ...state.touma, affection: 0 }, setsuna: { ...state.setsuna, affection: 0 } }));
  await refreshDispatch(session);
}

test('real registration respects reveal times, both talk prerequisites and exact one-time hits', async () => {
  const { session, calls } = await setup();
  try {
    for (const [time, hits, offered] of [
      ['2007.10.24: 07:59 星期三', [], []], ['2007.10.24: 08:00 星期三', [], [reveal]],
      ['2007.10.24: 09:00 星期三', [ktv, reveal], [talk]],
      ['2007.10.26: 15:00 星期五', [], [reveal]], ['2007.10.26: 15:01 星期五', [], [reveal]],
      ['2007.10.26: 15:59 星期五', [], [reveal]], ['2007.10.26: 16:00 星期五', [], [reveal]],
      ['2007.10.26: 17:59 星期五', [], [reveal]], ['2007.10.26: 18:00 星期五', [], [reveal]],
      ['2007.10.27: 15:59 星期六', [], [reveal]], ['2007.10.27: 16:00 星期六', [], [reveal]],
      ['2007.10.27: 17:59 星期六', [], [reveal]], ['2007.10.27: 18:00 星期六', [], [reveal]],
      ['2007.10.27: 17:00 星期六', [ktv], [reveal]], ['2007.10.27: 17:00 星期六', [reveal], []],
      ['2007.10.27: 17:00 星期六', [ktv, `${reveal}-extra`], [reveal]],
      ['2007.10.27: 17:00 星期六', [ktv, reveal], [talk]],
      ['2007.10.27: 17:00 星期六', [reveal, ktv, talk], []],
      ['2007.10.28: 13:59 星期日', [ktv, reveal], [talk]],
      ['2007.10.28: 14:00 星期日', [ktv, reveal], []]
    ]) {
      await setScene(session, time, hits);
      const start = calls.length;
      await session.send('继续自己的行动');
      assert.equal(calls[start].agentId, 'director', time);
      const state = session.snapshot().state;
      assert.equal(state.temp.PlotType, 'FreePlot1', time);
      if (time === '2007.10.24: 07:59 星期三' || time === '2007.10.28: 14:00 星期日') {
        assert.equal(state.temp.characterGuideRoll, 0, 'weak guides close outside the shared window');
      } else assert.ok(state.temp.characterGuideRoll >= 1 && state.temp.characterGuideRoll <= 100);
      assert.equal(state.timeline.currentSlotEnd, time === '2007.10.28: 14:00 星期日'
        ? '2007.10.28: 21:00 星期日' : '2007.10.28: 14:00 星期日', time);
      const context = tail(calls[start]);
      for (const title of ['FreePlot1SetsunaWeakGuide', 'ToumaWeakGuide']) {
        const guide = read('agents/narrator/plot/chapter-2.md').split(`## ${title}\n`)[1].split('\n## ')[0].trim();
        assert.equal(context.includes(guide), state.temp.characterGuideRoll > 50, `${time}: ${title}`);
      }
      for (const node of [reveal, talk]) {
        assert.equal(context.includes(`"plotNode":"${node}"`), offered.includes(node), `${time}: ${hits}: ${node}`);
      }
      assert.doesNotMatch(context, /"condition"/);
      assert.deepEqual(session.snapshot().state.story.triggeredHiddenNodes, hits, 'offering alone does not mark hits');
    }
  } finally { await session.dispose(); }
});

test('reveal → later talk → saved Sunday dinner keeps presets, restrictions and dispatch consistent', async () => {
  const { session, calls, choose, failOnce } = await setup();
  let latest;
  session.subscribe(view => { latest = view; });
  try {
    await setScene(session, '2007.10.26: 16:00 星期五', [ktv]);
    choose(reveal, '2007.10.26: 17:00 星期五');
    failOnce();
    await assert.rejects(session.send('从第三音乐教室翻窗寻找钢琴手'), /mock reveal failed/);
    assert.deepEqual(latest.state.story.triggeredHiddenNodes, [ktv, reveal]);
    await session.retry();
    assert.ok(tail(calls.at(-3)).includes(identityRestriction));
    assert.ok(!tail(calls.at(-2)).includes(identityRestriction), 'identity gate releases in the reveal round');
    assert.match(tail(calls.at(-2)), /visual.scene: `touma_hand`/);
    assert.match(prompt(calls.at(-1)), /冬马和纱\+5/);
    assert.equal(session.snapshot().state.PlotPlan, '');
    assert.deepEqual(session.snapshot().state.PlotWorldbookIndex,
      ['北原春希', '冬马和纱', '饭冢武也', '第三音乐教室', '第二音乐教室']);
    choose();
    await session.send('先回家休息');
    assert.ok(tail(calls.at(-3)).includes(`"plotNode":"${talk}"`));
    choose(talk, '2007.10.26: 19:00 星期五');
    await session.send('和雪菜聊聊冬马就是钢琴手这件事');
    assert.equal(session.snapshot().state.turn.previousPlotNode, 'free', 'talk is not limited to the next round');
    assert.deepEqual(session.snapshot().state.story.triggeredHiddenNodes, [ktv, reveal, talk]);
    assert.match(tail(calls.at(-2)), /雪菜察觉到两人的关系比想象中的熟悉很多/);
    assert.match(prompt(calls.at(-1)), /小木曾雪菜-1/);
    assert.deepEqual(session.snapshot().state.PlotWorldbookIndex, ['北原春希', '冬马和纱', '小木曾雪菜', '第三音乐教室']);
    await setScene(session, '2007.10.28: 13:00 星期日');
    const saved = session.exportSession(), count = calls.length;
    await session.beginLoad(); session.restoreHistory({ runtimeSession: saved }); await session.start();
    assert.equal(calls.length, count);
    assert.equal(session.snapshot().state.temp.nextPlotNode, dinner);
    choose('', '2007.10.28: 21:00 星期日');
    await session.send('继续');
    assert.deepEqual(calls.slice(count).map(request => request.agentId), ['narrator', 'settlement']);
    assert.equal(session.snapshot().state.PlotNode, dinner);
    assert.match(tail(calls.at(-2)), /visual.scene: `home_party`/);
    assert.match(prompt(calls.at(-1)), /雪菜邀请冬马和春希来家里吃饭/);
  } finally { await session.dispose(); }
});

test('dinner waits for talk within its window and stays free when the window expires', async () => {
  const { session, calls, choose } = await setup();
  try {
    await setScene(session, '2007.10.28: 13:00 星期日', [ktv, reveal]);
    await session.send('先休息一会儿');
    assert.deepEqual(calls.map(request => request.agentId), ['director', 'narrator', 'settlement']);
    assert.equal(session.snapshot().state.temp.PlotType, 'FreePlot1');
    assert.equal(session.snapshot().state.timeline.currentSlotEnd, '2007.10.28: 14:00 星期日');
    choose(talk, '2007.10.28: 13:30 星期日');
    await session.send('告诉雪菜找到钢琴手的事');
    assert.equal(session.snapshot().state.temp.nextPlotNode, dinner);
    choose('', '2007.10.28: 21:00 星期日');
    const start = calls.length;
    await session.send('继续');
    assert.deepEqual(calls.slice(start).map(request => request.agentId), ['narrator', 'settlement']);
    for (const hits of [[], [ktv], [reveal], [ktv, reveal]]) {
      await setScene(session, '2007.10.28: 14:00 星期日', hits);
      const before = calls.length;
      await session.send('继续自由行动');
      assert.equal(calls[before].agentId, 'director');
      assert.equal(session.snapshot().state.temp.PlotType, 'FreePlot1');
      assert.equal(session.snapshot().state.timeline.currentSlotEnd, '2007.10.28: 21:00 星期日');
      assert.doesNotMatch(tail(calls.at(-2)), /visual.scene: `home_party`/);
      assert.equal(session.snapshot().state.temp.nextPlotNode, 'plot.chapter.2#GameEnd1');
    }
    for (const [time, expected] of [['2007.10.28: 12:00 星期日', 'free'],
      ['2007.10.28: 12:01 星期日', dinner], ['2007.10.28: 14:00 星期日', dinner],
      ['2007.10.28: 14:01 星期日', 'plot.chapter.2#GameEnd1']]) {
      await setScene(session, time, [ktv, reveal, talk]);
      assert.equal(session.snapshot().state.temp.nextPlotNode, expected, time);
    }
  } finally { await session.dispose(); }
});
