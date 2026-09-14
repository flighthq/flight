import type { GltfExtensionHandler } from '@flighthq/types/contract';

import { GltfAnisotropyExtensionHandler } from './gltfAnisotropy';
import { GltfClearcoatExtensionHandler } from './gltfClearcoat';
import { GltfEmissiveStrengthExtensionHandler } from './gltfEmissiveStrength';
import { registerGltfExtensionHandler } from './gltfExtensionHandlerRegistry';
import { GltfIridescenceExtensionHandler } from './gltfIridescence';
import { GltfSheenExtensionHandler } from './gltfSheen';
import { GltfSpecularExtensionHandler } from './gltfSpecular';
import { GltfSpecularGlossinessExtensionHandler } from './gltfSpecularGlossiness';
import {
  GltfIorExtensionHandler,
  GltfTransmissionExtensionHandler,
  GltfVolumeExtensionHandler,
} from './gltfTransmissionVolume';
import { GltfUnlitExtensionHandler } from './gltfUnlit';

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
