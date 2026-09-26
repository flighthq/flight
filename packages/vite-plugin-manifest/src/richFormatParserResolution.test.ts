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

// Bedrock formats have no decomposable parser family: one function reads the whole file, so there is no
// subset to name and an empty `parserOptions` is the honest answer. Inventing a handler row for them
// would emit an import of a symbol that does not exist.
describe('bedrock formats through the built-in catalog', () => {
  it.each([
    ['a.obj', 'v 0 0 0\nf 1 1 1\n'],
    ['a.md2', ''],
    ['a.md5mesh', 'MD5Version 10\nnumJoints 1\n'],
    ['a.md5anim', 'MD5Version 10\nnumFrames 1\n'],
  ])('emits an empty parserOptions for %s', async (name, text) => {
    const { source } = await load(name, new TextEncoder().encode(text));
    expect(source).toContain('export const parserOptions = {};');
    expect(source).not.toContain('handlers:');
    expect(source).not.toContain('decoders:');
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

// ★ A GENERATED MODULE IS JAVASCRIPT NOBODY TYPECHECKED. Every assertion above reads emitted TEXT, which
// cannot tell a real symbol from a plausible misspelling. These import the module for real and compare
// what comes back against the family the format package ships, by identity.
//
// The bare specifier is rewritten to the package's source lane before importing. The unit lane runs
// without a build and `dist` is gitignored, so `@flighthq/scene3d-formats` would not resolve here; and a
// file-URL import bypasses vitest's aliasing, so resolving it to `dist` would hand back a SECOND copy of
// the module graph and every identity check would fail against objects that merely look equal. The bare
// specifier itself is exercised by the real Vite build below, which resolves it the way a consumer does.
describe('generated rich-format modules imported by Node', () => {
  it(
    'exports decoders that ARE the shipped values, in the shipped order',
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
    'exports handlers that ARE the shipped values',
    async () => {
      const source = (await load('a.3ds', threeDsFile({ materials: 1, meshes: ['Box'] }))).source;
      const { module, shipped } = await importGenerated(source);
      const handlers = (module.parserOptions as { handlers: readonly unknown[] }).handlers;
      expect(handlers).toEqual([shipped.threeDsMaterialHandler, shipped.threeDsMeshHandler]);
    },
    NODE_IMPORT_TIMEOUT_MS,
  );

  // ★ THE END-TO-END CLAIM. The generated options are handed to the real importer, on a document whose
  // geometry names a material symbol — the case the ordering exists for. A reversed family decodes the
  // geometry before the material index is built.
  it(
    'parses a mixed material-and-geometry document through the options it generated',
    async () => {
      const xml = colladaMaterialAndGeometryDocument();
      const source = (await load('a.dae', new TextEncoder().encode(xml))).source;
      const { module, shipped } = await importGenerated(source);
      const parseCollada = shipped.parseCollada as (
        xml: string,
        options?: { decoders?: readonly unknown[] },
      ) => { diagnostics: readonly unknown[]; document: { materials: readonly unknown[]; meshes: readonly unknown[] } };

      const generated = parseCollada(xml, module.parserOptions as { decoders?: readonly unknown[] });
      const full = parseCollada(xml);
      expect(generated.diagnostics).toEqual([]);
      expect(generated.document.meshes.length).toBe(full.document.meshes.length);
      expect(generated.document.materials.length).toBe(full.document.materials.length);
      expect(generated.document.materials.length).toBeGreaterThan(0);
    },
    NODE_IMPORT_TIMEOUT_MS,
  );
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
  const lane = join(root, 'packages', 'scene3d-formats', 'src', 'index.ts');
  const dir = join(root, 'node_modules', `.flight-generated-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'manifest.ts');
  await writeFile(file, source.replaceAll("'@flighthq/scene3d-formats'", `'${pathToFileURL(lane).href}'`));
  try {
    const module = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as Record<string, unknown>;
    const shipped = (await import(/* @vite-ignore */ pathToFileURL(lane).href)) as Record<string, unknown>;
    return { module, shipped };
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

function colladaFile(libraries: string): Uint8Array {
  return new TextEncoder().encode(
    `<?xml version="1.0"?>\n<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">${libraries}</COLLADA>`,
  );
}

// A document whose primitive names a material symbol — the case the material-before-geometry order
// exists for. Anything less would decode the same either way.
function colladaMaterialAndGeometryDocument(): string {
  return `<?xml version="1.0"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <library_effects>
    <effect id="fx"><profile_COMMON><technique sid="common"><lambert>
      <diffuse><color>1 0 0 1</color></diffuse>
    </lambert></technique></profile_COMMON></effect>
  </library_effects>
  <library_materials>
    <material id="mat" name="mat"><instance_effect url="#fx"/></material>
  </library_materials>
  <library_geometries>
    <geometry id="geo"><mesh>
      <source id="pos">
        <float_array id="pos-array" count="9">0 0 0 1 0 0 0 1 0</float_array>
        <technique_common><accessor source="#pos-array" count="3" stride="3">
          <param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>
        </accessor></technique_common>
      </source>
      <vertices id="verts"><input semantic="POSITION" source="#pos"/></vertices>
      <triangles count="1" material="matsym">
        <input semantic="VERTEX" source="#verts" offset="0"/>
        <p>0 1 2</p>
      </triangles>
    </mesh></geometry>
  </library_geometries>
  <library_visual_scenes>
    <visual_scene id="scene"><node id="n"><instance_geometry url="#geo">
      <bind_material><technique_common>
        <instance_material symbol="matsym" target="#mat"/>
      </technique_common></bind_material>
    </instance_geometry></node></visual_scene>
  </library_visual_scenes>
  <scene><instance_visual_scene url="#scene"/></scene>
</COLLADA>`;
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
