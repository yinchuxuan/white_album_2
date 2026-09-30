/* global include, validateHiddenCondition */
include("./hidden-condition.js");

async function loadHiddenNodes(ctx) {
  const nodes = JSON.parse(await ctx.files.readText('plans', 'hidden-nodes.json'));
  if (!Array.isArray(nodes)) throw new Error('Hidden-node registry must be an array');
  const seen = new Set();
  const fields = ['plotNode', 'condition', 'summary', 'trigger', 'exclude'];
  for (const node of nodes) {
    if (!node || typeof node !== 'object' || Array.isArray(node)
      || Object.keys(node).some(key => !fields.includes(key))
      || ['plotNode', 'summary', 'trigger', 'exclude'].some(key => typeof node[key] !== 'string' || !node[key].trim())
      || !/^[^#]+#[^#]+$/.test(node.plotNode)) throw new Error('Invalid hidden-node definition');
    if (seen.has(node.plotNode)) throw new Error(`Duplicate hidden plotNode: ${node.plotNode}`);
    seen.add(node.plotNode);
    validateHiddenCondition(node.condition);
  }
  return nodes;
}
