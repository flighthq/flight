import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getBitmapMismatch } from '../packages/bitmap/src/bitmapCompare.ts';
import { decodeOraclePng } from './reference-image-png.ts';
import type { DecodedPng } from './reference-image-png.ts';
import {
  REFERENCE_RASTER_PARITY_POLICY,
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

export interface ReferenceRendererParityMeasurement {
  readonly fraction: number;
  readonly maxChannelDelta: number;
  readonly mismatchedPixels: number;
  readonly renderer: 'webgl' | 'webgpu';
  readonly totalPixels: number;
}

export interface ReferenceRendererCaptureReport {
  readonly canonical: 'canvas';
  readonly determinism: Readonly<Record<ReferenceRenderer, number>> | null;
  readonly domRepresentation: 'registered-element-screenshot';
  readonly failures: readonly string[];
  readonly parity: readonly ReferenceRendererParityMeasurement[];
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
): ReferenceRendererCaptureReport {
  const failures: string[] = [];
  for (const renderer of REFERENCE_RENDERERS) validateCapture(renderer, captures[renderer], failures);

  const parity = (['webgl', 'webgpu'] as const).map((renderer): ReferenceRendererParityMeasurement => {
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
    return { renderer, ...mismatch };
  });

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

  return {
    canonical: 'canvas',
    determinism,
    domRepresentation: 'registered-element-screenshot',
    failures,
    parity,
    passed: failures.length === 0,
    policy: REFERENCE_RASTER_PARITY_POLICY,
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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const scriptPath = fileURLToPath(import.meta.url);
if (resolve(process.argv[1] ?? '') === resolve(scriptPath)) {
  const captureDirectory = process.argv[2];
  if (captureDirectory === undefined) {
    throw new Error('usage: tsx scripts/reference-renderer-capture-parity.ts <capture-entry-dir> [repeat-entry-dir]');
  }
  const repeatDirectory = process.argv[3];
  const report = compareReferenceRendererCaptures(
    readReferenceRendererCaptures(resolve(captureDirectory)),
    repeatDirectory === undefined ? null : readReferenceRendererCaptures(resolve(repeatDirectory)),
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}
