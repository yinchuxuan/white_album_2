import { createRequire } from 'node:module';
import { readFileSync, statSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const platform = process.env.WCS_ROOT || path.resolve(root, '../WorldCardStation');
const require = createRequire(path.join(platform, 'package.json'));
const { buildSync } = require('esbuild');
const temporary = mkdtempSync(path.join(tmpdir(), 'wa2-runtime-'));
let runtime;
try {
  const output = path.join(temporary, 'runtime.cjs');
  const contents = [
    ['applyGameCard', 'src/shared/game-card/engine/engine.js'],
    ['matchesState', 'src/shared/game-card/engine/predicate.js'],
    ['loadRuntimeDefinition', 'src/shared/game-card/runtime/loadDefinition.js'],
    ['loadMainProgram', 'src/renderer/gameCard/mainProgram.js'],
    ['createMainSession', 'src/renderer/gameCard/mainSession.js']
  ].map(([name, file]) => `export { ${name} } from ${JSON.stringify(path.join(platform, file))};`).join('\n');
  const result = buildSync({ stdin: { contents, resolveDir: platform }, bundle: true,
    write: false, format: 'cjs', platform: 'node', logLevel: 'silent' });
  writeFileSync(output, result.outputFiles[0].text);
  runtime = require(output);
} finally { rmSync(temporary, { recursive: true, force: true }); }
const workerSource = buildSync({ entryPoints: [path.join(platform, 'src/renderer/platform/mainRuntime.worker.js')],
  bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022', logLevel: 'silent'
}).outputFiles[0].text;
function workerFactory() {
  const worker = new Worker(`
    const { parentPort } = require('node:worker_threads');
    const vm = require('node:vm');
    const realm = vm.createContext({
      postMessage: data => parentPort.postMessage(data),
      addEventListener: (_, callback) => parentPort.on('message', data => callback({data}))
    });
    vm.runInContext(\`
      globalThis.AbortSignal = class {
        aborted = false; listeners = new Set();
        addEventListener(_, fn) { this.listeners.add(fn); }
        removeEventListener(_, fn) { this.listeners.delete(fn); }
      };
      globalThis.AbortController = class {
        signal = new AbortSignal();
        abort() { this.signal.aborted = true; this.signal.listeners.forEach(fn => fn()); }
      };
    \`, realm);
    vm.runInContext(${JSON.stringify(workerSource)}, realm);
  `, { eval: true });
  const adapter = { postMessage: data => worker.postMessage(data), terminate: () => worker.terminate() };
  worker.on('message', data => adapter.onmessage?.({ data }));
  worker.on('error', error => adapter.onerror?.(error));
  return adapter;
}
export const read = file => readFileSync(path.join(root, file), 'utf8');
export const applyGameCard = runtime.applyGameCard;
export const matchesState = runtime.matchesState;
export const freePlanState = { PlotNode: 'free', PlotPlan: '承接玩家行动继续练习，不触发预设事件。', PlotWorldbookIndex: ['北原春希', '第三音乐教室'] };
export const patch = value => `<state_patch>${JSON.stringify(value)}</state_patch>`;
export const freePlan = patch(freePlanState);
export async function refreshDispatch(session) {
  const expand = file => read(file).replace(/include\("([^"]+)"\);/g, (_, dependency) =>
    expand(dependency.startsWith('.') ? path.posix.join(path.posix.dirname(file), dependency) : dependency));
  const run = vm.runInNewContext(`${expand('agents/shared/scripts/prepare-dispatch.js')}; run;`);
  const state = structuredClone(session.snapshot().state);
  await run({ state, args: { timeline: 'timeline' }, files: {
    readText: async (_scope, file) => read(`agents/narrator/plot/${file}`)
  } });
  session.setState(() => state);
}
export function barrier() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { resolve, promise };
}
export function loadDefinition() {
  return runtime.loadRuntimeDefinition({ readText: async file => read(file),
    stat: async file => statSync(path.join(root, file)).isDirectory() ? 'directory' : 'file' });
}
export async function createSession(generate) {
  const readText = async file => read(file);
  const definition = await loadDefinition();
  const program = await runtime.loadMainProgram(definition, readText);
  const session = runtime.createMainSession({ definition, program, readText, generate, workerFactory });
  await session.beginLoad();
  session.restoreHistory({});
  const unsubscribe = session.subscribe((_view, detail) => {
    if (detail.type === 'display') session.advance();
  });
  await session.start();
  unsubscribe();
  return session;
}
