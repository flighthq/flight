import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The render-target/pass redesign is defined mostly by what it removed: the ambient WGPU surface
// provider, the per-backend background painters, the driver on the Canvas render state, the
// FromCanvasElement convenience suffix. Those are absences, and an absence has no test of its own unless
// someone writes one — so a reintroduction would land green. These are the WGPU, Canvas and DOM lanes'
// side of that; the GL lane is Builder's and is deliberately not asserted here.

const repositoryRoot = resolve(import.meta.dirname, '..');

// A detector has to name what it forbids. These two do exactly that — the p5 host-bypass gate still
// recognizes createWgpuCanvasElement so a reintroduction in render-wgpu is caught rather than ignored —
// and this file is the third. Nothing else may mention a retired name.
const EXEMPT_FILES = [
  'scripts/p5-host-bypass.test.ts',
  'scripts/p5-host-bypass.ts',
  'scripts/render-lane-architecture.test.ts',
];

// Retired across the WGPU, Canvas and DOM lanes. Each was deleted with no compatibility export, so any
// survivor outside the agents/ record is a regression rather than a leftover.
const RETIRED_RENDER_NAMES = [
  'WgpuRenderSurfaceProvider',
  'canvasRenderStateHandles',
  'createCanvasRenderTarget',
  'createWgpuAcquisitionFromCanvasElement',
  'createWgpuCanvasElement',
  'createWgpuRenderStateFromCanvasElement',
  'createWgpuRenderTarget',
  'enableHostWebWgpuRenderSurface',
  'getCanvasRenderStateHandles',
  'renderCanvasBackground',
  'renderDomBackground',
  'renderWgpuBackground',
  'setWgpuRenderSurfaceProvider',
];

describe('render lane architecture', () => {
  it('keeps every retired WGPU, Canvas and DOM name out of the repository', () => {
    expect(searchRepository(RETIRED_RENDER_NAMES)).toStrictEqual([]);
  }, 30_000);

  // A state that carries its own drawing surface is the coupling the redesign removed: one state draws to
  // several canvases, and which one is the pass's business. The entity may name neither the surface it
  // came from nor the attributes that configured it.
  it('leaves the Canvas render state without a driver', () => {
    const source = readFileSync(resolve(repositoryRoot, 'packages/types/src/CanvasRenderState.ts'), 'utf-8');
    const fields = source.slice(source.indexOf('export interface CanvasRenderState'));
    const body = fields.slice(0, fields.indexOf('\n}'));

    expect(body).not.toMatch(/^\s*(?:readonly\s+)?surface\s*:/mu);
    expect(body).not.toMatch(/^\s*(?:readonly\s+)?contextAttributes\s*:/mu);
  });

  // Installing a target's context and resetting compositing is the pass's job and only the pass's: a
  // second writer would leave two places deciding what a fresh draw inherits.
  //
  // This matches an assignment through an identifier named `state`, which is the convention every render
  // package follows; a writer that binds through a differently-named local would slip past. That is the
  // honest reach of a textual check — it holds the convention, and the pass module's own tests hold the
  // behavior.
  it('binds the Canvas state handles only from the pass module', () => {
    const writers = searchRepositoryForPattern('state\\.(canvas|context) = ').filter(
      (file) => file.startsWith('packages/') && !file.endsWith('.test.ts'),
    );

    expect(writers).toStrictEqual(['packages/scene2d-canvas/src/canvasRenderPass.ts']);
  }, 30_000);

  it('keeps the DOM lane pass-free', () => {
    expect(searchRepository(['DomRenderPass', 'beginDomRenderPass', 'endDomRenderPass'])).toStrictEqual([]);
  }, 30_000);
});

// ONE git pass for the whole file, memoized: these checks run beside a repository-wide host-electron
// ratchet that reads every tracked file and carries the default 5s timeout, and three separate git
// spawns here were enough contention to push that neighbour over it. Cheap gates keep each other honest.
//
// agents/ is documentation of record, read-only to builders, and its prose legitimately recalls retired
// names; the files in EXEMPT_FILES are detectors that must name what they forbid.
// -w is what makes this a whole-word match: git grep -E is POSIX ERE, where \b is not a word boundary,
// so a pattern written that way matches nothing and the check passes no matter what is in the tree. It
// did exactly that once here, and only the red-check caught it.
function searchRepository(names: readonly string[]): string[] {
  const pattern = new RegExp(`\\b(?:${names.join('|')})\\b`, 'u');
  return matchingLines()
    .filter(([, text]) => pattern.test(text))
    .map(([file]) => file)
    .filter((file, index, all) => all.indexOf(file) === index);
}

function searchRepositoryForPattern(pattern: string): string[] {
  const expression = new RegExp(pattern, 'u');
  return matchingLines()
    .filter(([, text]) => expression.test(text))
    .map(([file]) => file)
    .filter((file, index, all) => all.indexOf(file) === index);
}

// Every line in the repository that mentions anything these checks care about, fetched once. The union
// keeps the single pass wide enough for each assertion to filter it down with a JavaScript regex, where
// \b means what it says — git grep -E is POSIX ERE, in which \b is not a word boundary at all, so a
// pattern written that way silently matches nothing and the check passes on an empty result.
function matchingLines(): [string, string][] {
  _lines ??= runGitGrep([
    '-nE',
    [
      ...RETIRED_RENDER_NAMES,
      'DomRenderPass',
      'beginDomRenderPass',
      'endDomRenderPass',
      'state\\.(canvas|context) = ',
    ].join('|'),
  ])
    .map((line) => {
      const separator = line.indexOf(':');
      const rest = line.slice(separator + 1);
      return [line.slice(0, separator), rest.slice(rest.indexOf(':') + 1)] as [string, string];
    })
    // Exemptions are per FILE, applied to the parsed path rather than the raw grep line, which carries
    // the line number and matched text after it.
    .filter(([file]) => !file.startsWith('agents/') && !EXEMPT_FILES.some((exempt) => file.endsWith(exempt)));
  return _lines;
}

let _lines: [string, string][] | null = null;

function runGitGrep(args: readonly string[]): string[] {
  const result = spawnSync('git', ['grep', ...args], { cwd: repositoryRoot, encoding: 'utf-8' });
  // git grep exits 1 with no output when nothing matches, which is success for an absence check.
  if (result.status !== 0 && result.stdout === '') return [];
  return result.stdout.split('\n').filter((line) => line !== '');
}
