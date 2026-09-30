import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { read, matchesState } from './runtime-helper.mjs';

function scripts(nodes) {
  const context = vm.createContext({ include() {} });
  vm.runInContext(read('lib/timeline/time.js'), context);
  vm.runInContext(read('agents/shared/scripts/hidden-condition.js') + read('agents/shared/scripts/hidden-nodes.js'), context);
  const register = vm.runInContext(read('agents/director/scripts/context.js') + '\nrun', context);
  const validate = vm.runInContext(read('agents/director/scripts/validate-state.js') + '\nrun', context);
  const ctx = { state: { timeline: { currentTime: '2007.10.22: 8:01 星期一' },
    story: { triggeredHiddenNodes: [] }, turn: { previousPlotNode: '' }, temp: { working: true },
    setsuna: { affection: 14 }, PlotNode: '', PlotPlan: '', PlotWorldbookIndex: [] },
  files: { readText: async (scope, file) => {
    assert.equal(scope, 'plans'); assert.equal(file, 'hidden-nodes.json');
    return JSON.stringify(nodes);
  } } };
  return { ctx, register, validate, context };
}
function node(plotNode, state) {
  return { plotNode, condition: { state }, summary: '剧情摘要', trigger: '玩家行动', exclude: '排除行动' };
}

test('registration evaluates affinity and next-turn conditions, hides them from LLM and prevents duplicate hits', async () => {
  const first = 'plot.chapter.2#HiddenPlot2', second = 'plot.chapter.2#HiddenPlot3';
  const nodes = [node(first, { 'setsuna.affection': { gte: 15 }, 'temp.working': true }),
    node(second, { 'turn.previousPlotNode': first })];
  const { ctx, register, validate } = scripts(nodes);
  await register(ctx);
  assert.equal(ctx.state.temp.hiddenCandidates.length, 0);
  ctx.state.setsuna.affection = 15;
  ctx.state.temp.working = false;
  await register(ctx);
  assert.equal(ctx.state.temp.hiddenCandidates.length, 0);
  ctx.state.temp.working = true;
  await register(ctx);
  assert.deepEqual(Array.from(ctx.state.temp.hiddenCandidates), [first]);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.state.temp.hiddenSchemas)),
    [{ plotNode: first, summary: nodes[0].summary, trigger: nodes[0].trigger, exclude: nodes[0].exclude }]);
  ctx.state.PlotNode = first;
  await validate(ctx);
  await assert.rejects(validate(ctx), /hidden candidates/);
  ctx.state.turn.previousPlotNode = first;
  await register(ctx);
  assert.deepEqual(Array.from(ctx.state.temp.hiddenCandidates), [second]);
  ctx.state.turn.previousPlotNode = 'free';
  await register(ctx);
  assert.equal(ctx.state.temp.hiddenCandidates.length, 0, 'next-turn opportunity expires');
  ctx.state.turn.previousPlotNode = first;
  await register(ctx);
  ctx.state.PlotNode = second;
  await validate(ctx);
  await register(ctx);
  assert.deepEqual(ctx.state.story.triggeredHiddenNodes, [first, second]);
  assert.equal(ctx.state.temp.hiddenSchemas.length, 0);
});

test('state conditions share DSL comparison semantics, including normalized dates and missing values', () => {
  const { context } = scripts([]);
  const evaluate = vm.runInContext('matchesHiddenCondition', context);
  const check = vm.runInContext('validateHiddenCondition', context);
  const state = { affinity: 15, working: true, previous: 'park', time: '2007-10-22T08:01', hits: ['park'] };
  for (const predicate of [
    { affinity: { gte: 15 }, working: true }, { affinity: { gt: 15 } }, { previous: 'park' },
    { time: { gte: '2007-10-22T08:00', lt: '2007-10-23T17:00' } },
    { hits: { contains: 'park' } }, { previous: { in: ['park', 'ktv'] } },
    { previous: { nin: ['park'] } }, { absent: { exists: false } },
    { absent: { gt: 0 } }, { affinity: { gte: '15' } }, { previous: { regex: '^par' } }
  ]) {
    check({ state: predicate });
    assert.equal(evaluate({ state: predicate }, state), matchesState(predicate, state));
  }
});

test('currentTime ranges parse game time without publishing a derived state variable', async () => {
  const plotNode = 'plot.chapter.1#HiddenPlot2';
  const { ctx, register, context } = scripts([node(plotNode, {
    'timeline.currentTime': { gte: '2007.10.22: 08:00', lt: '2007.10.23: 17:00' }
  })]);
  for (const [time, eligible] of [
    ['2007.10.22: 7:59 星期一', false], ['2007.10.22: 8:00', true],
    ['2007.10.22: 9:00 星期一', true], ['2007.10.23: 16:59', true],
    ['2007.10.23: 17:00 星期二', false], ['2007.10.24: 0:00', false]
  ]) {
    ctx.state.timeline.currentTime = time;
    await register(ctx);
    assert.deepEqual(Array.from(ctx.state.temp.hiddenCandidates), eligible ? [plotNode] : [], time);
    assert.equal(ctx.state.timeline.currentTime, time);
    assert.equal(Object.hasOwn(ctx.state.temp, 'hiddenTime'), false);
  }
  const evaluate = vm.runInContext('matchesHiddenCondition', context);
  const state = { timeline: { currentTime: '2007.9.2: 9:00 星期日' } };
  const original = structuredClone(state);
  for (const [operator, bound, expected] of [
    ['gt', '2007.09.02: 09:00', false], ['gte', '2007.09.02: 09:00', true],
    ['lt', '2007.09.02: 09:00', false], ['lte', '2007.09.02: 09:00', true],
    ['gt', '2007.09.02: 08:00', true], ['lt', '2007.09.02: 17:00', true],
    ['lt', '2007.10.01: 00:00', true]
  ]) assert.equal(evaluate({ state: { 'timeline.currentTime': { [operator]: bound } } }, state), expected);
  assert.deepEqual(state, original);
  ctx.state.timeline.currentTime = '2007.02.30: 09:00';
  await assert.rejects(register(ctx), /invalid calendar time/);
});

test('invalid registries fail explicitly instead of silently opening nodes', async () => {
  const valid = node('plot.chapter.1#HiddenPlot1', { 'temp.working': true });
  for (const nodes of [
    [valid, valid], [{ ...valid, id: 'legacy-alias' }], [{ ...valid, summary: '' }],
    [{ ...valid, condition: { phase: 'pre_send' } }],
    ...[[], null, [{}], [{ state: {} }]].map(all => [{ ...valid, condition: { all } }]),
    [{ ...valid, condition: { all: [valid.condition], state: { 'temp.working': true } } }],
    [{ ...valid, condition: { state: { 'temp.working': { unknown: true } } } }],
    [{ ...valid, condition: { state: { 'timeline.currentTime': { gte: '2007.02.30: 09:00' } } } }],
    [{ ...valid, condition: { state: { 'timeline.currentTime': { lt: 'not a date' } } } }]
  ]) {
    const { ctx, register } = scripts(nodes);
    await assert.rejects(register(ctx), /Duplicate|Invalid|condition|Unsupported/);
  }
});

test('all requires both exact prerequisite hits without changing contains semantics', async () => {
  const prerequisite = id => ({ state: { 'story.triggeredHiddenNodes': { contains: id } } });
  const { ctx, register } = scripts([{ ...node('talk', { 'temp.working': true }),
    plotNode: 'plot.chapter.2#HiddenPlot5', condition: { all: [prerequisite('ktv'), prerequisite('pianist')] } }]);
  for (const [hits, offered] of [[[], false], [['ktv'], false], [['pianist'], false],
    [['ktv', 'pianist-extra'], false], [['ktv', 'pianist'], true], [['pianist', 'ktv'], true]]) {
    ctx.state.story.triggeredHiddenNodes = hits;
    await register(ctx);
    assert.equal(ctx.state.temp.hiddenCandidates.length, offered ? 1 : 0, hits.join(','));
    assert.ok(!JSON.stringify(ctx.state.temp.hiddenSchemas).includes('condition'));
  }
});

test('all chapter-two hidden nodes share the same opening and closing boundaries', async () => {
  const nodes = JSON.parse(read('agents/director/hidden-nodes.json')).filter(node => node.plotNode.startsWith('plot.chapter.2#'));
  const chapter = read('agents/narrator/plot/chapter-2.md');
  for (const node of nodes) {
    const { ctx, register } = scripts([node]);
    ctx.state.setsuna.affection = 15;
    ctx.state.turn.previousPlotNode = 'plot.chapter.2#HiddenPlot2';
    ctx.state.story.triggeredHiddenNodes = node.plotNode.endsWith('#HiddenPlot5')
      ? ['plot.chapter.2#HiddenPlot3', 'plot.chapter.2#HiddenPlot4'] : [];
    for (const [time, offered] of [
      ['2007.10.24: 7:59 星期三', false], ['2007.10.24: 8:00 星期三', true],
      ['2007.10.25: 21:00 星期四', true], ['2007.10.27: 9:00 星期六', true],
      ['2007.10.28: 13:59 星期日', true], ['2007.10.28: 14:00 星期日', false],
      ['2007.10.28: 15:00 星期日', false]
    ]) {
      ctx.state.timeline.currentTime = time;
      await register(ctx);
      assert.equal(ctx.state.temp.hiddenCandidates.includes(node.plotNode), offered, `${node.plotNode}: ${time}`);
    }
    const text = chapter.split(`## ${node.plotNode.split('#')[1]}\n`)[1].split('\n## ')[0];
    assert.match(text, /绝对禁止将时间推进到 2007\.10\.28: 14:00 星期日 之后/);
  }
});
