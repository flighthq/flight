import type { ImportDiagnostic } from './ImportDiagnostic.ts';
import type { MeshMorph } from './MorphTarget.ts';
import type { Scene3DDocument } from './Scene3DDocument.ts';

/**
 * One decompressed MD2 frame in Flight's Y-up space.
 *
 * `positions` and `normals` are 3 floats per SOURCE MD2 vertex, indexed by the raw MD2 vertex index
 * before triangle re-indexing. `name` is the frame's 16-byte label, which encodes its sub-animation as an
 * action prefix plus a trailing frame number ("stand01".."stand40"); contiguous same-prefix runs are what
 * the animation handler segments into named clips.
 */
export interface Md2Frame {
  name: string;
  normals: Float32Array;
  positions: Float32Array;
}

/**
 * What an MD2 section handler is handed — the parse state it reads and the tables it appends to.
 *
 * The geometry is NOT here to be produced: the header, triangles, texcoords and frame 0 are always read,
 * because without them there is no model at all. What the handlers own are the two sections a build can
 * genuinely do without — the skin records that become materials, and frames 1..N that become morph
 * animation — and each of those is the only reason its package is linked.
 */
export interface Md2ParseContext {
  readonly bytes: Readonly<Uint8Array>;
  readonly diagnostics: ImportDiagnostic[] | undefined;
  readonly document: Scene3DDocument;
  /** Every frame in file order. Frame 0 is the base pose; the rest are the morph targets. */
  readonly frames: readonly Md2Frame[];
  /**
   * Material indices bound to the mesh's single subset.
   *
   * The skin handler appends the FIRST skin it resolves and leaves the rest as alternates in
   * `document.materials`, which is MD2's own model: several skins are alternate diffuse textures for one
   * mesh, one active at a time.
   */
  readonly meshMaterials: number[];
  /** The morph substrate built from frames 1..N, or null for a single-frame model with no motion. */
  readonly morph: MeshMorph | null;
  readonly numSkins: number;
  readonly offSkins: number;
}

/**
 * One MD2 section handler — the unit of opt-in for the MD2 importer.
 *
 * MD2's header describes its content as sections at known offsets, so `section` names which one a handler
 * reads and is the same name `collectMd2Features` reports and `parseMd2Requirements` emits under
 * `document.format`. A handler is a plain value; importing one starts nothing.
 */
export interface Md2SectionHandler {
  readonly section: string;
  collect(context: Md2ParseContext): void;
}

/**
 * What `parseMd2` accepts beyond the bytes.
 *
 * ★ THE HANDLER FAMILY IS THE TREE-SHAKING BOUNDARY. A model read only for its geometry should not pay
 * for `@flighthq/materials` or `@flighthq/animation`, and naming a subset is what drops them. Leaving
 * `sectionHandlers` undefined runs the full standard family, which reproduces the parse this function
 * performed when both sections were read unconditionally.
 */
export interface Md2ImportOptions {
  readonly sectionHandlers?: readonly Readonly<Md2SectionHandler>[];
}
