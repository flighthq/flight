import type { ShareFile } from './ShareFile';

// Share seam. Free functions in @flighthq/share delegate to the active ShareBackend (web default over
// navigator.share, or a native host's). share resolves to false when the host denies, cancels, or
// lacks the capability rather than throwing — sharing is an expected-failure surface, not a
// programmer error.

export interface ShareContent {
  title?: string;
  text?: string;
  url?: string;
  // Portable file descriptors (data URL + MIME + name); converted to platform files at the backend
  // boundary (the web backend converts each to a DOM File for navigator.share).
  files?: ShareFile[];
}

// Presentation hints for the share sheet. All optional; backends ignore the ones they cannot honor.
export interface ShareOptions {
  // Title shown on the share chooser (Android chooser title).
  chooserTitle?: string;
  // Activity/app identifiers to omit from the share sheet (iOS UIActivityType exclusions).
  excludedActivityTypes?: string[];
}

// Outcome of a share sheet invocation. completed is true when the user finished sharing;
// activityType names the chosen app/activity when the host reports it, otherwise null; dismissed is
// true when the user explicitly cancelled.
export interface ShareResult {
  completed: boolean;
  activityType: string | null;
  dismissed: boolean;
}

export interface ShareBackend {
  // True when the platform can share at all (capability-level probe, independent of content).
  isAvailable(): boolean;
  canShare(content: Readonly<ShareContent>): boolean;
  // Opens the share sheet; resolves false when the host denies, the user cancels, or sharing is
  // unavailable.
  share(content: Readonly<ShareContent>, options?: Readonly<ShareOptions>): Promise<boolean>;
  // Opens the share sheet and resolves a full ShareResult describing completion and the chosen
  // activity.
  shareWithResult(content: Readonly<ShareContent>, options?: Readonly<ShareOptions>): Promise<ShareResult>;
}
