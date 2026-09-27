import type { ImportDiagnostic } from './ImportDiagnostic.ts';
import type { TiledMap } from './TiledMap.ts';
import type { TiledParseOptions } from './TiledParseOptions.ts';
import type { TiledTileset } from './TiledTileset.ts';
import type { TilemapFormatKind } from './TilemapFormatKind.ts';

/**
 * What one map format contributes: the test that recognises its document and the parser that reads it.
 *
 * A map document and a tileset document are DIFFERENT results — `TiledMap` against `TiledTileset` — which is why
 * the two roles are separate types rather than one entry with a union return. A union would make every caller
 * re-discriminate what the registry already knew, and would let a tileset parser be installed where a map is
 * expected without a type error.
 */
export interface TilemapFormatEntry {
  detect: (text: string) => boolean;
  parse: (text: string, options?: Readonly<TiledParseOptions>, diagnostics?: ImportDiagnostic[]) => TiledMap | null;
}

/** One map format as a single value: the kind it registers under and the entry that reads it. */
export interface TilemapFormatDescriptor {
  readonly entry: TilemapFormatEntry;
  readonly kind: TilemapFormatKind;
}

/** What one tileset format contributes. The tileset counterpart of `TilemapFormatEntry`. */
export interface TilesetFormatEntry {
  detect: (text: string) => boolean;
  parse: (text: string, options?: Readonly<TiledParseOptions>, diagnostics?: ImportDiagnostic[]) => TiledTileset | null;
}

/** One tileset format as a single value: the kind it registers under and the entry that reads it. */
export interface TilesetFormatDescriptor {
  readonly entry: TilesetFormatEntry;
  readonly kind: TilemapFormatKind;
}

/**
 * Which tilemap-domain formats an import installs.
 *
 * ★ TWO FIELDS BECAUSE THE TWO ROLES PRODUCE DIFFERENT TYPES, not because the formats differ in cost. A build
 * whose content is all standalone tilesets never names `mapFormats` and never links a map parser, and the
 * reverse holds — the same split, for the same reason, as `RiveImportOptions`.
 *
 * ★ ORDER IS NOT LOAD-BEARING WITHIN EITHER FIELD. Every built-in detector asks ONE shared discrimination
 * (`readTilemapFormatKind`) and answers only for its own kind, so no document is accepted by two; that is
 * measured by reversing the presets, not asserted. A caller may reorder or subset either list.
 *
 * ★ PLAIN DATA A CALLER STATES, NOT SOMETHING A BUILD GENERATES. An earlier version of this comment promised a
 * generated manifest module would name the one format a document needs. It cannot: installing any subset goes
 * through the applier, the applier reaches the registry initializer, and the initializer seeds the FULL preset — so
 * a build that named one format linked every sibling codec anyway. Measured on a real production bundle, the
 * one-format route cost the same as the all-formats route. A caller who wants one codec imports that codec
 * directly; this list is for a caller who wants the registry and accepts its cost knowingly.
 * Applying them is a separate explicit step — nothing is registered by importing anything.
 */
export interface TilemapImportOptions {
  readonly mapFormats?: readonly Readonly<TilemapFormatDescriptor>[];
  readonly tilesetFormats?: readonly Readonly<TilesetFormatDescriptor>[];
}
