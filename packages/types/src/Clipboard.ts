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

// Bookmark transport is a distinct capability because only native hosts with a bookmark pasteboard
// format can provide it.
export interface ClipboardBookmarkBackend extends Entity {
  readBookmark(): Promise<ClipboardBookmark | null>;
  writeBookmark(title: string, url: string): Promise<boolean>;
}

// Clipboard change delivery is optional at the method level so a consumer trait can make the
// subscribe/unsubscribe teardown obligation explicit as one eligibility edge.
export interface ClipboardChangeBackend extends Entity {
  subscribe?(callback: () => void): void;
  unsubscribe?(callback: () => void): void;
}

// Rich and arbitrary flavored clipboard transport. HTML and RTF share this slot with the generic
// format/item operations because provider coverage varies as one unit.
export interface ClipboardFormatsBackend extends Entity {
  getFormats(): Promise<readonly string[]>;
  hasFormat(format: string): Promise<boolean>;
  readFormat(format: string): Promise<string>;
  readHtml(): Promise<string>;
  readItems(formats: readonly string[]): Promise<Readonly<Record<string, string>>>;
  readRTF(): Promise<string>;
  writeFormat(format: string, data: string): Promise<boolean>;
  writeHtml(html: string): Promise<boolean>;
  writeItems(items: readonly Readonly<ClipboardWriteItem>[]): Promise<boolean>;
  writeRTF(rtf: string): Promise<boolean>;
}

// Image clipboard transport uses data URLs at Flight's host boundary.
export interface ClipboardImageBackend extends Entity {
  hasImage(): Promise<boolean>;
  readImage(): Promise<string>;
  writeImage(dataUrl: string): Promise<boolean>;
}

// Plain-text transport and clearing vary together across every shipped provider.
export interface ClipboardTextBackend extends Entity {
  clear(): Promise<boolean>;
  hasText(): Promise<boolean>;
  readText(): Promise<string>;
  writeText(text: string): Promise<boolean>;
}
import type { Entity } from './Entity';
