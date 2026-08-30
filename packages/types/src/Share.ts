import type { Entity } from './Entity';
import type { ShareFile } from './ShareFile';

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

export interface ShareContentBackend extends Entity {
  canShareContent(content: Readonly<ShareContent>): boolean;
  shareContent(content: Readonly<ShareContent>): Promise<boolean>;
  shareContentWithResult(content: Readonly<ShareContent>): Promise<ShareResult>;
}

export interface ShareFilesBackend extends Entity {
  canShareContent(content: Readonly<ShareFilesContent>): boolean;
  shareContent(content: Readonly<ShareFilesContent>): Promise<boolean>;
  shareContentWithResult(content: Readonly<ShareFilesContent>): Promise<ShareResult>;
}

// Capacitor alone understands a chooser title. Keeping the parameter on the concrete provider type
// prevents the portable Host slot (and the Web provider) from accepting a provider-specific hint.
export interface CapacitorShareContentOptions {
  readonly chooserTitle?: string;
}

export interface CapacitorShareContentBackend extends ShareContentBackend {
  shareContent(content: Readonly<ShareContent>, options?: Readonly<CapacitorShareContentOptions>): Promise<boolean>;
  shareContentWithResult(
    content: Readonly<ShareContent>,
    options?: Readonly<CapacitorShareContentOptions>,
  ): Promise<ShareResult>;
}
