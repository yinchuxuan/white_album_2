import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession, refreshDispatch, freePlan, patch, read } from './runtime-helper.mjs';

const id = 'plot.chapter.1#HiddenPlot2';
const node = read('agents/narrator/plot/chapter-1.md').split('## HiddenPlot2\n')[1].split('\n## ')[0].trim();

test('HiddenPlot2 is available between fixed nodes, preserves its description, and only triggers once', async () => {
  const calls = [];
  let trigger = false;
  const session = await createSession(async (req, cb) => {
    calls.push(req);
    if (req.agentId === 'director') {
      const context = req.messages.map(m => m.content).join('\n');
      cb.onToken(trigger && context.includes(`"plotNode":"${id}"`) ? patch({ PlotNode: id }) : freePlan);
    } else if (req.agentId === 'narrator') {
      cb.onToken('春希和依绪聊起雪菜。');
    } else {
      const time = req.messages.map(m => m.content).join('\n').match(/timeline.currentTime: ([^\n]+)/)[1];
      cb.onToken('<summary><item priority="current_event" known_by="北原春希">继续寻找队友。</item></summary>\n' +
        patch({ 'timeline.currentTime': time }));
    }
  });
  session.subscribe((_view, detail) => { if (detail.type === 'display') session.advance(); });
  try {
    for (const [time, agent, offered] of [
      ['2007.10.21: 20:00 星期日', 'director', false],
      ['2007.10.22: 08:00 星期一', 'narrator', false],
      ['2007.10.22: 08:01 星期一', 'director', true],
      ['2007.10.23: 08:00 星期二', 'director', true],
      ['2007.10.23: 08:01 星期二', 'narrator', false],
      ['2007.10.23: 10:01 星期二', 'director', true],
      ['2007.10.23: 14:00 星期二', 'director', true],
      ['2007.10.23: 14:01 星期二', 'narrator', false],
      ['2007.10.24: 12:00 星期三', 'director', false]
    ]) {
      session.setState(state => ({ ...state, timeline: { ...state.timeline, currentTime: time, currentSlotEnd: '' } }));
      await refreshDispatch(session);
      const start = calls.length;
      await session.send('与依绪聊起雪菜');
      assert.equal(calls[start].agentId, agent, time);
      const context = calls[start].messages.map(m => m.content).join('\n');
      assert.equal(context.includes(`"plotNode":"${id}"`), offered, time);
    }
    session.setState(state => ({ ...state, timeline: { ...state.timeline,
      currentTime: '2007.10.22: 12:00 星期一', currentSlotEnd: '' } }));
    await refreshDispatch(session);
    trigger = true;
    await session.send('问依绪和雪菜的关系怎么样');
    const state = session.snapshot().state;
    assert.equal(state.PlotNode, id);
    assert.equal(state.PlotPlan, '');
    assert.deepEqual(state.story.triggeredHiddenNodes, [id]);
    assert.deepEqual(state.PlotWorldbookIndex, ['北原春希', '水泽依绪', '小木曾雪菜', '峰城大附属中学']);
    assert.ok(calls.at(-2).messages.some(m => m.content.includes(node)));
    assert.ok(calls.at(-1).messages.some(m => m.content.includes('无额外数值奖励')));
    await session.send('继续和依绪聊天');
    assert.equal(session.snapshot().state.PlotNode, 'free');
    assert.ok(!calls.at(-3).messages.some(m => m.content.includes(`"plotNode":"${id}"`)));
  } finally { await session.dispose(); }
});
