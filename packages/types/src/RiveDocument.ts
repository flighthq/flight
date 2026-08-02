import type { DisplayObject } from './DisplayObject';
import type { PathWinding } from './ShapeCommand';

/**
 * Rive `.riv` container types used by `@flighthq/scene2d-formats`.
 *
 * A `.riv` file is not a document tree on the wire — it is a flat stream of **core objects**, each a
 * numeric type key followed by numeric property keys and their values. Hierarchy, artboards,
 * animations, and state machines are all reconstructed *from* that stream by later stages. These
 * types model the container faithfully and nothing more, so the decode step stays separable from
 * every interpretation built on it.
 */

/**
 * Wire field codes. The file's table of contents stores one of these per property key using two
 * bits, which is what lets a reader skip a property whose meaning it does not know — the code says
 * how many bytes to consume even when the key is meaningless to the reader.
 *
 * A boolean is carried as a single byte valued 0 or 1. That is byte-identical to a one-byte varuint
 * for those two values, which is why booleans need no code of their own and travel as `Uint`.
 */
export const RiveFieldType = {
  /** Unsigned LEB128, variable width. */
  Uint: 0,
  /** Varuint byte length followed by that many raw bytes; UTF-8 when read as text. */
  String: 1,
  /** IEEE-754 binary32, little-endian, always four bytes. */
  Double: 2,
  /** Unsigned 32-bit, little-endian, always four bytes. Carries a packed color. */
  Color: 3,
} as const;

export type RiveFieldType = (typeof RiveFieldType)[keyof typeof RiveFieldType];

/** A decoded property value. `String` fields surface as text; every other field is numeric. */
export type RiveValue = number | string;

/**
 * One property of one core object. The field type is retained alongside the value because it is what
 * made the value readable, and because a later mapping stage needs it to tell a color from a plain
 * unsigned integer — both of which arrive as numbers.
 */
export interface RiveProperty {
  key: number;
  type: RiveFieldType;
  value: RiveValue;
}

/**
 * One object in the file's flat stream. `typeKey` identifies which Rive core type this is; the
 * container assigns it no meaning. Properties appear in the order the file stated them.
 */
export interface RiveCoreObject {
  properties: RiveProperty[];
  typeKey: number;
}

/** A single table-of-contents entry: the field type the file declares for one property key. */
export interface RivePropertyFieldType {
  key: number;
  type: RiveFieldType;
}

/**
 * The file header. `fileId` may legitimately be zero. The table of contents is the file's own
 * forward-compatibility mechanism: it declares the wire width of property keys so a reader that
 * predates a property can still traverse past it.
 */
export interface RiveDocumentHeader {
  fileId: number;
  majorVersion: number;
  minorVersion: number;
  tableOfContents: RivePropertyFieldType[];
}

/** A decoded `.riv` container: its header, and the core-object stream in file order. */
export interface RiveDocument {
  header: RiveDocumentHeader;
  objects: RiveCoreObject[];
}

/**
 * One artboard's component tree, recovered from the flat stream.
 *
 * `objects` is the artboard's own numbering space: **the artboard itself is index 0**, followed by
 * its components in stream order. That numbering is what `parentId` indexes into, so it is the
 * artboard rather than the file that gives a component its address.
 */
export interface RiveArtboardGraph {
  objects: RiveCoreObject[];
  /**
   * The parent of each entry in `objects`, as an index into that same array. The artboard at index 0
   * has no parent and carries -1, as does any component whose stated parent could not be resolved.
   */
  parentIndices: number[];
}

/** Every artboard in a `.riv`, each with its component tree resolved. */
export interface RiveObjectGraph {
  artboards: RiveArtboardGraph[];
}

/**
 * One imported artboard. A `.riv` holds several, so import returns them side by side rather than
 * choosing one; the artboard's own size travels with its subtree because nothing in the display tree
 * records it.
 */
export interface RiveArtboardImport {
  height: number;
  name: string;
  root: DisplayObject;
  width: number;
}

/**
 * One path already resolved into its owning shape's space. Paint is applied per shape rather than
 * per path, so the shape holds its paths until the whole paint list is known.
 */
export interface RivePathRecord {
  commands: number[];
  data: number[];
  winding: PathWinding;
}

/** The result of importing a `.riv`: every artboard it declares, in file order. */
export interface RiveDocumentImportResult {
  artboards: RiveArtboardImport[];
}
