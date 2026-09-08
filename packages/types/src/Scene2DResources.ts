import type { AudioResourceFetch, AudioResourceReference } from './AudioResourceReference';
import type { Entity } from './Entity';
import type { ImageResourceFetch, ImageResourceReference } from './ImageResourceReference';
import type { Node2D } from './Node2D';
import type { Scene2DDocument, Scene2DSlotReference } from './Scene2DDocument';
import type { Signal } from './Signal';

export interface Scene2DDocumentFetchProgress {
  loaded: number;
  total: number;
  url: string;
}

export type Scene2DDocumentFetcher = (
  url: string,
  signal: AbortSignal,
  progress: Signal<(event: Readonly<Scene2DDocumentFetchProgress>) => void> | null,
) => Promise<Uint8Array | null>;

export interface Scene2DDocumentImportContext {
  mimeType: string | null;
  url: string | null;
}

export type Scene2DDocumentImporter = (
  source: Uint8Array,
  context: Readonly<Scene2DDocumentImportContext>,
) => Scene2DDocument | null;

export type Scene2DDocumentImporterMatcher = (
  source: Uint8Array,
  context: Readonly<Scene2DDocumentImportContext>,
) => boolean;

export interface Scene2DDocumentImporterEntry {
  importDocument: Scene2DDocumentImporter;
  kind: string;
  matches: Scene2DDocumentImporterMatcher;
}

export interface Scene2DDocumentImporterRegistry extends Entity {
  entries: Scene2DDocumentImporterEntry[];
}

export interface Scene2DDocumentLoadOptions {
  mimeType?: string | null;
  progress?: Signal<(event: Readonly<Scene2DDocumentFetchProgress>) => void>;
  signal?: AbortSignal;
}

// Receives the whole reference rather than its fields so the seam stays stable as slots gain fields.
export type Scene2DSlotContentResolver = (reference: Readonly<Scene2DSlotReference>) => Node2D | null;

export interface Scene2DSlotResolution {
  content: Node2D;
  reference: Scene2DSlotReference;
}

export interface Scene2DResources {
  document: Scene2DDocument;
  resolved: Scene2DSlotResolution[];
  root: Node2D;
  unresolved: Scene2DSlotReference[];
}

export interface ResolveScene2DResourcesOptions {
  resolveSlotContent?: Scene2DSlotContentResolver;
  select?: (reference: Readonly<Scene2DSlotReference>) => boolean;
}

export interface Scene2DImageResourceLoadProgress {
  loaded: number;
  reference: ImageResourceReference;
  total: number;
}

// Counted by reference rather than by waiting Texture: a document that places one bitmap a hundred times
// reports one resolution, which is also exactly one decode.
export interface Scene2DImageResources {
  document: Scene2DDocument;
  resolved: ImageResourceReference[];
  unresolved: ImageResourceReference[];
}

export interface LoadScene2DImageResourcesOptions {
  // Resolves an External reference's uri. A document whose images are all embedded never needs one.
  fetch?: ImageResourceFetch;
  progress?: Signal<(event: Readonly<Scene2DImageResourceLoadProgress>) => void>;
  select?: (reference: Readonly<ImageResourceReference>) => boolean;
  signal?: AbortSignal;
}

export interface Scene2DAudioResourceLoadProgress {
  loaded: number;
  reference: AudioResourceReference;
  total: number;
}

export interface Scene2DAudioResources {
  document: Scene2DDocument;
  resolved: AudioResourceReference[];
  unresolved: AudioResourceReference[];
}

export interface LoadScene2DAudioResourcesOptions {
  // The platform decoder every standard container goes through. Null when each selected reference resolves
  // through a registered decoder or the fetch seam, so a host with no Web Audio never has to build one.
  context?: AudioContext | null;
  // Resolves an External reference's uri. A document whose sounds are all embedded never needs one.
  fetch?: AudioResourceFetch;
  progress?: Signal<(event: Readonly<Scene2DAudioResourceLoadProgress>) => void>;
  select?: (reference: Readonly<AudioResourceReference>) => boolean;
  signal?: AbortSignal;
}

// One aggregate lane in explainScene2DResourceCoverage. Counts are document-wide rather than scoped
// to the last load selection, so a caller can ask one stable question after any combination of loads.
export interface Scene2DResourceCoverageCount {
  readonly resolved: number;
  readonly total: number;
}

// Complete when every authored image/audio reference is resolved and every required application slot
// has content. Optional slots deliberately do not affect completeness.
export interface Scene2DResourceCoverageExplanation {
  readonly audioResources: Readonly<Scene2DResourceCoverageCount>;
  readonly complete: boolean;
  readonly imageResources: Readonly<Scene2DResourceCoverageCount>;
  readonly requiredSlots: Readonly<Scene2DResourceCoverageCount>;
}

export type Scene2DResourceFailureOperation =
  | 'createScene2DDocumentFromBytes'
  | 'loadScene2DAudioResources'
  | 'loadScene2DDocumentFromUrl'
  | 'loadScene2DImageResources'
  | 'resolveScene2DResources';

export type Scene2DResourceFailureReason =
  | 'audio-resources-unresolved'
  | 'document-fetch-failed'
  | 'document-import-failed'
  | 'document-importer-missing'
  | 'image-resources-unresolved'
  | 'required-slots-unresolved';

// Plain-data notice installed by enableScene2DResourceFailureGuards. The aggregate counts keep the
// hook operation-scoped and avoid retaining document graphs in diagnostic sinks.
export interface Scene2DResourceFailureNotice {
  readonly operation: Scene2DResourceFailureOperation;
  readonly reason: Scene2DResourceFailureReason;
  readonly total: number;
  readonly unresolved: number;
  readonly url: string | null;
}

export type Scene2DResourceFailureGuard = (notice: Readonly<Scene2DResourceFailureNotice>) => void;
