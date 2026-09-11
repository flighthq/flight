import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { HostBitmapEncodeProvider, Entity, EntityConstruction } from '@flighthq/types/contract';

export function createWebBitmapEncodeBackend(): HostBitmapEncodeProvider & Entity {
  const out = allocateEntity<HostBitmapEncodeProvider & Entity>();
  initializeWebBitmapEncodeBackend(out);
  return finishEntity(out);
}

export function initializeWebBitmapEncodeBackend(out: EntityConstruction<HostBitmapEncodeProvider & Entity>): void {
  out.encodeBitmap = (source, format, quality): Uint8Array => {
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const imageData = new globalThis.ImageData(source.width, source.height);
    imageData.data.set(source.data);
    canvas.getContext('2d')!.putImageData(imageData, 0, 0);
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const dataUrl = canvas.toDataURL(mimeType, quality);
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  };
  out.supportedFormats = ['jpeg', 'png'];
}

export const webHostBitmapEncode: HostBitmapEncodeProvider & Entity = createWebBitmapEncodeBackend();
