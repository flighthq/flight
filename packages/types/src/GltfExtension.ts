import type { GltfDocument } from './GltfSchema';
import type { ImportDiagnostic } from './ImportDiagnostic';
import type { SceneDocument } from './SceneDocument';
import type { Transform3D } from './Transform3D';

// The deliberately small context an individually imported glTF extension handler receives. Core parsing
// has already decomposed nodes/materials/meshes before handlers run. Handlers append only the document
// facts their named extension owns; they do not fetch resources or reach into parser-private buffers.
// A handler that drops/skips/recovers input records structured crumbs onto `diagnostics` (the same raw
// array the parser functions accept), aggregating repeated per-element faults itself.
export interface GltfExtensionContext {
  buildNodeTransform(node: number): Transform3D;
  diagnostics?: ImportDiagnostic[];
  document: SceneDocument;
  nodeIndices: readonly number[];
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
