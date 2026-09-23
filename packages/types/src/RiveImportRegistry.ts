import type { DisplayObject } from './DisplayObject';
import type { Entity } from './Entity';
import type { ImportDiagnostic } from './ImportDiagnostic';
import type {
  RiveAdvancedBlend,
  RiveArtboardGraph,
  RiveCoreObject,
  RiveFileAsset,
  RiveLayoutImport,
  RivePathRecord,
  RiveSkeleton2DImport,
  RiveStateMachineDescriptor,
} from './RiveDocument';

/**
 * The seam that turns a Rive core object type into imported content.
 *
 * A `.riv` names everything by number: an object states a type key and nothing else, and behaviour is
 * inherited, so `Rectangle` is a `ParametricPath` is a `Path`. An importer registered for `Path`
 * therefore serves every path the format has or will add. That is why the registry is keyed by type
 * key and resolved along the inheritance chain rather than by an exhaustive union — the object model
 * has 368 types and grows with the editor, and a closed switch turns each new one into a silent
 * container.
 *
 * The three members are the three moments a family can act at, and a family registers only the ones
 * it needs:
 *
 * - `importComponent` runs as an artboard's components are walked, in file order, and returns the
 *   display object that component becomes — or `null` when the object is data belonging to a node
 *   above it (a fill, a gradient stop, a clipping shape). Returning `null` still counts as handled:
 *   an object with no importer at all is what gets reported as unregistered.
 * - `applyArtboard` runs once per artboard after the whole component tree exists, for work that
 *   cannot be done while the tree is half-built — clipping resolves a source node that may appear
 *   later in the stream, draw order reorders siblings, a solo hides the ones it does not name.
 * - `applyDocument` runs once over the file's whole object stream, for content that is not a
 *   component and so has no place in any artboard's numbering — the file's assets.
 *
 * Registration is what *enables* a family: an unregistered type contributes nothing and is reported,
 * which is what lets a caller import geometry without paint, or a document without its state
 * machines, and pay for neither.
 */
export interface RiveCoreObjectHandler {
  applyArtboard?: (context: RiveArtboardImportContext) => void;
  applyDocument?: (context: RiveDocumentImportContext) => void;
  importComponent?: (context: RiveArtboardImportContext, index: number) => DisplayObject | null;
}

/**
 * Everything one artboard's handlers read and write while it is being built.
 *
 * The context is deliberately one mutable value rather than a threaded argument list: a family
 * contributes to the artboard by writing its own field, and stays ignorant of every other family's.
 * `nodes` is index-for-index with `artboard.objects`, carrying `null` where a component became no
 * display object, so a later pass can resolve a stated component index to the node it produced.
 */
export interface RiveArtboardImportContext extends Entity {
  /** Nodes whose blend mode must be realized through a `BlendEffect` rather than blend state. */
  advancedBlends: RiveAdvancedBlend[];
  artboard: RiveArtboardGraph;
  diagnostics: ImportDiagnostic[] | undefined;
  /** The file's asset names, positionally addressed — a text style names its typeface by position. */
  fontNames: readonly string[];
  layouts: RiveLayoutImport[];
  nodes: Array<DisplayObject | null>;
  /** The file's whole core-object stream: animations and state machines are not components. */
  objects: readonly RiveCoreObject[];
  /** How to regenerate each shape's geometry and paint from current property values, by shape index. */
  rebuilds: Map<number, () => void>;
  registry: RiveImportRegistry;
  root: DisplayObject;
  /** Each shape's paths, by shape index, in the order the file lists them. */
  shapePaths: Map<number, RivePathRecord[]>;
  skeleton: RiveSkeleton2DImport | null;
  stateMachines: RiveStateMachineDescriptor[];
}

/** Everything a document-wide importer reads and writes, for content that belongs to no artboard. */
export interface RiveDocumentImportContext extends Entity {
  assets: RiveFileAsset[];
  diagnostics: ImportDiagnostic[] | undefined;
  objects: readonly RiveCoreObject[];
  registry: RiveImportRegistry;
}

/**
 * Which Rive core types an import understands, and what each one becomes.
 *
 * Insertion order is the order `applyArtboard` and `applyDocument` run in, so a registrar that
 * installs a whole family also fixes that family's place in the sequence. The built-in registrar
 * installs them in the order the passes depend on each other.
 */
export interface RiveImportRegistry {
  handlers: Map<number, RiveCoreObjectHandler>;
}
