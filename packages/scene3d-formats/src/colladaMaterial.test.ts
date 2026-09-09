import { packLinearToColor } from '@flighthq/color/contract';
import { getPbrRoughnessFromPhongShininess } from '@flighthq/materials/contract';
import type {
  ImageResourceReference,
  ImportDiagnostic,
  MaterialLike,
  StandardPbrMaterial,
  XmlElement,
} from '@flighthq/types/contract';
import { ImageResourceReferenceKind, ImportDiagnosticSeverity } from '@flighthq/types/contract';
import { parseXmlDocument } from '@flighthq/xml/contract';
import { describe, expect, it } from 'vitest';

import { appendColladaMaterials } from './colladaMaterial';

describe('appendColladaMaterials', () => {
  it('converts Lambert, Phong, and Blinn factors to standard PBR', () => {
    const { materials } = appendMaterials(`
      <COLLADA>
        <library_effects>
          <effect id="lambert-fx">
            <profile_COMMON><technique><lambert>
              <diffuse><color>0.25 0.5 1 0.8</color></diffuse>
              <emission><color>0.1 0 0.25 1</color></emission>
              <transparent opaque="A_ONE"><color>1 1 1 0.5</color></transparent>
              <transparency><float>0.5</float></transparency>
            </lambert></technique></profile_COMMON>
          </effect>
          <effect id="phong-fx">
            <profile_COMMON>
              <newparam sid="shine"><float>18</float></newparam>
              <technique><phong>
                <diffuse><color>0.5 0.25 0.125 1</color></diffuse>
                <shininess><param ref="shine"/></shininess>
              </phong></technique>
            </profile_COMMON>
          </effect>
          <effect id="blinn-fx">
            <profile_COMMON><technique><blinn>
              <diffuse><color>1 1 1 1</color></diffuse>
              <shininess><float>32</float></shininess>
              <transparent opaque="RGB_ZERO"><color>0.5 0.5 0.5 1</color></transparent>
              <transparency><float>0.5</float></transparency>
            </blinn></technique></profile_COMMON>
          </effect>
        </library_effects>
        <library_materials>
          <material id="lambert" name="Matte"><instance_effect url="#lambert-fx"/></material>
          <material id="phong"><instance_effect url="#phong-fx"/></material>
          <material id="blinn"><instance_effect url="#blinn-fx"/></material>
        </library_materials>
      </COLLADA>
    `);
    const lambert = materials[0] as StandardPbrMaterial;
    const phong = materials[1] as StandardPbrMaterial;
    const blinn = materials[2] as StandardPbrMaterial;

    expect(lambert.name).toBe('Matte');
    expect(lambert.baseColor).toBe(packLinearToColor([0.25, 0.5, 1, 0.2]));
    expect(lambert.emissive).toBe(packLinearToColor([0.1, 0, 0.25, 1]));
    expect(lambert.alphaMode).toBe('blend');
    expect(lambert.metallic).toBe(0);
    expect(lambert.roughness).toBe(1);
    expect(phong.name).toBe('phong');
    expect(phong.roughness).toBeCloseTo(getPbrRoughnessFromPhongShininess(18));
    expect(phong.alphaMode).toBe('opaque');
    expect(blinn.baseColor).toBe(packLinearToColor([1, 1, 1, 0.75]));
    expect(blinn.roughness).toBeCloseTo(getPbrRoughnessFromPhongShininess(32));
  });

  it('resolves profile parameters and image chains for color and normal textures', () => {
    const { materials, resources } = appendMaterials(
      `
        <c:COLLADA xmlns:c="urn:collada">
          <c:library_images>
            <c:image id="base-image"><c:init_from>base.png</c:init_from></c:image>
            <c:image id="normal-image"><c:init_from>normal.png</c:init_from></c:image>
          </c:library_images>
          <c:library_effects><c:effect id="textured-fx"><c:profile_COMMON>
            <c:newparam sid="base-surface"><c:surface type="2D"><c:init_from>base-image</c:init_from></c:surface></c:newparam>
            <c:newparam sid="base-sampler"><c:sampler2D><c:source>wrong-surface</c:source></c:sampler2D></c:newparam>
            <c:technique><c:newparam sid="normal-surface"><c:surface type="2D"><c:init_from>normal-image</c:init_from></c:surface></c:newparam>
              <c:newparam sid="normal-sampler"><c:sampler2D><c:source>normal-surface</c:source></c:sampler2D></c:newparam>
              <c:lambert>
                <c:diffuse><c:texture texture="base-sampler" texcoord="UVSET0"/></c:diffuse>
                <c:emission><c:texture texture="base-sampler" texcoord="UVSET0"/></c:emission>
              </c:lambert>
              <c:extra><c:technique profile="FCOLLADA"><c:bump><c:texture texture="normal-sampler" texcoord="UVSET0"/></c:bump></c:technique></c:extra>
            </c:technique>
          </c:profile_COMMON></c:effect></c:library_effects>
          <c:library_materials><c:material id="textured"><c:instance_effect url="#textured-fx">
            <c:setparam ref="base-sampler"><c:sampler2D><c:source>base-surface</c:source></c:sampler2D></c:setparam>
          </c:instance_effect></c:material></c:library_materials>
        </c:COLLADA>
      `,
      '/models',
    );
    const material = materials[0] as StandardPbrMaterial;

    expect(resources).toHaveLength(2);
    expect(resources.map((resource) => resource.kind)).toEqual([
      ImageResourceReferenceKind.External,
      ImageResourceReferenceKind.External,
    ]);
    expect(
      resources.map((resource) => (resource.kind === 'External' ? [resource.uri, resource.basePath] : null)),
    ).toEqual([
      ['base.png', '/models'],
      ['normal.png', '/models'],
    ]);
    expect(resources[0].textures).toHaveLength(2);
    expect(material.baseColorMap?.colorSpace).toBe('srgb');
    expect(material.emissiveMap?.colorSpace).toBe('srgb');
    expect(material.normalMap?.colorSpace).toBe('linear');
  });

  it('reports unsupported profiles and preserves fallbacks for missing effects and images', () => {
    const { diagnostics, materialIndices, materials } = appendMaterials(`
      <COLLADA>
        <library_effects>
          <effect id="custom-fx"><profile_GLSL/></effect>
          <effect id="missing-image-fx"><profile_COMMON>
            <newparam sid="surface"><surface type="2D"><init_from>absent-image</init_from></surface></newparam>
            <newparam sid="sampler"><sampler2D><source>surface</source></sampler2D></newparam>
            <technique><lambert><diffuse><texture texture="sampler"/></diffuse></lambert></technique>
          </profile_COMMON></effect>
        </library_effects>
        <library_materials>
          <material id="custom"><instance_effect url="#custom-fx"/></material>
          <material id="missing-effect"><instance_effect url="#absent-effect"/></material>
          <material id="missing-image"><instance_effect url="#missing-image-fx"/></material>
        </library_materials>
      </COLLADA>
    `);

    expect(materials).toHaveLength(3);
    expect([...materialIndices]).toEqual([
      ['custom', 0],
      ['missing-effect', 1],
      ['missing-image', 2],
    ]);
    expect(diagnostics.map((diagnostic) => [diagnostic.kind, diagnostic.severity, diagnostic.detail])).toEqual([
      ['collada.unsupported-profile', ImportDiagnosticSeverity.Skip, { effect: 'custom-fx', profile: 'profile_GLSL' }],
      [
        'collada.missing-reference',
        ImportDiagnosticSeverity.Recover,
        { element: 'effect', owner: 'missing-effect', reference: 'absent-effect' },
      ],
      [
        'collada.missing-reference',
        ImportDiagnosticSeverity.Recover,
        { element: 'image', owner: 'missing-image-fx', reference: 'absent-image' },
      ],
    ]);
  });
});

function appendMaterials(
  xml: string,
  basePath: string | null = null,
): {
  diagnostics: ImportDiagnostic[];
  materialIndices: Map<string, number>;
  materials: MaterialLike[];
  resources: ImageResourceReference[];
} {
  const root = parseXmlDocument(xml) as XmlElement;
  const diagnostics: ImportDiagnostic[] = [];
  const materialIndices = new Map<string, number>();
  const materials: MaterialLike[] = [];
  const resources: ImageResourceReference[] = [];
  appendColladaMaterials(root, materials, resources, materialIndices, basePath, diagnostics);
  return { diagnostics, materialIndices, materials, resources };
}
