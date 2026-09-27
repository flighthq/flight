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
  /**
   * Turns what this decoder read into scene content, after the node walk.
   *
   * ★ WHY A SECOND STEP EXISTS AT ALL. Half of a COLLADA feature cannot run during `decode`: a camera is
   * declared in a library and INSTANTIATED by a node, so binding one needs the node indices the walk has not
   * produced yet. The parser used to hold that half itself, calling `resolveColladaCameras`,
   * `resolveColladaLights`, `resolveColladaSkins` and `resolveColladaAnimations` by name — which made every
   * caller link all four whatever family they asked for, because the orchestrator named them. Moving it here
   * puts BOTH halves of a feature in the feature's own module, which is what makes omitting one omit its code.
   *
   * Optional: a feature whose whole job finishes during `decode` — materials index themselves and are read by
   * the walk — declares none, and the builder skips it.
   */
  build?(context: Readonly<ColladaBuildContext>): void;
  /**
   * Where this decoder's `build` runs relative to the others; lower runs first. Absent sorts last.
   *
   * The sequence is load-bearing and it is the one the single function ran inline: cameras and lights attach to
   * nodes, skins then rewrite the meshes those nodes point at, and animations address nodes by the index map all
   * three have finished populating. A number rather than an array position so a caller's family order cannot
   * change the parse — the same reason AWD2's handlers carry `buildPhase`.
   */
  readonly buildPhase?: number;
  /** The COLLADA elements this decoder reads, by local name. */
  readonly elements: readonly string[];
  /** The features it provides, matching the analyzer's feature vocabulary. */
  readonly features: readonly string[];
  decode(context: Readonly<ColladaParseContext>): void;
}

/**
 * What a decoder's `build` step is handed: the scene walk's results, plus the deferred instantiations it left.
 *
 * ★ THE DEFERRED LISTS ARE WHY THIS TYPE EXISTS. A COLLADA node says `<instance_camera url="#eye"/>`; the walk
 * cannot resolve that until the camera library is indexed AND the node exists, so it records the pairing and
 * moves on. Each list is OWNED BY ONE DECODER exactly as each map on `ColladaParseContext` is, and a decoder that
 * is absent simply leaves its list unread — the same reason a missing decoder yields a smaller scene rather than
 * a broken one.
 *
 * `parse` is the decode-phase context, carried through so a build step can read the maps it filled without the
 * parser copying them into a second shape.
 */
export interface ColladaBuildContext {
  /** Cameras a node instantiated, owned by the camera decoder. */
  readonly deferredCameras: readonly ColladaDeferredCameraBinding[];
  /** Controllers a node instantiated, owned by the controller decoder. */
  readonly deferredControllers: readonly ColladaDeferredControllerBinding[];
  /** Lights a node instantiated, owned by the light decoder. */
  readonly deferredLights: readonly ColladaDeferredLightBinding[];
  /** COLLADA node id to its index in `document.nodes`, filled by the walk and read by animations and skins. */
  readonly nodeIdMap: ReadonlyMap<string, number>;
  /** The decode-phase context, so a build step reads the maps its own decode filled. */
  readonly parse: Readonly<ColladaParseContext>;
  /** The indices of the scene's root nodes, in document order. */
  readonly rootNodeIndices: readonly number[];
}

/** A controller a node instantiated, waiting for the node walk to finish. */
export interface ColladaDeferredControllerBinding {
  controllerId: string;
  materialOverrides: ReadonlyMap<string, number>;
  nodeIndex: number;
  skeletonRoot: string | null;
}

/** A camera a node instantiated, waiting for the node walk to finish. */
export interface ColladaDeferredCameraBinding {
  cameraId: string;
  nodeIndex: number;
}

/** A light a node instantiated, waiting for the node walk to finish. */
export interface ColladaDeferredLightBinding {
  nodeIndex: number;
  url: string;
}
