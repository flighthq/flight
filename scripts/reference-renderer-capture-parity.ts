import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getBitmapMismatch } from '../packages/bitmap/src/bitmapCompare.ts';
import { decodeOraclePng } from './reference-image-png.ts';
import type { DecodedPng } from './reference-image-png.ts';
import { createReferenceRendererFontFixture } from './reference-renderer-font.ts';
import {
  REFERENCE_RASTER_PARITY_POLICY,
  REFERENCE_RASTER_FEATURE_POLICIES,
  REFERENCE_BROWSER_ENVIRONMENT_DESCRIPTOR,
  REFERENCE_RENDERERS,
  REFERENCE_RENDERER_SCENE,
} from './reference-renderer-scene.ts';
import type { ReferenceRenderer } from './reference-renderer-scene.ts';

export interface ReferenceRendererCapture {
  readonly image: DecodedPng;
  readonly logs: string;
  readonly status: unknown;
}

export type ReferenceRendererCaptureSet = Readonly<Record<ReferenceRenderer, ReferenceRendererCapture>>;

export type NativeReferenceRenderer = 'rust-gl' | 'rust-wgpu';

export interface NativeReferenceRendererCapture extends ReferenceRendererCapture {
  readonly fontBytes: Readonly<Uint8Array>;
  readonly initialImage: DecodedPng;
}

export type NativeReferenceRendererCaptureSet = Readonly<
  Record<NativeReferenceRenderer, NativeReferenceRendererCapture>
>;

export interface ReferenceRendererParityMeasurement {
  readonly fraction: number;
  readonly maxChannelDelta: number;
  readonly mismatchedPixels: number;
  readonly renderer: 'dom' | 'webgl' | 'webgpu' | NativeReferenceRenderer;
  readonly totalPixels: number;
}

export interface ReferenceRendererCaptureReport {
  readonly canonical: 'canvas';
  readonly determinism: Readonly<Record<ReferenceRenderer, number>> | null;
  readonly domRepresentation: 'registered-element-screenshot';
  readonly failures: readonly string[];
  readonly parity: readonly ReferenceRendererParityMeasurement[];
  readonly nativeDeterminism: Readonly<Record<NativeReferenceRenderer, number>> | null;
  readonly passed: boolean;
  readonly policy: typeof REFERENCE_RASTER_PARITY_POLICY;
}

/**
 * Applies the reference scene's full-resolution acceptance policy. Canvas is the one canonical raster;
 * GL and WGPU compare to it through the repository's existing decoded-pixel mismatch primitive. DOM is
 * deliberately not forced through that raster equivalence: its capture must be the functional suite's
 * registered-element screenshot, with the page-side bitmap oracle invoked on those supplied pixels.
 */
export function compareReferenceRendererCaptures(
  captures: ReferenceRendererCaptureSet,
  repeat: ReferenceRendererCaptureSet | null = null,
  native: NativeReferenceRendererCaptureSet | null = null,
  nativeRepeat: NativeReferenceRendererCaptureSet | null = null,
): ReferenceRendererCaptureReport {
  const failures: string[] = [];
  for (const renderer of REFERENCE_RENDERERS) validateCapture(renderer, captures[renderer], failures);

  const parity: ReferenceRendererParityMeasurement[] = (['dom', 'webgl', 'webgpu'] as const).map((renderer) => {
    const mismatch = getBitmapMismatch(
      captures.canvas.image,
      captures[renderer].image,
      REFERENCE_RASTER_PARITY_POLICY.channelTolerance,
    );
    if (mismatch.fraction > REFERENCE_RASTER_PARITY_POLICY.maxMismatchFraction) {
      failures.push(
        `${renderer}: decoded-pixel mismatch fraction ${mismatch.fraction} exceeds ` +
          `${REFERENCE_RASTER_PARITY_POLICY.maxMismatchFraction} at channel tolerance ` +
          REFERENCE_RASTER_PARITY_POLICY.channelTolerance,
      );
    }
    validateFeatureParity(renderer, captures.canvas.image, captures[renderer].image, failures);
    return { renderer, ...mismatch };
  });

  if (native !== null) {
    for (const renderer of ['rust-gl', 'rust-wgpu'] as const) {
      validateNativeCapture(renderer, native[renderer], failures);
      const mismatch = getBitmapMismatch(
        captures.canvas.image,
        native[renderer].image,
        REFERENCE_RASTER_PARITY_POLICY.channelTolerance,
      );
      if (mismatch.fraction > REFERENCE_RASTER_PARITY_POLICY.maxMismatchFraction) {
        failures.push(
          `${renderer}: decoded-pixel mismatch fraction ${mismatch.fraction} exceeds ` +
            `${REFERENCE_RASTER_PARITY_POLICY.maxMismatchFraction} at channel tolerance ` +
            REFERENCE_RASTER_PARITY_POLICY.channelTolerance,
        );
      }
      validateFeatureParity(renderer, captures.canvas.image, native[renderer].image, failures);
      parity.push({ renderer, ...mismatch });
    }
  }

  let determinism: Record<ReferenceRenderer, number> | null = null;
  if (repeat !== null) {
    determinism = {} as Record<ReferenceRenderer, number>;
    for (const renderer of REFERENCE_RENDERERS) {
      validateCapture(renderer, repeat[renderer], failures, 'repeat');
      const mismatch = getBitmapMismatch(captures[renderer].image, repeat[renderer].image, 0);
      determinism[renderer] = mismatch.fraction;
      if (mismatch.mismatchedPixels !== 0) {
        failures.push(
          `${renderer}: repeat capture changed ${mismatch.mismatchedPixels}/${mismatch.totalPixels} decoded pixels`,
        );
      }
    }
  }

  let nativeDeterminism: Record<NativeReferenceRenderer, number> | null = null;
  if (nativeRepeat !== null) {
    if (native === null) throw new Error('native repeat supplied without a first native capture');
    nativeDeterminism = {} as Record<NativeReferenceRenderer, number>;
    for (const renderer of ['rust-gl', 'rust-wgpu'] as const) {
      validateNativeCapture(renderer, nativeRepeat[renderer], failures, 'repeat');
      const mismatch = getBitmapMismatch(native[renderer].image, nativeRepeat[renderer].image, 0);
      nativeDeterminism[renderer] = mismatch.fraction;
      if (mismatch.mismatchedPixels !== 0) {
        failures.push(
          `${renderer}: repeat capture changed ${mismatch.mismatchedPixels}/${mismatch.totalPixels} decoded pixels`,
        );
      }
    }
  }

  return {
    canonical: 'canvas',
    determinism,
    domRepresentation: 'registered-element-screenshot',
    failures,
    nativeDeterminism,
    parity,
    passed: failures.length === 0,
    policy: REFERENCE_RASTER_PARITY_POLICY,
  };
}

function validateFeatureParity(
  renderer: Exclude<ReferenceRendererParityMeasurement['renderer'], 'canvas'>,
  canonical: DecodedPng,
  actual: DecodedPng,
  failures: string[],
): void {
  for (const policy of REFERENCE_RASTER_FEATURE_POLICIES) {
    let mismatchedPixels = 0;
    for (let y = policy.region.y; y < policy.region.y + policy.region.height; y++) {
      for (let x = policy.region.x; x < policy.region.x + policy.region.width; x++) {
        const offset = (y * canonical.width + x) * 4;
        let delta = 0;
        for (let channel = 0; channel < 4; channel++) {
          delta = Math.max(delta, Math.abs(canonical.data[offset + channel]! - actual.data[offset + channel]!));
        }
        if (delta > policy.channelTolerance) mismatchedPixels++;
      }
    }
    if (mismatchedPixels > policy.maxMismatchedPixels) {
      failures.push(
        `${renderer}: ${policy.label} differs at ${mismatchedPixels} pixels, expected at most ` +
          `${policy.maxMismatchedPixels} above channel tolerance ${policy.channelTolerance}`,
      );
    }
  }
}

export function readNativeReferenceRendererCaptures(directory: string): NativeReferenceRendererCaptureSet {
  const status = JSON.parse(readFileSync(join(directory, 'rust-status.json'), 'utf8')) as unknown;
  const fontBytes = readFileSync(join(directory, 'reference-font.sfnt'));
  const captures = {} as Record<NativeReferenceRenderer, NativeReferenceRendererCapture>;
  for (const renderer of ['rust-gl', 'rust-wgpu'] as const) {
    const stem = renderer === 'rust-gl' ? 'rust-gl' : 'rust-wgpu';
    captures[renderer] = {
      fontBytes,
      image: readRawRgba(join(directory, `${stem}-final.rgba`)),
      initialImage: readRawRgba(join(directory, `${stem}-initial.rgba`)),
      logs: readFileSync(join(directory, `${stem}.logs.jsonl`), 'utf8'),
      status,
    };
  }
  return captures;
}

function readRawRgba(path: string): DecodedPng {
  const data = readFileSync(path);
  const expected = REFERENCE_RENDERER_SCENE.width * REFERENCE_RENDERER_SCENE.height * 4;
  if (data.byteLength !== expected) throw new Error(`${path}: ${data.byteLength} bytes, expected ${expected}`);
  return {
    data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    height: REFERENCE_RENDERER_SCENE.height,
    width: REFERENCE_RENDERER_SCENE.width,
  };
}

export function readReferenceRendererCaptures(entryDirectory: string): ReferenceRendererCaptureSet {
  const captures = {} as Record<ReferenceRenderer, ReferenceRendererCapture>;
  for (const renderer of REFERENCE_RENDERERS) {
    const directory = join(entryDirectory, renderer);
    const decoded = decodeOraclePng(readFileSync(join(directory, 'screenshot.png')));
    if ('refused' in decoded) throw new Error(`${renderer}: screenshot PNG refused (${decoded.refused})`);
    captures[renderer] = {
      image: decoded.png,
      logs: readFileSync(join(directory, 'logs.jsonl'), 'utf8'),
      status: JSON.parse(readFileSync(join(directory, 'status.json'), 'utf8')) as unknown,
    };
  }
  return captures;
}

function validateCapture(
  renderer: ReferenceRenderer,
  capture: ReferenceRendererCapture,
  failures: string[],
  label: string = 'capture',
): void {
  const status = capture.status;
  if (!isRecord(status)) {
    failures.push(`${renderer}: ${label} status is not an object`);
  } else {
    if (status['state'] !== 'ready') failures.push(`${renderer}: ${label} state is not ready`);
    if (status['error'] !== null) failures.push(`${renderer}: ${label} carries an error`);
    if (status['oracle'] !== 'invoked') failures.push(`${renderer}: ${label} did not invoke its bitmap oracle`);
    const provenance = status['provenance'];
    if (!isRecord(provenance) || provenance['targetKind'] !== renderer) {
      failures.push(`${renderer}: ${label} target kind does not match its route`);
    } else if (provenance['environmentDescriptor'] !== REFERENCE_BROWSER_ENVIRONMENT_DESCRIPTOR) {
      failures.push(`${renderer}: ${label} browser environment descriptor is not pinned`);
    }
  }
  if (
    capture.image.width !== REFERENCE_RENDERER_SCENE.width ||
    capture.image.height !== REFERENCE_RENDERER_SCENE.height
  ) {
    failures.push(
      `${renderer}: ${label} is ${capture.image.width}x${capture.image.height}, expected ` +
        `${REFERENCE_RENDERER_SCENE.width}x${REFERENCE_RENDERER_SCENE.height}`,
    );
  }
  if (capture.logs.includes('createRenderProxy: node kind has no registered renderer')) {
    failures.push(`${renderer}: ${label} logged an undrawn renderer registry miss`);
  }
}

function validateNativeCapture(
  renderer: NativeReferenceRenderer,
  capture: NativeReferenceRendererCapture,
  failures: string[],
  label: string = 'capture',
): void {
  const expectedFontBytes = createReferenceRendererFontFixture().bytes;
  const status = capture.status;
  if (!isRecord(status)) {
    failures.push(`${renderer}: ${label} status is not an object`);
  } else {
    if (status['state'] !== 'ready') failures.push(`${renderer}: ${label} state is not ready`);
    if (status['width'] !== REFERENCE_RENDERER_SCENE.width || status['height'] !== REFERENCE_RENDERER_SCENE.height) {
      failures.push(`${renderer}: ${label} status dimensions do not match the scene contract`);
    }
    if (status['devicePixelRatio'] !== 1 || status['colorSpace'] !== 'srgb') {
      failures.push(`${renderer}: ${label} DPR/color space does not match the scene contract`);
    }
    if (status['fontBytes'] !== 2684 || status['fontFnv1a32'] !== 'f5d71ca9') {
      failures.push(`${renderer}: ${label} did not load the pinned generated SFNT bytes`);
    }
    if (renderer === 'rust-gl') {
      if (
        typeof status['glVersion'] !== 'string' ||
        !status['glVersion'].includes('4.5') ||
        status['glProfile'] !== 'core' ||
        typeof status['glRenderer'] !== 'string' ||
        !status['glRenderer'].toLowerCase().includes('llvmpipe')
      ) {
        failures.push(`${renderer}: ${label} did not use the pinned Mesa llvmpipe GL 4.5 core renderer`);
      }
    } else if (
      typeof status['wgpuAdapter'] !== 'string' ||
      !status['wgpuAdapter'].toLowerCase().includes('llvmpipe') ||
      String(status['wgpuBackend']).toLowerCase() !== 'vulkan'
    ) {
      failures.push(`${renderer}: ${label} did not use the pinned llvmpipe Vulkan adapter`);
    }
  }
  if (!equalBytes(capture.fontBytes, expectedFontBytes)) {
    failures.push(`${renderer}: ${label} SFNT bytes differ from the TypeScript fixture`);
  }
  if (capture.logs.trim() !== '') failures.push(`${renderer}: ${label} carries unexpected backend logs`);
  if (getBitmapMismatch(capture.initialImage, capture.image, 0).mismatchedPixels === 0) {
    failures.push(`${renderer}: ${label} initial and activated frames are identical`);
  }
}

function equalBytes(left: Readonly<Uint8Array>, right: Readonly<Uint8Array>): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const scriptPath = fileURLToPath(import.meta.url);
if (resolve(process.argv[1] ?? '') === resolve(scriptPath)) {
  const captureDirectory = process.argv[2];
  if (captureDirectory === undefined) {
    throw new Error(
      'usage: tsx scripts/reference-renderer-capture-parity.ts <capture-entry-dir> ' +
        '[repeat-entry-dir] [native-dir native-repeat-dir]',
    );
  }
  const repeatDirectory = process.argv[3];
  const nativeDirectory = process.argv[4];
  const nativeRepeatDirectory = process.argv[5];
  if ((nativeDirectory === undefined) !== (nativeRepeatDirectory === undefined)) {
    throw new Error('native capture and native repeat directories must be supplied together');
  }
  const report = compareReferenceRendererCaptures(
    readReferenceRendererCaptures(resolve(captureDirectory)),
    repeatDirectory === undefined ? null : readReferenceRendererCaptures(resolve(repeatDirectory)),
    nativeDirectory === undefined ? null : readNativeReferenceRendererCaptures(resolve(nativeDirectory)),
    nativeRepeatDirectory === undefined ? null : readNativeReferenceRendererCaptures(resolve(nativeRepeatDirectory)),
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}
