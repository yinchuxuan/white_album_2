/* global include, loadHiddenNodes, matchesHiddenCondition */
include("agents/shared/scripts/hidden-nodes.js");

async function run(ctx) {
  const nodes = await loadHiddenNodes(ctx);
  const triggered = ctx.state.story.triggeredHiddenNodes;
  const candidates = nodes.filter(node => !triggered.includes(node.plotNode) && matchesHiddenCondition(node.condition, ctx.state));
  ctx.state.temp.hiddenCandidates = candidates.map(node => node.plotNode);
  ctx.state.temp.hiddenSchemas = candidates.map(({ plotNode, summary, trigger, exclude }) => ({ plotNode, summary, trigger, exclude }));
  return { state: ctx.state };
}
