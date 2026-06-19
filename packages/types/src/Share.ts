// Share seam. Free functions in @flighthq/share delegate to the active ShareBackend (web default over
// navigator.share, or a native host's). share resolves to false when the host denies, cancels, or
// lacks the capability rather than throwing — sharing is an expected-failure surface, not a
// programmer error.

export interface ShareContent {
  title?: string;
  text?: string;
  url?: string;
}

export interface ShareBackend {
  share(content: Readonly<ShareContent>): Promise<boolean>;
  canShare(content: Readonly<ShareContent>): boolean;
}
