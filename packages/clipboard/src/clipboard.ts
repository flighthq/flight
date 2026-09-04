import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  ClipboardBookmark,
  ClipboardWatch,
  ClipboardWriteItem,
  EntityConstruction,
  HasClipboardBookmark,
  HasClipboardChange,
  HasClipboardFormats,
  HasClipboardImage,
  HasClipboardText,
} from '@flighthq/types/contract';
import { ClipboardFormatHtml, ClipboardFormatRtf } from '@flighthq/types/contract';

// Attaches watch to the explicitly supplied host's clipboard change subscription. Attaching the
// same watch again first releases its prior subscription, even when the new host is different.
export function attachClipboardWatch(host: HasClipboardChange, watch: ClipboardWatch): void {
  detachClipboardWatch(watch);
  const change = host.clipboard.change;
  const callback = () => emitSignal(watch.onChange);
  change.subscribe(callback);
  _watchSubscriptions.set(watch, { callback, change });
}

// Clears the system clipboard. Returns false when the host denies access. Sentinel, not throw.
export function clearClipboard(host: HasClipboardText): Promise<boolean> {
  return host.clipboard.text.clear();
}

// Allocates a ClipboardWatch event entity with an inert signal.
// Call attachClipboardWatch to start delivery; call disposeClipboardWatch when done.
export function createClipboardWatch(): ClipboardWatch {
  const out = allocateEntity<ClipboardWatch>();
  out.onChange = createSignal();
  return finishEntity(out);
}

// Stops delivery to watch and forgets its subscription. Safe to call when not attached.
export function detachClipboardWatch(watch: ClipboardWatch): void {
  const subscription = _watchSubscriptions.get(watch);
  if (subscription !== undefined) {
    subscription.change.unsubscribe(subscription.callback);
    _watchSubscriptions.delete(watch);
  }
}

// Detaches watch's backend subscription and releases it for garbage collection.
// The signal remains plain GC-managed memory afterward.
export function disposeClipboardWatch(watch: ClipboardWatch): void {
  detachClipboardWatch(watch);
}

// Returns the list of MIME/format strings currently on the clipboard. [] sentinel on access denied.
export function getClipboardFormats(host: HasClipboardFormats): Promise<readonly string[]> {
  return host.clipboard.formats.getFormats();
}

// True when the clipboard currently holds a bookmark. Returns false when access is denied.
export async function hasClipboardBookmark(host: HasClipboardBookmark): Promise<boolean> {
  return (await host.clipboard.bookmark.readBookmark()) !== null;
}

// True when the given MIME/format string is currently present on the clipboard.
export function hasClipboardFormat(host: HasClipboardFormats, format: string): Promise<boolean> {
  return host.clipboard.formats.hasFormat(format);
}

// True when the clipboard currently holds HTML content. Returns false when access is denied.
export function hasClipboardHtml(host: HasClipboardFormats): Promise<boolean> {
  return host.clipboard.formats.hasFormat(ClipboardFormatHtml);
}

// True when the clipboard currently holds an image. Returns false when access is denied.
export function hasClipboardImage(host: HasClipboardImage): Promise<boolean> {
  return host.clipboard.image.hasImage();
}

// True when the clipboard currently holds RTF content. Returns false when access is denied.
export function hasClipboardRTF(host: HasClipboardFormats): Promise<boolean> {
  return host.clipboard.formats.hasFormat(ClipboardFormatRtf);
}

// True when the clipboard currently holds non-empty text. Returns false when access is denied.
export function hasClipboardText(host: HasClipboardText): Promise<boolean> {
  return host.clipboard.text.hasText();
}

// Reads multiple formats in one round-trip; missing formats are omitted from the result.
export function readClipboard(
  host: HasClipboardFormats,
  formats: readonly string[],
): Promise<Readonly<Record<string, string>>> {
  return host.clipboard.formats.readItems(formats);
}

// Reads a bookmark (title + URL) from the clipboard, or null when none is present or access is denied.
export function readClipboardBookmark(host: HasClipboardBookmark): Promise<ClipboardBookmark | null> {
  return host.clipboard.bookmark.readBookmark();
}

// Reads an arbitrary MIME/format flavor as a string; returns '' when absent or access is denied.
export function readClipboardFormat(host: HasClipboardFormats, format: string): Promise<string> {
  return host.clipboard.formats.readFormat(format);
}

// Reads HTML from the clipboard, or '' when none is present or access is denied.
export function readClipboardHtml(host: HasClipboardFormats): Promise<string> {
  return host.clipboard.formats.readHtml();
}

// Reads an image from the clipboard as a data URL, or '' when none is present or access is denied.
export function readClipboardImage(host: HasClipboardImage): Promise<string> {
  return host.clipboard.image.readImage();
}

// Reads RTF markup from the clipboard, or '' when none is present or access is denied.
export function readClipboardRTF(host: HasClipboardFormats): Promise<string> {
  return host.clipboard.formats.readRTF();
}

// Reads plain text from the clipboard, or '' when empty or access is denied.
export function readClipboardText(host: HasClipboardText): Promise<string> {
  return host.clipboard.text.readText();
}

// Writes multiple formats atomically so a paste target picks its best representation.
export function writeClipboard(
  host: HasClipboardFormats,
  items: readonly Readonly<ClipboardWriteItem>[],
): Promise<boolean> {
  return host.clipboard.formats.writeItems(items);
}

// Writes a bookmark (title + URL) to the clipboard. Returns false when the host denies access.
export function writeClipboardBookmark(host: HasClipboardBookmark, title: string, url: string): Promise<boolean> {
  return host.clipboard.bookmark.writeBookmark(title, url);
}

// Writes an arbitrary MIME/format flavor. Returns false when the host denies access.
export function writeClipboardFormat(host: HasClipboardFormats, format: string, data: string): Promise<boolean> {
  return host.clipboard.formats.writeFormat(format, data);
}

// Writes HTML to the clipboard. Returns false when the host denies access.
export function writeClipboardHtml(host: HasClipboardFormats, html: string): Promise<boolean> {
  return host.clipboard.formats.writeHtml(html);
}

// Writes an image (given as a data URL) to the clipboard. Returns false when the host denies access.
export function writeClipboardImage(host: HasClipboardImage, dataUrl: string): Promise<boolean> {
  return host.clipboard.image.writeImage(dataUrl);
}

// Writes RTF markup to the clipboard. Returns false when the host denies access.
export function writeClipboardRTF(host: HasClipboardFormats, rtf: string): Promise<boolean> {
  return host.clipboard.formats.writeRTF(rtf);
}

// Writes plain text to the clipboard. Returns false when the host denies access.
export function writeClipboardText(host: HasClipboardText, text: string): Promise<boolean> {
  return host.clipboard.text.writeText(text);
}

// Active watches are deliberate registry roots until detach/dispose; enumeration is unnecessary now
// that provider selection is explicit and subscriptions never rebind through an ambient backend swap.
const _watchSubscriptions = new Map<
  ClipboardWatch,
  {
    readonly callback: () => void;
    readonly change: HasClipboardChange['clipboard']['change'];
  }
>();
