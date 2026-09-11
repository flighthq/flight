import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { clearSignal, createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  EntityConstruction,
  HostShareContentProvider,
  HostShareFilesProvider,
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
export function canShareContent(
  hostShareContent: Readonly<HostShareContentProvider>,
  content: Readonly<ShareContent>,
): boolean {
  return hasShareContentFields(content) && hostShareContent.canShareContent(content);
}

export function canShareFiles(hostShareFiles: Readonly<HostShareFilesProvider>, files: readonly ShareFile[]): boolean {
  const content = filesContent(files);
  return content !== null && hostShareFiles.canShareContent(content);
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
  initializeShareSignals(out);
  return finishEntity(out);
}

export function hasShareContentFields(content: Readonly<ShareContent>): boolean {
  if (content.title !== undefined && content.title !== '') return true;
  if (content.text !== undefined && content.text !== '') return true;
  if (content.url !== undefined && content.url !== '') return true;
  return false;
}

export function initializeShareSignals(out: EntityConstruction<ShareSignals>): void {
  out.onShareResult = createSignal();
}

// True when the required descriptor strings are non-empty and dataUrl has the portable envelope
// core can recognize without decoding: a data: prefix and comma separator. URL syntax, MIME
// plausibility, and encoded bytes remain provider-boundary concerns.
export function isShareFileValid(file: Readonly<ShareFile>): boolean {
  return file.name !== '' && file.mimeType !== '' && file.dataUrl.startsWith('data:') && file.dataUrl.includes(',');
}

export function shareContent(
  hostShareContent: Readonly<HostShareContentProvider>,
  content: Readonly<ShareContent>,
): Promise<boolean> {
  if (!hasShareContentFields(content)) return Promise.resolve(false);
  return hostShareContent.shareContent(content);
}

export async function shareContentWithResult(
  hostShareContent: Readonly<HostShareContentProvider>,
  content: Readonly<ShareContent>,
): Promise<ShareResult> {
  if (!hasShareContentFields(content)) {
    return { completed: false, activityType: null, dismissed: false };
  }
  const result = await hostShareContent.shareContentWithResult(content);
  for (const signals of _attachedSignals) {
    emitSignal(signals.onShareResult, result);
  }
  return result;
}

export function shareFiles(
  hostShareFiles: Readonly<HostShareFilesProvider>,
  files: readonly ShareFile[],
): Promise<boolean> {
  const content = filesContent(files);
  if (content === null) return Promise.resolve(false);
  return hostShareFiles.shareContent(content);
}

export function shareText(hostShareContent: Readonly<HostShareContentProvider>, text: string): Promise<boolean> {
  return shareContent(hostShareContent, { text });
}

export function shareUrl(hostShareContent: Readonly<HostShareContentProvider>, url: string): Promise<boolean> {
  return shareContent(hostShareContent, { url });
}

const _attachedSignals = new Set<ShareSignals>();

function filesContent(files: readonly ShareFile[]): ShareFilesContent | null {
  const first = files[0];
  return first === undefined || !files.every(isShareFileValid) ? null : { files: [first, ...files.slice(1)] };
}
