import assert from 'node:assert/strict';
import test from 'node:test';
import { applyGameCard, createSession, freePlan, loadDefinition, patch, read, refreshDispatch } from './runtime-helper.mjs';

const park = 'plot.chapter.2#HiddenPlot2', ktv = 'plot.chapter.2#HiddenPlot3';
const routes = [
  ['plot.chapter.1', 'FixedPlot2', '第一章通用限制'],
  ['plot.chapter.2', 'HiddenPlot2', '第二章通用限制'],
  ['plot.chapter.2.successAfterstory', 'Chapter2SuccessAfterstory', '成功结局日后谈限制'],
  ['plot.chapter.2.gameEnd1Afterstory', 'GameEnd1Afterstory', '失败结局日后谈限制']
];
function section(file, title) {
  const parts = read(file).split(`## ${title}\n`);
  assert.equal(parts.length, 2, `${file}: unique ${title}`);
  return parts[1].split('\n## ')[0].trim();
}
const tail = request => request.agentId === 'director'
  ? request.messages.find(message => message._meta?.source === 'wa2_director_context').content
  : request.messages.filter(message => message.role === 'user').at(-1).content;
function render(definition, agentId, [plotFile, PlotType], triggeredHiddenNodes = [], memory = {}) {
  const ruleId = agentId === 'director' ? 'wa2-director-timeline-guide' : 'wa2-tail-roleplay-guide';
  const rule = definition.agents[agentId].definition.rules.find(item => item.id === ruleId);
  assert.ok(rule, `${agentId} has the expanded tail rule`);
  const result = applyGameCard({
    card: { id: 'restrictions', version: '1', name: 'Restrictions', files: definition.card.files, rules: [rule] }, phase: 'pre_send',
    messages: [{ id: 'input', role: 'user', content: '继续' }],
    state: { PlotNode: 'free', PlotPlan: '继续行动', memory, story: { triggeredHiddenNodes },
      timeline: { currentTime: '2007.10.24: 16:00 星期三', currentSlotEnd: '2007.10.26: 17:00 星期五' },
      temp: { plotFile, PlotType, plotKind: 'free', includeFreeGuide: true, characterGuideRoll: 50,
        plotMoodSection: 'PlotMood_normal', plotEventCategory: '', hiddenSchemas: [],
        toumaAttitudeSection: 'ToumaAttitudeLow', setsunaAttitudeSection: 'SetsunaAttitudeLow' } },
    dependencies: { readFile: read }
  });
  assert.deepEqual(result.trace.errors, []);
  return tail({ agentId, messages: result.messages });
}

test('expanded tails share migrated restrictions, isolate chapters and preserve node restrictions', async () => {
  const definition = await loadDefinition(), files = definition.card.files;
  assert.equal(files['plot.restrictions'], 'agents/shared/prompts/plot-restrictions.md');
  const common = routes.map(([, , title]) => section(files['plot.restrictions'], title));
  const retained = [
    ['春希(用户)无论如何无法得知隔壁音乐教室里弹琴的神秘人是谁',
      '春希(用户)无论如何无法得知雪菜喜欢自己唱歌，会去打工，像个小女孩等真实的一面',
      '小木曾雪菜不会明确答应参加“峰城大附属小姐”评选',
      '冬马明面上不会理会春希的互动请求，也不会主动和春希互动(尤其是演奏相关)',
      '冬马和小木曾雪菜不会加入轻音乐同好会参加学园祭演奏',
      '春希(用户)始终找不到愿意参加轻音乐同好会演出的队友'],
    ['雪菜打工、独自唱 KTV 等秘密是否已被春希知道，以 memory 和实际发生的互动为准，不因日期自动解锁，也不得虚构错过的隐藏剧情',
      '小木曾雪菜是否同意加入同好会，以 memory 中的明确承诺为准；本轮新增承诺须遵守动态剧情限制，未明确同意、拒绝或待考虑都不能当作已经加入',
      '冬马在2007.10.28: 21:00前不会同意加入同好会', '冬马和小木曾雪菜此时不会和春希有超越友情的亲密互动'],
    ['雪菜和冬马已经同意加入同好会；不得否定或重写这个结果；人物关系仍保持克制，不要突然跨越到不符合当前阶段的亲密关系。'],
    ['剧情限制：不得把时间线拉回 2007 年改写轻音乐同好会结局；不得写三人突然补办学园祭演出；不得开启新的固定主线节点。']
  ];
  for (const [index, route] of routes.entries()) {
    for (const text of retained[index]) assert.ok(common[index].includes(text), text);
    assert.doesNotMatch(read(files[route[0]]), /^## 剧情限制$/m, 'common body moved out of each plot file');
    const node = section(files[route[0]], route[1]);
    for (const agentId of ['director', 'narrator']) {
      const text = render(definition, agentId, route);
      assert.ok(text.includes(node), `${agentId}: complete node plan and its restrictions`);
      assert.equal(text.split(common[index]).length - 1, 1, `${agentId}: shared restriction occurs once`);
      for (const other of common.filter((_, position) => position !== index)) assert.ok(!text.includes(other));
    }
  }
});

test('only the exact chapter-two KTV key removes the dynamic joining restriction', async () => {
  const definition = await loadDefinition();
  const dynamic = section(definition.card.files['plot.restrictions'], '雪菜加入同好会限制');
  assert.match(dynamic, /本轮不得让雪菜新作出加入轻音乐同好会担任主唱的承诺/);
  assert.match(dynamic, /已有 memory 中明确记录的真实加入承诺照常承接，不得否定或重写/);
  for (const agentId of ['director', 'narrator']) {
    for (const [keys, restricted] of [[[], true], [[park], true], [['HiddenPlot3'], true],
      [['plot.chapter.1#HiddenPlot3'], true], [[`${ktv}-extra`], true], [[ktv], false], [[park, ktv], false]]) {
      assert.equal(render(definition, agentId, routes[1], keys).includes(dynamic), restricted, `${agentId}: ${keys}`);
    }
    const memory = { summary: { anchor: [{ text: '雪菜已明确同意担任主唱。', knownBy: ['北原春希', '小木曾雪菜'] }] } };
    assert.ok(render(definition, agentId, routes[1], [], memory).includes(dynamic), 'memory is preserved, not an unlock key');
    for (const route of routes.filter((_, index) => index !== 1)) assert.ok(!render(definition, agentId, route).includes(dynamic));
  }
});

test('only the exact reveal hit unlocks winter identity in both Agent tails', async () => {
  const definition = await loadDefinition();
  const restriction = section(definition.card.files['plot.restrictions'], '冬马身份限制');
  const reveal = 'plot.chapter.2#HiddenPlot4';
  for (const agentId of ['director', 'narrator']) {
    for (const [keys, locked] of [[[], true], [[park, ktv], true], [['HiddenPlot4'], true],
      [['plot.chapter.1#HiddenPlot4'], true], [[`${reveal}-extra`], true], [[reveal], false]]) {
      assert.equal(render(definition, agentId, routes[1], keys).includes(restriction), locked, `${agentId}: ${keys}`);
    }
    for (const route of routes.filter((_, index) => index !== 1)) {
      assert.equal(render(definition, agentId, route, [reveal]), render(definition, agentId, route));
    }
  }
});

test('exact park key releases secrets independently from the KTV joining restriction', async () => {
  const definition = await loadDefinition(), file = definition.card.files['plot.restrictions'];
  const secret = section(file, '雪菜秘密限制'), joining = section(file, '雪菜加入同好会限制');
  const cases = [[[], true, true], [[park], false, true], [[ktv], true, false], [[park, ktv], false, false],
    [['HiddenPlot2'], true, true], [['plot.chapter.1#HiddenPlot2'], true, true], [[`${park}-extra`], true, true],
    [['plot.chapter.2#HiddenPlot20'], true, true], [[`${park}-extra`, ktv], true, false], [[park, 'HiddenPlot3'], false, true]];
  for (const agentId of ['director', 'narrator']) {
    for (const [keys, secretRestricted, joiningRestricted] of cases) {
      const text = render(definition, agentId, routes[1], keys);
      assert.equal(text.includes(secret), secretRestricted, `${agentId}: secret with ${keys}`);
      assert.equal(text.includes(joining), joiningRestricted, `${agentId}: joining with ${keys}`);
    }
    for (const route of routes.filter((_, index) => index !== 1)) {
      assert.equal(render(definition, agentId, route, [park]), render(definition, agentId, route),
        `${agentId}: park key cannot affect ${route[0]}`);
    }
  }
});

test('park → KTV gates director before resolution, releases narrator and survives retry and save', { timeout: 20000 }, async () => {
  const definition = await loadDefinition();
  const dynamic = section(definition.card.files['plot.restrictions'], '雪菜加入同好会限制');
  const secret = section(definition.card.files['plot.restrictions'], '雪菜秘密限制');
  const calls = [], choices = '<choices><item>赴约</item><item>回家</item><item>练习</item><item>休息</item></choices>';
  const joined = '当天晚上｜KTV：雪菜明确同意担任轻音乐同好会主唱。';
  let requested = park, selected = '', failKtv = true;
  const session = await createSession(async (request, callbacks) => {
    calls.push(request);
    if (request.agentId === 'director') {
      selected = requested;
      callbacks.onToken(selected ? patch({ PlotNode: selected }) : freePlan);
    } else if (request.agentId === 'narrator') {
      if (selected === ktv && failKtv) { failKtv = false; throw new Error('mock KTV narration failed'); }
      callbacks.onToken((selected === park ? '雪菜请春希保密，并约他一小时后见面。'
        : selected === ktv ? '雪菜明确同意担任轻音乐同好会主唱。' : '雪菜作为主唱继续排练。') + '\n\n' + choices);
    } else {
      const previous = request.messages.map(message => message.content).join('\n').match(/timeline.currentTime: ([^\n]+)/)[1];
      const day = previous.split(':')[0], weekday = previous.match(/星期./)[0];
      const time = selected === park ? `${day}: 17:00 ${weekday}` : selected === ktv ? `${day}: 20:00 ${weekday}` : previous;
      const memory = selected === park
        ? `<item priority="current_event" known_by="北原春希,小木曾雪菜">约定 ${day}: 18:00 在 KTV 见面，雪菜尚未加入。</item>`
        : `<item priority="anchor" known_by="北原春希,小木曾雪菜">${joined}</item>` +
          '<item priority="current_event" known_by="北原春希,小木曾雪菜">雪菜已加入同好会，担任主唱。</item>';
      callbacks.onToken(`<summary>${memory}</summary>\n${patch({ 'timeline.currentTime': time })}`);
    }
  });
  session.subscribe((_view, detail) => { if (detail.type === 'display') session.advance(); });
  const assertRound = (start, directorRestricted, narratorRestricted, directorSecretRestricted = false) => {
    const [director, narrator] = calls.slice(start);
    assert.equal(director.agentId, 'director');
    assert.equal(narrator.agentId, 'narrator');
    assert.equal(tail(director).includes(dynamic), directorRestricted);
    assert.equal(tail(narrator).includes(dynamic), narratorRestricted);
    assert.equal(tail(director).includes(secret), directorSecretRestricted, 'director sees the pre-selection secret gate');
    assert.ok(!tail(narrator).includes(secret), 'park resolution removes the secret gate before narration');
  };
  try {
    session.setState(state => ({ ...state, setsuna: { ...state.setsuna, affection: 15 },
      timeline: { ...state.timeline, currentTime: '2007.10.24: 16:00 星期三', currentSlotEnd: '' } }));
    await refreshDispatch(session);
    await session.send('去便利店找雪菜');
    assertRound(0, true, true, true);
    assert.deepEqual(session.snapshot().state.story.triggeredHiddenNodes, [park]);
    requested = ktv;
    let start = calls.length;
    await assert.rejects(session.send('一小时后接受邀约去 KTV'), /mock KTV narration failed/);
    assertRound(start, true, false);
    assert.throws(() => session.exportSession());
    start = calls.length;
    await session.retry();
    assertRound(start, true, false);
    assert.deepEqual(session.snapshot().state.story.triggeredHiddenNodes, [park, ktv]);
    assert.ok(session.snapshot().state.memory.summary.anchor.some(item => item.text === joined));
    requested = '';
    start = calls.length;
    await session.send('继续排练');
    assertRound(start, false, false);
    const saved = session.exportSession(), count = calls.length;
    await session.beginLoad(); session.restoreHistory({ runtimeSession: saved }); await session.start();
    assert.equal(calls.length, count);
    await session.send('继续下一轮排练');
    assertRound(count, false, false);
    assert.deepEqual(session.snapshot().state.story.triggeredHiddenNodes, [park, ktv]);
    assert.ok(session.snapshot().state.memory.summary.anchor.some(item => item.text === joined));
  } finally { await session.dispose(); }
});
