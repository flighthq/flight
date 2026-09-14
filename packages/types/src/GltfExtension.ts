import type { GltfDocument, GltfTextureInfo } from './GltfSchema';
import type { ImportDiagnostic, ImportDiagnosticSeverity } from './ImportDiagnostic';
import type { Scene3DDocument } from './Scene3DDocument';
import type { Texture, TextureColorSpace } from './Texture';
import type { Transform3D } from './Transform3D';

// One accessor result exposed to an optional core-feature handler. The parser retains ownership of byte
// decoding and diagnostic aggregation; a handler receives only the flat values, authored element count,
// and any recoverable decoding fault its feature needs.
export interface GltfAccessorData {
  count: number;
  data: ArrayLike<number>;
  fault: GltfAccessorFault | null;
}

export interface GltfAccessorFault {
  detail: Record<string, number>;
  kind: string;
}

// The core document decomposition shared by the three optional glTF section handlers. Meshes, materials,
// textures, nodes, and scenes already exist when a handler runs. The index maps preserve the source file's
// identities across multi-primitive mesh expansion, while readAccessor/reportDiagnostic keep parser-private
// byte/tally machinery out of each independently bundled handler.
export interface GltfCoreFeatureContext {
  buildNodeTransform(node: number): Transform3D;
  document: Scene3DDocument;
  meshIndices: readonly (readonly number[])[];
  nodeIndices: readonly number[];
  primitiveNodeIndices: readonly (readonly number[])[];
  readAccessor(accessor: number, expectedType?: string): GltfAccessorData;
  reportAccessorFault(severity: ImportDiagnosticSeverity, fault: Readonly<GltfAccessorFault>): void;
  reportDiagnostic(
    severity: ImportDiagnosticSeverity,
    kind: string,
    detail?: Record<string, boolean | number | string>,
    discriminator?: string,
  ): void;
  source: Readonly<GltfDocument>;
}

// One open, source-section-keyed glTF core feature. `kind` is the canonical JSON member identity
// (`animations`, `cameras`, or `skins` for Flight's built-ins), so custom handlers and diagnostics use the
// same name the asset author sees. Registration is caller-owned and duplicate kinds resolve last-write-wins.
export interface GltfCoreFeatureHandler {
  apply(context: Readonly<GltfCoreFeatureContext>): void;
  kind: string;
}

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
// them through GltfImportOptions.extensionHandlers. No global registry exists.
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
