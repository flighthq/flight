import type {
  ExtendedPbrMaterial,
  GltfDocument,
  ImportDiagnostic,
  StandardPbrMaterial,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { GltfClearcoatExtensionHandler } from './gltfClearcoat';
import { GltfEmissiveStrengthExtensionHandler } from './gltfEmissiveStrength';
import { parseGltf } from './gltfParse';

function makeGltf(material: unknown): GltfDocument {
  return { asset: { version: '2.0' }, materials: [material], scenes: [{ nodes: [] }] } as GltfDocument;
}

describe('GltfEmissiveStrengthExtensionHandler', () => {
  it('applies the strength the file states', () => {
    const document = parseGltf(
      makeGltf({ emissiveFactor: [1, 1, 1], extensions: { KHR_materials_emissive_strength: { emissiveStrength: 4 } } }),
      undefined,
      { extensionHandlers: [GltfEmissiveStrengthExtensionHandler] },
    );

    expect((document.materials[0] as unknown as StandardPbrMaterial).emissiveStrength).toBeCloseTo(4, 6);
  });

  it('leaves every material at strength 1 when the handler is not imported', () => {
    // The handler is opt-in, so an asset pipeline that does not accept the extension must be unaffected.
    const document = parseGltf(
      makeGltf({ emissiveFactor: [1, 1, 1], extensions: { KHR_materials_emissive_strength: { emissiveStrength: 4 } } }),
    );

    expect((document.materials[0] as unknown as StandardPbrMaterial).emissiveStrength).toBe(1);
  });

  it('follows a material another handler already promoted', () => {
    // Handler order is not guaranteed, so the strength has to land on the standard BLOCK of an already
    // extended material rather than being skipped for no longer being a StandardPbrMaterial.
    const document = parseGltf(
      makeGltf({
        extensions: {
          KHR_materials_clearcoat: { clearcoatFactor: 1 },
          KHR_materials_emissive_strength: { emissiveStrength: 3 },
        },
      }),
      undefined,
      { extensionHandlers: [GltfClearcoatExtensionHandler, GltfEmissiveStrengthExtensionHandler] },
    );

    const extended = document.materials[0] as unknown as ExtendedPbrMaterial;
    expect(extended.standard.emissiveStrength).toBeCloseTo(3, 6);
  });

  it('drops a negative strength and reports it', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const document = parseGltf(
      makeGltf({ extensions: { KHR_materials_emissive_strength: { emissiveStrength: -2 } } }),
      diagnostics,
      { extensionHandlers: [GltfEmissiveStrengthExtensionHandler] },
    );

    expect((document.materials[0] as unknown as StandardPbrMaterial).emissiveStrength).toBe(1);
    const crumb = diagnostics.find((d) => d.kind === 'gltf.emissive-strength-negative');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
  });

  it('satisfies a required-extension declaration so the asset is not reported unsupported', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const source = makeGltf({ extensions: { KHR_materials_emissive_strength: { emissiveStrength: 2 } } });
    source.extensionsRequired = ['KHR_materials_emissive_strength'];
    parseGltf(source, diagnostics, { extensionHandlers: [GltfEmissiveStrengthExtensionHandler] });

    expect(diagnostics.find((d) => d.kind === 'gltf.unsupported-required-extension')).toBeUndefined();
  });
});
