import type { DirectionalLight, ImportDiagnostic, PointLight, SpotLight, GltfDocument } from '@flighthq/types/contract';
import {
  DirectionalLightKind,
  ImportDiagnosticSeverity,
  PointLightKind,
  SpotLightKind,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { parseGltf } from './gltfParse';
import { GltfPunctualLightsExtensionHandler } from './gltfPunctualLights';

function findLightDiagnostic(diagnostics: readonly ImportDiagnostic[], kind: string): ImportDiagnostic | undefined {
  return diagnostics.find((diagnostic) => diagnostic.kind === kind);
}

// A KHR_lights_punctual glTF document with one light and one node referencing it — the fixture the
// per-light diagnostic tests vary.
function makeLightGltf(light: unknown): GltfDocument {
  return {
    asset: { version: '2.0' },
    extensions: { KHR_lights_punctual: { lights: [light] } },
    nodes: [{ extensions: { KHR_lights_punctual: { light: 0 } } }],
    scenes: [{ nodes: [0] }],
  } as GltfDocument;
}

describe('GltfPunctualLightsExtensionHandler', () => {
  it('individually realizes placed directional, point, and spot lights', () => {
    const source: GltfDocument = {
      asset: { version: '2.0' },
      extensions: {
        KHR_lights_punctual: {
          lights: [
            { color: [1, 0, 0], intensity: 2, name: 'sun', type: 'directional' },
            { intensity: 3, range: 10, type: 'point' },
            { spot: { innerConeAngle: 0.25, outerConeAngle: 0.5 }, type: 'spot' },
          ],
        },
      },
      extensionsRequired: ['KHR_lights_punctual'],
      nodes: [
        { extensions: { KHR_lights_punctual: { light: 0 } }, translation: [1, 2, 3] },
        { extensions: { KHR_lights_punctual: { light: 1 } } },
        { extensions: { KHR_lights_punctual: { light: 2 } } },
      ],
      scenes: [{ nodes: [0, 1, 2] }],
    };
    const diagnostics: ImportDiagnostic[] = [];
    const document = parseGltf(source, diagnostics, {
      extensionHandlers: [GltfPunctualLightsExtensionHandler],
    });

    expect(diagnostics).toEqual([]);
    expect(document.lights).toHaveLength(3);
    const directional = document.lights[0].descriptor as DirectionalLight;
    expect(directional.kind).toBe(DirectionalLightKind);
    expect(directional.intensity).toBe(2);
    expect(directional.color).toBe(0xff0000ff);
    expect(directional.direction).toMatchObject({ x: 0, y: 0, z: -1 });
    expect(document.lights[0]).toMatchObject({ name: 'sun', node: 0 });
    expect(document.lights[0].transform.position).toMatchObject({ x: 1, y: 2, z: 3 });

    const point = document.lights[1].descriptor as PointLight;
    expect(point.kind).toBe(PointLightKind);
    expect(point.intensity).toBe(3);
    expect(point.range).toBe(10);

    const spot = document.lights[2].descriptor as SpotLight;
    expect(spot.kind).toBe(SpotLightKind);
    expect(spot.innerConeCos).toBeCloseTo(Math.cos(0.25));
    expect(spot.outerConeCos).toBeCloseTo(Math.cos(0.5));
  });

  it('is absent unless the caller imports and supplies it', () => {
    const source: GltfDocument = {
      asset: { version: '2.0' },
      extensions: { KHR_lights_punctual: { lights: [{ type: 'point' }] } },
      extensionsRequired: ['KHR_lights_punctual'],
      nodes: [{ extensions: { KHR_lights_punctual: { light: 0 } } }],
      scenes: [{ nodes: [0] }],
    };
    const diagnostics: ImportDiagnostic[] = [];
    const document = parseGltf(source, diagnostics);

    expect(document.lights).toEqual([]);
    expect(findLightDiagnostic(diagnostics, 'gltf.unsupported-required-extension')).toEqual({
      detail: { count: 1, firstExtension: 'KHR_lights_punctual' },
      kind: 'gltf.unsupported-required-extension',
      origin: 'buildGltfDocument',
      severity: ImportDiagnosticSeverity.Skip,
    });
  });

  it('loads an unhandled optional extension without claiming that it was skipped', () => {
    const source: GltfDocument = {
      asset: { version: '2.0' },
      extensions: { KHR_lights_punctual: { lights: [{ type: 'point' }] } },
      extensionsUsed: ['KHR_lights_punctual'],
      nodes: [{ extensions: { KHR_lights_punctual: { light: 0 } } }],
      scenes: [{ nodes: [0] }],
    };
    const diagnostics: ImportDiagnostic[] = [];
    const document = parseGltf(source, diagnostics);

    // The caller can see a successfully built core document with no realized lights, but the parser's
    // established contract exposes no diagnostic for an extension named only in extensionsUsed.
    expect(document.nodes).toHaveLength(1);
    expect(document.scenes).toHaveLength(1);
    expect(document.lights).toEqual([]);
    expect(diagnostics).toEqual([]);
  });

  it('drops and reports gltf.light-missing for a node referencing a missing light', () => {
    const source: GltfDocument = {
      asset: { version: '2.0' },
      extensions: { KHR_lights_punctual: { lights: [] } },
      nodes: [{ extensions: { KHR_lights_punctual: { light: 5 } } }],
      scenes: [{ nodes: [0] }],
    } as GltfDocument;
    const diagnostics: ImportDiagnostic[] = [];
    const document = parseGltf(source, diagnostics, { extensionHandlers: [GltfPunctualLightsExtensionHandler] });
    expect(document.lights).toHaveLength(0);
    const crumb = findLightDiagnostic(diagnostics, 'gltf.light-missing');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('buildGltfPunctualLight');
    expect(crumb!.detail?.count).toBe(1);
    expect(crumb!.detail?.firstLight).toBe(5);
    expect(crumb!.detail?.firstNode).toBe(0);
  });

  it('drops the light and reports gltf.light-negative-intensity', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const document = parseGltf(makeLightGltf({ intensity: -1, type: 'point' }), diagnostics, {
      extensionHandlers: [GltfPunctualLightsExtensionHandler],
    });
    // Drop (not Recover): the light is omitted — no clamp/substitute — so the document carries no light.
    expect(document.lights).toHaveLength(0);
    const crumb = findLightDiagnostic(diagnostics, 'gltf.light-negative-intensity');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('buildGltfPunctualLight');
    expect(crumb!.detail?.count).toBe(1);
    expect(crumb!.detail?.firstLight).toBe(0);
  });

  it('drops the light and reports gltf.light-non-positive-range', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const document = parseGltf(makeLightGltf({ range: 0, type: 'point' }), diagnostics, {
      extensionHandlers: [GltfPunctualLightsExtensionHandler],
    });
    expect(document.lights).toHaveLength(0);
    const crumb = findLightDiagnostic(diagnostics, 'gltf.light-non-positive-range');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('buildGltfPunctualLight');
    expect(crumb!.detail?.firstLight).toBe(0);
  });

  it('drops the light and reports gltf.light-invalid-spot-cone', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const document = parseGltf(
      makeLightGltf({ spot: { innerConeAngle: 0.6, outerConeAngle: 0.3 }, type: 'spot' }),
      diagnostics,
      {
        extensionHandlers: [GltfPunctualLightsExtensionHandler],
      },
    );
    expect(document.lights).toHaveLength(0);
    const crumb = findLightDiagnostic(diagnostics, 'gltf.light-invalid-spot-cone');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('buildGltfPunctualLight');
    expect(crumb!.detail?.firstLight).toBe(0);
  });

  it('skips and reports gltf.light-unsupported-type', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const document = parseGltf(makeLightGltf({ type: 'area' }), diagnostics, {
      extensionHandlers: [GltfPunctualLightsExtensionHandler],
    });
    // Skip: a recognized light type Flight does not realize (area) — the light is not produced.
    expect(document.lights).toHaveLength(0);
    const crumb = findLightDiagnostic(diagnostics, 'gltf.light-unsupported-type');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Skip);
    expect(crumb!.origin).toBe('buildGltfPunctualLight');
    expect(crumb!.detail?.firstLight).toBe(0);
    expect(crumb!.detail?.firstType).toBe('area');
  });

  it('aggregates repeated light-missing drops across nodes into one crumb with a count', () => {
    const source: GltfDocument = {
      asset: { version: '2.0' },
      extensions: { KHR_lights_punctual: { lights: [] } },
      nodes: [
        { extensions: { KHR_lights_punctual: { light: 3 } } },
        { extensions: { KHR_lights_punctual: { light: 4 } } },
      ],
      scenes: [{ nodes: [0, 1] }],
    } as GltfDocument;
    const diagnostics: ImportDiagnostic[] = [];
    parseGltf(source, diagnostics, { extensionHandlers: [GltfPunctualLightsExtensionHandler] });
    const matching = diagnostics.filter((d) => d.kind === 'gltf.light-missing');
    expect(matching).toHaveLength(1);
    expect(matching[0].detail?.count).toBe(2);
    expect(matching[0].detail?.firstLight).toBe(3);
  });

  it('emits no diagnostics when no collector array is supplied', () => {
    expect(() =>
      parseGltf(makeLightGltf({ intensity: -1, type: 'area' }), undefined, {
        extensionHandlers: [GltfPunctualLightsExtensionHandler],
      }),
    ).not.toThrow();
  });
});
