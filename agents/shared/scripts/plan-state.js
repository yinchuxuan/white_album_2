/* global include */
// Only catalog access and result validation; DSL owns prompt/section assembly.
async function planCatalog(ctx) {
  return JSON.parse(await ctx.files.readText('plans', 'catalog.json'));
}

function validatePlotPlan(state) {
  const validPlan = typeof state.PlotPlan === 'string'
    && (state.PlotNode === 'free' ? Boolean(state.PlotPlan.trim()) : state.PlotPlan === '');
  if (!validPlan) throw new Error('Invalid PlotPlan: require a non-empty free-node plan or empty preset plan');
  if (!Array.isArray(state.PlotWorldbookIndex)
    || state.PlotWorldbookIndex.some(key => typeof key !== 'string')) {
    throw new Error('Invalid PlotWorldbookIndex: require an array of strings');
  }
}
