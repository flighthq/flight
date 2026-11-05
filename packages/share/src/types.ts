import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';
import type { Signal } from '@flighthq/signals/contract';

// A portable file descriptor for sharing: the file content as a data URL plus its MIME type and
// display name. Backends convert this to their platform's file type at the share boundary (the web
// backend parses the data URL into a DOM File for navigator.share).
export interface ShareFile {
  name: string;
  mimeType: string;
  dataUrl: string;
}

// Content and file sharing are separate capability slots. A content payload requires at least one
// declared vector, while the runtime probe below the slot rejects empty strings. File sharing has a
// non-empty file tuple and exists only on providers that can actually carry Flight's data-URL files.
export type ShareContent =
  | { readonly text?: string; readonly title: string; readonly url?: string }
  | { readonly text: string; readonly title?: string; readonly url?: string }
  | { readonly text?: string; readonly title?: string; readonly url: string };

export interface ShareFilesContent {
  readonly files: readonly [ShareFile, ...ShareFile[]];
  readonly text?: string;
  readonly title?: string;
  readonly url?: string;
}

// Outcome of a share sheet invocation. completed is true when the user finished sharing;
// activityType names the chosen app/activity when the host reports it, otherwise null; dismissed is
// true when the user explicitly cancelled.
export interface ShareResult {
  completed: boolean;
  activityType: string | null;
  dismissed: boolean;
}

export interface HostShareContentCapability {
  canShareContent(content: Readonly<ShareContent>): boolean;
  shareContent(content: Readonly<ShareContent>): Promise<boolean>;
  shareContentWithResult(content: Readonly<ShareContent>): Promise<ShareResult>;
}

export interface HostShareFilesCapability {
  canShareContent(content: Readonly<ShareFilesContent>): boolean;
  shareContent(content: Readonly<ShareFilesContent>): Promise<boolean>;
  shareContentWithResult(content: Readonly<ShareFilesContent>): Promise<ShareResult>;
}

// Capacitor alone understands a chooser title. Keeping the parameter on the concrete provider type
// prevents the portable Host slot (and the Web provider) from accepting a provider-specific hint.
export interface CapacitorShareContentOptions {
  readonly chooserTitle?: string;
}

export interface HostCapacitorShareContentCapability extends HostShareContentCapability {
  shareContent(content: Readonly<ShareContent>, options?: Readonly<CapacitorShareContentOptions>): Promise<boolean>;
  shareContentWithResult(
    content: Readonly<ShareContent>,
    options?: Readonly<CapacitorShareContentOptions>,
  ): Promise<ShareResult>;
}

// Share result event entity. Enable delivery with attachShareSignals; the signals stay inert until
// then. onShareResult carries the full ShareResult emitted by shareContentWithResult calls.
export interface ShareSignals extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  onShareResult: Signal<Readonly<ShareResult>>;
}
