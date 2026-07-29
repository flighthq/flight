import type { Entity } from './Entity';
import type { Node2D } from './Node2D';
import type {
  Scene2DAssetReference,
  Scene2DContentReference,
  Scene2DContentReferenceKind,
  Scene2DDocument,
  Scene2DSlotReference,
} from './Scene2DDocument';
import type { Signal } from './Signal';

export type Scene2DAssetContentLoader = (
  reference: Readonly<Scene2DAssetReference>,
  signal: AbortSignal,
) => Promise<Node2D | null>;

export type Scene2DAssetContentResolver = (reference: Readonly<Scene2DAssetReference>) => Node2D | null;

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

export interface Scene2DResourceLoadProgress {
  kind: Scene2DContentReferenceKind;
  loaded: number;
  name: string;
  total: number;
}

export interface Scene2DResourceResolution {
  content: Node2D;
  reference: Scene2DContentReference;
}

export interface Scene2DResources {
  document: Scene2DDocument;
  resolved: Scene2DResourceResolution[];
  root: Node2D;
  unresolved: Scene2DContentReference[];
}

export type Scene2DSlotContentResolver = (
  name: string,
  linkage: string | null,
  reference: Readonly<Scene2DSlotReference>,
) => Node2D | null;

export interface ResolveScene2DResourcesOptions {
  resolveAssetContent?: Scene2DAssetContentResolver;
  resolveSlotContent?: Scene2DSlotContentResolver;
  select?: (reference: Readonly<Scene2DContentReference>) => boolean;
}

export interface LoadScene2DResourcesOptions extends Omit<ResolveScene2DResourcesOptions, 'resolveAssetContent'> {
  loadAssetContent: Scene2DAssetContentLoader;
  progress?: Signal<(event: Readonly<Scene2DResourceLoadProgress>) => void>;
  signal?: AbortSignal;
}
