import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  ClipboardBookmark,
  ClipboardWatch,
  ClipboardWriteItem,
  EntityConstruction,
  HostClipboardBookmarkProvider,
  HostClipboardChangeProvider,
  HostClipboardFormatsProvider,
  HostClipboardImageProvider,
  HostClipboardTextProvider,
} from '@flighthq/types/contract';
import { ClipboardFormatHtml, ClipboardFormatRtf } from '@flighthq/types/contract';

// Attaches watch to the explicitly supplied host's clipboard change subscription. Attaching the
// same watch again first releases its prior subscription, even when the new host is different.
export function attachClipboardWatch(
  hostClipboardChange: Readonly<Required<Pick<HostClipboardChangeProvider, 'subscribe' | 'unsubscribe'>>>,
  watch: ClipboardWatch,
): void {
  detachClipboardWatch(watch);
  const change = hostClipboardChange;
  const callback = () => emitSignal(watch.onChange);
  change.subscribe(callback);
  _watchSubscriptions.set(watch, { callback, change });
}

// Clears the system clipboard. Returns false when the host denies access. Sentinel, not throw.
export function clearClipboard(hostClipboardText: Readonly<HostClipboardTextProvider>): Promise<boolean> {
  return hostClipboardText.clear();
}

// Allocates a ClipboardWatch event entity with an inert signal.
// Call attachClipboardWatch to start delivery; call disposeClipboardWatch when done.
export function createClipboardWatch(): ClipboardWatch {
  const out = allocateEntity<ClipboardWatch>();
  initializeClipboardWatch(out);
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

// Detaches watch's provider subscription and releases it for garbage collection.
// The signal remains plain GC-managed memory afterward.
export function disposeClipboardWatch(watch: ClipboardWatch): void {
  detachClipboardWatch(watch);
}

// Returns the list of MIME/format strings currently on the clipboard. [] sentinel on access denied.
export function getClipboardFormats(
  hostClipboardFormats: Readonly<HostClipboardFormatsProvider>,
): Promise<readonly string[]> {
  return hostClipboardFormats.getFormats();
}

// True when the clipboard currently holds a bookmark. Returns false when access is denied.
export async function hasClipboardBookmark(
  hostClipboardBookmark: Readonly<HostClipboardBookmarkProvider>,
): Promise<boolean> {
  return (await hostClipboardBookmark.readBookmark()) !== null;
}

// True when the given MIME/format string is currently present on the clipboard.
export function hasClipboardFormat(
  hostClipboardFormats: Readonly<HostClipboardFormatsProvider>,
  format: string,
): Promise<boolean> {
  return hostClipboardFormats.hasFormat(format);
}

// True when the clipboard currently holds HTML content. Returns false when access is denied.
export function hasClipboardHtml(hostClipboardFormats: Readonly<HostClipboardFormatsProvider>): Promise<boolean> {
  return hostClipboardFormats.hasFormat(ClipboardFormatHtml);
}

// True when the clipboard currently holds an image. Returns false when access is denied.
export function hasClipboardImage(hostClipboardImage: Readonly<HostClipboardImageProvider>): Promise<boolean> {
  return hostClipboardImage.hasImage();
}

// True when the clipboard currently holds RTF content. Returns false when access is denied.
export function hasClipboardRTF(hostClipboardFormats: Readonly<HostClipboardFormatsProvider>): Promise<boolean> {
  return hostClipboardFormats.hasFormat(ClipboardFormatRtf);
}

// True when the clipboard currently holds non-empty text. Returns false when access is denied.
export function hasClipboardText(hostClipboardText: Readonly<HostClipboardTextProvider>): Promise<boolean> {
  return hostClipboardText.hasText();
}

export function initializeClipboardWatch(out: EntityConstruction<ClipboardWatch>): void {
  out.onChange = createSignal();
}

// Reads multiple formats in one round-trip; missing formats are omitted from the result.
export function readClipboard(
  hostClipboardFormats: Readonly<HostClipboardFormatsProvider>,
  formats: readonly string[],
): Promise<Readonly<Record<string, string>>> {
  return hostClipboardFormats.readItems(formats);
}

// Reads a bookmark (title + URL) from the clipboard, or null when none is present or access is denied.
export function readClipboardBookmark(
  hostClipboardBookmark: Readonly<HostClipboardBookmarkProvider>,
): Promise<ClipboardBookmark | null> {
  return hostClipboardBookmark.readBookmark();
}

// Reads an arbitrary MIME/format flavor as a string; returns '' when absent or access is denied.
export function readClipboardFormat(
  hostClipboardFormats: Readonly<HostClipboardFormatsProvider>,
  format: string,
): Promise<string> {
  return hostClipboardFormats.readFormat(format);
}

// Reads HTML from the clipboard, or '' when none is present or access is denied.
export function readClipboardHtml(hostClipboardFormats: Readonly<HostClipboardFormatsProvider>): Promise<string> {
  return hostClipboardFormats.readHtml();
}

// Reads an image from the clipboard as a data URL, or '' when none is present or access is denied.
export function readClipboardImage(hostClipboardImage: Readonly<HostClipboardImageProvider>): Promise<string> {
  return hostClipboardImage.readImage();
}

// Reads RTF markup from the clipboard, or '' when none is present or access is denied.
export function readClipboardRTF(hostClipboardFormats: Readonly<HostClipboardFormatsProvider>): Promise<string> {
  return hostClipboardFormats.readRTF();
}

// Reads plain text from the clipboard, or '' when empty or access is denied.
export function readClipboardText(hostClipboardText: Readonly<HostClipboardTextProvider>): Promise<string> {
  return hostClipboardText.readText();
}

// Writes multiple formats atomically so a paste target picks its best representation.
export function writeClipboard(
  hostClipboardFormats: Readonly<HostClipboardFormatsProvider>,
  items: readonly Readonly<ClipboardWriteItem>[],
): Promise<boolean> {
  return hostClipboardFormats.writeItems(items);
}

// Writes a bookmark (title + URL) to the clipboard. Returns false when the host denies access.
export function writeClipboardBookmark(
  hostClipboardBookmark: Readonly<HostClipboardBookmarkProvider>,
  title: string,
  url: string,
): Promise<boolean> {
  return hostClipboardBookmark.writeBookmark(title, url);
}

// Writes an arbitrary MIME/format flavor. Returns false when the host denies access.
export function writeClipboardFormat(
  hostClipboardFormats: Readonly<HostClipboardFormatsProvider>,
  format: string,
  data: string,
): Promise<boolean> {
  return hostClipboardFormats.writeFormat(format, data);
}

// Writes HTML to the clipboard. Returns false when the host denies access.
export function writeClipboardHtml(
  hostClipboardFormats: Readonly<HostClipboardFormatsProvider>,
  html: string,
): Promise<boolean> {
  return hostClipboardFormats.writeHtml(html);
}

// Writes an image (given as a data URL) to the clipboard. Returns false when the host denies access.
export function writeClipboardImage(
  hostClipboardImage: Readonly<HostClipboardImageProvider>,
  dataUrl: string,
): Promise<boolean> {
  return hostClipboardImage.writeImage(dataUrl);
}

// Writes RTF markup to the clipboard. Returns false when the host denies access.
export function writeClipboardRTF(
  hostClipboardFormats: Readonly<HostClipboardFormatsProvider>,
  rtf: string,
): Promise<boolean> {
  return hostClipboardFormats.writeRTF(rtf);
}

// Writes plain text to the clipboard. Returns false when the host denies access.
export function writeClipboardText(
  hostClipboardText: Readonly<HostClipboardTextProvider>,
  text: string,
): Promise<boolean> {
  return hostClipboardText.writeText(text);
}

// Active watches are deliberate registry roots until detach/dispose; enumeration is unnecessary now
// that provider selection is explicit and subscriptions never rebind through a later provider choice.
const _watchSubscriptions = new Map<
  ClipboardWatch,
  {
    readonly callback: () => void;
    readonly change: Readonly<Required<Pick<HostClipboardChangeProvider, 'subscribe' | 'unsubscribe'>>>;
  }
>();
