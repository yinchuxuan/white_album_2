import assert from 'node:assert/strict';
import test from 'node:test';
import { barrier, createSession, read } from './runtime-helper.mjs';

const choices = '<choices><item>练习</item><item>休息</item><item>交谈</item><item>回家</item></choices>';
const story = '<state_patch_stream>{"visual.scene":"classroom_afternoon"}</state_patch_stream>\n' +
  '【时间地点】2007.10.20: 16:10 星期六｜教室\n\n<state_patch_stream>{"visual.scene":"school_afternoon"}</state_patch_stream>\n春希完成了本轮练习。\n\n' + choices;
const settlement = '<summary><item priority="current_event" known_by="北原春希">等待合练。</item>' +
  '<item priority="recent" known_by="北原春希">2007.10.20 16:10｜教室：完成练习。</item></summary>\n' +
  '<state_patch>[{"type":"state.set","path":"timeline.currentTime","value":"2007.10.20: 16:10 星期六"},' +
  '{"type":"state.inc","path":"performance.proficiency","value":2}]</state_patch>';
const autoRead = session => session.subscribe((_view, detail) => {
  if (detail.type === 'display') session.advance();
});

test('settlement overlaps reading; the queued turn gets updated memory and variables', { timeout: 20000 }, async () => {
  const requests = [], narratorDone = barrier(), settlementStarted = barrier(), release = barrier(), readingDone = barrier();
  const session = await createSession(async (req, cb) => {
    requests.push(req);
    if (req.agentId === 'narrator') { cb.onToken(story); await narratorDone.promise; return; }
    if (requests.length === 2) { settlementStarted.resolve(); await release.promise; }
    cb.onToken(settlement);
  });
  try {
    assert.equal(requests.length, 0, 'opening must not invoke models');
    const baseline = session.snapshot();
    assert.deepEqual(baseline.state.memory.summary, JSON.parse(read('agents/settlement/initial-memory.json')));
    assert.equal(baseline.state.timeline.currentTime, JSON.parse(read('state/schema.json')).schema['timeline.currentTime'].default);
    assert.ok(!baseline.contexts.narrator.messages.find(m => m._meta?.source === 'wa2_first_msg').content.includes('<summary>'));
    const first = session.send('练习');
    const shown = barrier();
    const stop = session.subscribe((_view, detail) => {
      if (detail.type === 'display') shown.resolve();
      if (detail.type === 'read-complete') readingDone.resolve();
    });
    await shown.promise;
    assert.deepEqual(requests.map(r => r.agentId), ['narrator']);
    narratorDone.resolve();
    await settlementStarted.promise;
    assert.ok(session.view().reading, 'settlement must start before reading finishes');
    const prompt = requests[1].messages.map(m => m.content).join('\n');
    assert.ok(prompt.includes('春希完成了本轮练习。'));
    assert.ok(prompt.includes('主唱和键盘手'), 'initial memory must reach settlement');
    const characterIndex = requests[1].messages.find(m => m._meta?.source === 'wa2_character_index');
    const characters = read('worldbook/entries/世界书索引.md').split('人物:')[1].split('地点:')[0].trim();
    assert.equal(characterIndex.role, 'system');
    assert.equal(characterIndex.content.replace(/^#[^\r\n]*\r?\n/, '').trim(), characters);
    assert.ok(!characterIndex.content.includes('地点:'));
    assert.ok(!characterIndex.content.includes('本轮命中的世界书条目'));
    assert.throws(() => session.exportSession());
    const second = session.send('继续');
    autoRead(session); session.advance();
    await readingDone.promise;
    assert.deepEqual(requests.map(r => r.agentId), ['narrator', 'settlement']);
    release.resolve();
    await first; await second; stop();
    assert.deepEqual(requests.map(r => r.agentId), ['narrator', 'settlement', 'narrator', 'settlement']);
    assert.ok(requests[2].messages.find(m => m._meta?.source === 'wa2_summary').content.includes('等待合练'));
    assert.equal(requests[2].messages.filter(m => m.role === 'assistant').length, 1);
    const saved = session.exportSession();
    assert.equal(saved.current.state.performance.proficiency, baseline.state.performance.proficiency + 4);
    assert.equal(saved.current.state.memory.summary.turn, baseline.state.memory.summary.turn + 2);
    assert.equal(saved.current.state.visual.scene, 'school_afternoon');
    assert.ok(!session.snapshot().messages.at(-1).content.includes('<summary>'));
    assert.equal(saved.current.contexts.settlement.messages.filter(m => m.role === 'user').length, 1);
    await session.beginLoad();
    session.restoreHistory({ runtimeSession: saved });
    await session.start();
    assert.equal(requests.length, 4, 'restore must not repeat settlement');
    await session.retry();
    assert.equal(session.snapshot().state.performance.proficiency, saved.current.state.performance.proficiency);
    assert.equal(session.snapshot().state.memory.summary.turn, saved.current.state.memory.summary.turn);
  } finally { release.resolve(); narratorDone.resolve(); await session.dispose(); }
});

test('failed settlement blocks saving; whole-turn retry applies summary and increments once', { timeout: 20000 }, async () => {
  let fail = true;
  const calls = [];
  const session = await createSession(async ({ agentId }, cb) => {
    calls.push(agentId);
    if (agentId === 'settlement' && fail) throw new Error('settlement offline');
    cb.onToken(agentId === 'narrator' ? story : settlement);
  });
  autoRead(session);
  try {
    const before = session.snapshot();
    await assert.rejects(session.send('练习'), /settlement offline/);
    assert.throws(() => session.exportSession());
    assert.deepEqual(session.snapshot(), before);
    fail = false;
    await session.retry();
    assert.deepEqual(calls, ['narrator', 'settlement', 'narrator', 'settlement']);
    assert.equal(session.snapshot().state.performance.proficiency, before.state.performance.proficiency + 2);
    assert.equal(session.snapshot().state.memory.summary.turn, before.state.memory.summary.turn + 1);
  } finally { await session.dispose(); }
});

test('cancelling settlement restores the round baseline and aborts the model request', { timeout: 20000 }, async () => {
  const started = barrier(), release = barrier();
  let signal;
  const session = await createSession(async (req, cb) => {
    if (req.agentId === 'narrator') { cb.onToken(story); return; }
    signal = req.signal; started.resolve(); await release.promise;
  });
  autoRead(session);
  try {
    const before = session.snapshot();
    const work = session.send('练习');
    const rejected = assert.rejects(work, /cancelled/);
    await started.promise;
    await session.cancel();
    await rejected;
    assert.equal(signal.aborted, true);
    assert.deepEqual(session.snapshot(), before);
  } finally { release.resolve(); await session.dispose(); }
});

test('role validation rejects narrator settlement and settlement presentation patches', { timeout: 20000 }, async () => {
  for (const wrongAgent of ['narrator', 'settlement']) {
    const session = await createSession(async ({ agentId }, cb) => {
      let text = agentId === 'narrator' ? story : settlement;
      if (agentId === wrongAgent) text += agentId === 'narrator'
        ? '<state_patch>{"performance.proficiency":99}</state_patch>'
        : '<state_patch>{"visual.scene":"school_afternoon"}</state_patch>';
      cb.onToken(text);
    });
    autoRead(session);
    try {
      const before = session.snapshot();
      await assert.rejects(session.send('练习'), /validation|校验/);
      assert.deepEqual(session.snapshot(), before);
      assert.throws(() => session.exportSession());
    } finally { await session.dispose(); }
  }
});
