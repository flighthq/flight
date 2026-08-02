import type { GltfDocument, GltfTextureInfo } from './GltfSchema';
import type { ImportDiagnostic } from './ImportDiagnostic';
import type { Scene3DDocument } from './Scene3DDocument';
import type { Texture, TextureColorSpace } from './Texture';
import type { Transform3D } from './Transform3D';

// The deliberately small context an individually imported glTF extension handler receives. Core parsing
// has already decomposed nodes/materials/meshes before handlers run. Handlers append only the document
// facts their named extension owns; they do not fetch resources or reach into parser-private buffers.
// A handler that drops/skips/recovers input records structured crumbs onto `diagnostics` (the same raw
// array the parser functions accept), aggregating repeated per-element faults itself.
// `document.materials` is INDEX-ALIGNED with `source.materials` — the core builds one document material
// per glTF material, in order — so a material-extension handler addresses its target by the same index
// the glTF file uses, with no lookup table. `resolveTexture` is the core's own texture resolver, exposed
// because an extension's texture references have to become the same Unresolved refs the base material's
// do (same sampler, same color space, same KHR_texture_transform handling); a handler that built its own
// would produce refs `loadScene3DResources` does not recognize.
export interface GltfExtensionContext {
  buildNodeTransform(node: number): Transform3D;
  diagnostics?: ImportDiagnostic[];
  document: Scene3DDocument;
  nodeIndices: readonly number[];
  resolveTexture(info: Readonly<GltfTextureInfo> | undefined, colorSpace: TextureColorSpace): Texture | null;
  source: Readonly<GltfDocument>;
}

// One open glTF extension atom. Callers import only the handlers their asset pipeline accepts and pass
// them through GltfImportOptions.extensionHandlers. No global registry or registerAll assembly exists.
export interface GltfExtensionHandler {
  apply(context: Readonly<GltfExtensionContext>): void;
  kind: string;
}

// Caller-owned synchronous import inputs. External geometry bytes are supplied explicitly; image URIs
// remain unresolved for scene-resources. Extension handlers are likewise explicit and individually
// imported, so accepting one extension never installs or bundles the family.
export interface GltfImportOptions {
  basePath?: string | null;
  extensionHandlers?: readonly GltfExtensionHandler[];
  externalBuffers?: Readonly<Record<string, ArrayLike<number>>>;
}
