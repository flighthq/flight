import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The host-web seam cleanup moved every browser-typed image, bitmap and atlas convenience out of the
// portable packages. Its success condition is an ABSENCE, which is exactly the kind of property that
// decays silently: re-adding one HTMLCanvasElement parameter to @flighthq/image breaks no test and fails
// no gate, it just quietly puts the web back inside the portable half. These pin the absence.

const packagesDirectory = resolve(import.meta.dirname, '../packages');

// Packages that must name no browser type. Each was a source of one before the cleanup.
const PORTABLE_PACKAGES = ['bitmap', 'image', 'image-codec', 'textureatlas'];

// Browser types, not browser globals: `document` and `window` access is the p5 host-bypass gate's
// subject and is checked there against the whole repository.
const BROWSER_TYPES = [
  'CanvasImageSource',
  'CanvasRenderingContext2D',
  'HTMLCanvasElement',
  'HTMLImageElement',
  'HTMLVideoElement',
  'ImageBitmap',
  'ImageData',
  'OffscreenCanvas',
];

// The functions and registries the approved tranche moved into host-web. None may reappear on a portable
// package's lanes, under any spelling — a re-export is the compatibility shim the tranche forbade.
const MOVED_TO_HOST_WEB = [
  'clearWebImageBitmapComposers',
  'createWebBitmapFromCanvas',
  'createWebGlContext',
  'createWebImageResourceFromCanvas',
  'createWebImageResourceFromImageBitmap',
  'createWebImageResourceFromImageElement',
  'createWebTextureAtlasFromCanvas',
  'createWebTextureAtlasFromImageBitmap',
  'createWebTextureAtlasFromImageElement',
  'disableWebImageBitmapComposition',
  'drawWebBitmap',
  'enableWebImageBitmapComposition',
  'getWebImageBitmapComposer',
  'getWebImageBitmapComposerKinds',
  'hasWebImageBitmapComposer',
  'initializeWebBitmapFromCanvas',
  'initializeWebImageResourceFromCanvas',
  'initializeWebImageResourceFromImageBitmap',
  'initializeWebImageResourceFromImageElement',
  'registerWebImageBitmapComposer',
  'registerWebImageDecoders',
  'registerWebImageEncoders',
  'unregisterWebImageBitmapComposer',
];

// The names these replaced. A host-owned function that reads as portable is the mistake the web prefix
// corrects, so the old spellings must not come back anywhere — not as an alias, not as a re-export, not
// in a caller that a search-and-replace missed. agents/ is excluded: it is documentation of record and
// read-only to builders, and its prose legitimately recalls what the functions used to be called.
const RETIRED_NAMES = [
  'clearImageBitmapComposers',
  'createBitmapFromCanvas',
  'createImageResourceFromCanvas',
  'createImageResourceFromImageBitmap',
  'createImageResourceFromImageElement',
  'createTextureAtlasFromCanvas',
  'createTextureAtlasFromImageBitmap',
  'createTextureAtlasFromImageElement',
  'disableImageBitmapComposition',
  'drawBitmap',
  'enableImageBitmapComposition',
  'getImageBitmapComposer',
  'getImageBitmapComposerKinds',
  'hasImageBitmapComposer',
  'initializeBitmapFromCanvas',
  'initializeImageResourceFromCanvas',
  'initializeImageResourceFromImageBitmap',
  'initializeImageResourceFromImageElement',
  'registerImageBitmapComposer',
  'unregisterImageBitmapComposer',
];

const MOVED_GL_CONTEXT_NAMES = ['createGlContext', 'createGlContextFromCanvasElement'];

describe('host-web seam closure', () => {
  // Reported as one list rather than one failure per package, so a regression names every site at once
  // instead of hiding the rest behind the first one.
  it('leaves no browser type in the portable packages the tranche cleaned', () => {
    const found: string[] = [];
    for (const packageName of PORTABLE_PACKAGES) {
      for (const [file, source] of readPackageSource(packageName)) {
        const code = stripCommentsAndStrings(source);
        for (const type of BROWSER_TYPES) {
          // Flight's own ImageBitmapComposition/ImageBitmapComposer names describe composing a Flight
          // Bitmap and are deliberately kept; the browser class is the banned one.
          const pattern = type === 'ImageBitmap' ? /\bImageBitmap\b(?!Compos)/gu : new RegExp(`\\b${type}\\b`, 'gu');
          if (pattern.test(code)) found.push(`${packageName}/${file}: ${type}`);
        }
      }
    }

    expect(found).toStrictEqual([]);
  });

  it('re-exports none of the moved functions from a portable package lane', () => {
    const found: string[] = [];
    for (const packageName of PORTABLE_PACKAGES) {
      for (const lane of ['index.ts', 'contract.ts']) {
        const chunks = readLaneWithWildcards(packageName, lane);
        for (const moved of MOVED_TO_HOST_WEB) {
          const pattern = new RegExp(`\\b${moved}\\b`, 'u');
          if (chunks.some((chunk) => pattern.test(chunk))) found.push(`${packageName}/${lane}: ${moved}`);
        }
      }
    }

    expect(found).toStrictEqual([]);
  });

  // getImageBitmapComposer is a prefix of getWebImageBitmapComposer only in the other direction, so a
  // bare substring search would be satisfied by the new name; the word-boundary match is what keeps this
  // from passing vacuously the moment the rename lands.
  it('leaves no retired unprefixed name anywhere in the repository', () => {
    const found = searchRepository(RETIRED_NAMES);

    expect(found).toStrictEqual([]);
  }, 30_000);

  // A moved function that reached no lane at all would satisfy both checks above while being unreachable,
  // so the census is asserted from the other side too.
  it('exports every moved function from a host-web lane', () => {
    const chunks = ['index.ts', 'contract.ts'].flatMap((lane) => readLaneWithWildcards('host-web', lane));
    const missing = MOVED_TO_HOST_WEB.filter((moved) => {
      const pattern = new RegExp(`\\b${moved}\\b`, 'u');
      return !chunks.some((chunk) => pattern.test(chunk));
    });

    expect(missing).toStrictEqual([]);
  });
});

describe('GL context migration closure', () => {
  it('does not export the old GL context factory names from render-gl public lane', () => {
    const chunks = readLaneWithWildcards('render-gl', 'index.ts');
    const found = MOVED_GL_CONTEXT_NAMES.filter((name) => {
      const pattern = new RegExp(`\\b${name}\\b`, 'u');
      return chunks.some((chunk) => pattern.test(chunk));
    });

    expect(found).toStrictEqual([]);
  });

  it('exports createWebGlContext from a host-web lane', () => {
    const chunks = ['index.ts', 'contract.ts'].flatMap((lane) => readLaneWithWildcards('host-web', lane));
    const pattern = /\bcreateWebGlContext\b/u;

    expect(chunks.some((chunk) => pattern.test(chunk))).toBe(true);
  });
});

// The dimension resolver is one module-scoped slot shared by every test file in a Vitest process, so a
// file that registers and never clears can satisfy a LATER file's missing registration. That is how
// canvasTextureView passed in the broad suite while failing on its own: it never declared the dependency
// and inherited one. Neither the broad suite nor a package-scoped run can catch that, because both are
// the very process that shares the slot — so the declaration is what gets pinned here, per file.
//
// The behavioral proof is a real fresh process, but it must not run inside this suite: nesting Vitest in
// Vitest collided twice, once over the completeness reporter's output file and once over Vite's temp
// config, each time failing the outer run with no failing test to explain it. Run it directly instead:
//   npx vitest run --config vitest.config.ts packages/scene2d-canvas/src/canvasTextureView.test.ts
describe('portable dimension-resolver declaration', () => {
  // Every package whose tests wrap a host handle. A test that measures must say so in its own file.
  const MEASURING_PACKAGES = [
    'bitmap',
    'image',
    'scene2d-canvas',
    'scene2d-dom',
    'scene2d-gl',
    'scene2d-wgpu',
    'scene3d-gl',
    'scene3d-wgpu',
    'textureatlas',
  ];

  it('registers and clears the resolver in every test file that measures a wrapped handle', () => {
    const undeclared: string[] = [];
    const unbalanced: string[] = [];
    for (const packageName of MEASURING_PACKAGES) {
      for (const [file, source] of readPackageTests(packageName)) {
        const code = stripCommentsAndStrings(source);
        const registers = /\bregisterTestImageDimensionResolver\b/u.test(code);
        const clears = /\bunregisterTestImageDimensionResolver\b/u.test(code);
        // Whether a given file's assertions happen to depend on the measured size is not something the
        // file's text can answer — the dependency can sit inside the production code it calls, which is
        // exactly where canvasTextureView's did. So the rule is the blunt one: wrap a handle in a test,
        // supply the host.
        if (!registers && /\bcreateImageResource\s*\(/u.test(code)) undeclared.push(`${packageName}/${file}`);
        // Registering without clearing is what let one file cover for another.
        if (registers && !clears) unbalanced.push(`${packageName}/${file}`);
      }
    }

    expect({ unbalanced, undeclared }).toStrictEqual({ unbalanced: [], undeclared: [] });
  });
});

// Comments and string literals are prose: a sentence explaining that browser canvas decodes are
// straight-alpha is not a dependency on HTMLCanvasElement, and flagging it would push real explanation
// out of the source to satisfy a grep.
function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/gu, '$1 ')
    .replace(/'(?:[^'\\\n]|\\.)*'/gu, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/gu, '""')
    .replace(/`(?:[^`\\]|\\.)*`/gu, '``');
}

// A lane re-exports most of its package through `export * from './module'`, so reading the lane file
// alone would let a moved function hide one hop away — in either direction: an unnoticed compatibility
// re-export, or a symbol nothing can reach. Expanding the wildcards is what makes both claims true
// claims about the lane rather than about one file's text.
function readLaneWithWildcards(packageName: string, lane: string): string[] {
  const directory = resolve(packagesDirectory, packageName, 'src');
  const source = readFileSync(resolve(directory, lane), 'utf-8');
  const wildcards = [...source.matchAll(/export \* from '\.\/([^']+)';/gu)].map((match) => match[1]);
  const expanded = wildcards.map((module) => {
    const path = resolve(directory, `${module}.ts`);
    return existsSync(path) ? readFileSync(path, 'utf-8') : '';
  });
  // Each file is stripped and searched on its own. Concatenating first would let one file's leftover
  // quote pair with another's and silently swallow the text between them — which is how an earlier cut
  // of this ratchet reported three present exports as missing.
  //
  // Prose is excluded for the same reason as above: a comment in the moved function's former home
  // explaining where it went is not a re-export, and a mention is not a binding.
  return [source, ...expanded].map(stripCommentsAndStrings);
}

function readPackageSource(packageName: string): [string, string][] {
  const directory = resolve(packagesDirectory, packageName, 'src');
  return readdirSync(directory)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .map((file) => [file, readFileSync(resolve(directory, file), 'utf-8')]);
}

function readPackageTests(packageName: string): [string, string][] {
  const directory = resolve(packagesDirectory, packageName, 'src');
  return readdirSync(directory)
    .filter((file) => file.endsWith('.test.ts'))
    .map((file) => [file, readFileSync(resolve(directory, file), 'utf-8')]);
}

// Searches tracked files for any of these whole-word identifiers in ONE git pass. Seventeen separate
// greps was the obvious shape and the wrong one: it timed out under a loaded full-suite run, and a
// ratchet that fails on machine load teaches people to ignore it. agents/ is skipped because it is
// documentation of record, read-only to builders, whose prose legitimately recalls the old names; this
// file is skipped because it must name every retired spelling in order to forbid it.
function searchRepository(names: readonly string[]): string[] {
  const result = spawnSync('git', ['grep', '-lwE', names.join('|')], {
    cwd: resolve(import.meta.dirname, '..'),
    encoding: 'utf-8',
  });
  // git grep exits 1 with no output when nothing matches, which is this check's success, not an error.
  if (result.status !== 0 && result.stdout === '') return [];
  return result.stdout
    .split('\n')
    .filter((line) => line !== '')
    .filter((line) => !line.startsWith('agents/') && !line.endsWith('scripts/host-web-seam.test.ts'));
}
