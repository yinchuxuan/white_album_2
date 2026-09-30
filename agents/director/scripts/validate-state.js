/* global include, validatePlotPlan */
include("agents/shared/scripts/plan-state.js");

async function run(ctx) {
  const { state } = ctx;
  if (state.PlotNode === 'free') {
    validatePlotPlan(state);
  } else {
    if (!state.temp.hiddenCandidates.includes(state.PlotNode)
      || state.story.triggeredHiddenNodes.includes(state.PlotNode)) {
      throw new Error('director: PlotNode must be free or one of this turn hidden candidates');
    }
    if (state.PlotPlan !== '' || state.PlotWorldbookIndex.length !== 0) {
      throw new Error('director: hidden node must only set PlotNode');
    }
    state.story.triggeredHiddenNodes.push(state.PlotNode);
  }
  return { state };
}
