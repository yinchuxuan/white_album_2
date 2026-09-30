function waitForReading(text) {
  return !/^<choices>[^\r\n]*<\/choices>$/.test(text.trim());
}

export async function onStart(ctx) {
  const opening = ctx.agents.messages('narrator')
    .find(message => message._meta?.source === 'wa2_first_msg');
  if (!opening) throw new Error('缺少 WA2 开场消息');
  await ctx.present(ctx.createReader({ source: opening.content, mode: 'segmented' }), { waitForAdvance: waitForReading });
}

export async function onInput(ctx, input) {
  ctx.state.set('turn.previousPlotNode', ctx.state.get('PlotNode'));
  ctx.state.set('turn.input', input);
  ctx.state.set('PlotNode', ctx.state.get('temp.nextPlotNode'));
  ctx.state.set('PlotPlan', '');
  ctx.state.set('PlotWorldbookIndex', []);
  if (ctx.state.get('PlotNode') === 'free') {
    await ctx.agents.call('director').done();
  }
  const call = ctx.agents.call('narrator');
  const reading = ctx.present(ctx.createReader({ source: call.response, mode: 'segmented' }), { waitForAdvance: waitForReading });
  const settlement = call.done().then(async () => {
    const update = ctx.agents.call('settlement');
    await update.done();
  });
  await Promise.all([reading, settlement]);
}
