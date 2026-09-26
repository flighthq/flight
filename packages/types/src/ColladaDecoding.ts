import type { ImportDiagnostic } from './ImportDiagnostic.ts';
import type { Scene3DDocument } from './Scene3DDocument.ts';
import type { XmlElement } from './XmlElement.ts';

/**
 * The intermediate shapes COLLADA decoding produces, between reading an element and building a node.
 *
 * ★ HERE RATHER THAN IN THE FORMAT PACKAGE BECAUSE THEY BECAME PUBLIC. They were module-private to
 * `colladaParse` while only that file threaded them between its own phases. Once the decoders became a
 * registrable family, the shared parse context has to expose them — a caller supplying its own decoder
 * can only write what the scene builder later reads — and every exported type lives in this package.
 * Moving them changed no field: the decoders and the scene builder read exactly what they read before.
 */
export interface ColladaDecodedSkin {
  bindShapeMatrix: number[];
  controllerId: string;
  geometryRef: string;
  influences: Array<Array<{ joint: string; weight: number }>>;
  inverseBindMatrices: number[][];
  jointNames: string[];
  jointSids: string[];
}
export interface ColladaDecodedAnimationChannel {
  target: string;
  times: number[];
  values: number[];
  interpolation: string[];
  inTangents: number[];
  outTangents: number[];
}
export interface ColladaPerspectiveCameraDefinition {
  aspect: number;
  far: number;
  fovY: number;
  kind: 'perspective';
  name?: string;
  near: number;
}
export interface ColladaOrthographicCameraDefinition {
  far: number;
  halfHeight: number;
  halfWidth: number;
  kind: 'orthographic';
  name?: string;
  near: number;
}
export type ColladaCameraDefinition = ColladaOrthographicCameraDefinition | ColladaPerspectiveCameraDefinition;
export interface ColladaDecodedMorph {
  controllerId: string;
  baseGeometry: string;
  method: 'RELATIVE' | 'NORMALIZED';
  targets: string[];
  weights: number[];
}
export type ColladaLightKind = 'ambient' | 'directional' | 'point' | 'spot';
export interface ColladaLightDefinition {
  color: number;
  decay: number;
  innerConeDegrees: number;
  intensity: number;
  kind: ColladaLightKind;
  name?: string;
  outerConeDegrees: number;
  spotBlend: number;
}

/**
 * The state one COLLADA parse threads between its decoders and its scene builder.
 *
 * ★ WHY A CONTEXT AT ALL. The six feature paths used to be inline phases of one function, each writing
 * locals the scene builder then read as fifteen positional parameters. That works for exactly one
 * composition — the whole thing — and nothing else: a caller wanting geometry without animation had no
 * seam to cut at, and the parser paid for every feature whether the document used it or not. Naming the
 * state explicitly is what lets a decoder be a value rather than a paragraph.
 *
 * Every map is OWNED BY ONE DECODER and read by the scene builder. That ownership is the reason omitting
 * a decoder is safe: its map stays empty, and the builder treats an absent id exactly as it already
 * treats one the document never declared.
 *
 * The maps are mutable by design — a decoder's whole job is to fill its own — while the fields
 * themselves are `readonly` so a decoder cannot swap a caller's map for its own and lose what another
 * decoder wrote into it.
 */
export interface ColladaParseContext {
  /** Animation channels, owned by the animation decoder. */
  readonly animationChannels: ColladaDecodedAnimationChannel[];
  /** Resolved against relative texture references; null when the caller supplied no base. */
  readonly baseUrl: string | null;
  /** Camera definitions by id, owned by the camera decoder. */
  readonly cameraDefinitions: Map<string, ColladaCameraDefinition | null>;
  readonly diagnostics: ImportDiagnostic[];
  /** The document being built. Decoders append resources and meshes; the builder adds nodes. */
  readonly document: Scene3DDocument;
  /** Geometry id to mesh index, owned by the geometry decoder. */
  readonly geometryIdToMeshIndex: Map<string, number>;
  /** Geometry id to its flattened positions, owned by the geometry decoder. */
  readonly geometryPositions: Map<string, number[]>;
  /** Geometry id to the material symbols its primitives name, owned by the geometry decoder. */
  readonly geometryPrimitiveSymbols: Map<string, string[]>;
  /** Light definitions by id, owned by the light decoder. */
  readonly lightDefinitions: Map<string, ColladaLightDefinition | null>;
  /** Material id to index in `document.materials`, owned by the material decoder. */
  readonly materialIndices: Map<string, number>;
  /** Morph controllers by controller id, owned by the controller decoder. */
  readonly morphs: Map<string, ColladaDecodedMorph>;
  /** The parsed COLLADA root. */
  readonly root: XmlElement;
  /** Skin controllers by controller id, owned by the controller decoder. */
  readonly skins: Map<string, ColladaDecodedSkin>;
}

/**
 * One COLLADA feature decoder: reads the elements it claims out of the context's root and writes what
 * it decoded back into the context.
 *
 * ★ SIDE-EFFECT-FREE AT MODULE SCOPE, AND OPT-IN. A decoder is a plain value; importing one registers
 * nothing and starts nothing. A caller chooses a family and passes it to `parseCollada`, and the
 * families it leaves out are absent from the module graph rather than merely unreferenced in it — which
 * is the whole reason this is a family of values and not a switch inside the parser.
 *
 * `decode` writes ONLY into the context's own maps and the document. It returns nothing because there
 * is nothing a caller could do with a return value that the context does not already hold, and because
 * a decoder that returned state would invite two sources of truth for the same feature.
 */
export interface ColladaElementDecoder {
  /** The COLLADA elements this decoder reads, by local name. */
  readonly elements: readonly string[];
  /** The features it provides, matching the analyzer's feature vocabulary. */
  readonly features: readonly string[];
  decode(context: Readonly<ColladaParseContext>): void;
}
