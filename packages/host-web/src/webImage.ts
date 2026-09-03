import { createEntity } from '@flighthq/entity/contract';
import { createWebImageBackend, installImageHostBackend, observeImageHostResult } from '@flighthq/image/contract';
import type { EntityWithoutRuntime, ImageResource, ImageBackend } from '@flighthq/types/contract';

export function enableHostWebImage(): void {
  if (_enabled) return;
  _enabled = true;
  const inner = createWebImageBackend();
  const backend: ImageBackend = createEntity<EntityWithoutRuntime<ImageBackend>>({
    async loadImageFromUrl(url, crossOrigin, signal): Promise<ImageResource> {
      try {
        const result = await inner.loadImageFromUrl(url, crossOrigin, signal);
        observeImageHostResult('loadImageFromUrl', true);
        return result;
      } catch (error) {
        observeImageHostResult('loadImageFromUrl', false);
        throw error;
      }
    },
  });
  // Optional operations are composed structurally: an observing wrapper must not advertise a method
  // the inner provider does not implement, because method presence is the capability signal.
  if (inner.createImageFromBitmap !== undefined) {
    backend.createImageFromBitmap = (bitmap) => {
      try {
        const result = inner.createImageFromBitmap!(bitmap);
        observeImageHostResult('createImageFromBitmap', true);
        return result;
      } catch (error) {
        observeImageHostResult('createImageFromBitmap', false);
        throw error;
      }
    };
  }
  installImageHostBackend(backend);
}

export function resetHostWebImageForTest(): void {
  _enabled = false;
}

let _enabled = false;
