import type { EntityRaw } from '@flighthq/entity/contract';
import type { Signal } from '@flighthq/signals/contract';

export const ClipboardFormatBookmark = 'text/x-moz-url';
export const ClipboardFormatHtml = 'text/html';
export const ClipboardFormatImage = 'image/png';
export const ClipboardFormatRtf = 'text/rtf';
export const ClipboardFormatText = 'text/plain';
export const ClipboardFormatUriList = 'text/uri-list';

/** A title/URL pair captured from the clipboard's bookmark format. */
export interface ClipboardBookmark {
  title: string;
  url: string;
}

/** One format/data pair for an atomic multi-format write. */
export interface ClipboardWriteItem {
  format: string;
  data: string;
}

/** Bookmark transport, provided only by hosts with a bookmark pasteboard format. */
export interface HostClipboardBookmarkCapability {
  readBookmark(): Promise<ClipboardBookmark | null>;
  writeBookmark(title: string, url: string): Promise<boolean>;
}

/** Optional clipboard change delivery. */
export interface HostClipboardChangeCapability {
  subscribe?(callback: () => void): () => void;
}

/** Rich and arbitrary flavored clipboard transport. */
export interface HostClipboardFormatsCapability {
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

/** Image clipboard transport using data URLs at the host boundary. */
export interface HostClipboardImageCapability {
  hasImage(): Promise<boolean>;
  readImage(): Promise<string>;
  writeImage(dataUrl: string): Promise<boolean>;
}

/** Plain-text transport and clearing. */
export interface HostClipboardTextCapability {
  clear(): Promise<boolean>;
  hasText(): Promise<boolean>;
  readText(): Promise<string>;
  writeText(text: string): Promise<boolean>;
}

/** Clipboard capability group. An omitted slot is capability absence. */
export interface HostClipboardCapabilities {
  readonly bookmark?: HostClipboardBookmarkCapability;
  readonly change?: HostClipboardChangeCapability;
  readonly formats?: HostClipboardFormatsCapability;
  readonly image?: HostClipboardImageCapability;
  readonly text?: HostClipboardTextCapability;
}

/** Clipboard change event entity. */
export interface ClipboardWatch extends EntityRaw {
  onChange: Signal<void>;
}
