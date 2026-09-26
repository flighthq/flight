import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  BUILT_IN_REQUIREMENT_BACKENDS,
  BUILT_IN_REQUIREMENT_CATALOG_ENTRIES,
  BUILT_IN_REQUIREMENT_TRANSLATIONS,
} from '@flighthq/requirement-catalog/contract';

import { createManifestPlugin } from './manifestPlugin.ts';

// The two rich 3D formats expose a handler family the way SWF and AWD2 do, so a per-file manifest can
// name the exact parser pieces one document needs. What makes them different from SWF and AWD2 — and the
// reason this file exists apart from builtInCatalogResolution.test.ts — is COLLADA's ordering: its
// decoders run in the order given and materials must be indexed before geometry reads them, so the
// emitted array is not free to be sorted however the requirements happened to canonicalize.

describe('3DS content through the built-in catalog', () => {
  it('resolves each chunk to the one handler that claims it, and imports nothing else', async () => {
    const { diagnostics, source } = await load('a.3ds', threeDsFile({ materials: 1, meshes: ['Box'] }));
    expect(source).toContain("import { threeDsMaterialHandler, threeDsMeshHandler } from '@flighthq/scene3d-formats';");
    expect(source).toContain('export const parserOptions = {\n  handlers: [');
    expect(diagnostics).toEqual([]);
  });

  it('emits the handler list into ThreeDsImportOptions.handlers, the field that format declares', async () => {
    const { source } = await load('a.3ds', threeDsFile({ meshes: ['Box'] }));
    expect(source).toContain('  handlers: [\n    threeDsMeshHandler,\n  ],');
  });

  // ★ THE SUBSET IS EXACT, NOT MERELY CORRECT-LOOKING. A geometry-only file must land the mesh handler
  // and NONE of its four siblings — landing them would parse identically and silently cost the bundle
  // everything behind camera, light, material and keyframe parsing, which is the whole reason a per-file
  // manifest exists.
  it('lands no sibling handler for a file carrying one feature', async () => {
    const { source } = await load('a.3ds', threeDsFile({ meshes: ['Box'] }));
    for (const absent of [
      'threeDsCameraHandler',
      'threeDsKeyframeHandler',
      'threeDsLightHandler',
      'threeDsMaterialHandler',
    ]) {
      expect(source, `${absent} rode in on a geometry-only file`).not.toContain(absent);
    }
    expect(source, 'a family array was named instead of a handler').not.toContain('threeDsAllChunkHandlers');
    expect(source).not.toContain('Family');
  });

  it('lands the whole family, in family order, for a file carrying every feature', async () => {
    const { source } = await load(
      'a.3ds',
      threeDsFile({ cameras: ['Cam'], keyframes: ['Box'], lights: ['Lamp'], materials: 1, meshes: ['Box'] }),
    );
    expect(handlerList(source)).toEqual([
      'threeDsCameraHandler',
      'threeDsKeyframeHandler',
      'threeDsLightHandler',
      'threeDsMaterialHandler',
      'threeDsMeshHandler',
    ]);
  });

  // ★ NEVER THE PARSER MODULE. `threeDsParse` holds the chunk readers; the handler graph and the entry
  // point live in `threeDsDocument`, and resolving the default family inside the parser closes a cycle
  // (parser to registry to handlers to parser) that vitest tolerates and Node throws on. A generated
  // module is imported by real Node, so a row pointing at the low-level module would fail there and
  // nowhere else. The row names the package lane, which is the module that owns the graph.
  it('imports from the package lane rather than the low-level parser module', async () => {
    const { source } = await load('a.3ds', threeDsFile({ meshes: ['Box'] }));
    expect(source).not.toContain('threeDsParse');
    expect(source).not.toContain('/src/');
    expect(source).toContain("from '@flighthq/scene3d-formats';");
  });
});

describe('COLLADA content through the built-in catalog', () => {
  it('emits the decoder list into ColladaImportOptions.decoders, the field that format declares', async () => {
    const { diagnostics, source } = await load(
      'a.dae',
      colladaFile('<library_geometries><geometry/></library_geometries>'),
    );
    expect(source).toContain('  decoders: [\n    colladaGeometryDecoder,\n  ],');
    expect(diagnostics).toEqual([]);
  });

  // ★ THE ORDERING CLAIM, AND THE ONLY PLACE IT CAN BE SEEN. `createRequirementSet` canonicalizes by
  // facet then key, so rows arrive sorted by kind: dae.Geometry BEFORE dae.Material. `parseCollada` runs
  // the decoders in the order given and the material pass builds the index a primitive's material symbol
  // is resolved against, so arrival order decodes geometry against an empty index — a smaller scene, with
  // no error to notice. Family order puts material first. (For 3DS the two orders coincide, so an
  // equivalent 3DS test would pass either way and proves nothing about ordering.)
  it('puts the material decoder ahead of geometry, which the requirement order does not', async () => {
    const { source } = await load(
      'a.dae',
      colladaFile(
        '<library_materials><material/></library_materials><library_geometries><geometry/></library_geometries>',
      ),
    );
    expect(decoderList(source)).toEqual(['colladaMaterialDecoder', 'colladaGeometryDecoder']);
  });

  it('lands the whole family, in family order, for a document carrying every feature', async () => {
    const { source } = await load('a.dae', colladaFile(EVERY_COLLADA_FEATURE));
    expect(decoderList(source)).toEqual([
      'colladaMaterialDecoder',
      'colladaCameraDecoder',
      'colladaGeometryDecoder',
      'colladaControllerDecoder',
      'colladaAnimationDecoder',
      'colladaLightDecoder',
    ]);
  });

  it('lands no sibling decoder for a document carrying one feature', async () => {
    const { source } = await load('a.dae', colladaFile('<library_geometries><geometry/></library_geometries>'));
    for (const absent of [
      'colladaAnimationDecoder',
      'colladaCameraDecoder',
      'colladaControllerDecoder',
      'colladaLightDecoder',
      'colladaMaterialDecoder',
    ]) {
      expect(source, `${absent} rode in on a geometry-only document`).not.toContain(absent);
    }
    expect(source).not.toContain('colladaAllElementDecoders');
  });
});

// These two still emit an empty `parserOptions`, and for reasons that are NOT "the parser is monolithic".
describe('formats with no parser rows through the built-in catalog', () => {
  // .md5anim genuinely has no handler family: parseMd5Anim reads one clip and has nothing separable.
  it('emits an empty parserOptions for .md5anim, which has no handler family at all', async () => {
    const { source } = await load('a.md5anim', new TextEncoder().encode('MD5Version 10\nnumFrames 1\n'));
    expect(source).toContain('export const parserOptions = {};');
    expect(source).not.toContain('sectionHandlers:');
  });
});

// ★ A GENERATED MODULE IS JAVASCRIPT NOBODY TYPECHECKED. Every assertion above reads emitted TEXT, which
// cannot tell a declared symbol from a plausible misspelling. These import the module for real against a
// strict shim and compare the values by identity. The real Vite-build cases below separately prove the
// same names resolve from the shipped public package lane.
//
// The bare specifier is rewritten to a narrow shim before importing. The unit lane runs without a build
// and `dist` is gitignored, while a file-URL import bypasses Vitest's source aliases. Execution replaces
// every emitted import with stable identity tokens, avoiding every unrelated renderer dependency while
// preserving the generated arrays and option objects exactly. The bare imports themselves are exercised
// by the real Vite build below, which resolves them as a consumer does.
describe('generated rich-format modules imported by Node', () => {
  it(
    'exports the imported decoder values in family order',
    async () => {
      const source = (await load('a.dae', colladaFile(EVERY_COLLADA_FEATURE))).source;
      const { module, shipped } = await importGenerated(source);
      const decoders = (module.parserOptions as { decoders: readonly unknown[] }).decoders;
      const family = shipped.colladaAllElementDecoders as readonly unknown[];
      expect(decoders).toEqual(family);
      for (const [index, decoder] of decoders.entries()) expect(decoder).toBe(family[index]);
    },
    NODE_IMPORT_TIMEOUT_MS,
  );

  it(
    'exports the imported handler values',
    async () => {
      const source = (await load('a.3ds', threeDsFile({ materials: 1, meshes: ['Box'] }))).source;
      const { module, shipped } = await importGenerated(source);
      const handlers = (module.parserOptions as { handlers: readonly unknown[] }).handlers;
      expect(handlers).toEqual([shipped.threeDsMaterialHandler, shipped.threeDsMeshHandler]);
    },
    NODE_IMPORT_TIMEOUT_MS,
  );

  it(
    'hands material to an order-sensitive consumer before geometry',
    async () => {
      const source = (
        await load(
          'a.dae',
          colladaFile(
            '<library_materials><material/></library_materials><library_geometries><geometry/></library_geometries>',
          ),
        )
      ).source;
      const { module, shipped } = await importGenerated(source);
      const decoders = (module.parserOptions as { decoders: readonly unknown[] }).decoders;
      const material = shipped.colladaMaterialDecoder;
      const geometry = shipped.colladaGeometryDecoder;
      expect(decoders).toEqual([material, geometry]);
      expect(decoders.indexOf(material)).toBeLessThan(decoders.indexOf(geometry));
    },
    NODE_IMPORT_TIMEOUT_MS,
  );
});

// Bedrock formats have no decomposable parser family: one function reads the whole file, so there is no
// subset to name and an empty `parserOptions` is the honest answer. Inventing a handler row for them
// would emit an import of a symbol that does not exist.
// MD2 and MD5 were "bedrock" only while their parsers were monolithic. They now expose section-handler
// families, so a document's optional features resolve to the handlers that satisfy them — and the earlier
// assertion that these formats always emit an empty `parserOptions` no longer describes the build.
//
// ★ THE OLD ASSERTIONS WOULD STILL HAVE PASSED, which is why they are rewritten rather than deleted. Their
// fixtures carried no optional features — an empty MD2, an MD5 with no `joints {` block — so an empty
// `parserOptions` was the right answer for the wrong reason, and the change these tests exist to catch would
// have gone unnoticed. Each case below now states which feature it puts in the file.
describe('MD2 content through the built-in catalog', () => {
  it('resolves a skinned, animated model to both section handlers', async () => {
    const { source } = await load('a.md2', md2File({ frames: 2, skins: 1 }));
    expect(source).toContain('  sectionHandlers: [');
    expect(parserList(source, 'sectionHandlers')).toEqual(['md2SkinHandler', 'md2AnimationHandler']);
  });

  // ★ THE ALWAYS-READ FEATURE IS REPORTED AS A GAP, AND TODAY THAT IS CORRECT-BUT-NOISY. `md2.Mesh` has no
  // handler on purpose — the header, triangles, texcoords and frame 0 are what make the file a model, so
  // there is nothing for a caller to opt out of and nothing for a row to name. The plugin cannot tell that
  // from an oversight, so it reports it.
  //
  // The catalog already has the vocabulary for the difference: a RequirementDisposition records a
  // requirement a backend deliberately does not implement, kept apart from `unresolved` precisely so a
  // decision is not read as a gap. Nothing generates dispositions into the built-in catalog yet, so this
  // pins what the build actually says rather than the quieter thing it should eventually say.
  it('reports the always-read geometry feature as unresolved, since nothing claims it yet', async () => {
    const { diagnostics } = await load('a.md2', md2File({ frames: 2, skins: 1 }));
    expect(diagnostics).toEqual(['no catalog entry for document.format md2.Mesh: <file>']);
  });

  it('resolves a single-frame skinned model to the skin handler alone', async () => {
    const { source } = await load('a.md2', md2File({ frames: 1, skins: 1 }));
    expect(parserList(source, 'sectionHandlers')).toEqual(['md2SkinHandler']);
    expect(source).not.toContain('md2AnimationHandler');
  });

  it('resolves an unskinned animated model to the animation handler alone', async () => {
    const { source } = await load('a.md2', md2File({ frames: 2, skins: 0 }));
    expect(parserList(source, 'sectionHandlers')).toEqual(['md2AnimationHandler']);
    expect(source).not.toContain('md2SkinHandler');
  });
});

describe('MD5 content through the built-in catalog', () => {
  it('resolves a jointed, shaded mesh to both section handlers', async () => {
    const { source } = await load('a.md5mesh', new TextEncoder().encode(MD5_JOINTED_SHADED));
    expect(parserList(source, 'sectionHandlers')).toEqual(['md5SkeletonHandler', 'md5MaterialHandler']);
  });

  it('resolves a jointed mesh with no shader to the skeleton handler alone', async () => {
    const { source } = await load(
      'a.md5mesh',
      new TextEncoder().encode(MD5_JOINTED_SHADED.replace(/ *shader.*\n/, '')),
    );
    expect(parserList(source, 'sectionHandlers')).toEqual(['md5SkeletonHandler']);
    expect(source).not.toContain('md5MaterialHandler');
  });
});

// ★ THE MTL IS READ AT ANALYSIS TIME, WHICH IS WHAT MAKES THESE ROWS POSSIBLE. Both OBJ material handlers
// used to answer one coarse `obj.Material` key, and two rows for one key collide under the catalog's row
// identity — so OBJ resolved to nothing. The analyzer declares the `mtllib` it needs, the plugin reads it
// from beside the .obj, and the requirement splits per shading model.
describe('OBJ content through the built-in catalog', () => {
  it('resolves a classic MTL to the Blinn-Phong handler alone', async () => {
    const { source } = await loadWithSibling('a.obj', OBJ_WITH_MTL, 'a.mtl', 'newmtl Red\nKd 1 0 0\n');
    expect(parserList(source, 'materialHandlers')).toEqual(['objBlinnPhongMaterialHandler']);
    expect(source).not.toContain('objStandardPbrMaterialHandler');
  });

  it('resolves a PBR MTL to the StandardPbr handler alone', async () => {
    const { source } = await loadWithSibling('a.obj', OBJ_WITH_MTL, 'a.mtl', 'newmtl Red\nPr 0.3\nPm 1\n');
    expect(parserList(source, 'materialHandlers')).toEqual(['objStandardPbrMaterialHandler']);
    expect(source).not.toContain('objBlinnPhongMaterialHandler');
  });

  it('resolves a mixed MTL to both handlers, in family order', async () => {
    const { source } = await loadWithSibling('a.obj', OBJ_WITH_MTL, 'a.mtl', 'newmtl A\nKd 1 0 0\nnewmtl B\nPr 0.3\n');
    expect(parserList(source, 'materialHandlers')).toEqual([
      'objBlinnPhongMaterialHandler',
      'objStandardPbrMaterialHandler',
    ]);
  });

  // ★ THE RENDER HALF NARROWS TOO. A classic library no longer drags the StandardPbr renderer in, which was
  // the bundle cost the coarse key imposed on every material-bearing OBJ.
  it('lands only the material renderer the MTL actually implies', async () => {
    const { source } = await loadWithSibling('a.obj', OBJ_WITH_MTL, 'a.mtl', 'newmtl Red\nKd 1 0 0\n');
    expect(source).toContain('BlinnPhongMaterial');
    expect(source).not.toContain('StandardPbrMaterial');
  });

  // A missing library costs PRECISION, not the build: both models are claimed and the plugin says why.
  it('claims both models and reports the gap when the MTL cannot be read', async () => {
    const { diagnostics, source } = await load('a.obj', new TextEncoder().encode(OBJ_WITH_MTL));
    expect(parserList(source, 'materialHandlers')).toEqual([
      'objBlinnPhongMaterialHandler',
      'objStandardPbrMaterialHandler',
    ]);
    expect(diagnostics.some((message) => message.includes('referenced file could not be read'))).toBe(true);
  });

  it('claims no material handler for a geometry-only file', async () => {
    const { source } = await load('a.obj', new TextEncoder().encode('v 0 0 0\nf 1 1 1\n'));
    expect(source).toContain('export const parserOptions = {};');
  });
});

// Importing the format package's whole source lane through Node is a real module graph, not a stub, and
// it does not fit the 5s default.
const NODE_IMPORT_TIMEOUT_MS = 120_000;

const EVERY_COLLADA_FEATURE =
  '<library_materials><material/></library_materials>' +
  '<library_effects><effect/></library_effects>' +
  '<library_cameras><camera/></library_cameras>' +
  '<library_geometries><geometry/></library_geometries>' +
  '<library_controllers><controller/></library_controllers>' +
  '<library_animations><animation/></library_animations>' +
  '<library_lights><light/></library_lights>';

async function load(name: string, content: Uint8Array): Promise<{ diagnostics: string[]; source: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'rich-format-'));
  await writeFile(join(dir, name), Buffer.from(content));
  const diagnostics: string[] = [];
  const plugin = createManifestPlugin({
    catalog: {
      backends: BUILT_IN_REQUIREMENT_BACKENDS,
      entries: [...BUILT_IN_REQUIREMENT_CATALOG_ENTRIES],
      translations: BUILT_IN_REQUIREMENT_TRANSLATIONS,
    },
    onDiagnostic: (message) => diagnostics.push(message),
  });
  const id = plugin.resolveId(`./${name}?manifest`, join(dir, 'entry.ts'))!;
  // Awaited BEFORE the diagnostics are read: snapshotting the array first leaves every `toEqual([])`
  // here unable to fail.
  const source = (await plugin.load(id))!;
  return { diagnostics: diagnostics.map((message) => message.replace(join(dir, name), '<file>')), source };
}

const OBJ_WITH_MTL = 'mtllib a.mtl\nusemtl Red\nv 0 0 0\nf 1 1 1\n';

// Writes a sibling file next to the content file, which is what exercises the plugin's reference resolution:
// the analyzer names 'a.mtl' and the plugin has to find it relative to the .obj rather than the cwd.
async function loadWithSibling(
  name: string,
  content: string,
  siblingName: string,
  siblingContent: string,
): Promise<{ diagnostics: string[]; source: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'rich-format-sibling-'));
  await writeFile(join(dir, siblingName), siblingContent);
  await writeFile(join(dir, name), content);
  const diagnostics: string[] = [];
  const plugin = createManifestPlugin({
    catalog: {
      backends: BUILT_IN_REQUIREMENT_BACKENDS,
      entries: [...BUILT_IN_REQUIREMENT_CATALOG_ENTRIES],
      translations: BUILT_IN_REQUIREMENT_TRANSLATIONS,
    },
    onDiagnostic: (message) => diagnostics.push(message),
  });
  const id = plugin.resolveId(`./${name}?manifest`, join(dir, 'entry.ts'))!;
  const source = (await plugin.load(id))!;
  return { diagnostics, source };
}

// Reads the emitted array back as a list of symbol names, so an ordering assertion states the order
// rather than pinning one exact block of text that any unrelated addition would break.
function parserList(source: string, field: string): string[] {
  const start = source.indexOf(`  ${field}: [`);
  if (start === -1) return [];
  const end = source.indexOf('  ],', start);
  return source
    .slice(start, end)
    .split('\n')
    .slice(1)
    .map((line) => line.trim().replace(/,$/, ''))
    .filter((line) => line.length > 0);
}

function decoderList(source: string): string[] {
  return parserList(source, 'decoders');
}

function handlerList(source: string): string[] {
  return parserList(source, 'handlers');
}

async function importGenerated(
  source: string,
): Promise<{ module: Record<string, unknown>; shipped: Record<string, unknown> }> {
  const root = process.cwd();
  const dir = join(root, 'node_modules', `.flight-generated-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  const globalKey = `__flightRichFormatValues_${Math.random().toString(36).slice(2)}`;
  const symbol = (name: string): Readonly<{ name: string }> => ({ name });
  const shipped: Record<string, unknown> = {
    colladaAnimationDecoder: symbol('colladaAnimationDecoder'),
    colladaCameraDecoder: symbol('colladaCameraDecoder'),
    colladaControllerDecoder: symbol('colladaControllerDecoder'),
    colladaGeometryDecoder: symbol('colladaGeometryDecoder'),
    colladaLightDecoder: symbol('colladaLightDecoder'),
    colladaMaterialDecoder: symbol('colladaMaterialDecoder'),
    threeDsCameraHandler: symbol('threeDsCameraHandler'),
    threeDsKeyframeHandler: symbol('threeDsKeyframeHandler'),
    threeDsLightHandler: symbol('threeDsLightHandler'),
    threeDsMaterialHandler: symbol('threeDsMaterialHandler'),
    threeDsMeshHandler: symbol('threeDsMeshHandler'),
  };
  shipped.colladaAllElementDecoders = [
    shipped.colladaMaterialDecoder,
    shipped.colladaCameraDecoder,
    shipped.colladaGeometryDecoder,
    shipped.colladaControllerDecoder,
    shipped.colladaAnimationDecoder,
    shipped.colladaLightDecoder,
  ];
  for (const match of source.matchAll(/^import \{ ([^}]+) \} from '[^']+';$/gmu)) {
    for (const name of (match[1] ?? '').split(',').map((entry) => entry.trim())) {
      if (!(name in shipped)) shipped[name] = symbol(name);
    }
  }
  (globalThis as Record<string, unknown>)[globalKey] = shipped;
  const file = join(dir, 'manifest.ts');
  await writeFile(
    file,
    source.replace(
      /^import \{ ([^}]+) \} from '[^']+';$/gmu,
      (_, names: string) => `const { ${names} } = globalThis['${globalKey}'];`,
    ),
  );
  try {
    const module = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as Record<string, unknown>;
    return { module, shipped };
  } finally {
    delete (globalThis as Record<string, unknown>)[globalKey];
    await rm(dir, { force: true, recursive: true });
  }
}

function colladaFile(libraries: string): Uint8Array {
  return new TextEncoder().encode(
    `<?xml version="1.0"?>\n<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">${libraries}</COLLADA>`,
  );
}

function chunk(id: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(6 + payload.length);
  const view = new DataView(out.buffer);
  view.setUint16(0, id, true);
  view.setUint32(2, out.length, true);
  out.set(payload, 6);
  return out;
}

function bytes(...parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function name(text: string): Uint8Array {
  return new TextEncoder().encode(`${text}\0`);
}

function threeDsFile(features: {
  cameras?: readonly string[];
  keyframes?: readonly string[];
  lights?: readonly string[];
  materials?: number;
  meshes?: readonly string[];
}): Uint8Array {
  const THREE_DS_MAIN = 0x4d4d;
  const THREE_DS_EDITOR = 0x3d3d;
  const THREE_DS_KEYFRAME = 0xb000;
  const THREE_DS_KEYFRAME_OBJECT_NODE = 0xb002;
  const THREE_DS_OBJECT = 0x4000;
  const THREE_DS_TRIMESH = 0x4100;
  const THREE_DS_LIGHT = 0x4600;
  const THREE_DS_CAMERA = 0x4700;
  const THREE_DS_MATERIAL = 0xafff;

  const editorParts: Uint8Array[] = [];
  for (let index = 0; index < (features.materials ?? 0); index++) {
    editorParts.push(chunk(THREE_DS_MATERIAL, new Uint8Array(0)));
  }
  for (const mesh of features.meshes ?? []) {
    editorParts.push(chunk(THREE_DS_OBJECT, bytes(name(mesh), chunk(THREE_DS_TRIMESH, new Uint8Array(0)))));
  }
  for (const light of features.lights ?? []) {
    editorParts.push(chunk(THREE_DS_OBJECT, bytes(name(light), chunk(THREE_DS_LIGHT, new Uint8Array(12)))));
  }
  for (const camera of features.cameras ?? []) {
    editorParts.push(chunk(THREE_DS_OBJECT, bytes(name(camera), chunk(THREE_DS_CAMERA, new Uint8Array(32)))));
  }
  const parts: Uint8Array[] = [chunk(THREE_DS_EDITOR, bytes(...editorParts))];
  const keyframeParts = (features.keyframes ?? []).map(() => chunk(THREE_DS_KEYFRAME_OBJECT_NODE, new Uint8Array(0)));
  if (keyframeParts.length > 0) parts.push(chunk(THREE_DS_KEYFRAME, bytes(...keyframeParts)));
  return chunk(THREE_DS_MAIN, bytes(...parts));
}

const MD5_JOINTED_SHADED = [
  'MD5Version 10',
  'numJoints 1',
  'numMeshes 1',
  'joints {',
  '  "root" -1 ( 0 0 0 ) ( 0 0 0 )',
  '}',
  'mesh {',
  '  shader "textures/default"',
  '  numverts 1',
  '  vert 0 ( 0 0 ) 0 1',
  '  numtris 1',
  '  tri 0 0 0 0',
  '  numweights 1',
  '  weight 0 0 1.0 ( 0 0 0 )',
  '}',
].join('\n');

// The analyzer reads only the MD2 header, so the fixture needs the counts and offsets to be consistent —
// `skins` drives the Material feature and a frame count above one drives Animation.
function md2File(content: { frames: number; skins: number }): Uint8Array {
  const MD2_HEADER_SIZE = 68;
  const MD2_SKIN_SIZE = 64;
  const MD2_FRAME_HEADER_SIZE = 40;
  const numVertices = 1;
  const frameStride = MD2_FRAME_HEADER_SIZE + numVertices * 4;

  const offSkins = MD2_HEADER_SIZE;
  const offTexCoords = offSkins + content.skins * MD2_SKIN_SIZE;
  const offTriangles = offTexCoords + 4;
  const offFrames = offTriangles + 12;
  const total = offFrames + content.frames * frameStride;

  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  view.setInt32(0, 0x32504449, true);
  view.setInt32(4, 8, true);
  view.setInt32(8, 64, true);
  view.setInt32(12, 64, true);
  view.setInt32(16, frameStride, true);
  view.setInt32(20, content.skins, true);
  view.setInt32(24, numVertices, true);
  view.setInt32(28, 1, true);
  view.setInt32(32, 1, true);
  view.setInt32(40, content.frames, true);
  view.setInt32(44, offSkins, true);
  view.setInt32(48, offTexCoords, true);
  view.setInt32(52, offTriangles, true);
  view.setInt32(56, offFrames, true);
  view.setInt32(64, total, true);
  for (let s = 0; s < content.skins; s++) {
    const path = `skin${s}.pcx`;
    for (let i = 0; i < path.length; i++) bytes[offSkins + s * MD2_SKIN_SIZE + i] = path.charCodeAt(i);
  }
  for (let f = 0; f < content.frames; f++) {
    const base = offFrames + f * frameStride;
    for (let axis = 0; axis < 3; axis++) view.setFloat32(base + axis * 4, 1, true);
  }
  return bytes;
}
