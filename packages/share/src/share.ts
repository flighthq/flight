import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type { BackendExplanation } from '@flighthq/types/contract';
import type {
  ShareBackend,
  ShareContent,
  ShareFile,
  ShareOptions,
  ShareResult,
  ShareSignals,
} from '@flighthq/types/contract';

export function attachShareSignals(signals: ShareSignals): void {
  _attachedSignals.add(signals);
}

export function canShareContent(content: Readonly<ShareContent>): boolean {
  return getShareBackend().canShare(content);
}

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
        const dismissed = err instanceof Error && err.name === 'AbortError';
        return { completed: false, activityType: null, dismissed };
      }
    },
  };
}

export function detachShareSignals(signals: ShareSignals): void {
  _attachedSignals.delete(signals);
}

export function disposeShareSignals(signals: ShareSignals): void {
  detachShareSignals(signals);
}

export function enableShareSignals(): ShareSignals {
  return {
    onShareResult: createSignal(),
  };
}

export function explainShareBackend(): BackendExplanation {
  if (_custom !== null) {
    return { conflict: _hostConflict, layer: 'custom', operation: null, viability: 'unobserved' };
  }
  if (_host !== null) {
    return {
      conflict: _hostConflict,
      layer: 'host',
      operation: _hostObservation !== null ? _hostObservation.operation : null,
      viability: _hostObservation !== null ? _hostObservation.viability : 'unobserved',
    };
  }
  return { conflict: false, layer: 'host-not-enabled', operation: null, viability: 'unobserved' };
}

export function getShareBackend(): ShareBackend {
  return _custom ?? _host ?? _sentinel;
}

export function hasShareContentFields(content: Readonly<ShareContent>): boolean {
  if (content.title !== undefined && content.title !== '') return true;
  if (content.text !== undefined && content.text !== '') return true;
  if (content.url !== undefined && content.url !== '') return true;
  if (content.files !== undefined && content.files.length > 0) return true;
  return false;
}

export function installShareHostBackend(backend: ShareBackend): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
}

export function isShareAvailable(): boolean {
  return getShareBackend().isAvailable();
}

export function observeShareHostResult(operation: string, succeeded: boolean): void {
  _hostObservation = {
    operation,
    viability: succeeded ? 'available' : 'runtime-api-unavailable',
  };
}

export function resetShareBackendForTest(): void {
  _custom = null;
  _host = null;
  _hostConflict = false;
  _hostObservation = null;
}

export function setShareBackend(backend: ShareBackend | null): void {
  _custom = backend;
}

export function shareContent(content: Readonly<ShareContent>, options?: Readonly<ShareOptions>): Promise<boolean> {
  if (!hasShareContentFields(content)) return Promise.resolve(false);
  return getShareBackend().share(content, options);
}

export async function shareContentWithResult(
  content: Readonly<ShareContent>,
  options?: Readonly<ShareOptions>,
): Promise<ShareResult> {
  if (!hasShareContentFields(content)) {
    return { completed: false, activityType: null, dismissed: false };
  }
  const result = await getShareBackend().shareWithResult(content, options);
  for (const signals of _attachedSignals) {
    emitSignal(signals.onShareResult, result);
  }
  return result;
}

export function shareFiles(files: readonly ShareFile[], options?: Readonly<ShareOptions>): Promise<boolean> {
  return shareContent({ files }, options);
}

export function shareText(text: string, options?: Readonly<ShareOptions>): Promise<boolean> {
  return shareContent({ text }, options);
}

export function shareUrl(url: string, options?: Readonly<ShareOptions>): Promise<boolean> {
  return shareContent({ url }, options);
}

let _custom: ShareBackend | null = null;
let _host: ShareBackend | null = null;
let _hostConflict = false;
let _hostObservation: { operation: string; viability: 'available' | 'runtime-api-unavailable' } | null = null;

const _sentinel: ShareBackend = {
  canShare(): boolean {
    return false;
  },
  isAvailable(): boolean {
    return false;
  },
  async share(): Promise<boolean> {
    return false;
  },
  async shareWithResult(): Promise<ShareResult> {
    return { completed: false, activityType: null, dismissed: false };
  },
};

const _attachedSignals = new Set<ShareSignals>();

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

function shareFileToDomFile(file: Readonly<ShareFile>): File {
  const comma = file.dataUrl.indexOf(',');
  if (comma === -1) throw new Error('share: dataUrl is not a data URL (no comma)');
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
