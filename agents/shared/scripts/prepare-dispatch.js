/* global include, clampTimelineTime, parseTimelineTime, resolveChapter1Timeline, resolveChapter2Timeline */
include("lib/timeline/core.js");
include("agents/narrator/scripts/chapters/chapter-1.js");
include("agents/narrator/scripts/chapters/chapter-2.js");

async function run(ctx) {
  // Probe on a copy: preparing the next turn must not lock branches or reach endings.
  const probe = JSON.parse(JSON.stringify(ctx.state));
  probe.turn = { ...probe.turn, previousPlotNode: probe.PlotNode };
  probe.timeline.currentTime = clampTimelineTime(probe.timeline.currentTime, probe.timeline.currentSlotEnd).currentTime;
  const chapter2 = probe.story.chapter2GameEnd1Reached || probe.story.chapter2SuccessReached
    || parseTimelineTime(probe.timeline.currentTime) > parseTimelineTime('2007.10.23: 17:00');
  const result = await (chapter2 ? resolveChapter2Timeline : resolveChapter1Timeline)(probe, ctx);
  ctx.state.temp = { ...ctx.state.temp, nextPlotNode: result.plotKind === 'fixed'
    ? `${result.plotFile}#${result.plotType}` : 'free' };
  return { state: ctx.state };
}
