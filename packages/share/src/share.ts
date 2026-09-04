import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { clearSignal, createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  HasShareContent,
  HasShareFiles,
  ShareContent,
  ShareFile,
  ShareFilesContent,
  ShareResult,
  ShareSignals,
} from '@flighthq/types/contract';

export function attachShareSignals(signals: ShareSignals): void {
  _attachedSignals.add(signals);
}

// This is payload validation within the content capability. Capability presence itself is expressed
// by HasShareContent, so a host without the slot is a type error rather than a false probe.
export function canShareContent(host: HasShareContent, content: Readonly<ShareContent>): boolean {
  return hasShareContentFields(content) && host.share.content.canShareContent(content);
}

export function canShareFiles(host: HasShareFiles, files: readonly ShareFile[]): boolean {
  const content = filesContent(files);
  return content !== null && host.share.files.canShareContent(content);
}

export function detachShareSignals(signals: ShareSignals): void {
  _attachedSignals.delete(signals);
}

export function disposeShareSignals(signals: ShareSignals): void {
  detachShareSignals(signals);
  clearSignal(signals.onShareResult);
}

export function enableShareSignals(): ShareSignals {
  const out = allocateEntity<ShareSignals>();
  out.onShareResult = createSignal();
  return finishEntity(out);
}

export function hasShareContentFields(content: Readonly<ShareContent>): boolean {
  if (content.title !== undefined && content.title !== '') return true;
  if (content.text !== undefined && content.text !== '') return true;
  if (content.url !== undefined && content.url !== '') return true;
  return false;
}

export function shareContent(host: HasShareContent, content: Readonly<ShareContent>): Promise<boolean> {
  if (!hasShareContentFields(content)) return Promise.resolve(false);
  return host.share.content.shareContent(content);
}

export async function shareContentWithResult(
  host: HasShareContent,
  content: Readonly<ShareContent>,
): Promise<ShareResult> {
  if (!hasShareContentFields(content)) {
    return { completed: false, activityType: null, dismissed: false };
  }
  const result = await host.share.content.shareContentWithResult(content);
  for (const signals of _attachedSignals) {
    emitSignal(signals.onShareResult, result);
  }
  return result;
}

export function shareFiles(host: HasShareFiles, files: readonly ShareFile[]): Promise<boolean> {
  const content = filesContent(files);
  if (content === null) return Promise.resolve(false);
  return host.share.files.shareContent(content);
}

export function shareText(host: HasShareContent, text: string): Promise<boolean> {
  return shareContent(host, { text });
}

export function shareUrl(host: HasShareContent, url: string): Promise<boolean> {
  return shareContent(host, { url });
}

const _attachedSignals = new Set<ShareSignals>();

function filesContent(files: readonly ShareFile[]): ShareFilesContent | null {
  const first = files[0];
  return first === undefined ? null : { files: [first, ...files.slice(1)] };
}
