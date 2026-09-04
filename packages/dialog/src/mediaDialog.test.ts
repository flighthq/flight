import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  CapturePhotoDialogOptions,
  CaptureVideoDialogOptions,
  HasDialogImageOpen,
  HasDialogPhotoCapture,
  HasDialogVideoCapture,
  ImageOpenDialogBackend,
  OpenImageDialogOptions,
  PhotoCaptureDialogBackend,
  VideoCaptureDialogBackend,
} from '@flighthq/types/contract';

import { showCapturePhotoDialog, showCaptureVideoDialog, showOpenImageDialog } from './mediaDialog';

describe('showCapturePhotoDialog', () => {
  it('routes capture through the explicit photo-capture slot and forwards options', async () => {
    const capture = vi.fn(async () => ({
      outcome: 'selected' as const,
      photo: { dataUrl: 'data:image/png;base64,AA==', height: 480, mimeType: 'image/png', width: 640 },
    }));
    const host: HasDialogPhotoCapture = {
      dialog: { photoCapture: (() => { const out = allocateEntity<unknown>(); out.capture = capture; return finishEntity(out) as PhotoCaptureDialogBackend; })() },
    };
    const options: CapturePhotoDialogOptions = {
      facingMode: 'user',
      signal: new AbortController().signal,
    };

    const result = await showCapturePhotoDialog(host, options);

    expect(result.outcome === 'selected' ? result.photo.width : 0).toBe(640);
    expect(capture).toHaveBeenCalledWith(options);
  });

  it('preserves the operation-specific failure outcome', async () => {
    const capture = async () => ({ outcome: 'photo-capture-failed' as const });
    const host: HasDialogPhotoCapture = {
      dialog: {
        photoCapture: (() => { const out = allocateEntity<unknown>(); out.capture = capture; return finishEntity(out) as PhotoCaptureDialogBackend,; })()
      },
    };

    expect(await showCapturePhotoDialog(host)).toEqual({ outcome: 'photo-capture-failed' });
  });
});

describe('showCaptureVideoDialog', () => {
  it('routes capture through the explicit video-capture slot and preserves decoded duration', async () => {
    const capture = vi.fn(async () => ({
      outcome: 'selected' as const,
      video: { dataUrl: 'data:video/mp4;base64,AA==', duration: 2.5, mimeType: 'video/mp4' },
    }));
    const host: HasDialogVideoCapture = {
      dialog: { videoCapture: (() => { const out = allocateEntity<unknown>(); out.capture = capture; return finishEntity(out) as VideoCaptureDialogBackend; })() },
    };
    const options: CaptureVideoDialogOptions = { facingMode: 'environment' };

    const result = await showCaptureVideoDialog(host, options);

    expect(result.outcome === 'selected' ? result.video.duration : 0).toBe(2.5);
    expect(capture).toHaveBeenCalledWith(options);
  });
});

describe('showOpenImageDialog', () => {
  it('routes selection through the explicit image-open slot and forwards cancellation', async () => {
    const open = vi.fn(async () => ({ outcome: 'cancelled' as const }));
    const host: HasDialogImageOpen = {
      dialog: { imageOpen: (() => { const out = allocateEntity<unknown>(); out.open = open; return finishEntity(out) as ImageOpenDialogBackend; })() },
    };
    const options: OpenImageDialogOptions = { signal: new AbortController().signal };

    await expect(showOpenImageDialog(host, options)).resolves.toEqual({ outcome: 'cancelled' });
    expect(open).toHaveBeenCalledWith(options);
  });

  it('preserves the operation-specific failure outcome', async () => {
    const open = async () => ({ outcome: 'image-open-failed' as const });
    const host: HasDialogImageOpen = {
      dialog: {
        imageOpen: (() => { const out = allocateEntity<unknown>(); out.open = open; return finishEntity(out) as ImageOpenDialogBackend,; })()
      },
    };

    expect(await showOpenImageDialog(host)).toEqual({ outcome: 'image-open-failed' });
  });
});
