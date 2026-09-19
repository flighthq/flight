import type {
  HostClipboardChangeCapability,
  HostClipboardFormatsCapability,
  HostClipboardImageCapability,
  HostClipboardTextCapability,
} from '@flighthq/types/contract';
import { ClipboardFormatHtml, ClipboardFormatRtf } from '@flighthq/types/contract';

type WebClipboardChangeProvider = HostClipboardChangeCapability &
  Required<Pick<HostClipboardChangeCapability, 'subscribe'>>;
type WebClipboardBackend = HostClipboardFormatsCapability &
  HostClipboardImageCapability &
  HostClipboardTextCapability &
  WebClipboardChangeProvider;

export function initializeWebClipboardBackend(out: WebClipboardBackend): void {
  initializeWebClipboardChangeProvider(out);
  initializeWebClipboardFormatsBackend(out);
  initializeWebClipboardImageBackend(out);
  initializeWebClipboardTextProvider(out);
}

export const webHostClipboardChange = createWebClipboardChangeProvider();
export const webHostClipboardFormats = createWebClipboardFormatsProvider();
export const webHostClipboardImage = createWebClipboardImageProvider();
export const webHostClipboardText = createWebClipboardTextProvider();

function createWebClipboardChangeProvider(): WebClipboardChangeProvider {
  const out = {} as WebClipboardChangeProvider;
  initializeWebClipboardChangeProvider(out);
  return out;
}

function createWebClipboardFormatsProvider(): HostClipboardFormatsCapability {
  const out = {} as HostClipboardFormatsCapability;
  initializeWebClipboardFormatsBackend(out);
  return out;
}

function createWebClipboardImageProvider(): HostClipboardImageCapability {
  const out = {} as HostClipboardImageCapability;
  initializeWebClipboardImageBackend(out);
  return out;
}

function createWebClipboardTextProvider(): HostClipboardTextCapability {
  const out = {} as HostClipboardTextCapability;
  initializeWebClipboardTextProvider(out);
  return out;
}

function initializeWebClipboardChangeProvider(out: WebClipboardChangeProvider): void {
  out.subscribe = (callback: () => void) => {
    if (typeof window === 'undefined' || !('onclipboardchange' in window)) return noop;
    const pageWindow = window;
    const handler = () => callback();
    pageWindow.addEventListener('clipboardchange' as keyof WindowEventMap, handler as EventListener);
    return () => {
      pageWindow.removeEventListener('clipboardchange' as keyof WindowEventMap, handler as EventListener);
    };
  };
}

function initializeWebClipboardFormatsBackend(out: HostClipboardFormatsCapability): void {
  async function blobFromFormatData(format: string, data: string): Promise<Blob> {
    if (format.startsWith('image/') && data.startsWith('data:')) {
      const response = await fetch(data);
      return response.blob();
    }
    return new Blob([data], { type: format });
  }
  async function writeFormat(format: string, data: string): Promise<boolean> {
    const clipboard = getWritableWebClipboard();
    if (clipboard === null) return false;
    try {
      const blob = await blobFromFormatData(format, data);
      await clipboard.write([new ClipboardItem({ [format]: blob })]);
      return true;
    } catch {
      return false;
    }
  }
  async function writeItems(
    items: ReadonlyArray<{ readonly data: string; readonly format: string }>,
  ): Promise<boolean> {
    const clipboard = getWritableWebClipboard();
    if (clipboard === null) return false;
    try {
      const entry: Record<string, Blob> = {};
      for (const item of items) entry[item.format] = await blobFromFormatData(item.format, item.data);
      await clipboard.write([new ClipboardItem(entry)]);
      return true;
    } catch {
      return false;
    }
  }

  out.getFormats = getWebClipboardFormats;
  out.hasFormat = async (format: string) => (await getWebClipboardFormats()).includes(format);
  out.readFormat = readWebClipboardFormat;
  out.readHtml = () => readWebClipboardFormat(ClipboardFormatHtml);
  out.readItems = readWebClipboardItems;
  out.readRTF = () => readWebClipboardFormat(ClipboardFormatRtf);
  out.writeFormat = writeFormat;
  out.writeHtml = (html: string) => writeFormat(ClipboardFormatHtml, html);
  out.writeItems = writeItems;
  out.writeRTF = (rtf: string) => writeFormat(ClipboardFormatRtf, rtf);
}

function initializeWebClipboardImageBackend(out: HostClipboardImageCapability): void {
  out.hasImage = async () => (await readWebClipboardImage()).length > 0;
  out.readImage = readWebClipboardImage;
  out.writeImage = async (dataUrl: string): Promise<boolean> => {
    const clipboard = getWritableWebClipboard();
    if (clipboard === null) return false;
    try {
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      await clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      return true;
    } catch {
      return false;
    }
  };
}

function initializeWebClipboardTextProvider(out: HostClipboardTextCapability): void {
  out.clear = () => writeWebClipboardText('');
  out.hasText = async () => (await readWebClipboardText()).length > 0;
  out.readText = readWebClipboardText;
  out.writeText = writeWebClipboardText;
}

function getWebClipboard(): Clipboard | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.clipboard ?? null;
}

async function getWebClipboardFormats(): Promise<string[]> {
  const clipboard = getWebClipboard();
  if (clipboard === null || typeof clipboard.read !== 'function') return [];
  try {
    const items = await clipboard.read();
    const formats: string[] = [];
    for (const item of items) {
      for (const type of item.types) {
        if (!formats.includes(type)) formats.push(type);
      }
    }
    return formats;
  } catch {
    return [];
  }
}

function noop(): void {}

function getWritableWebClipboard(): Clipboard | null {
  const clipboard = getWebClipboard();
  if (clipboard === null || typeof clipboard.write !== 'function' || typeof ClipboardItem === 'undefined') return null;
  return clipboard;
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    if (typeof FileReader === 'undefined') {
      resolve('');
      return;
    }
    try {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    } catch {
      resolve('');
    }
  });
}

async function readWebClipboardFormat(format: string): Promise<string> {
  const clipboard = getWebClipboard();
  if (clipboard === null || typeof clipboard.read !== 'function') return '';
  try {
    const items = await clipboard.read();
    for (const item of items) {
      if (!item.types.includes(format)) continue;
      const blob = await item.getType(format);
      return format.startsWith('image/') ? readBlobAsDataUrl(blob) : blob.text();
    }
  } catch {}
  return '';
}

async function readWebClipboardImage(): Promise<string> {
  const clipboard = getWebClipboard();
  if (clipboard === null || typeof clipboard.read !== 'function') return '';
  try {
    const items = await clipboard.read();
    for (const item of items) {
      const type = item.types.find((candidate) => candidate.startsWith('image/'));
      if (type !== undefined) return readBlobAsDataUrl(await item.getType(type));
    }
  } catch {}
  return '';
}

async function readWebClipboardItems(formats: readonly string[]): Promise<Readonly<Record<string, string>>> {
  const clipboard = getWebClipboard();
  if (clipboard === null || typeof clipboard.read !== 'function') return {};
  try {
    const items = await clipboard.read();
    const result: Record<string, string> = {};
    for (const item of items) {
      for (const format of formats) {
        if (!item.types.includes(format) || format in result) continue;
        const blob = await item.getType(format);
        result[format] = format.startsWith('image/') ? await readBlobAsDataUrl(blob) : await blob.text();
      }
    }
    return result;
  } catch {
    return {};
  }
}

async function readWebClipboardText(): Promise<string> {
  const clipboard = getWebClipboard();
  if (clipboard === null || typeof clipboard.readText !== 'function') return '';
  try {
    return await clipboard.readText();
  } catch {
    return '';
  }
}

async function writeWebClipboardText(text: string): Promise<boolean> {
  const clipboard = getWebClipboard();
  if (clipboard === null || typeof clipboard.writeText !== 'function') return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
