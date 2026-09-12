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
  'registerWebImageDecoders',
  'registerWebImageEncoders',
  'unregisterImageBitmapComposer',
];

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
