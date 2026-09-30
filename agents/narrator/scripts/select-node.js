/* global include, planCatalog, loadHiddenNodes, resolvePlot */
include("agents/shared/scripts/plan-state.js");
include("agents/shared/scripts/hidden-nodes.js");
include("./resolve-plot.js");

async function run(ctx) {
  const { state } = ctx;
  const catalog = await planCatalog(ctx);
  const hidden = (await loadHiddenNodes(ctx)).find(node => node.plotNode === state.PlotNode);
  if (hidden) {
    const [plotFile, PlotType] = hidden.plotNode.split('#');
    if (!Object.hasOwn(catalog.presets, hidden.plotNode)) throw new Error(`Missing preset worldbook mapping: ${hidden.plotNode}`);
    Object.assign(state.temp, { plotFile, PlotType, plotKind: 'hidden' });
    return { state };
  }
  if (!Object.hasOwn(catalog.presets, state.PlotNode)) {
    throw new Error(`Unknown or mismatched preset PlotNode: ${state.PlotNode}`);
  }
  const result = await resolvePlot(ctx);
  if (state.PlotNode !== `${state.temp.plotFile}#${state.temp.PlotType}`) {
    throw new Error(`Unknown or mismatched preset PlotNode: ${state.PlotNode}`);
  }
  if (state.temp.plotFile === 'plot.chapter.2') {
    if (state.temp.PlotType === 'FixedPlot7') state.story.chapter2SuccessReached = true;
    if (state.temp.PlotType === 'GameEnd1') state.story.chapter2GameEnd1Reached = true;
  }
  return result;
}
