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
  ctx.state.set('turn.input', input);
  const call = ctx.agents.call('narrator');
  await ctx.present(ctx.createReader({ source: call.response, mode: 'segmented' }), { waitForAdvance: waitForReading });
  await call.done();
}
