/* eslint-disable no-unused-vars */
/* global loadTimelineConfig, selectTimelineSlot, parseTimelineTime */
/* exported resolveChapter2EventCategory, resolveChapter2Timeline */

function resolveChapter2EventCategory(roll) {
  if (roll <= 40) return 'touma_setsuna';
  if (roll <= 65) return 'music';
  if (roll <= 85) return 'friends';
  return 'personal';
}

async function resolveChapter2Timeline(state, ctx) {
  if (state.story?.chapter2SuccessReached) {
    return {
      chapter: 'chapter_2',
      plotFile: 'plot.chapter.2.successAfterstory',
      slotId: 'Chapter2SuccessAfterstory',
      plotType: 'Chapter2SuccessAfterstory',
      plotKind: 'free',
      end: '2099.12.31: 23:59 星期四'
    };
  }
  if (state.story?.chapter2GameEnd1Reached) {
    return {
      chapter: 'chapter_2',
      plotFile: 'plot.chapter.2.gameEnd1Afterstory',
      slotId: 'GameEnd1Afterstory',
      plotType: 'GameEnd1Afterstory',
      plotKind: 'free',
      end: '2099.12.31: 23:59 星期四'
    };
  }
  const config = await loadTimelineConfig(ctx, { ...ctx.args, config: 'chapter-2.json' });
  const selection = selectTimelineSlot(config, state.timeline.currentTime);
  const slot = selection.slot;
  const awaitingTalk = slot.id === 'FixedPlot6'
    && !state.story.triggeredHiddenNodes.includes('plot.chapter.2#HiddenPlot5');
  const ending = slot.id === 'GameEnd1';
  const success = ending && state.turn.previousPlotNode === 'plot.chapter.2#FixedPlot6'
    && state.setsuna.affection >= 20 && state.touma.affection >= 30;
  return {
    chapter: 'chapter_2',
    plotFile: 'plot.chapter.2',
    slotId: slot.id,
    plotType: ending ? (success ? 'FixedPlot7' : 'GameEnd1') : awaitingTalk ? 'FreePlot1' : slot.id,
    plotKind: awaitingTalk ? 'free' : slot.data.plotKind,
    end: ending && !success ? '2012.10.28: 22:00 星期日'
      : awaitingTalk && parseTimelineTime(state.timeline.currentTime) < parseTimelineTime(slot.range.lte)
      ? slot.range.lte : slot.end,
    diagnostics: selection.diagnostics
  };
}
