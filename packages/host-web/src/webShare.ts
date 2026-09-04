import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  ShareContentBackend,
  EntityRuntimeKey,
  ShareFile,
  ShareFilesBackend,
  ShareFilesContent,
  ShareResult,
} from '@flighthq/types/contract';

export const webShareContentBackend = (() => {
  const out = allocateEntity<ShareContentBackend>();
  out.canShareContent = (content) => {
    return hasShareableContent(content) && canNavigatorShare(contentToNavigatorData(content));
  };
  out.shareContent = async (content) => {
    if (!hasShareableContent(content)) return false;
    return invokeNavigatorShare(contentToNavigatorData(content));
  };
  out.shareContentWithResult = async (content) => {
    if (!hasShareableContent(content)) return failedResult(false);
    return invokeNavigatorShareWithResult(contentToNavigatorData(content));
  };
  return finishEntity(out);
})();

export const webShareFilesBackend = (() => {
  const out = allocateEntity<ShareFilesBackend>();
  out.canShareContent = (content) => {
    if (content.files.length === 0) return false;
    try {
      return canNavigatorShare(filesToNavigatorData(content));
    } catch {
      return false;
    }
  };
  out.shareContent = async (content) => {
    if (content.files.length === 0) return false;
    try {
      return await invokeNavigatorShare(filesToNavigatorData(content));
    } catch {
      return false;
    }
  };
  out.shareContentWithResult = async (content) => {
    if (content.files.length === 0) return failedResult(false);
    try {
      return await invokeNavigatorShareWithResult(filesToNavigatorData(content));
    } catch {
      return failedResult(false);
    }
  };
  return finishEntity(out);
})();

function canNavigatorShare(data: ShareData): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  try {
    return navigator.canShare?.(data) ?? true;
  } catch {
    return false;
  }
}

function contentToNavigatorData(content: Readonly<{ text?: string; title?: string; url?: string }>): ShareData {
  const data: ShareData = {};
  if (content.title !== undefined) data.title = content.title;
  if (content.text !== undefined) data.text = content.text;
  if (content.url !== undefined) data.url = content.url;
  return data;
}

function failedResult(dismissed: boolean): ShareResult {
  return { activityType: null, completed: false, dismissed };
}

function filesToNavigatorData(content: Readonly<ShareFilesContent>): ShareData {
  return {
    ...contentToNavigatorData(content),
    files: content.files.map(shareFileToDomFile),
  };
}

function hasShareableContent(content: Readonly<{ text?: string; title?: string; url?: string }>): boolean {
  return (
    (content.title !== undefined && content.title !== '') ||
    (content.text !== undefined && content.text !== '') ||
    (content.url !== undefined && content.url !== '')
  );
}

async function invokeNavigatorShare(data: ShareData): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  try {
    await navigator.share(data);
    return true;
  } catch {
    return false;
  }
}

async function invokeNavigatorShareWithResult(data: ShareData): Promise<ShareResult> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return failedResult(false);
  try {
    await navigator.share(data);
    return { activityType: null, completed: true, dismissed: false };
  } catch (error) {
    return failedResult(error instanceof Error && error.name === 'AbortError');
  }
}

function shareFileToDomFile(file: Readonly<ShareFile>): File {
  const comma = file.dataUrl.indexOf(',');
  if (comma === -1) throw new Error('share: dataUrl is not a data URL (no comma)');
  const header = file.dataUrl.substring(0, comma);
  const body = file.dataUrl.substring(comma + 1);
  let bytes: Uint8Array<ArrayBuffer>;
  if (header.includes(';base64')) {
    const binary = atob(body);
    bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } else {
    const encoded = new TextEncoder().encode(decodeURIComponent(body));
    bytes = new Uint8Array(new ArrayBuffer(encoded.length));
    bytes.set(encoded);
  }
  return new File([bytes], file.name, { type: file.mimeType });
}
