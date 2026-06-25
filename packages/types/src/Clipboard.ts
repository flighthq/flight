// A title/URL pair captured from the clipboard's bookmark format (a hyperlink with a display title).
export interface ClipboardBookmark {
  title: string;
  url: string;
}

// A single format/data pair for an atomic multi-format write. `format` is a MIME/flavor string
// (e.g. 'text/plain', 'image/png'); `data` is its string payload (data URL for image formats).
export interface ClipboardWriteItem {
  format: string;
  data: string;
}

// System clipboard seam. Free functions in @flighthq/clipboard delegate to the active ClipboardBackend
// (web default or a native host's). Read operations resolve to '' / false when the host denies or lacks
// access rather than throwing — clipboard access is an expected-failure surface, not a programmer error.
export interface ClipboardBackend {
  readText(): Promise<string>;
  writeText(text: string): Promise<boolean>;
  readHtml(): Promise<string>;
  writeHtml(html: string): Promise<boolean>;
  hasText(): Promise<boolean>;
  // Reads an image from the clipboard as a data URL, or '' when none is present or access is denied.
  readImage(): Promise<string>;
  // Writes an image (given as a data URL) to the clipboard. Returns false when access is denied.
  writeImage(dataUrl: string): Promise<boolean>;
  hasImage(): Promise<boolean>;
  // Reads RTF (Rich Text Format) markup from the clipboard, or '' when none is present or access is denied.
  readRTF(): Promise<string>;
  // Writes RTF (Rich Text Format) markup to the clipboard. Returns false when access is denied.
  writeRTF(rtf: string): Promise<boolean>;
  // Reads a bookmark (title + URL) from the clipboard, or null when none is present or access is denied.
  readBookmark(): Promise<ClipboardBookmark | null>;
  // Writes a bookmark (title + URL) to the clipboard. Returns false when access is denied.
  writeBookmark(title: string, url: string): Promise<boolean>;
  // Reads an arbitrary MIME/format flavor as a string; '' when absent or access is denied.
  readFormat(format: string): Promise<string>;
  // Writes an arbitrary MIME/format flavor. Returns false when access is denied.
  writeFormat(format: string, data: string): Promise<boolean>;
  // True when the given MIME/format string is currently present on the clipboard.
  hasFormat(format: string): Promise<boolean>;
  // The MIME/format strings currently on the clipboard. [] sentinel on access denied.
  getFormats(): Promise<readonly string[]>;
  // Reads multiple formats in one round-trip; missing formats are omitted from the result.
  readItems(formats: readonly string[]): Promise<Readonly<Record<string, string>>>;
  // Writes multiple formats atomically. Returns false when access is denied.
  writeItems(items: readonly Readonly<ClipboardWriteItem>[]): Promise<boolean>;
  // Reads the file paths currently on the clipboard. [] when none are present or on web.
  readFiles(): Promise<readonly string[]>;
  // Writes file paths to the clipboard. Returns false when access is denied or on web.
  writeFiles(paths: readonly string[]): Promise<boolean>;
  clear(): Promise<boolean>;
  // A monotonically increasing clipboard change count, or -1 when the host does not report it.
  getChangeCount(): number;
  // Registers a listener invoked on any clipboard change; returns an unsubscribe function.
  subscribeClipboardChange(listener: () => void): () => void;
}
