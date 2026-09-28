import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const FORMAT_PACKAGES = ['scene3d-formats', 'scene2d-formats', 'skeleton2d-formats'] as const;

interface FormatCore {
  /** The module that declares the format's selective entry point. */
  core: string;
  /** Symbols this core must not name: the format's all-handler preset, or a whole-family registrar. */
  families: readonly string[];
  format: string;
  package: (typeof FORMAT_PACKAGES)[number];
}

// Every decomposed format, its SELECTIVE core module, and the preset or family registrars that module must not
// name. One row per format; `covers every preset` below proves the table is total against the source.
//
// ★ THIS IS THE ONE INVARIANT NO PER-FORMAT GATE WAS CHECKING. Each format's own gate proves the bundle half —
// that declining a family removes its code — and every one of them passes. But a selective core that NAMES its
// preset still tree-shakes clean today, so the bundle half cannot see this: the glTF and MD5 audits both found
// the coupling live in source while measuring zero bytes, because esbuild removed the unreachable reference.
// The claim is about what the module graph permits, not about what one bundler currently emits, so it has to be
// read off the source.
const FORMAT_CORES: readonly FormatCore[] = [
  { core: 'awd2Parse.ts', families: ['awd2AllBlockHandlers'], format: 'AWD2', package: 'scene3d-formats' },
  { core: 'colladaParse.ts', families: ['colladaAllElementDecoders'], format: 'Collada', package: 'scene3d-formats' },
  { core: 'gltfParse.ts', families: ['registerAllGltfHandlers'], format: 'glTF', package: 'scene3d-formats' },
  { core: 'md2Parse.ts', families: ['md2AllSectionHandlers'], format: 'MD2', package: 'scene3d-formats' },
  { core: 'md5Parse.ts', families: ['md5AllSectionHandlers'], format: 'MD5', package: 'scene3d-formats' },
  { core: 'objParse.ts', families: ['objAllMaterialHandlers'], format: 'OBJ', package: 'scene3d-formats' },
  { core: 'threeDsParse.ts', families: ['threeDsAllChunkHandlers'], format: '3DS', package: 'scene3d-formats' },
  {
    core: 'lottieDocument.ts',
    families: [
      'registerAllLottieHandlers',
      'lottieAllLayerHandlers',
      'lottieAllMaskHandlers',
      'lottieAllShapeItemHandlers',
    ],
    format: 'Lottie',
    package: 'scene2d-formats',
  },
  { core: 'riveScene2D.ts', families: ['registerAllRiveHandlers'], format: 'Rive', package: 'scene2d-formats' },
  {
    core: 'svgDocument.ts',
    families: ['registerAllSvgHandlers', 'svgAllElementHandlers', 'svgAllClipHandlers'],
    format: 'SVG',
    package: 'scene2d-formats',
  },
  {
    core: 'spineBinaryParse.ts',
    families: ['registerAllSpineBinaryHandlers', 'spineBinaryAllSectionHandlers', 'spineBinaryAllTimelineHandlers'],
    format: 'Spine Binary',
    package: 'skeleton2d-formats',
  },
];

// ★ TWO FORMATS DO NOT HOLD THE INVARIANT YET, AND THIS RECORDS THEM AS THEY ARE RATHER THAN EXCUSING THEM.
// Both declare their zero-config wrapper in the SAME module as their selective entry point, so that module
// resolves the families for the caller — `spineParse.ts` through the preset, `dragonBonesParse.ts` through the
// two family registrars. Measured, both tree-shake clean today: `spine-json-import-selective` is 9,098 raw
// bytes against 43,027 for the full import and carries neither the preset nor any section handler, and
// `dragonbones-import-selective` is 13,060 against 47,266 with no registrar and no timeline handler. So this
// is latent, exactly as glTF and MD5 were, and it costs nothing until someone makes the reference reachable.
//
// The fix already exists in the same package as a template: `spineBinaryFull.ts` is a fifteen-line module
// holding nothing but `parseSpineSkeletonBinary`, leaving `spineBinaryParse.ts` free of the preset. Lifting
// `parseSpineSkeleton` and `parseDragonBonesSkeleton` into siblings of that shape closes both.
//
// These entries are a RATCHET, not an allow-list: each asserts the coupling is still exactly what was
// measured, so this test fails both if a third format regresses AND when either of these is fixed — at which
// point the entry moves up into FORMAT_CORES.
const KNOWN_COUPLED: readonly FormatCore[] = [
  {
    core: 'spineParse.ts',
    families: ['registerAllSpineJsonHandlers'],
    format: 'Spine JSON',
    package: 'skeleton2d-formats',
  },
  {
    core: 'dragonBonesParse.ts',
    families: ['registerDragonBonesSectionHandlers', 'registerDragonBonesTimelineHandlers'],
    format: 'DragonBones',
    package: 'skeleton2d-formats',
  },
];

// The remaining presets each format declares, which its core is ALSO required to stay clear of. They sit apart
// from the rows above only because those rows name the symbol whose coupling the format is judged on — the
// `registerAll*` door, or for the two coupled formats the family registrars they actually reach. Keeping these
// in a flat list is what lets `covers every preset` be total without inventing a second notion of "the" preset
// per format.
const ALSO_FORBIDDEN: readonly FormatCore[] = [
  {
    core: 'spineParse.ts',
    families: ['spineJsonAllSectionHandlers', 'spineJsonAllTimelineHandlers'],
    format: 'Spine JSON',
    package: 'skeleton2d-formats',
  },
  {
    core: 'dragonBonesParse.ts',
    families: ['registerAllDragonBonesHandlers', 'dragonBonesAllSectionHandlers', 'dragonBonesAllTimelineHandlers'],
    format: 'DragonBones',
    package: 'skeleton2d-formats',
  },
];

describe('format core preset isolation', () => {
  it.each([...FORMAT_CORES, ...ALSO_FORBIDDEN].map((entry) => [entry.format, entry] as const))(
    'keeps the %s selective core free of its preset',
    (_format, entry) => {
      const source = codeOf(entry);
      for (const family of entry.families) {
        expect(new RegExp(`\\b${family}\\b`).test(source), `${entry.core} names ${family}`).toBe(false);
      }
    },
  );

  it.each(KNOWN_COUPLED.map((entry) => [entry.format, entry] as const))(
    'still records the known %s coupling, so fixing it retires this entry',
    (_format, entry) => {
      const source = codeOf(entry);
      const named = entry.families.filter((family) => new RegExp(`\\b${family}\\b`).test(source));
      expect(named, `${entry.core} no longer names these — move it into FORMAT_CORES`).toEqual([...entry.families]);
    },
  );

  // ★ THE TABLE MUST BE TOTAL, OR A FORMAT ADDED WITHOUT THE SPLIT IS SIMPLY ABSENT FROM THE AUDIT. A hole in a
  // hand-written roster never reports itself; it returns a smaller number that looks like a pass. So the preset
  // symbols are read back out of the source and every one is required to appear in a row above.
  it('covers every all-handler preset the format packages declare', () => {
    const declared = new Set<string>();
    for (const pkg of FORMAT_PACKAGES) {
      const dir = join(root, 'packages', pkg, 'src');
      for (const file of readdirSync(dir)) {
        if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
        const source = readFileSync(join(dir, file), 'utf8');
        for (const match of source.matchAll(/^export (?:const|function) (\w*(?:All|register(?:All|\w+))\w*)\b/gm)) {
          if (/All[A-Z]\w*(?:Handlers|Decoders|Chunks|Blocks)$/.test(match[1])) declared.add(match[1]);
        }
      }
    }
    const covered = new Set([...FORMAT_CORES, ...KNOWN_COUPLED, ...ALSO_FORBIDDEN].flatMap((entry) => entry.families));
    const uncovered = [...declared].filter((name) => !covered.has(name)).sort();
    expect(uncovered, 'a preset no row claims — add the format, do not widen the regex').toEqual([]);
  });

  // Each named core must exist, so a rename turns into a failure here rather than into a silently vacuous scan.
  it.each([...FORMAT_CORES, ...KNOWN_COUPLED].map((entry) => [entry.format, entry] as const))(
    'resolves the %s core module',
    (_format, entry) => {
      expect(codeOf(entry).length).toBeGreaterThan(200);
    },
  );
});

// A core's CODE, with comment lines stripped. Several of these headers discuss the preset they deliberately do
// not call — `awd2BlockDispatch.ts` says so in as many words — and a scan that read comments would report the
// very coupling those comments exist to rule out.
function codeOf(entry: Readonly<FormatCore>): string {
  return readFileSync(join(root, 'packages', entry.package, 'src', entry.core), 'utf8')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
    })
    .join('\n');
}
