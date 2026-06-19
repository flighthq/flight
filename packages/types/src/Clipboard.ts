// A title/URL pair captured from the clipboard's bookmark format (a hyperlink with a display title).
export interface ClipboardBookmark {
  title: string;
  url: string;
}

// System clipboard seam. Free functions in @flighthq/clipboard delegate to the active ClipboardBackend
// (web default or a native host's). Read operations resolve to '' / false when the host denies or lacks
// access rather than throwing — clipboard access is an expected-failure surface, not a programmer error.
export interface ClipboardBackend {
  readText(): Promise<string>;
  writeText(text: string): Promise<boolean>;
  readHTML(): Promise<string>;
  writeHTML(html: string): Promise<boolean>;
  hasText(): Promise<boolean>;
  // Reads an image from the clipboard as a data URL, or '' when none is present or access is denied.
  readImage(): Promise<string>;
  // Writes an image (given as a data URL) to the clipboard. Returns false when access is denied.
  writeImage(dataURL: string): Promise<boolean>;
  hasImage(): Promise<boolean>;
  // Reads RTF (Rich Text Format) markup from the clipboard, or '' when none is present or access is denied.
  readRTF(): Promise<string>;
  // Writes RTF (Rich Text Format) markup to the clipboard. Returns false when access is denied.
  writeRTF(rtf: string): Promise<boolean>;
  // Reads a bookmark (title + URL) from the clipboard, or null when none is present or access is denied.
  readBookmark(): Promise<ClipboardBookmark | null>;
  // Writes a bookmark (title + URL) to the clipboard. Returns false when access is denied.
  writeBookmark(title: string, url: string): Promise<boolean>;
  clear(): Promise<boolean>;
}
