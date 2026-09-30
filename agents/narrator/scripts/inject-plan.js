/* global include, planCatalog, validatePlotPlan */
include("agents/shared/scripts/plan-state.js");

async function run(ctx) {
  const catalog = await planCatalog(ctx);
  const { plotFile, PlotType } = ctx.state.temp;
  if (ctx.state.PlotNode !== 'free') {
    ctx.state.PlotWorldbookIndex = catalog.presets[`${plotFile}#${PlotType}`];
  }
  validatePlotPlan(ctx.state);
  const config = JSON.parse(await ctx.files.readText('worldbook', 'config.json'));
  const queries = ctx.state.PlotWorldbookIndex.map(value => value.toLowerCase());
  const ids = config.entries.filter(entry => entry.enabled !== false
    && Object.hasOwn(catalog.worldbook, entry.name)
    && entry.keys.some(key => key.trim() && queries.some(query => query.includes(key.toLowerCase()))))
    .map(entry => entry.name);
  const entries = await Promise.all([...new Set(ids)].map(async id =>
    `## ${id}\n${await ctx.files.readText('worldbook', catalog.worldbook[id])}`));
  ctx.state.temp.worldbookContent = entries.join('\n\n');
  return { state: ctx.state };
}
