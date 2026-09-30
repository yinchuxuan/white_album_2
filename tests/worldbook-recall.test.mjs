import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession, freePlanState, patch, read } from './runtime-helper.mjs';

test('worldbook recall matches registered keys, deduplicates and ignores unknown queries', async () => {
  const cases = [
    [['北原春希', '早坂亲志', '峰城大附属中学', '三年E班教室'], ['北原春希', '早坂亲志', '峰城大附属中学']],
    [['春希', '和紗', '雪菜', '找依绪聊天', 'MIZUSAWA', '第三音乐室'],
      ['北原春希', '冬马和纱', '小木曾雪菜', '水泽依绪', '第三音乐教室']],
    [['三年E班教室', '../secret'], []],
    [[], []]
  ];
  const catalog = JSON.parse(read('agents/director/catalog.json'));
  let queries, narrator;
  const session = await createSession(async (req, cb) => {
    if (req.agentId === 'director') cb.onToken(patch({ ...freePlanState, PlotWorldbookIndex: queries }));
    else if (req.agentId === 'narrator') {
      narrator = req;
      cb.onToken('春希继续整理招募启事。');
    } else {
      const time = req.messages.map(m => m.content).join('\n').match(/timeline.currentTime: ([^\n]+)/)[1];
      cb.onToken('<summary><item priority="current_event" known_by="北原春希">继续寻找队友。</item></summary>\n'
        + patch({ 'timeline.currentTime': time }));
    }
  });
  session.subscribe((_view, detail) => { if (detail.type === 'display') session.advance(); });
  try {
    for (const [input, expected] of cases) {
      queries = input;
      await session.send('整理招募启事');
      assert.deepEqual(session.snapshot().state.PlotWorldbookIndex, input, 'preserve requested queries');
      const messages = narrator.messages.filter(m => m._meta?.source === 'wa2_worldbook');
      assert.equal(messages.length, 1);
      const body = messages[0].content.split('# 本轮召回的世界书条目\n')[1];
      for (const [id, file] of Object.entries(catalog.worldbook)) {
        assert.equal(body.split(`## ${id}\n`).length - 1, expected.includes(id) ? 1 : 0, id);
        if (expected.includes(id)) assert.ok(body.includes(read(`worldbook/${file}`).trim()));
      }
    }
  } finally { await session.dispose(); }
});
