import assert from 'node:assert/strict';
import test from 'node:test';
import { applyGameCard, loadDefinition, read } from './runtime-helper.mjs';

const definition = await loadDefinition();
const files = definition.card.files;
const rules = definition.agents.director.definition.rules.filter(rule => rule.id === 'wa2-director-timeline-guide');
function render(temp) {
  const result = applyGameCard({
    card: { id: 'guide', version: '1', name: 'Guide', files, rules }, phase: 'pre_send',
    messages: [{ id: 'input', role: 'user', content: '继续' }],
    state: { temp, timeline: { currentTime: '2007.10.24: 12:00', currentSlotEnd: '2007.10.25: 17:00' },
      story: { triggeredHiddenNodes: [] }, touma: { affection: 30 }, setsuna: { affection: 20 }, performance: { proficiency: 10 } },
    dependencies: { readFile: read }
  });
  assert.deepEqual(result.trace.errors, []);
  return result.messages.find(message => message._meta?.source === 'wa2_director_context').content;
}
const base = { plotKind: 'free', includeFreeGuide: true, plotFile: 'plot.chapter.2', PlotType: 'FreePlot1',
  plotMoodSection: 'PlotMood_happy', plotEventCategory: 'music', plotEventSection: 'PlotEvent_music',
  toumaAttitudeSection: 'ToumaAttitudeHigh', setsunaAttitudeSection: 'SetsunaAttitudeHigh', hiddenSchemas: [] };
const section = (file, title) => read(files[file]).split(`## ${title}\n`)[1].split(/\n##? /)[0].trim();

test('director DSL preserves weak-guide boundary and mood/event/attitude/constraint branches', () => {
  for (const roll of [50, 51]) {
    const text = render({ ...base, characterGuideRoll: roll });
    for (const weak of ['FreePlot1SetsunaWeakGuide', 'ToumaWeakGuide']) {
      assert.equal(text.includes(section(base.plotFile, weak)), roll > 50);
    }
    if (roll > 50) assert.match(text, /本轮最多选择其中一种/);
    for (const title of ['剧情大纲', 'FreePlot1', 'PlotMood_happy', 'PlotEventRules', 'PlotEvent_music',
      'ToumaAttitudeHigh', 'SetsunaAttitudeHigh']) {
      assert.ok(text.includes(section(base.plotFile, title)), title);
    }
    assert.ok(text.includes(section('plot.restrictions', '第二章通用限制')));
  }
  const text = render({ ...base, plotFile: 'plot.chapter.1', plotEventCategory: 'friends',
    plotEventSection: 'PlotEvent_friends', toumaAttitudeSection: 'ToumaAttitudeLow', setsunaAttitudeSection: 'SetsunaAttitudeLow' });
  for (const title of ['PlotEventRules', 'PlotEvent_friends', 'ToumaAttitudeLow', 'SetsunaAttitudeLow']) {
    assert.ok(text.includes(section('plot.chapter.1', title)), title);
  }
  const normal = render({ ...base, plotMoodSection: 'PlotMood_normal', plotEventCategory: '', plotEventSection: '' });
  assert.ok(!normal.includes(section(base.plotFile, 'PlotEventRules')));
  assert.ok(!normal.includes(section(base.plotFile, 'PlotEvent_music')));
});
