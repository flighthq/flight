import type { GltfExtensionHandler } from '@flighthq/types/contract';

import { GltfAnisotropyExtensionHandler } from './gltfAnisotropy.ts';
import { GltfClearcoatExtensionHandler } from './gltfClearcoat.ts';
import { GltfEmissiveStrengthExtensionHandler } from './gltfEmissiveStrength.ts';
import { registerGltfExtensionHandler } from './gltfExtensionHandlerRegistry.ts';
import { GltfIridescenceExtensionHandler } from './gltfIridescence.ts';
import { GltfSheenExtensionHandler } from './gltfSheen.ts';
import { GltfSpecularExtensionHandler } from './gltfSpecular.ts';
import { GltfSpecularGlossinessExtensionHandler } from './gltfSpecularGlossiness.ts';
import {
  GltfIorExtensionHandler,
  GltfTransmissionExtensionHandler,
  GltfVolumeExtensionHandler,
} from './gltfTransmissionVolume.ts';
import { GltfUnlitExtensionHandler } from './gltfUnlit.ts';

// Registers Flight's glTF material-extension family into a caller-owned extension list.
export function registerGltfMaterialExtensionHandlers(handlers: GltfExtensionHandler[]): void {
  registerGltfExtensionHandler(handlers, GltfAnisotropyExtensionHandler);
  registerGltfExtensionHandler(handlers, GltfClearcoatExtensionHandler);
  registerGltfExtensionHandler(handlers, GltfEmissiveStrengthExtensionHandler);
  registerGltfExtensionHandler(handlers, GltfIridescenceExtensionHandler);
  registerGltfExtensionHandler(handlers, GltfSheenExtensionHandler);
  registerGltfExtensionHandler(handlers, GltfSpecularExtensionHandler);
  registerGltfExtensionHandler(handlers, GltfSpecularGlossinessExtensionHandler);
  registerGltfExtensionHandler(handlers, GltfIorExtensionHandler);
  registerGltfExtensionHandler(handlers, GltfTransmissionExtensionHandler);
  registerGltfExtensionHandler(handlers, GltfVolumeExtensionHandler);
  registerGltfExtensionHandler(handlers, GltfUnlitExtensionHandler);
}
