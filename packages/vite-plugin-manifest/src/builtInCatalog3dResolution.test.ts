import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { encodeUTF8 } from '@flighthq/encoding/contract';
import {
  BUILT_IN_REQUIREMENT_BACKENDS,
  BUILT_IN_REQUIREMENT_CATALOG_ENTRIES,
  BUILT_IN_REQUIREMENT_DISPOSITIONS,
  BUILT_IN_REQUIREMENT_TRANSLATIONS,
} from '@flighthq/requirement-catalog/contract';
import { MD2_HEADER_SIZE, MD2_MAGIC, MD2_VERSION } from '@flighthq/scene3d-formats/contract';

import { createManifestPlugin } from './manifestPlugin.ts';

// 3D format features produce `document.format` requirements that the translation layer EXPANDS into
// `scene.material-kind` requirements, and both halves resolve: the expansion reaches the material
// renderers, and the format requirement itself reaches the parser handler that reads it. The material
// renderers appear in the generated source because the TRANSLATED requirements resolve on gl and wgpu.
// This test verifies that pipeline end to end.
//
// The note that used to sit here — that the catalog has no parser rows for 3D formats because their parsers
// are standalone functions — is no longer true. 3DS, COLLADA, MD2, MD5 and OBJ all expose handler families
// now and all have derived parser rows; what remains without a row is the set of always-read features, and
// those are DECLINED with a reason rather than unresolved.

describe('3D format content through the built-in catalog', () => {
  describe('.3ds', () => {
    it('resolves a material-bearing 3DS to BlinnPhong material renderers on gl and wgpu', async () => {
      const { source } = await load3d('.3ds', threeDsWithMaterial());
      expect(source).toContain('materialRenderers');
      expect(source).toContain("'BlinnPhongMaterial'");
      expect(source).toContain('glBlinnPhongMeshMaterialRenderer');
      expect(source).toContain('wgpuBlinnPhongMeshMaterialRenderer');
    });

    it('omits material renderers for a mesh-only 3DS', async () => {
      const { source } = await load3d('.3ds', threeDsWithMeshOnly());
      expect(source).not.toContain('materialRenderers');
      expect(source).not.toContain('BlinnPhongMaterial');
      expect(source).not.toContain('glBlinnPhongMeshMaterialRenderer');
    });

    it('produces material renderers only via per-feature translation, not coarse namespace', async () => {
      const { source } = await load3d('.3ds', threeDsWithMaterial());
      expect(source).toContain('BlinnPhongMaterial');
      const coarseTranslation = BUILT_IN_REQUIREMENT_TRANSLATIONS.find(
        (t) => t.from.facet === 'document.format' && t.from.key === '3ds',
      );
      expect(coarseTranslation).toBeUndefined();
    });

    it('reports unreadable diagnostic for corrupt bytes', async () => {
      const { diagnostics } = await load3d('.3ds', new Uint8Array([0x00]));
      expect(diagnostics.some((d) => d.includes('unreadable'))).toBe(true);
    });
  });

  describe('.glb', () => {
    it('resolves a mesh-bearing GLB to StandardPbr material renderers', async () => {
      const { source } = await load3d('.glb', buildGlb(JSON.stringify({ asset: { version: '2.0' }, meshes: [{}] })));
      expect(source).toContain('materialRenderers');
      expect(source).toContain("'StandardPbrMaterial'");
      expect(source).toContain('glStandardPbrMeshMaterialRenderer');
      expect(source).toContain('wgpuStandardPbrMeshMaterialRenderer');
    });

    it('omits unused extension handlers', async () => {
      const { source } = await load3d('.glb', buildGlb(JSON.stringify({ asset: { version: '2.0' }, meshes: [{}] })));
      expect(source).not.toContain('GltfUnlitExtensionHandler');
      expect(source).not.toContain('GltfClearcoatExtensionHandler');
    });

    it('reports unreadable diagnostic for truncated bytes', async () => {
      const { diagnostics } = await load3d('.glb', new Uint8Array(4));
      expect(diagnostics.some((d) => d.includes('unreadable'))).toBe(true);
    });
  });

  describe('.gltf', () => {
    it('resolves a mesh-bearing document to StandardPbr material renderers', async () => {
      const { source } = await load3d('.gltf', encodeUTF8(GLTF_WITH_MESHES));
      expect(source).toContain('materialRenderers');
      expect(source).toContain("'StandardPbrMaterial'");
      expect(source).toContain('glStandardPbrMeshMaterialRenderer');
      expect(source).toContain('wgpuStandardPbrMeshMaterialRenderer');
    });

    it('includes Unlit material renderers when KHR_materials_unlit is used', async () => {
      const { source } = await load3d('.gltf', encodeUTF8(GLTF_WITH_UNLIT));
      expect(source).toContain("'UnlitMaterial'");
    });

    it('includes the extension handler only when the extension is used', async () => {
      const withUnlit = await load3d('.gltf', encodeUTF8(GLTF_WITH_UNLIT));
      const withoutUnlit = await load3d('.gltf', encodeUTF8(GLTF_WITH_MESHES));
      expect(withUnlit.source).toContain('GltfUnlitExtensionHandler');
      expect(withoutUnlit.source).not.toContain('GltfUnlitExtensionHandler');
    });

    it('omits material renderers for a camera-only document', async () => {
      const { source } = await load3d('.gltf', encodeUTF8(GLTF_CAMERAS_ONLY));
      expect(source).not.toContain('materialRenderers');
      expect(source).not.toContain('StandardPbrMaterial');
    });

    it('does not diagnose gltf.Mesh — the catalog deliberately declines it', async () => {
      const { diagnostics } = await load3d('.gltf', encodeUTF8(GLTF_WITH_MESHES));
      expect(diagnostics.filter((d) => d.includes('gltf.Mesh'))).toEqual([]);
    });

    it('reports unreadable diagnostic for non-glTF JSON', async () => {
      const { diagnostics } = await load3d('.gltf', encodeUTF8('{ "not": "gltf" }'));
      expect(diagnostics.some((d) => d.includes('unreadable'))).toBe(true);
    });
  });

  describe('.dae', () => {
    it('resolves a material-bearing COLLADA to StandardPbr material renderers', async () => {
      const { source } = await load3d('.dae', encodeUTF8(FULL_COLLADA));
      expect(source).toContain('materialRenderers');
      expect(source).toContain("'StandardPbrMaterial'");
      expect(source).toContain('glStandardPbrMeshMaterialRenderer');
      expect(source).toContain('wgpuStandardPbrMeshMaterialRenderer');
    });

    it('omits material renderers for a geometry-only COLLADA', async () => {
      const { source } = await load3d('.dae', encodeUTF8(GEOMETRY_ONLY_COLLADA));
      expect(source).not.toContain('materialRenderers');
      expect(source).not.toContain('StandardPbrMaterial');
    });

    it('reports unreadable diagnostic for non-COLLADA XML', async () => {
      const { diagnostics } = await load3d('.dae', encodeUTF8('<root/>'));
      expect(diagnostics.some((d) => d.includes('unreadable'))).toBe(true);
    });
  });

  describe('.md2', () => {
    it('resolves a skin-bearing MD2 to BlinnPhong material renderers', async () => {
      const { source } = await load3d('.md2', md2WithSkins());
      expect(source).toContain('materialRenderers');
      expect(source).toContain("'BlinnPhongMaterial'");
      expect(source).toContain('glBlinnPhongMeshMaterialRenderer');
    });

    it('omits material renderers for a mesh-only MD2', async () => {
      const { source } = await load3d('.md2', md2MeshOnly());
      expect(source).not.toContain('materialRenderers');
      expect(source).not.toContain('BlinnPhongMaterial');
    });

    it('reports unreadable diagnostic for truncated bytes', async () => {
      const { diagnostics } = await load3d('.md2', new Uint8Array(10));
      expect(diagnostics.some((d) => d.includes('unreadable'))).toBe(true);
    });
  });

  describe('.md5anim', () => {
    it('is registered and produces a valid module', async () => {
      const { source } = await load3d('.md5anim', encodeUTF8(FULL_MD5_ANIM));
      expect(source).toBeDefined();
      expect(source.length).toBeGreaterThan(0);
    });

    it('does not emit material renderers — animations carry no material', async () => {
      const { source } = await load3d('.md5anim', encodeUTF8(FULL_MD5_ANIM));
      expect(source).not.toContain('materialRenderers');
      expect(source).not.toContain('BlinnPhongMaterial');
      expect(source).not.toContain('StandardPbrMaterial');
    });

    // ★ THESE TWO ARE DECLINED NOW, NOT UNRESOLVED, AND THAT IS THE POINT. This case used to assert they
    // WERE diagnosed, which was true and useless: the .md5anim parser reads one clip and has no separable
    // family, so no handler exists for a row to name and no build could have acted on the report. The catalog
    // records that decision with its reason (BUILT_IN_REQUIREMENT_DISPOSITIONS), so the plan routes them to
    // `declined` and the channel stays trustworthy. A requirement nobody decided about still reports — see
    // the unknown-chunk case in richFormatParserResolution.test.ts.
    it('does not diagnose a format feature the catalog deliberately declines', async () => {
      const { diagnostics } = await load3d('.md5anim', encodeUTF8(FULL_MD5_ANIM));
      expect(diagnostics.filter((d) => d.includes('md5.Hierarchy'))).toEqual([]);
      expect(diagnostics.filter((d) => d.includes('md5.Animation'))).toEqual([]);
    });
  });

  describe('.md5mesh', () => {
    it('resolves a mesh with shaders to BlinnPhong material renderers', async () => {
      const { source } = await load3d('.md5mesh', encodeUTF8(FULL_MD5_MESH));
      expect(source).toContain('materialRenderers');
      expect(source).toContain("'BlinnPhongMaterial'");
      expect(source).toContain('glBlinnPhongMeshMaterialRenderer');
    });

    it('omits material renderers for a skeleton-only MD5 mesh', async () => {
      const { source } = await load3d('.md5mesh', encodeUTF8(MINIMAL_MD5_MESH));
      expect(source).not.toContain('materialRenderers');
      expect(source).not.toContain('BlinnPhongMaterial');
    });
  });

  describe('.obj', () => {
    it('resolves a material-bearing OBJ to both BlinnPhong and StandardPbr renderers', async () => {
      const { source } = await load3d('.obj', encodeUTF8(FULL_OBJ));
      expect(source).toContain('materialRenderers');
      expect(source).toContain("'BlinnPhongMaterial'");
      expect(source).toContain("'StandardPbrMaterial'");
      expect(source).toContain('glBlinnPhongMeshMaterialRenderer');
      expect(source).toContain('glStandardPbrMeshMaterialRenderer');
    });

    it('omits material renderers for a geometry-only OBJ', async () => {
      const { source } = await load3d('.obj', encodeUTF8(MINIMAL_OBJ));
      expect(source).not.toContain('materialRenderers');
      expect(source).not.toContain('BlinnPhongMaterial');
      expect(source).not.toContain('StandardPbrMaterial');
    });
  });

  describe('cross-format', () => {
    it('no format uses a coarse namespace key in translations — all are per-feature', () => {
      const coarseKeys = BUILT_IN_REQUIREMENT_TRANSLATIONS.filter(
        (t) => t.from.facet === 'document.format' && ['3ds', 'dae', 'gltf', 'md2', 'md5', 'obj'].includes(t.from.key),
      );
      expect(coarseKeys).toEqual([]);
    });

    it('every per-feature 3D translation key contains a dot separator', () => {
      const scene3dTranslations = BUILT_IN_REQUIREMENT_TRANSLATIONS.filter((t) =>
        t.from.key.match(/^(3ds|dae|md2|md5|obj)\./),
      );
      expect(scene3dTranslations.length).toBeGreaterThan(0);
      for (const t of scene3dTranslations) {
        expect(t.from.key).toContain('.');
      }
    });

    it('minimal content produces fewer material renderers than feature-rich content', async () => {
      const minimalMd2 = await load3d('.md2', md2MeshOnly());
      const fullMd2 = await load3d('.md2', md2WithSkins());
      const minimalHasRenderers = minimalMd2.source.includes('materialRenderers');
      const fullHasRenderers = fullMd2.source.includes('materialRenderers');
      expect(minimalHasRenderers).toBe(false);
      expect(fullHasRenderers).toBe(true);
    });
  });
});

async function load3d(ext: string, content: Uint8Array): Promise<{ diagnostics: string[]; source: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'builtin-catalog-3d-'));
  const filename = `a${ext}`;
  await writeFile(join(dir, filename), Buffer.from(content));
  const diagnostics: string[] = [];
  const plugin = createManifestPlugin({
    catalog: {
      backends: BUILT_IN_REQUIREMENT_BACKENDS,
      dispositions: BUILT_IN_REQUIREMENT_DISPOSITIONS,
      entries: [...BUILT_IN_REQUIREMENT_CATALOG_ENTRIES],
      translations: BUILT_IN_REQUIREMENT_TRANSLATIONS,
    },
    onDiagnostic: (message) => diagnostics.push(message),
  });
  const id = plugin.resolveId(`./${filename}?manifest`, join(dir, 'entry.ts'))!;
  const source = (await plugin.load(id))!;
  return { diagnostics: diagnostics.map((message) => message.replace(join(dir, filename), '<file>')), source };
}

function threeDsWithMaterial(): Uint8Array {
  const materialChunk = threeDsChunk(0xafff, new Uint8Array(0));
  const editorChunk = threeDsChunk(0x3d3d, materialChunk);
  return threeDsChunk(0x4d4d, editorChunk);
}

function threeDsWithMeshOnly(): Uint8Array {
  const trimeshChunk = threeDsChunk(0x4100, new Uint8Array(0));
  const objectName = new Uint8Array([0x4d, 0x00]); // "M\0"
  const objectBody = new Uint8Array(objectName.length + trimeshChunk.length);
  objectBody.set(objectName, 0);
  objectBody.set(trimeshChunk, objectName.length);
  const objectChunk = threeDsChunk(0x4000, objectBody);
  const editorChunk = threeDsChunk(0x3d3d, objectChunk);
  return threeDsChunk(0x4d4d, editorChunk);
}

function threeDsChunk(id: number, body: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(6 + body.length);
  const view = new DataView(chunk.buffer);
  view.setUint16(0, id, true);
  view.setUint32(2, 6 + body.length, true);
  chunk.set(body, 6);
  return chunk;
}

function md2WithSkins(): Uint8Array {
  const buf = new ArrayBuffer(MD2_HEADER_SIZE);
  const view = new DataView(buf);
  view.setInt32(0, MD2_MAGIC, true);
  view.setInt32(4, MD2_VERSION, true);
  view.setInt32(20, 1, true); // numSkins
  view.setInt32(32, 10, true); // numTriangles
  view.setInt32(40, 1, true); // numFrames
  return new Uint8Array(buf);
}

function md2MeshOnly(): Uint8Array {
  const buf = new ArrayBuffer(MD2_HEADER_SIZE);
  const view = new DataView(buf);
  view.setInt32(0, MD2_MAGIC, true);
  view.setInt32(4, MD2_VERSION, true);
  view.setInt32(20, 0, true); // numSkins = 0
  view.setInt32(32, 10, true); // numTriangles
  view.setInt32(40, 1, true); // numFrames
  return new Uint8Array(buf);
}

const FULL_COLLADA = [
  '<?xml version="1.0"?>',
  '<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">',
  '<library_geometries><geometry id="g"><mesh></mesh></geometry></library_geometries>',
  '<library_materials><material id="m"><instance_effect url="#e"/></material></library_materials>',
  '<library_effects><effect id="e"><profile_COMMON></profile_COMMON></effect></library_effects>',
  '</COLLADA>',
].join('\n');

const GEOMETRY_ONLY_COLLADA = [
  '<?xml version="1.0"?>',
  '<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">',
  '<library_geometries><geometry id="g"><mesh></mesh></geometry></library_geometries>',
  '</COLLADA>',
].join('\n');

const MINIMAL_OBJ = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n';

const FULL_OBJ = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\nmtllib foo.mtl\nusemtl bar\n';

const MINIMAL_MD5_MESH = 'joints {\n}\n';

const FULL_MD5_MESH = 'joints {\n}\nmesh {\nshader "body"\n}\n';

const FULL_MD5_ANIM = 'hierarchy {\n}\nframe 0 {\n}\n';

const GLTF_WITH_MESHES = JSON.stringify({ asset: { version: '2.0' }, meshes: [{}] });

const GLTF_WITH_UNLIT = JSON.stringify({
  asset: { version: '2.0' },
  meshes: [{}],
  extensionsUsed: ['KHR_materials_unlit'],
});

const GLTF_CAMERAS_ONLY = JSON.stringify({ asset: { version: '2.0' }, cameras: [{}] });

const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;

function buildGlb(json: string): Uint8Array {
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(json);
  const paddedLength = (jsonBytes.byteLength + 3) & ~3;
  const totalLength = 12 + 8 + paddedLength;
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, paddedLength, true);
  view.setUint32(16, GLB_JSON_CHUNK_TYPE, true);
  bytes.set(jsonBytes, 20);
  for (let i = jsonBytes.byteLength; i < paddedLength; i++) {
    bytes[20 + i] = 0x20;
  }
  return bytes;
}
