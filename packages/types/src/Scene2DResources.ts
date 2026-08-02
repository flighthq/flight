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
