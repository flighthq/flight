import { createSignal, emitSignal } from '@flighthq/signals';
import type { ShareBackend, ShareContent, ShareOptions, ShareResult, ShareSignals } from '@flighthq/types';

// Attaches `signals` to receive share result events emitted by shareContentWithResult calls. A prior
// subscription on this signals group is torn down first. Pair with detachShareSignals /
// disposeShareSignals.
//
// Note: shareContent (the boolean convenience wrapper) does NOT emit signals — only
// shareContentWithResult emits onShareResult. If you need signals on every share, use
// shareContentWithResult directly.
export function attachShareSignals(signals: ShareSignals): void {
  detachShareSignals(signals);
  _signalListeners.set(signals, true);
}

// True when the active backend can share the given content. Returns false when sharing is
// unavailable or the content is not shareable by this platform (e.g. a MIME type not accepted by
// the share sheet). Distinct from isShareAvailable: that probe asks whether sharing is possible at
// all; this asks whether this specific content is shareable.
export function canShareContent(content: Readonly<ShareContent>): boolean {
  return getShareBackend().canShare(content);
}

// Builds the default web backend over navigator.share / navigator.canShare.
// share and shareWithResult resolve to false/dismissed=true when the Web Share API is absent (jsdom,
// unsupported browsers) or the user cancels. canShare returns false when the API is absent or the
// platform cannot share the given content. isAvailable returns true when navigator.share exists.
// Files are converted from ShareFile (data URL) to DOM File at the boundary; conversion errors
// fall back to false.
export function createWebShareBackend(): ShareBackend {
  return {
    isAvailable() {
      return typeof navigator !== 'undefined' && 'share' in navigator;
    },

    canShare(content) {
      if (typeof navigator === 'undefined' || !('share' in navigator)) return false;
      try {
        const data = shareContentToNavigatorData(content);
        return navigator.canShare?.(data) ?? false;
      } catch {
        return false;
      }
    },

    async share(content, _options?) {
      if (typeof navigator === 'undefined' || !('share' in navigator) || typeof navigator.share !== 'function') {
        return false;
      }
      try {
        const data = shareContentToNavigatorData(content);
        await navigator.share(data);
        return true;
      } catch {
        return false;
      }
    },

    async shareWithResult(content, _options?) {
      if (typeof navigator === 'undefined' || !('share' in navigator) || typeof navigator.share !== 'function') {
        return { completed: false, activityType: null, dismissed: false };
      }
      try {
        const data = shareContentToNavigatorData(content);
        await navigator.share(data);
        return { completed: true, activityType: null, dismissed: false };
      } catch (err) {
        // AbortError means the user explicitly cancelled; other errors are failures.
        const dismissed = err instanceof Error && err.name === 'AbortError';
        return { completed: false, activityType: null, dismissed };
      }
    },
  };
}

// Stops delivery to `signals` and forgets its subscription. Safe to call when not attached.
export function detachShareSignals(signals: ShareSignals): void {
  _signalListeners.delete(signals);
}

// Releases `signals` for garbage collection by detaching its subscription. The signals remain plain
// GC-managed memory afterward.
export function disposeShareSignals(signals: ShareSignals): void {
  detachShareSignals(signals);
}

// Enables a signals group for share result events. Signals stay inert until attachShareSignals is
// called. This is the opt-in; the cost is assumed when attached.
export function enableShareSignals(): ShareSignals {
  return {
    onShareResult: createSignal(),
  };
}

// The active share backend, or a lazily-created web default. There is always a backend.
export function getShareBackend(): ShareBackend {
  if (_backend === null) _backend = createWebShareBackend();
  return _backend;
}

// True when content has at least one populated field (title, text, url, or a non-empty files array).
// The Web Share API requires at least one field to be present; calling shareContent with an empty
// payload will throw on some engines, which shareContent swallows to false. Use this to detect
// an obviously-empty payload before calling shareContent.
export function hasShareContentFields(content: Readonly<ShareContent>): boolean {
  if (content.title !== undefined && content.title !== '') return true;
  if (content.text !== undefined && content.text !== '') return true;
  if (content.url !== undefined && content.url !== '') return true;
  if (content.files !== undefined && content.files.length > 0) return true;
  return false;
}

// True when the active backend's platform supports sharing at all (capability-level probe,
// independent of any content). Distinct from canShareContent: this asks "can this platform share?"
// while canShareContent asks "is this specific content shareable?".
export function isShareAvailable(): boolean {
  return getShareBackend().isAvailable();
}

// Installs a native host share backend; pass null to fall back to the web default.
export function setShareBackend(backend: ShareBackend | null): void {
  _backend = backend;
}

// Opens the native share sheet with the given content. Resolves true on success, false when the host
// denies, the user cancels, or sharing is unavailable. An empty content payload (no title/text/url/
// files) is caught by hasShareContentFields and returns false immediately rather than forwarding to the
// backend (which may throw). Pass options to control presentation on native hosts (parentWindow,
// sourceRect on iPad).
export function shareContent(content: Readonly<ShareContent>, options?: Readonly<ShareOptions>): Promise<boolean> {
  if (!hasShareContentFields(content)) return Promise.resolve(false);
  return getShareBackend().share(content, options);
}

// Opens the native share sheet and returns a full ShareResult describing completion, cancellation,
// and which activity/app was chosen. Emits onShareResult on all attached ShareSignals groups.
// An empty content payload returns { completed: false, activityType: null, dismissed: false }
// immediately. Pass options to control presentation on native hosts.
export async function shareContentWithResult(
  content: Readonly<ShareContent>,
  options?: Readonly<ShareOptions>,
): Promise<ShareResult> {
  if (!hasShareContentFields(content)) {
    return { completed: false, activityType: null, dismissed: false };
  }
  const result = await getShareBackend().shareWithResult(content, options);
  if (_signalListeners.size > 0) {
    for (const signals of _signalListeners.keys()) {
      emitSignal(signals.onShareResult, result);
    }
  }
  return result;
}

// Opens the share sheet with a plain text payload. A convenience wrapper over shareContent.
export function shareText(text: string, options?: Readonly<ShareOptions>): Promise<boolean> {
  return shareContent({ text }, options);
}

// Opens the share sheet with a URL payload. A convenience wrapper over shareContent.
export function shareUrl(url: string, options?: Readonly<ShareOptions>): Promise<boolean> {
  return shareContent({ url }, options);
}

let _backend: ShareBackend | null = null;
// Maps signals groups that have been attached via attachShareSignals.
const _signalListeners = new Map<ShareSignals, true>();

// Converts a ShareContent (with portable ShareFile descriptors) to the navigator.share data shape,
// converting ShareFile data URLs to DOM File objects at the web boundary.
function shareContentToNavigatorData(content: Readonly<ShareContent>): ShareData {
  const data: ShareData = {};
  if (content.title !== undefined) data.title = content.title;
  if (content.text !== undefined) data.text = content.text;
  if (content.url !== undefined) data.url = content.url;
  if (content.files !== undefined && content.files.length > 0) {
    data.files = content.files.map((f) => shareFileToDomFile(f));
  }
  return data;
}

// Converts a portable ShareFile descriptor to a DOM File for navigator.share / navigator.canShare.
function shareFileToDomFile(file: { dataUrl: string; mimeType: string; name: string }): File {
  // Parse the data URL: 'data:<mimeType>;base64,<data>' or 'data:<mimeType>,<data>'
  const comma = file.dataUrl.indexOf(',');
  const header = file.dataUrl.substring(0, comma);
  const body = file.dataUrl.substring(comma + 1);
  const isBase64 = header.includes(';base64');
  let bytes: Uint8Array<ArrayBuffer>;
  if (isBase64) {
    const binary = atob(body);
    bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
  } else {
    const decoded = decodeURIComponent(body);
    const encoded = new TextEncoder().encode(decoded);
    bytes = new Uint8Array(new ArrayBuffer(encoded.length));
    bytes.set(encoded);
  }
  return new File([bytes], file.name, { type: file.mimeType });
}
