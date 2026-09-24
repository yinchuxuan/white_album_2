import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const display = JSON.parse(read('display.json'));
const validation = JSON.parse(read('response-validation.json'));
const opening = read('first_msg.md');
const matches = (id, text) => {
  const rule = validation.rules.find(item => item.id === id);
  return [...text.matchAll(new RegExp(rule.pattern, `${rule.flags || ''}g`))].length;
};
const transform = text => display.assistant.reduce((value, rule) =>
  value.replace(new RegExp(rule.pattern, rule.flags), rule.replace), text);

test('opening blocks stay on one line and display yields exactly four buttons, no summary', () => {
  const summary = opening.match(/<summary>[\s\S]*?<\/summary>/)[0];
  const choices = opening.match(/<choices>[\s\S]*?<\/choices>/)[0];
  assert.ok(!summary.includes('\n'));
  assert.ok(!choices.includes('\n'));
  assert.equal(transform(summary), '');
  assert.equal((transform(choices).match(/<button /g) || []).length, 4);
  assert.ok(!transform(choices).includes('\n'));
  assert.equal(matches('error-summary-structure', summary), 1);
  assert.equal(matches('error-choices-structure', choices), 1);
  assert.equal(matches('error-summary-structure', summary.replace('><item', '>\n<item')), 0);
  assert.equal(matches('error-choices-structure', choices.replace('</item><item>', '</item>\n<item>')), 0);
  assert.equal(matches('error-choices-structure', `${choices}\n额外正文`), 0);
});

test('choices use exactly four item bodies; labels are supplied by display, not the model', () => {
  const choices = '<choices><item>回学校</item><item>练习｜休息</item><item>联系依绪</item><item>整理资料</item></choices>';
  const rendered = transform(choices);
  assert.equal(matches('error-choices-structure', choices), 1);
  for (const label of ['A', 'B', 'C', 'D']) assert.ok(rendered.includes('data-gc-chat-input-label="' + label + '"'));
  assert.ok(rendered.includes('练习｜休息'));
  assert.ok(!rendered.includes('<item>'));
  for (const invalid of [
    choices.replace('<item>回学校</item>', ''),
    choices.replace('</choices>', '<item>第五项</item></choices>'),
    choices.replace('回学校', ''),
    choices.replace('回学校', '   '),
    choices.replace('</choices>', '｜</choices>')
  ]) {
    assert.equal(matches('error-choices-structure', invalid), 0);
    assert.equal(transform(invalid), invalid);
  }
});

test('single-line summary still updates structured memory and Agent summary message', () => {
  const run = vm.runInNewContext(`${read('scripts/summary-memory.js')}; run;`);
  const result = run({ messages: [
    { role: 'system', content: '', _meta: { source: 'wa2_summary' } },
    { role: 'assistant', content: opening }
  ], state: {} });
  assert.equal(result.state.memory.summary.turn, 1);
  assert.equal(result.state.memory.summary.anchor.length, 1);
  assert.equal(result.state.memory.summary.currentEvents.length, 1);
  assert.equal(result.state.memory.summary.recent.length, 1);
  assert.match(result.messages[0].content, /主唱和键盘手/);
  assert.equal(result.messages[1].content, opening);
});

test('opening and generated choices finish reading without a choice-click acknowledgement', async () => {
  const entry = vm.runInNewContext(`${read('main.js').replaceAll('export ', '')}; ({onStart,onInput});`);
  const choices = opening.match(/<choices>[\s\S]*?<\/choices>/)[0];
  const events = [];
  const ctx = {
    state: { set: (key, value) => events.push([key, value]) },
    agents: {
      messages: () => [{ content: opening, _meta: { source: 'wa2_first_msg' } }],
      call: () => ({ response: choices, done: async () => events.push('done') })
    },
    createReader: options => options,
    present: async (reader, options) => {
      assert.equal(reader.mode, 'segmented');
      assert.equal(options.waitForAdvance('普通正文'), true);
      assert.equal(options.waitForAdvance(choices), false);
      events.push('present');
    }
  };
  await entry.onStart(ctx);
  assert.deepEqual(events, ['present']);
  events.length = 0;
  await entry.onInput(ctx, '选择 A');
  assert.deepEqual(events, [['turn.input', '选择 A'], 'present', 'done']);
});
