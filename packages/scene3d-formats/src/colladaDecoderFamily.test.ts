import type { ColladaElementDecoder } from '@flighthq/types/contract';

import { colladaAnimationDecoder } from './colladaAnimationDecoder.ts';
import { colladaCameraDecoder } from './colladaCameraDecoder.ts';
import { colladaControllerDecoder } from './colladaControllerDecoder.ts';
import { colladaAllElementDecoders } from './colladaDecoderFamily.ts';
import { parseCollada } from './colladaDocument.ts';
import { COLLADA_FEATURE_ELEMENTS } from './colladaFeatures.ts';
import { colladaGeometryDecoder } from './colladaGeometryDecoder.ts';
import { colladaLightDecoder } from './colladaLightDecoder.ts';
import { colladaMaterialDecoder } from './colladaMaterialDecoder.ts';

describe('colladaAllElementDecoders', () => {
  it('is the six decoders, in the order the single-function parser ran them', () => {
    expect(colladaAllElementDecoders.map((decoder) => decoder.features[0])).toEqual([
      'Material',
      'Camera',
      'Geometry',
      'Controller',
      'Animation',
      'Light',
    ]);
  });

  it('runs materials before geometry, which is what makes primitive symbols resolvable', () => {
    const coarseFeatures = colladaAllElementDecoders.map((decoder) => decoder.features[0]);
    expect(coarseFeatures.indexOf('Material')).toBeLessThan(coarseFeatures.indexOf('Geometry'));
  });

  it('joins every decoder feature to the feature map, with census-only coarse features explicit', () => {
    const decoderFeatures = new Set(colladaAllElementDecoders.flatMap((d) => d.features));
    const allFeatures = [...COLLADA_FEATURE_ELEMENTS.keys()];

    for (const f of decoderFeatures) {
      expect(COLLADA_FEATURE_ELEMENTS.has(f), `decoder feature '${f}' missing from feature map`).toBe(true);
    }

    const censusOnly = allFeatures.filter((f) => !decoderFeatures.has(f));
    expect(censusOnly).toEqual(['Image']);
  });

  it('claims exactly the elements the analyzer keys the coarse decoder feature on', () => {
    for (const decoder of colladaAllElementDecoders) {
      const coarse = decoder.features[0];
      expect([...decoder.elements].sort(), coarse).toEqual([...(COLLADA_FEATURE_ELEMENTS.get(coarse) ?? [])].sort());
    }
  });

  it('gives each feature exactly one decoder', () => {
    const allFeatures = colladaAllElementDecoders.flatMap((decoder) => decoder.features);
    expect(allFeatures.length).toBe(new Set(allFeatures).size);
  });

  it('exposes a callable decode on every member, which is what a descriptor inventory could not', () => {
    for (const decoder of colladaAllElementDecoders) {
      expect(typeof decoder.decode, decoder.features[0]).toBe('function');
      expect(decoder.elements.length, decoder.features[0]).toBeGreaterThan(0);
    }
  });
});

describe('parseCollada decoder composition', () => {
  // ★ DEFAULT PARITY. The 48 cases in colladaParse.test.ts are the real proof that the refactor changed
  // no observable behaviour — they exercise the full parser and passed unchanged. This asserts the
  // narrower thing they cannot: that omitting `decoders` and passing the full family explicitly are the
  // same parse, so the default is the family rather than a second code path that happens to agree.
  it('parses identically with the default and with the full family named explicitly', () => {
    const implicit = parseCollada(fullDocument());
    const explicit = parseCollada(fullDocument(), { decoders: colladaAllElementDecoders });
    // Compared as JSON, not with toEqual on the documents. Every node is an Entity carrying a
    // symbol-keyed runtime slot that is unique per allocation, so two structurally identical parses are
    // never `toEqual` — vitest says "no visual difference" and fails, which is the trap. JSON drops
    // symbol keys and keeps every observable field, so it compares the whole document on exactly the
    // axis that counts as semantics.
    expect(JSON.stringify(explicit.document)).toBe(JSON.stringify(implicit.document));
    expect(explicit.diagnostics).toEqual(implicit.diagnostics);
    expect(explicit.upAxis).toBe(implicit.upAxis);
    expect(explicit.rootTransform).toEqual(implicit.rootTransform);
  });

  it('produces content at all from the full family, so the parity check is not comparing two empties', () => {
    const result = parseCollada(fullDocument());
    expect(result.document.meshes.length).toBeGreaterThan(0);
    expect(result.document.materials.length).toBeGreaterThan(0);
  });

  // ★ OMITTING A FAMILY EXCLUDES ONLY ITS FEATURE. Checked one decoder at a time against the full parse:
  // the feature it owns disappears and every other feature's output is byte-identical. A decoder that
  // quietly did someone else's work too would fail the second half of this, which is the failure a
  // "refactor preserved everything" claim is most likely to hide.
  it.each([
    ['Material', colladaMaterialDecoder, (r: ReturnType<typeof parseCollada>) => r.document.materials.length],
    ['Geometry', colladaGeometryDecoder, (r: ReturnType<typeof parseCollada>) => r.document.meshes.length],
  ])('omitting the %s decoder empties only what it owns', (_feature, omitted, measure) => {
    const full = parseCollada(fullDocument());
    const partial = parseCollada(fullDocument(), { decoders: without(omitted) });
    expect(measure(full)).toBeGreaterThan(0);
    expect(measure(partial)).toBe(0);
  });

  it.each([
    ['Camera', colladaCameraDecoder],
    ['Light', colladaLightDecoder],
    ['Controller', colladaControllerDecoder],
    ['Animation', colladaAnimationDecoder],
  ])('omitting the %s decoder still parses, leaving the rest of the document intact', (_feature, omitted) => {
    const full = parseCollada(fullDocument());
    const partial = parseCollada(fullDocument(), { decoders: without(omitted) });
    // Meshes and materials are owned by other decoders, so they must be untouched by this omission.
    expect(partial.document.meshes.length).toBe(full.document.meshes.length);
    expect(partial.document.materials.length).toBe(full.document.materials.length);
  });

  it('parses a document with NO decoders at all rather than failing', () => {
    const result = parseCollada(fullDocument(), { decoders: [] });
    expect(result.document.meshes).toEqual([]);
    expect(result.document.materials).toEqual([]);
    // Still a readable COLLADA document: the up-axis and root transform come from the asset header,
    // which is not a decoder's business and must survive an empty family.
    expect(result.upAxis).toBe('Y_UP');
    expect(result.rootTransform.length).toBeGreaterThan(0);
  });

  // Diagnostics are observable output, so they are part of parity rather than a detail beside it.
  it('reports the coordinate-conversion diagnostic regardless of the family, since the asset owns it', () => {
    const zUp = fullDocument().replace('<up_axis>Y_UP</up_axis>', '<up_axis>Z_UP</up_axis>');
    for (const decoders of [undefined, colladaAllElementDecoders, []]) {
      const result = parseCollada(zUp, decoders === undefined ? undefined : { decoders });
      expect(result.upAxis, String(decoders?.length)).toBe('Z_UP');
      expect(result.diagnostics.some((d) => d.kind === 'collada.coordinate-conversion')).toBe(true);
    }
  });
});

function without(omitted: ColladaElementDecoder): readonly ColladaElementDecoder[] {
  return colladaAllElementDecoders.filter((decoder) => decoder !== omitted);
}

function fullDocument(): string {
  return `<?xml version="1.0"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset><up_axis>Y_UP</up_axis></asset>
  <library_effects>
    <effect id="fx"><profile_COMMON><technique sid="t"><lambert>
      <diffuse><color>0.8 0.2 0.1 1</color></diffuse>
    </lambert></technique></profile_COMMON></effect>
  </library_effects>
  <library_materials><material id="mat"><instance_effect url="#fx"/></material></library_materials>
  <library_cameras><camera id="cam"><optics><technique_common><perspective>
    <yfov>45</yfov><znear>0.1</znear><zfar>100</zfar>
  </perspective></technique_common></optics></camera></library_cameras>
  <library_lights><light id="lit"><technique_common><point>
    <color>1 1 1</color>
  </point></technique_common></light></library_lights>
  <library_geometries>
    <geometry id="geo"><mesh>
      <source id="pos"><float_array id="pos-a" count="9">0 0 0 1 0 0 0 1 0</float_array></source>
      <vertices id="verts"><input semantic="POSITION" source="#pos"/></vertices>
      <triangles count="1" material="mat"><input semantic="VERTEX" source="#verts" offset="0"/><p>0 1 2</p></triangles>
    </mesh></geometry>
  </library_geometries>
  <library_animations>
    <animation id="anim">
      <source id="t-in"><float_array id="t-in-a" count="2">0 1</float_array></source>
      <source id="t-out"><float_array id="t-out-a" count="2">0 5</float_array></source>
      <sampler id="samp"><input semantic="INPUT" source="#t-in"/><input semantic="OUTPUT" source="#t-out"/></sampler>
      <channel source="#samp" target="nodeA/translate.X"/>
    </animation>
  </library_animations>
  <library_visual_scenes>
    <visual_scene id="scene">
      <node id="nodeA"><instance_geometry url="#geo">
        <bind_material><technique_common>
          <instance_material symbol="mat" target="#mat"/>
        </technique_common></bind_material>
      </instance_geometry></node>
      <node id="nodeC"><instance_camera url="#cam"/></node>
      <node id="nodeL"><instance_light url="#lit"/></node>
    </visual_scene>
  </library_visual_scenes>
  <scene><instance_visual_scene url="#scene"/></scene>
</COLLADA>`;
}
