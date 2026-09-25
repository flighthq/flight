import { readdirSync, readFileSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import ts from 'typescript';

import { formatGateProvenance, readGateTreeState } from './gate-provenance.ts';

type HostBypassKindV1 = 'direct-dom' | 'input-ingress' | 'scratch-surface' | 'webgpu-acquisition';

type HostBypassKindV3 = HostBypassKindV1 | 'frame-scheduling';

export type HostBypassKind = HostBypassKindV3 | 'render-surface';

export type HostBypassExclusion =
  | 'explicit-web-adapter'
  | 'host-implementation'
  | 'transport'
  | 'window-attachment'
  | 'technology-specific-renderer'
  | 'test-support'
  | 'tooling';

export interface HostBypassSite {
  readonly column: number;
  readonly expression: string;
  readonly exclusion: HostBypassExclusion | null;
  readonly file: string;
  readonly functionName: string | null;
  readonly inputEventName: string | null;
  readonly inputListenerOperation: 'registration' | 'removal' | null;
  readonly kind: HostBypassKind | 'transport';
  readonly line: number;
}

export interface InputIngressListenerOperations {
  readonly registrationNames: readonly string[];
  readonly removalNames: readonly string[];
}

export interface HostBypassReport {
  readonly excluded: readonly HostBypassSite[];
  readonly sites: readonly HostBypassSite[];
  readonly scannedFiles: number;
}

// The empty report, owned beside the type it builds. See `createEmptyBackendLifecycleReport` for why
// every report type carries one: a fixture that needs a valid report rather than a particular one
// starts here, so a new field is supplied once instead of at each construction site.
export function createEmptyHostBypassReport(): HostBypassReport {
  return { excluded: [], sites: [], scannedFiles: 0 };
}

export type HostBypassBudget = Readonly<Record<HostBypassKind, number>>;

type HostBypassBudgetV1 = Readonly<Record<HostBypassKindV1, number>>;

type HostBypassBudgetV3 = Readonly<Record<HostBypassKindV3, number>>;

export interface HostBypassBudgetEvidence {
  readonly budget: HostBypassBudgetV1;
  readonly reason: string;
  readonly total: number;
}

export interface HostBypassV3BudgetEvidence {
  readonly budget: HostBypassBudgetV3;
  readonly reason: string;
  readonly total: number;
}

export interface HostBypassV4BudgetEvidence {
  readonly budget: HostBypassBudget;
  readonly reason: string;
  // Sites this checkpoint repaired, DECLARED by the entry rather than inferred from its position. The
  // delta alone cannot tell "repaired three sites" from "repaired one and mis-stated the total", and the
  // index-keyed table this replaces encoded that fact in a place no entry could keep true: inserting a
  // checkpoint ahead of pointer-lock would have silently reassigned its exception to a different repair.
  readonly repairedSites: number;
  readonly total: number;
}

const HOST_BYPASS_ACCEPTED_SLICE_GUIDANCE =
  'a host-bypass seam repair is complete only when every existing production consumer migrates in the same slice; a lowered census alone is incomplete';

export const HOST_BYPASS_SLICE_GUIDANCE = HOST_BYPASS_ACCEPTED_SLICE_GUIDANCE;

type HostBypassVersionedBudget = Readonly<Partial<Record<HostBypassKind, number>>>;

export interface HostBypassRecategorisation {
  readonly count: number;
  readonly from: HostBypassKind;
  readonly reason: string;
  readonly to: HostBypassKind;
}

export interface HostBypassNewDetection {
  readonly count: number;
  readonly kind: HostBypassKind;
  readonly reason: string;
}

export interface HostBypassClassificationEvidence {
  readonly fromBudget: HostBypassVersionedBudget;
  readonly fromTotal: number;
  readonly fromVersion: number;
  readonly newlyDetected: readonly HostBypassNewDetection[];
  readonly reason: string;
  readonly recategorised: readonly HostBypassRecategorisation[];
  readonly toBudget: HostBypassVersionedBudget;
  readonly toTotal: number;
  readonly toVersion: number;
}

export interface HostBypassDetectorProvenance {
  readonly detects: string;
  readonly zeroMeaning: string;
}

export interface HostBypassVersionedDetectorProvenance extends HostBypassDetectorProvenance {
  readonly taxonomyVersion: number;
}

// IMMUTABLE PREFIX. These accepted checkpoints pin every category, total and reason. History
// validation compares against this full prefix, so even a coherent category-and-total rewrite fails.
const HOST_BYPASS_ACCEPTED_BUDGET_HISTORY_PREFIX = [
  {
    budget: { 'direct-dom': 18, 'input-ingress': 26, 'scratch-surface': 18, 'webgpu-acquisition': 6 },
    reason: 'initial runtime-derived host-bypass census',
    total: 68,
  },
  {
    budget: { 'direct-dom': 18, 'input-ingress': 26, 'scratch-surface': 18, 'webgpu-acquisition': 0 },
    reason: 'WebGPU acquisition routed through the structural host backend',
    total: 62,
  },
  {
    budget: { 'direct-dom': 18, 'input-ingress': 0, 'scratch-surface': 18, 'webgpu-acquisition': 0 },
    reason: 'input listeners routed through the process-wide ingress backend',
    total: 36,
  },
  {
    budget: { 'direct-dom': 15, 'input-ingress': 0, 'scratch-surface': 18, 'webgpu-acquisition': 0 },
    reason: 'geolocation availability routed through the selected backend',
    total: 33,
  },
  {
    budget: { 'direct-dom': 15, 'input-ingress': 0, 'scratch-surface': 16, 'webgpu-acquisition': 0 },
    reason: 'Bitmap materialization routed through the selected image backend',
    total: 31,
  },
  {
    budget: { 'direct-dom': 14, 'input-ingress': 0, 'scratch-surface': 16, 'webgpu-acquisition': 0 },
    reason: 'Shortcut platform identity routed through the selected platform backend',
    total: 30,
  },
] as const satisfies readonly HostBypassBudgetEvidence[];

// APPEND ONLY. Each entry is an evidenced repair state, not a current number to edit in place. Future
// repairs append a lower state with its category breakdown and reason without editing the accepted
// prefix above.
export const HOST_BYPASS_BUDGET_HISTORY = [
  ...HOST_BYPASS_ACCEPTED_BUDGET_HISTORY_PREFIX,
] as const satisfies readonly HostBypassBudgetEvidence[];

// Classification changes are append-only evidence, not repairs. A pure relabel preserves the census;
// a discovery explicitly raises it. Keeping these events separate prevents a detector improvement from
// being disguised as repair progress or used to rewrite the accepted v1 checkpoints above.
const HOST_BYPASS_ACCEPTED_CLASSIFICATION_HISTORY_PREFIX = [
  {
    fromBudget: { 'direct-dom': 14, 'input-ingress': 0, 'scratch-surface': 16, 'webgpu-acquisition': 0 },
    fromTotal: 30,
    fromVersion: 1,
    newlyDetected: [],
    reason: 'navigator.getGamepads sampling recategorised as input ingress',
    recategorised: [
      {
        count: 2,
        from: 'direct-dom',
        reason: 'navigator.getGamepads capability read and poll call',
        to: 'input-ingress',
      },
    ],
    toBudget: { 'direct-dom': 12, 'input-ingress': 2, 'scratch-surface': 16, 'webgpu-acquisition': 0 },
    toTotal: 30,
    toVersion: 2,
  },
  {
    fromBudget: { 'direct-dom': 12, 'input-ingress': 2, 'scratch-surface': 16, 'webgpu-acquisition': 0 },
    fromTotal: 30,
    fromVersion: 2,
    newlyDetected: [
      {
        count: 3,
        kind: 'frame-scheduling',
        reason: 'two requestAnimationFrame calls and one cancelAnimationFrame call',
      },
    ],
    reason: 'gamepad frame scheduling added to host-bypass classification coverage',
    recategorised: [],
    toBudget: {
      'direct-dom': 12,
      'input-ingress': 2,
      'frame-scheduling': 3,
      'scratch-surface': 16,
      'webgpu-acquisition': 0,
    },
    toTotal: 33,
    toVersion: 3,
  },
  {
    fromBudget: {
      'direct-dom': 12,
      'input-ingress': 0,
      'frame-scheduling': 0,
      'scratch-surface': 16,
      'webgpu-acquisition': 0,
    },
    fromTotal: 28,
    fromVersion: 3,
    newlyDetected: [],
    reason: 'GL and WebGPU root canvases recategorised as caller-owned render surfaces',
    recategorised: [
      {
        count: 2,
        from: 'scratch-surface',
        reason: 'render-gl and render-wgpu root canvas factories',
        to: 'render-surface',
      },
    ],
    toBudget: {
      'direct-dom': 12,
      'input-ingress': 0,
      'frame-scheduling': 0,
      'scratch-surface': 14,
      'render-surface': 2,
      'webgpu-acquisition': 0,
    },
    toTotal: 28,
    toVersion: 4,
  },
] as const satisfies readonly HostBypassClassificationEvidence[];

export const HOST_BYPASS_CLASSIFICATION_HISTORY: readonly HostBypassClassificationEvidence[] = [
  ...HOST_BYPASS_ACCEPTED_CLASSIFICATION_HISTORY_PREFIX,
] as const satisfies readonly HostBypassClassificationEvidence[];

const HOST_BYPASS_ACCEPTED_V3_PROGRESS_HISTORY_PREFIX = [
  {
    budget: {
      'direct-dom': 12,
      'input-ingress': 2,
      'frame-scheduling': 3,
      'scratch-surface': 16,
      'webgpu-acquisition': 0,
    },
    reason: 'host-bypass taxonomy v3 classification baseline',
    total: 33,
  },
  {
    budget: {
      'direct-dom': 12,
      'input-ingress': 0,
      'frame-scheduling': 0,
      'scratch-surface': 16,
      'webgpu-acquisition': 0,
    },
    reason: 'gamepad sampling and scheduling moved into the explicit Web ingress adapter',
    total: 28,
  },
] as const satisfies readonly HostBypassV3BudgetEvidence[];

export const HOST_BYPASS_V3_PROGRESS_HISTORY = [
  ...HOST_BYPASS_ACCEPTED_V3_PROGRESS_HISTORY_PREFIX,
] as const satisfies readonly HostBypassV3BudgetEvidence[];

const HOST_BYPASS_ACCEPTED_V4_PROGRESS_HISTORY_PREFIX = [
  {
    budget: {
      'direct-dom': 12,
      'input-ingress': 0,
      'frame-scheduling': 0,
      'scratch-surface': 14,
      'render-surface': 2,
      'webgpu-acquisition': 0,
    },
    reason: 'host-bypass taxonomy v4 classification baseline',
    repairedSites: 0,
    total: 28,
  },
  {
    budget: {
      'direct-dom': 12,
      'input-ingress': 0,
      'frame-scheduling': 0,
      'scratch-surface': 14,
      'render-surface': 1,
      'webgpu-acquisition': 0,
    },
    reason: 'GL root-surface creation routed through the selected GL render-surface provider',
    repairedSites: 1,
    total: 27,
  },
  {
    budget: {
      'direct-dom': 12,
      'input-ingress': 0,
      'frame-scheduling': 0,
      'scratch-surface': 14,
      'render-surface': 0,
      'webgpu-acquisition': 0,
    },
    reason: 'WGPU root-surface creation routed through the selected WGPU render-surface provider',
    repairedSites: 1,
    total: 26,
  },
] as const satisfies readonly HostBypassV4BudgetEvidence[];

const HOST_BYPASS_BITMAP_DRAW_V4_PROGRESS = {
  budget: {
    'direct-dom': 12,
    'input-ingress': 0,
    'frame-scheduling': 0,
    'scratch-surface': 13,
    'render-surface': 0,
    'webgpu-acquisition': 0,
  },
  reason: 'Bitmap drawing allocates its pixel-transfer buffer through the caller-owned 2D context',
  repairedSites: 1,
  total: 25,
} as const satisfies HostBypassV4BudgetEvidence;

const HOST_BYPASS_INPUT_POINTER_LOCK_V4_PROGRESS = {
  budget: {
    'direct-dom': 9,
    'input-ingress': 0,
    'frame-scheduling': 0,
    'scratch-surface': 13,
    'render-surface': 0,
    'webgpu-acquisition': 0,
  },
  reason: 'Input pointer-lock exit and state queries routed through the selected input ingress backend',
  repairedSites: 3,
  total: 22,
} as const satisfies HostBypassV4BudgetEvidence;

const HOST_BYPASS_VIDEO_MIME_V4_PROGRESS = {
  budget: {
    'direct-dom': 8,
    'input-ingress': 0,
    'frame-scheduling': 0,
    'scratch-surface': 13,
    'render-surface': 0,
    'webgpu-acquisition': 0,
  },
  reason: 'Video MIME capability probing routed through the selected video capability backend',
  repairedSites: 1,
  total: 21,
} as const satisfies HostBypassV4BudgetEvidence;

const HOST_BYPASS_FONT_LOAD_V4_PROGRESS = {
  budget: {
    'direct-dom': 7,
    'input-ingress': 0,
    'frame-scheduling': 0,
    'scratch-surface': 13,
    'render-surface': 0,
    'webgpu-acquisition': 0,
  },
  reason: 'Font face loading routed through the selected font-loading backend',
  repairedSites: 1,
  total: 20,
} as const satisfies HostBypassV4BudgetEvidence;

const HOST_BYPASS_FONT_ADD_V4_PROGRESS = {
  budget: {
    'direct-dom': 6,
    'input-ingress': 0,
    'frame-scheduling': 0,
    'scratch-surface': 13,
    'render-surface': 0,
    'webgpu-acquisition': 0,
  },
  reason: 'Font face registration routed through the selected font-loading backend',
  repairedSites: 1,
  total: 19,
} as const satisfies HostBypassV4BudgetEvidence;

const HOST_BYPASS_FONT_CHECK_V4_PROGRESS = {
  budget: {
    'direct-dom': 5,
    'input-ingress': 0,
    'frame-scheduling': 0,
    'scratch-surface': 13,
    'render-surface': 0,
    'webgpu-acquisition': 0,
  },
  reason: 'Font availability check routed through the selected font-loading backend',
  repairedSites: 1,
  total: 18,
} as const satisfies HostBypassV4BudgetEvidence;

const HOST_BYPASS_FONT_READY_V4_PROGRESS = {
  budget: {
    'direct-dom': 4,
    'input-ingress': 0,
    'frame-scheduling': 0,
    'scratch-surface': 13,
    'render-surface': 0,
    'webgpu-acquisition': 0,
  },
  reason: 'Font readiness query routed through the selected font-loading backend',
  repairedSites: 1,
  total: 17,
} as const satisfies HostBypassV4BudgetEvidence;

const HOST_BYPASS_IMAGE_CAPTURE_V4_PROGRESS = {
  budget: {
    'direct-dom': 4,
    'input-ingress': 0,
    'frame-scheduling': 0,
    'scratch-surface': 12,
    'render-surface': 0,
    'webgpu-acquisition': 0,
  },
  reason: 'Image-resource capture composed through the existing image-source readback primitive',
  repairedSites: 1,
  total: 16,
} as const satisfies HostBypassV4BudgetEvidence;

const HOST_BYPASS_BITMAP_ENCODE_CANVAS_V4_PROGRESS = {
  budget: {
    'direct-dom': 4,
    'input-ingress': 0,
    'frame-scheduling': 0,
    'scratch-surface': 11,
    'render-surface': 0,
    'webgpu-acquisition': 0,
  },
  reason: 'Bitmap encoding scratch canvas creation routed through the selected bitmap encode backend',
  repairedSites: 1,
  total: 15,
} as const satisfies HostBypassV4BudgetEvidence;

const HOST_BYPASS_BITMAP_ENCODE_IMAGE_DATA_V4_PROGRESS = {
  budget: {
    'direct-dom': 4,
    'input-ingress': 0,
    'frame-scheduling': 0,
    'scratch-surface': 10,
    'render-surface': 0,
    'webgpu-acquisition': 0,
  },
  reason: 'Bitmap encoding ImageData construction routed through the selected bitmap encode backend',
  repairedSites: 1,
  total: 14,
} as const satisfies HostBypassV4BudgetEvidence;

// Immutable historical checkpoint: Screen R3 later deleted ScreenBackend, but this reason deliberately
// preserves the symbol used by the audited host-bypass repair when the checkpoint was recorded.
// One checkpoint for one slice. Both window-management sites were routed together, so the honest evidence
// is a single entry declaring what it repaired rather than two synthetic one-site steps.
const HOST_BYPASS_SCREEN_PERMISSION_V4_PROGRESS = {
  budget: {
    'direct-dom': 2,
    'input-ingress': 0,
    'frame-scheduling': 0,
    'scratch-surface': 10,
    'render-surface': 0,
    'webgpu-acquisition': 0,
  },
  reason:
    'window-management permission query and change subscription routed through two optional ScreenBackend operations',
  repairedSites: 2,
  total: 12,
} as const satisfies HostBypassV4BudgetEvidence;

const HOST_BYPASS_SHAPE_RASTER_SURFACE_V4_PROGRESS = {
  budget: {
    'direct-dom': 2,
    'input-ingress': 0,
    'frame-scheduling': 0,
    'scratch-surface': 8,
    'render-surface': 0,
    'webgpu-acquisition': 0,
  },
  reason: 'GL and WGPU shape raster scratch surfaces routed through the shared Raster2DSurfaceProvider',
  repairedSites: 2,
  total: 10,
} as const satisfies HostBypassV4BudgetEvidence;

const HOST_BYPASS_VIDEO_ELEMENT_V4_PROGRESS = {
  budget: {
    'direct-dom': 0,
    'input-ingress': 0,
    'frame-scheduling': 0,
    'scratch-surface': 8,
    'render-surface': 0,
    'webgpu-acquisition': 0,
  },
  reason: 'Video element creation routed through VideoCapabilityBackend.createVideoElement',
  repairedSites: 2,
  total: 8,
} as const satisfies HostBypassV4BudgetEvidence;

const HOST_BYPASS_BITMAP_READBACK_V4_PROGRESS = {
  budget: {
    'direct-dom': 0,
    'input-ingress': 0,
    'frame-scheduling': 0,
    'scratch-surface': 6,
    'render-surface': 0,
    'webgpu-acquisition': 0,
  },
  reason: 'Bitmap construction and explanation routed through the selected BitmapReadbackBackend',
  repairedSites: 2,
  total: 6,
} as const satisfies HostBypassV4BudgetEvidence;

const HOST_BYPASS_SCALE9_RASTER_SURFACE_V4_PROGRESS = {
  budget: {
    'direct-dom': 0,
    'input-ingress': 0,
    'frame-scheduling': 0,
    'scratch-surface': 4,
    'render-surface': 0,
    'webgpu-acquisition': 0,
  },
  reason: 'GL and WGPU Scale9 raster scratch surfaces routed through the shared Raster2DSurfaceProvider',
  repairedSites: 2,
  total: 4,
} as const satisfies HostBypassV4BudgetEvidence;

const HOST_BYPASS_TEXT_RASTER_SURFACE_V4_PROGRESS = {
  budget: {
    'direct-dom': 0,
    'input-ingress': 0,
    'frame-scheduling': 0,
    'scratch-surface': 0,
    'render-surface': 0,
    'webgpu-acquisition': 0,
  },
  reason: 'GL and WGPU RichText and TextLabel scratch surfaces routed through the shared Raster2DSurfaceProvider',
  repairedSites: 4,
  total: 0,
} as const satisfies HostBypassV4BudgetEvidence;
export const HOST_BYPASS_V4_PROGRESS_HISTORY = [
  ...HOST_BYPASS_ACCEPTED_V4_PROGRESS_HISTORY_PREFIX,
  HOST_BYPASS_BITMAP_DRAW_V4_PROGRESS,
  HOST_BYPASS_INPUT_POINTER_LOCK_V4_PROGRESS,
  HOST_BYPASS_VIDEO_MIME_V4_PROGRESS,
  HOST_BYPASS_FONT_LOAD_V4_PROGRESS,
  HOST_BYPASS_FONT_ADD_V4_PROGRESS,
  HOST_BYPASS_FONT_CHECK_V4_PROGRESS,
  HOST_BYPASS_FONT_READY_V4_PROGRESS,
  HOST_BYPASS_IMAGE_CAPTURE_V4_PROGRESS,
  HOST_BYPASS_BITMAP_ENCODE_CANVAS_V4_PROGRESS,
  HOST_BYPASS_BITMAP_ENCODE_IMAGE_DATA_V4_PROGRESS,
  HOST_BYPASS_SCREEN_PERMISSION_V4_PROGRESS,
  HOST_BYPASS_SHAPE_RASTER_SURFACE_V4_PROGRESS,
  HOST_BYPASS_VIDEO_ELEMENT_V4_PROGRESS,
  HOST_BYPASS_BITMAP_READBACK_V4_PROGRESS,
  HOST_BYPASS_SCALE9_RASTER_SURFACE_V4_PROGRESS,
  HOST_BYPASS_TEXT_RASTER_SURFACE_V4_PROGRESS,
] as const satisfies readonly HostBypassV4BudgetEvidence[];

const HOST_BYPASS_ACCEPTED_DETECTOR_PROVENANCE_HISTORY_PREFIX = [
  {
    detects:
      'hand-written floor (not an exhaustive ceiling): direct document/window/navigator access, input listener and gamepad sampling, frame scheduling, Canvas/ImageData/ImageBitmap scratch construction, and WebGPU adapter/device/context acquisition',
    taxonomyVersion: 3,
    zeroMeaning: 'category zero means none found by current detectors, not that no bypasses exist',
  },
  {
    detects:
      'hand-written floor (not an exhaustive ceiling): direct document/window/navigator access, input listener and gamepad sampling, frame scheduling, caller-owned GL/WebGPU render-surface construction, Canvas/ImageData/ImageBitmap scratch construction, and WebGPU adapter/device/context acquisition',
    taxonomyVersion: 4,
    zeroMeaning: 'category zero means none found by current detectors, not that no bypasses exist',
  },
] as const satisfies readonly HostBypassVersionedDetectorProvenance[];

export const HOST_BYPASS_DETECTOR_PROVENANCE_HISTORY = [
  ...HOST_BYPASS_ACCEPTED_DETECTOR_PROVENANCE_HISTORY_PREFIX,
] as const satisfies readonly HostBypassVersionedDetectorProvenance[];

export const HOST_BYPASS_DETECTOR_PROVENANCE: HostBypassVersionedDetectorProvenance = {
  ...HOST_BYPASS_DETECTOR_PROVENANCE_HISTORY[HOST_BYPASS_DETECTOR_PROVENANCE_HISTORY.length - 1],
};

// Category upper bounds, not source membership. The active budget is the latest evidenced repair in
// the current taxonomy, so there is no second lone number an ordinary bypass addition can edit green.
export const HOST_BYPASS_BUDGET: HostBypassBudget =
  HOST_BYPASS_V4_PROGRESS_HISTORY[HOST_BYPASS_V4_PROGRESS_HISTORY.length - 1].budget;

// Which argument of a WGPU entry point IS the presentation surface, which is the only thing that makes
// the ownership claim checkable at a call site. Both entry points take the host's WGPU provider first,
// so the surface sits one position right of where it did before `wgpuHost` was threaded through: the
// index is a function of the signature, not a fixed 0/1. A further signature change must move it here
// too — `wgpuSurfaceArgumentFailures` reads these declarations and fails the gate loudly when the
// recorded position no longer names `surface`, so a stale index cannot silently start reading the host.
const WGPU_SURFACE_ARGUMENT: Readonly<Record<string, { readonly file: string; readonly index: number }>> = {
  createWgpuAcquisition: { file: 'packages/render-wgpu/src/wgpuRenderState.ts', index: 1 },
  createWgpuScreenRenderTarget: { file: 'packages/render-wgpu/src/wgpuScreenRenderTarget.ts', index: 2 },
};

const PRESENTATION_PARAMETER_NAMES = new Set(['drawable', 'surface', 'target']);

const TRANSPORT_CONSTRUCTORS = new Set(['EventSource', 'Image', 'Request', 'WebSocket', 'XMLHttpRequest']);
const INPUT_EVENT_NAMES = new Set([
  'beforeinput',
  'compositionend',
  'compositionstart',
  'compositionupdate',
  'contextmenu',
  'gamepadconnected',
  'gamepaddisconnected',
  'keydown',
  'keyup',
  'mousemove',
  'pointercancel',
  'pointerdown',
  'pointermove',
  'pointerup',
  'touchcancel',
  'touchend',
  'touchmove',
  'touchstart',
  'wheel',
]);

/**
 * Derives the production TypeScript population from the workspace on every run. There is deliberately
 * no source-file allowlist: adding a package or file makes it part of the next scan automatically.
 */
export function scanHostBypasses(root: string): HostBypassReport {
  const packagesDirectory = join(root, 'packages');
  const files = collectProductionSourceFiles(packagesDirectory);
  const sites = files.flatMap((file) =>
    scanHostBypassSource(relative(root, file).split(sep).join('/'), readFileSync(file, 'utf8')),
  );
  return createHostBypassReport(files.length, sites);
}

export function scanHostBypassSource(file: string, source: string): HostBypassSite[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const webAdapterFunctions = collectWebAdapterFunctionNames(parsed);
  const sites: HostBypassSite[] = [];

  const visit = (node: ts.Node): void => {
    const functionNames = enclosingFunctionNames(node);
    const finding = classifyNode(node, parsed);
    if (finding !== null) {
      const start = node.getStart(parsed);
      const position = parsed.getLineAndCharacterOfPosition(start);
      const functionName = functionNames[0] ?? null;
      const structuralExclusion = classifyStructuralExclusion(file, functionNames, webAdapterFunctions);
      const kind =
        finding.kind === 'scratch-surface' && isRenderSurfaceFactory(file, functionNames)
          ? 'render-surface'
          : finding.kind;
      sites.push({
        column: position.character + 1,
        expression: node.getText(parsed),
        exclusion: finding.kind === 'transport' ? 'transport' : structuralExclusion,
        file,
        functionName,
        inputEventName: finding.inputEventName ?? null,
        inputListenerOperation: finding.inputListenerOperation ?? null,
        kind,
        line: position.line + 1,
      });

      // A finding represents the whole browser primitive. Do not also report its callee's nested
      // `navigator.gpu` / `document.createElement` property access as a second site.
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        for (const argument of node.arguments ?? []) ts.forEachChild(argument, visit);
        return;
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(parsed);
  return sites;
}

// A WebGPU page must not conjure its own PRESENTATION drawable. The target a screen target or an
// acquisition is given comes through the host capability seam: allocated by createWgpuSurface(host, w, h)
// and read off `surface.target`, or adopted from an existing element via
// createWebSurfaceFromElement(canvas).
//
// Scratch canvases a scene paints texture content into are deliberately NOT flagged here: they are a
// different bypass with its own kind ('scratch-surface') and its own budget. Only the surface that
// actually presents is this gate's subject, which is why the check follows the identifier handed to the
// presentation call rather than every createElement in the file.
export function wgpuRenderSurfaceConsumerSourceFailures(file: string, source: string): string[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const presentationSurfaces: { line: number; name: string }[] = [];
  const hostCanvasBindings = new Set<string>();
  let usesHostCanvas = false;

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
      // createWgpuSurface is async, so the binding's initializer is an await wrapping the call.
      const initializer = ts.isAwaitExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (ts.isCallExpression(initializer)) {
        const calledName = expressionName(initializer.expression);
        if (calledName === 'createWgpuSurface') {
          hostCanvasBindings.add(node.name.text);
          usesHostCanvas = true;
        } else if (
          calledName === 'createWebSurfaceFromElement' &&
          initializer.arguments.length >= 1 &&
          ts.isIdentifier(initializer.arguments[0])
        ) {
          hostCanvasBindings.add(node.name.text);
        }
      }
    }
    // `const target = wgpuSurface.target` carries the provenance of the surface it is read from: the
    // allocating seam returns the surface, and the target is the identity that surface already owns.
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      ts.isPropertyAccessExpression(node.initializer) &&
      node.initializer.name.text === 'target' &&
      ts.isIdentifier(node.initializer.expression) &&
      hostCanvasBindings.has(node.initializer.expression.text)
    ) {
      hostCanvasBindings.add(node.name.text);
    }
    if (ts.isCallExpression(node)) {
      const called = expressionName(node.expression);
      const surfaceArgument = called === null ? undefined : WGPU_SURFACE_ARGUMENT[called];
      if (called !== null && surfaceArgument !== undefined) {
        // createWgpuAcquisition(wgpuHost, surface, …) and createWgpuScreenRenderTarget(wgpuHost, device, surface, …).
        const surface = node.arguments[surfaceArgument.index];
        if (surface !== undefined && ts.isIdentifier(surface)) {
          presentationSurfaces.push({
            line: parsed.getLineAndCharacterOfPosition(surface.getStart(parsed)).line + 1,
            name: surface.text,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  if (presentationSurfaces.length === 0) return [];

  const failures: string[] = [];
  for (const surface of presentationSurfaces) {
    if (!hostCanvasBindings.has(surface.name)) {
      failures.push(
        `${file}:${surface.line}: WGPU presentation surface '${surface.name}' does not come from createWgpuSurface or createWebSurfaceFromElement`,
      );
    }
  }
  if (usesHostCanvas && !importsFromHostWeb(parsed, 'webHostWgpuContext')) {
    failures.push(`${file}: WGPU consumer does not import webHostWgpuContext from @flighthq/host-web`);
  }
  return failures;
}

function importsFromHostWeb(parsed: ts.SourceFile, name: string): boolean {
  return parsed.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === '@flighthq/host-web' &&
      statement.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(statement.importClause.namedBindings) &&
      statement.importClause.namedBindings.elements.some(
        (element) => element.propertyName === undefined && element.name.text === name,
      ),
  );
}

export function wgpuRenderSurfaceConsumerFailures(root: string): string[] {
  const failures: string[] = [];
  const functionalFiles: string[] = [];
  collectTypeScriptFiles(join(root, 'functional'), functionalFiles);
  for (const path of functionalFiles) {
    const file = relative(root, path).split(sep).join('/');
    failures.push(...wgpuRenderSurfaceConsumerSourceFailures(file, readFileSync(path, 'utf8')));
  }

  const harnessFile = 'tools/harness/webgpu.ts';
  const harnessSource = readFileSync(join(root, harnessFile), 'utf8');
  if (!harnessSource.includes('createWgpuSurface(')) {
    failures.push(
      `${harnessFile}: shared WebGPU harness no longer creates its surface through the host capability seam`,
    );
  } else {
    failures.push(...wgpuRenderSurfaceConsumerSourceFailures(harnessFile, harnessSource));
  }
  return failures;
}

// The gate checks a call site by position, so the position has to still name the surface. Reading the
// declaration rather than trusting the table is what keeps a re-threaded host parameter from turning
// the check into a comparison against whatever now sits at the old index.
export function wgpuSurfaceArgumentFailures(root: string): string[] {
  const failures: string[] = [];
  for (const [functionName, argument] of Object.entries(WGPU_SURFACE_ARGUMENT)) {
    const parameters = exportedFunctionParameterNames(join(root, argument.file), functionName);
    if (parameters === null) {
      failures.push(
        `${argument.file}: cannot read ${functionName} to confirm argument ${argument.index} is the presentation surface`,
      );
      continue;
    }
    // The names that mean "the thing being presented through". `drawable` is used where `surface` is
    // already taken in the same file by the live-size WgpuPresentationSurface view.
    if (!PRESENTATION_PARAMETER_NAMES.has(parameters[argument.index] ?? '')) {
      failures.push(
        `${functionName}: argument ${argument.index} is recorded as the presentation surface but names ` +
          `'${parameters[argument.index] ?? '<none>'}' in ${argument.file}`,
      );
    }
  }
  return failures;
}

export function wgpuRenderSurfaceRepairFailures(report: Readonly<HostBypassReport>): string[] {
  const remaining = report.sites
    .filter((site) => site.kind === 'render-surface')
    .map((site) => `${site.file}:${site.functionName ?? '<module>'}`);
  return remaining.length === 0 ? [] : [`S08 must leave no render surfaces; found [${remaining.join(', ')}]`];
}

export function bitmapDrawTransferRepairFailures(report: Readonly<HostBypassReport>): string[] {
  const remaining = report.sites
    .filter(
      (site) =>
        site.kind === 'scratch-surface' &&
        site.file === 'packages/bitmap/src/bitmapDraw.ts' &&
        site.functionName === 'drawBitmap',
    )
    .map((site) => `${site.file}:${site.functionName}`);
  return remaining.length === 0
    ? []
    : [`S09 must remove the bitmapDraw global ImageData transfer; found [${remaining.join(', ')}]`];
}

export function bitmapEncodeRepairFailures(report: Readonly<HostBypassReport>): string[] {
  const remaining = report.sites
    .filter(
      (site) =>
        site.kind === 'scratch-surface' &&
        site.file === 'packages/bitmap/src/bitmapEncode.ts' &&
        site.functionName === 'encodeBitmap',
    )
    .map((site) => `${site.file}:${site.functionName}:${site.expression}`);
  return remaining.length === 0
    ? []
    : [`Bitmap encoding must leave no portable scratch construction; found [${remaining.join(', ')}]`];
}

export function bitmapReadbackRepairFailures(report: Readonly<HostBypassReport>): string[] {
  const remaining = report.sites
    .filter(
      (site) =>
        site.kind === 'scratch-surface' &&
        ((site.file === 'packages/bitmap/src/bitmapFrom.ts' && site.functionName === 'createBitmapFromImageSource') ||
          (site.file === 'packages/bitmap/src/explainBitmapReadback.ts' &&
            site.functionName === 'explainBitmapReadback')),
    )
    .map((site) => `${site.file}:${site.functionName}`);
  return remaining.length === 0
    ? []
    : [`H15 must remove both bitmap-readback scratch surfaces; found [${remaining.join(', ')}]`];
}

export function shapeRasterSurfaceRepairFailures(report: Readonly<HostBypassReport>): string[] {
  const remaining = report.sites
    .filter(
      (site) =>
        site.kind === 'scratch-surface' &&
        ((site.file === 'packages/scene2d-gl/src/glShapeData.ts' &&
          site.functionName === 'acquireGlShapeRasterSurface') ||
          (site.file === 'packages/scene2d-wgpu/src/wgpuShapeData.ts' &&
            site.functionName === 'acquireWgpuShapeRasterSurface')),
    )
    .map((site) => `${site.file}:${site.functionName}`);
  return remaining.length === 0
    ? []
    : [`H8 must remove both shape-raster scratch surfaces; found [${remaining.join(', ')}]`];
}

export function scale9RasterSurfaceRepairFailures(report: Readonly<HostBypassReport>): string[] {
  const remaining = report.sites
    .filter(
      (site) =>
        site.kind === 'scratch-surface' &&
        ((site.file === 'packages/scene2d-gl/src/glScale9Shape.ts' &&
          site.functionName === 'createGlScale9ShapeData') ||
          (site.file === 'packages/scene2d-wgpu/src/wgpuScale9Shape.ts' &&
            site.functionName === 'createWgpuScale9ShapeData')),
    )
    .map((site) => `${site.file}:${site.functionName}`);
  return remaining.length === 0
    ? []
    : [`Scale9 must remove both raster scratch surfaces; found [${remaining.join(', ')}]`];
}

export function textRasterSurfaceRepairFailures(report: Readonly<HostBypassReport>): string[] {
  const remaining = report.sites
    .filter(
      (site) =>
        site.kind === 'scratch-surface' &&
        ((site.file === 'packages/scene2d-gl/src/glRichText.ts' && site.functionName === 'getOffscreenCanvas') ||
          (site.file === 'packages/scene2d-gl/src/glTextLabel.ts' && site.functionName === 'createGlTextLabelData') ||
          (site.file === 'packages/scene2d-wgpu/src/wgpuRichText.ts' && site.functionName === 'getOffscreenCanvas') ||
          (site.file === 'packages/scene2d-wgpu/src/wgpuTextLabel.ts' &&
            site.functionName === 'createWgpuTextLabelData')),
    )
    .map((site) => `${site.file}:${site.functionName}`);
  return remaining.length === 0
    ? []
    : [`H13 must remove all four text-raster scratch surfaces; found [${remaining.join(', ')}]`];
}

export function videoCapabilityRepairFailures(report: Readonly<HostBypassReport>): string[] {
  const failures: string[] = [];
  const target = report.sites.filter(
    (site) =>
      site.kind === 'direct-dom' &&
      site.file === 'packages/video/src/videoFormat.ts' &&
      site.functionName === 'canPlayVideoType' &&
      site.expression === "document.createElement('video')",
  );
  if (target.length > 0) {
    failures.push(
      `S10 must remove the videoFormat canPlayVideoType DOM probe; found [${target
        .map((site) => `${site.file}:${site.functionName}`)
        .join(', ')}]`,
    );
  }

  // H8-C repaired both videoResourceFrom sites by routing through VideoCapabilityBackend.
  // Verify the repair holds: these sites must NOT reappear as direct-dom.
  const repaired = report.sites.filter(
    (site) =>
      site.kind === 'direct-dom' &&
      site.file === 'packages/video/src/videoResourceFrom.ts' &&
      site.expression === "document.createElement('video')",
  );
  if (repaired.length > 0) {
    failures.push(
      `H8-C must keep videoResourceFrom routed through the backend; found [${repaired
        .map((site) => `${site.file}:${site.functionName}`)
        .join(', ')}]`,
    );
  }
  return failures;
}

export function createHostBypassReport(scannedFiles: number, sites: readonly HostBypassSite[]): HostBypassReport {
  const sorted = [...sites].sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.kind.localeCompare(b.kind),
  );
  return {
    excluded: sorted.filter((site) => site.exclusion !== null),
    sites: sorted.filter((site) => site.exclusion === null),
    scannedFiles,
  };
}

export function countHostBypasses(report: Readonly<HostBypassReport>): Record<HostBypassKind, number> {
  const counts: Record<HostBypassKind, number> = {
    'direct-dom': 0,
    'input-ingress': 0,
    'frame-scheduling': 0,
    'scratch-surface': 0,
    'render-surface': 0,
    'webgpu-acquisition': 0,
  };
  for (const site of report.sites) counts[site.kind as HostBypassKind]++;
  return counts;
}

export function deriveInputIngressListenerOperations(
  report: Readonly<HostBypassReport>,
): InputIngressListenerOperations {
  const sites = [...report.sites, ...report.excluded].filter(
    (site) => site.kind === 'input-ingress' && site.file === 'packages/host-web/src/webInputIngress.ts',
  );
  return {
    registrationNames: sites
      .filter((site) => site.inputListenerOperation === 'registration')
      .map((site) => site.inputEventName!)
      .sort(),
    removalNames: sites
      .filter((site) => site.inputListenerOperation === 'removal')
      .map((site) => site.inputEventName!)
      .sort(),
  };
}

export function inputIngressPairingFailures(operations: Readonly<InputIngressListenerOperations>): string[] {
  if (
    operations.registrationNames.length === operations.removalNames.length &&
    operations.registrationNames.every((name, index) => name === operations.removalNames[index])
  ) {
    return [];
  }
  return [
    `input-ingress listener names differ: registered [${operations.registrationNames.join(', ')}], removed [${operations.removalNames.join(', ')}]`,
  ];
}

export function hostBypassBudgetFailures(report: Readonly<HostBypassReport>, budget: HostBypassBudget): string[] {
  const counts = countHostBypasses(report);
  return (Object.keys(counts) as HostBypassKind[])
    .filter((kind) => counts[kind] > budget[kind])
    .map((kind) => `${kind}: found ${counts[kind]}, budget ${budget[kind]}`);
}

export function hostBypassCurrentBudgetFailures(
  report: Readonly<HostBypassReport>,
  budget: HostBypassBudget,
): string[] {
  const counts = countHostBypasses(report);
  const failures = (Object.keys(counts) as HostBypassKind[])
    .filter((kind) => counts[kind] !== budget[kind])
    .map((kind) => `host-bypass current ${kind}: found ${counts[kind]}, expected ${budget[kind]}`);
  const expectedTotal = totalHostBypassBudget(budget);
  if (report.sites.length !== expectedTotal) {
    failures.push(`host-bypass current outstanding: found ${report.sites.length}, expected ${expectedTotal}`);
  }
  return failures;
}

export function textRasterSurfaceCurrentFailures(report: Readonly<HostBypassReport>): string[] {
  return hostBypassCurrentBudgetFailures(report, HOST_BYPASS_TEXT_RASTER_SURFACE_V4_PROGRESS.budget);
}

export function hostBypassBudgetHistoryFailures(history: readonly HostBypassBudgetEvidence[]): string[] {
  if (history.length === 0) return ['host-bypass budget history is empty'];
  const failures: string[] = [];
  for (let index = 0; index < HOST_BYPASS_ACCEPTED_BUDGET_HISTORY_PREFIX.length; index++) {
    const accepted = HOST_BYPASS_ACCEPTED_BUDGET_HISTORY_PREFIX[index];
    const entry = history[index];
    if (entry === undefined || !hostBypassBudgetEvidenceMatches(entry, accepted)) {
      failures.push(
        `host-bypass budget history[${index}] rewrites immutable accepted checkpoint total ${accepted.total} (categories and reason are pinned)`,
      );
    }
  }
  for (let index = 0; index < history.length; index++) {
    const entry = history[index];
    const categoryTotal = totalHostBypassVersionedBudget(entry.budget);
    if (categoryTotal !== entry.total) {
      failures.push(
        `host-bypass budget history[${index}] category sum ${categoryTotal} does not match evidenced total ${entry.total}`,
      );
    }
    const prior = history[index - 1];
    if (prior !== undefined && entry.total >= prior.total) {
      failures.push(
        `host-bypass budget history[${index}] total ${entry.total} is not below prior total ${prior.total}`,
      );
    }
  }
  return failures;
}

export function hostBypassSliceGuidanceFailures(guidance: string): string[] {
  return guidance === HOST_BYPASS_ACCEPTED_SLICE_GUIDANCE
    ? []
    : ['host-bypass seam-slice guidance no longer requires same-slice production consumer migration'];
}

export function hostBypassClassificationHistoryFailures(
  history: readonly HostBypassClassificationEvidence[],
): string[] {
  if (history.length === 0) return ['host-bypass taxonomy history is empty'];
  const failures: string[] = [];
  for (let index = 0; index < HOST_BYPASS_ACCEPTED_CLASSIFICATION_HISTORY_PREFIX.length; index++) {
    const accepted = HOST_BYPASS_ACCEPTED_CLASSIFICATION_HISTORY_PREFIX[index];
    const entry = history[index];
    if (entry === undefined || !hostBypassClassificationEvidenceMatches(entry, accepted)) {
      failures.push(`host-bypass taxonomy history[${index}] rewrites immutable accepted classification evidence`);
    }
  }
  for (let index = 0; index < history.length; index++) {
    const entry = history[index];
    const fromCategoryTotal = totalHostBypassVersionedBudget(entry.fromBudget);
    const toCategoryTotal = totalHostBypassVersionedBudget(entry.toBudget);
    if (fromCategoryTotal !== entry.fromTotal) {
      failures.push(
        `host-bypass taxonomy history[${index}] before-category sum ${fromCategoryTotal} does not match evidenced total ${entry.fromTotal}`,
      );
    }
    if (toCategoryTotal !== entry.toTotal) {
      failures.push(
        `host-bypass taxonomy history[${index}] after-category sum ${toCategoryTotal} does not match evidenced total ${entry.toTotal}`,
      );
    }

    const newCount = entry.newlyDetected.reduce((sum, evidence) => sum + evidence.count, 0);
    if (newCount === 0 && entry.fromTotal !== entry.toTotal) {
      failures.push(
        `host-bypass taxonomy history[${index}] pure relabel changes total ${entry.fromTotal} -> ${entry.toTotal}`,
      );
    }
    if (entry.toTotal - entry.fromTotal !== newCount) {
      failures.push(
        `host-bypass taxonomy history[${index}] census delta ${entry.toTotal - entry.fromTotal} does not match ${newCount} newly detected sites`,
      );
    }

    const derived = completeHostBypassBudget(entry.fromBudget);
    for (const recategorisation of entry.recategorised) {
      derived[recategorisation.from] -= recategorisation.count;
      derived[recategorisation.to] += recategorisation.count;
    }
    for (const detection of entry.newlyDetected) derived[detection.kind] += detection.count;
    if (!hostBypassBudgetsMatch(derived, entry.toBudget)) {
      failures.push(
        `host-bypass taxonomy history[${index}] derived categories do not match its evidenced after-budget`,
      );
    }

    if (entry.toVersion !== entry.fromVersion + 1) {
      failures.push(
        `host-bypass taxonomy history[${index}] version ${entry.fromVersion} does not advance exactly once to ${entry.toVersion}`,
      );
    }
    const prior = history[index - 1];
    if (
      prior !== undefined &&
      (entry.fromVersion !== prior.toVersion ||
        (!hostBypassBudgetsMatch(entry.fromBudget, prior.toBudget) &&
          !hostBypassClassificationStartsFromAcceptedProgress(entry)))
    ) {
      failures.push(`host-bypass taxonomy history[${index}] does not continue the prior classification state`);
    }
  }
  return failures;
}

export function hostBypassV3ProgressHistoryFailures(history: readonly HostBypassV3BudgetEvidence[]): string[] {
  if (history.length === 0) return ['host-bypass taxonomy v3 progress history is empty'];
  const failures: string[] = [];
  for (let index = 0; index < HOST_BYPASS_ACCEPTED_V3_PROGRESS_HISTORY_PREFIX.length; index++) {
    const accepted = HOST_BYPASS_ACCEPTED_V3_PROGRESS_HISTORY_PREFIX[index];
    const entry = history[index];
    if (entry === undefined || !hostBypassV3BudgetEvidenceMatches(entry, accepted)) {
      failures.push(`host-bypass taxonomy v3 progress history[${index}] rewrites immutable accepted checkpoint`);
    }
  }
  for (let index = 0; index < history.length; index++) {
    const entry = history[index];
    const categoryTotal = totalHostBypassVersionedBudget(entry.budget);
    if (categoryTotal !== entry.total) {
      failures.push(
        `host-bypass taxonomy v3 progress history[${index}] category sum ${categoryTotal} does not match evidenced total ${entry.total}`,
      );
    }
    const prior = history[index - 1];
    if (prior !== undefined && entry.total >= prior.total) {
      failures.push(
        `host-bypass taxonomy v3 progress history[${index}] total ${entry.total} is not below prior total ${prior.total}`,
      );
    }
  }
  return failures;
}

export function hostBypassV4ProgressHistoryFailures(history: readonly HostBypassV4BudgetEvidence[]): string[] {
  if (history.length === 0) return ['host-bypass taxonomy v4 progress history is empty'];
  const failures: string[] = [];
  for (let index = 0; index < HOST_BYPASS_ACCEPTED_V4_PROGRESS_HISTORY_PREFIX.length; index++) {
    const accepted = HOST_BYPASS_ACCEPTED_V4_PROGRESS_HISTORY_PREFIX[index];
    const entry = history[index];
    if (entry === undefined || !hostBypassV4BudgetEvidenceMatches(entry, accepted)) {
      failures.push(`host-bypass taxonomy v4 progress history[${index}] rewrites immutable accepted checkpoint`);
    }
  }
  const pointerLockEntry = findHostBypassV4ProgressEntry(history, HOST_BYPASS_INPUT_POINTER_LOCK_V4_PROGRESS.reason);
  if (
    pointerLockEntry === undefined ||
    !hostBypassV4BudgetEvidenceMatches(pointerLockEntry, HOST_BYPASS_INPUT_POINTER_LOCK_V4_PROGRESS)
  ) {
    failures.push(
      'Input pointer-lock taxonomy v4 progress checkpoint no longer pins the exact total, categories, and reason',
    );
  }
  for (let index = 0; index < history.length; index++) {
    const entry = history[index];
    const categoryTotal = totalHostBypassBudget(entry.budget);
    if (categoryTotal !== entry.total) {
      failures.push(
        `host-bypass taxonomy v4 progress history[${index}] category sum ${categoryTotal} does not match evidenced total ${entry.total}`,
      );
    }
    const prior = history[index - 1];
    if (prior !== undefined && entry.total >= prior.total) {
      failures.push(
        `host-bypass taxonomy v4 progress history[${index}] total ${entry.total} is not below prior total ${prior.total}`,
      );
    }
    if (prior !== undefined && entry.total !== prior.total - entry.repairedSites) {
      failures.push(
        `host-bypass taxonomy v4 progress history[${index}] declares ${entry.repairedSites} repaired site(s) but moves ${prior.total} -> ${entry.total}`,
      );
    }
  }
  return failures;
}

export function bitmapDrawTransferProgressFailures(history: readonly HostBypassV4BudgetEvidence[]): string[] {
  const entry = findHostBypassV4ProgressEntry(history, HOST_BYPASS_BITMAP_DRAW_V4_PROGRESS.reason);
  return entry !== undefined && hostBypassV4BudgetEvidenceMatches(entry, HOST_BYPASS_BITMAP_DRAW_V4_PROGRESS)
    ? []
    : ['S09 taxonomy v4 progress checkpoint no longer pins the exact total, categories, and reason'];
}

export function bitmapEncodeProgressFailures(history: readonly HostBypassV4BudgetEvidence[]): string[] {
  const canvas = history[11];
  const imageData = history[12];
  return canvas !== undefined &&
    imageData !== undefined &&
    hostBypassV4BudgetEvidenceMatches(canvas, HOST_BYPASS_BITMAP_ENCODE_CANVAS_V4_PROGRESS) &&
    hostBypassV4BudgetEvidenceMatches(imageData, HOST_BYPASS_BITMAP_ENCODE_IMAGE_DATA_V4_PROGRESS)
    ? []
    : ['Bitmap encode taxonomy v4 progress checkpoints no longer pin the exact totals, categories, and reasons'];
}

export function bitmapReadbackProgressFailures(history: readonly HostBypassV4BudgetEvidence[]): string[] {
  const entry = findHostBypassV4ProgressEntry(history, HOST_BYPASS_BITMAP_READBACK_V4_PROGRESS.reason);
  return entry !== undefined && hostBypassV4BudgetEvidenceMatches(entry, HOST_BYPASS_BITMAP_READBACK_V4_PROGRESS)
    ? []
    : [
        'H15 bitmap-readback taxonomy v4 progress checkpoint no longer pins the exact total, categories, repair count, and reason',
      ];
}

export function videoCapabilityProgressFailures(history: readonly HostBypassV4BudgetEvidence[]): string[] {
  const entry = findHostBypassV4ProgressEntry(history, HOST_BYPASS_VIDEO_MIME_V4_PROGRESS.reason);
  return entry !== undefined && hostBypassV4BudgetEvidenceMatches(entry, HOST_BYPASS_VIDEO_MIME_V4_PROGRESS)
    ? []
    : ['S10 taxonomy v4 progress checkpoint no longer pins the exact total, categories, and reason'];
}

export function shapeRasterSurfaceProgressFailures(history: readonly HostBypassV4BudgetEvidence[]): string[] {
  const entry = findHostBypassV4ProgressEntry(history, HOST_BYPASS_SHAPE_RASTER_SURFACE_V4_PROGRESS.reason);
  return entry !== undefined && hostBypassV4BudgetEvidenceMatches(entry, HOST_BYPASS_SHAPE_RASTER_SURFACE_V4_PROGRESS)
    ? []
    : [
        'H8 shape-raster taxonomy v4 progress checkpoint no longer pins the exact total, categories, repair count, and reason',
      ];
}

export function scale9RasterSurfaceProgressFailures(history: readonly HostBypassV4BudgetEvidence[]): string[] {
  const entry = findHostBypassV4ProgressEntry(history, HOST_BYPASS_SCALE9_RASTER_SURFACE_V4_PROGRESS.reason);
  return entry !== undefined && hostBypassV4BudgetEvidenceMatches(entry, HOST_BYPASS_SCALE9_RASTER_SURFACE_V4_PROGRESS)
    ? []
    : [
        'Scale9 raster taxonomy v4 progress checkpoint no longer pins the exact total, categories, repair count, and reason',
      ];
}

export function textRasterSurfaceProgressFailures(history: readonly HostBypassV4BudgetEvidence[]): string[] {
  const entry = findHostBypassV4ProgressEntry(history, HOST_BYPASS_TEXT_RASTER_SURFACE_V4_PROGRESS.reason);
  return entry !== undefined && hostBypassV4BudgetEvidenceMatches(entry, HOST_BYPASS_TEXT_RASTER_SURFACE_V4_PROGRESS)
    ? []
    : [
        'H13 text-raster taxonomy v4 progress checkpoint no longer pins the exact total, categories, repair count, and reason',
      ];
}

export function hostBypassDetectorProvenanceHistoryFailures(
  history: readonly HostBypassVersionedDetectorProvenance[],
): string[] {
  const failures: string[] = [];
  for (let index = 0; index < HOST_BYPASS_ACCEPTED_DETECTOR_PROVENANCE_HISTORY_PREFIX.length; index++) {
    const accepted = HOST_BYPASS_ACCEPTED_DETECTOR_PROVENANCE_HISTORY_PREFIX[index];
    const entry = history[index];
    if (entry === undefined || JSON.stringify(entry) !== JSON.stringify(accepted)) {
      failures.push(
        `host-bypass detector provenance history[${index}] rewrites immutable taxonomy v${accepted.taxonomyVersion}`,
      );
    }
  }
  return failures;
}

export function hostBypassDetectorProvenanceFailures(provenance: Readonly<HostBypassDetectorProvenance>): string[] {
  const accepted = HOST_BYPASS_ACCEPTED_DETECTOR_PROVENANCE_HISTORY_PREFIX.at(-1)!;
  const failures: string[] = [];
  if (provenance.detects !== accepted.detects) {
    failures.push('host-bypass detector provenance rewrites the accepted hand-written detection floor');
  }
  if (provenance.zeroMeaning !== accepted.zeroMeaning) {
    failures.push('host-bypass detector provenance rewrites the accepted non-exhaustive zero meaning');
  }
  return failures;
}

function hostBypassBudgetEvidenceMatches(
  entry: Readonly<HostBypassBudgetEvidence>,
  accepted: Readonly<HostBypassBudgetEvidence>,
): boolean {
  return (
    entry.total === accepted.total &&
    entry.reason === accepted.reason &&
    entry.budget['direct-dom'] === accepted.budget['direct-dom'] &&
    entry.budget['input-ingress'] === accepted.budget['input-ingress'] &&
    entry.budget['scratch-surface'] === accepted.budget['scratch-surface'] &&
    entry.budget['webgpu-acquisition'] === accepted.budget['webgpu-acquisition']
  );
}

function hostBypassClassificationEvidenceMatches(
  entry: Readonly<HostBypassClassificationEvidence>,
  accepted: Readonly<HostBypassClassificationEvidence>,
): boolean {
  return JSON.stringify(entry) === JSON.stringify(accepted);
}

function hostBypassClassificationStartsFromAcceptedProgress(
  entry: Readonly<HostBypassClassificationEvidence>,
): boolean {
  if (entry.fromVersion !== 3) return false;
  const latest = HOST_BYPASS_V3_PROGRESS_HISTORY[HOST_BYPASS_V3_PROGRESS_HISTORY.length - 1];
  return entry.fromTotal === latest.total && hostBypassBudgetsMatch(entry.fromBudget, latest.budget);
}

function hostBypassV3BudgetEvidenceMatches(
  entry: Readonly<HostBypassV3BudgetEvidence>,
  accepted: Readonly<HostBypassV3BudgetEvidence>,
): boolean {
  return (
    entry.total === accepted.total &&
    entry.reason === accepted.reason &&
    hostBypassBudgetsMatch(entry.budget, accepted.budget)
  );
}

function hostBypassV4BudgetEvidenceMatches(
  entry: Readonly<HostBypassV4BudgetEvidence>,
  accepted: Readonly<HostBypassV4BudgetEvidence>,
): boolean {
  return (
    entry.total === accepted.total &&
    entry.reason === accepted.reason &&
    entry.repairedSites === accepted.repairedSites &&
    hostBypassBudgetsMatch(entry.budget, accepted.budget)
  );
}

function findHostBypassV4ProgressEntry(
  history: readonly HostBypassV4BudgetEvidence[],
  reason: string,
): HostBypassV4BudgetEvidence | undefined {
  return history.find((entry) => entry.reason === reason);
}

function completeHostBypassBudget(budget: HostBypassVersionedBudget): Record<HostBypassKind, number> {
  return {
    'direct-dom': budget['direct-dom'] ?? 0,
    'input-ingress': budget['input-ingress'] ?? 0,
    'frame-scheduling': budget['frame-scheduling'] ?? 0,
    'scratch-surface': budget['scratch-surface'] ?? 0,
    'render-surface': budget['render-surface'] ?? 0,
    'webgpu-acquisition': budget['webgpu-acquisition'] ?? 0,
  };
}

function hostBypassBudgetsMatch(left: HostBypassVersionedBudget, right: HostBypassVersionedBudget): boolean {
  const completedLeft = completeHostBypassBudget(left);
  const completedRight = completeHostBypassBudget(right);
  return (Object.keys(completedLeft) as HostBypassKind[]).every((kind) => completedLeft[kind] === completedRight[kind]);
}

function totalHostBypassVersionedBudget(budget: HostBypassVersionedBudget): number {
  return Object.values(budget).reduce((sum, count) => sum + (count ?? 0), 0);
}

export function totalHostBypassBudget(budget: HostBypassBudget): number {
  return Object.values(budget).reduce((sum, count) => sum + count, 0);
}

export function formatHostBypassReport(report: Readonly<HostBypassReport>): string {
  const counts = countHostBypasses(report);
  const lines = [
    formatGateProvenance(
      {
        command: 'npm run check:host-bypasses (scripts/check-host-bypasses.ts)',
        counting:
          'one unit = one packages/*/src/**/*.ts file scanned; a site is one direct host-API expression, tallied per detected kind',
        scope:
          'runtime directory walk of packages/*/src/**/*.ts with no file roster; tests and helpers, host-* implementations, tool-* sources, explicit *Web* adapters, *-dom and *-canvas technology adapters, window attachment and transport syntax all excluded',
      },
      readGateTreeState(process.cwd()),
    ),
    'host-bypass census',
    `SCANNED ${report.scannedFiles} packages/*/src/**/*.ts files (runtime directory walk; no file roster)`,
    `SLICE ${HOST_BYPASS_SLICE_GUIDANCE}`,
    `TAXONOMY v${HOST_BYPASS_DETECTOR_PROVENANCE.taxonomyVersion}`,
    `DETECTS ${HOST_BYPASS_DETECTOR_PROVENANCE.detects}`,
    `ZERO ${HOST_BYPASS_DETECTOR_PROVENANCE.zeroMeaning}`,
    'EXCLUDES tests/helpers, host-* implementations, tool-* sources, explicit *Web* adapters, *-dom/*-canvas technology adapters, application window attachment, and fetch/socket/EventSource/WebSocket/XHR/Request/Image transport syntax',
    `host-bypass outstanding=${report.sites.length} ${Object.entries(counts)
      .map(([kind, count]) => `${kind}=${count}`)
      .join(' ')}`,
    'host-bypass budget history (append-only)',
  ];
  for (let index = 0; index < HOST_BYPASS_BUDGET_HISTORY.length; index++) {
    const entry = HOST_BYPASS_BUDGET_HISTORY[index];
    const prior = HOST_BYPASS_BUDGET_HISTORY[index - 1];
    const delta = prior === undefined ? '' : ` (-${prior.total - entry.total} fixed)`;
    lines.push(
      `  ${entry.total}${delta} ${Object.entries(entry.budget)
        .map(([kind, count]) => `${kind}=${count}`)
        .join(' ')} — ${entry.reason}`,
    );
  }
  lines.push('host-bypass taxonomy history (append-only)');
  for (const entry of HOST_BYPASS_CLASSIFICATION_HISTORY) {
    const recategorised = entry.recategorised.reduce((sum, evidence) => sum + evidence.count, 0);
    const newlyDetected = entry.newlyDetected.reduce((sum, evidence) => sum + evidence.count, 0);
    const recategorisationProvenance =
      entry.recategorised.length === 0
        ? 'none'
        : entry.recategorised.map((evidence) => `${evidence.from}->${evidence.to}=${evidence.count}`).join(',');
    const discoveryProvenance =
      entry.newlyDetected.length === 0
        ? 'none'
        : entry.newlyDetected.map((evidence) => `${evidence.kind}=${evidence.count}`).join(',');
    const censusDelta = entry.toTotal - entry.fromTotal;
    const delta = censusDelta === 0 ? '0 census delta' : `${censusDelta > 0 ? '+' : ''}${censusDelta} classified`;
    lines.push(
      `  v${entry.fromVersion} -> v${entry.toVersion} total ${entry.fromTotal} -> ${entry.toTotal} (${delta}) recategorised=${recategorised} from-to=${recategorisationProvenance} new=${newlyDetected} detected=${discoveryProvenance} — ${entry.reason}`,
    );
  }
  lines.push('host-bypass repair history (taxonomy v3)');
  for (let index = 0; index < HOST_BYPASS_V3_PROGRESS_HISTORY.length; index++) {
    const entry = HOST_BYPASS_V3_PROGRESS_HISTORY[index];
    const prior = HOST_BYPASS_V3_PROGRESS_HISTORY[index - 1];
    const delta = prior === undefined ? '' : ` (-${prior.total - entry.total} fixed)`;
    lines.push(
      `  ${entry.total}${delta} ${Object.entries(entry.budget)
        .map(([kind, count]) => `${kind}=${count}`)
        .join(' ')} — ${entry.reason}`,
    );
  }
  lines.push('host-bypass repair history (taxonomy v4)');
  for (let index = 0; index < HOST_BYPASS_V4_PROGRESS_HISTORY.length; index++) {
    const entry = HOST_BYPASS_V4_PROGRESS_HISTORY[index];
    const prior = HOST_BYPASS_V4_PROGRESS_HISTORY[index - 1];
    const delta = prior === undefined ? '' : ` (-${prior.total - entry.total} fixed)`;
    lines.push(
      `  ${entry.total}${delta} ${Object.entries(entry.budget)
        .map(([kind, count]) => `${kind}=${count}`)
        .join(' ')} — ${entry.reason}`,
    );
  }
  for (const site of report.sites)
    lines.push(`  ${site.kind} ${site.file}:${site.line}:${site.column} ${site.expression}`);

  const excludedCounts = new Map<HostBypassExclusion, number>();
  for (const site of report.excluded) {
    const exclusion = site.exclusion as HostBypassExclusion;
    excludedCounts.set(exclusion, (excludedCounts.get(exclusion) ?? 0) + 1);
  }
  lines.push(
    `EXCLUDED ${[...excludedCounts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([reason, count]) => `${reason}=${count}`)
      .join(' ')}`,
  );
  lines.push(
    'TRANSPORT PARTITION primitives=fetch,XMLHttpRequest,Request,Image,WebSocket,EventSource (reported here; enforced only by the independent transport gate)',
  );
  for (const site of report.excluded.filter((candidate) => candidate.exclusion === 'transport')) {
    lines.push(`  TRANSPORT ${site.file}:${site.line}:${site.column} ${site.expression}`);
  }
  return lines.join('\n');
}

if (isMainModule(import.meta.url, process.argv[1])) {
  const report = scanHostBypasses(process.cwd());
  process.stdout.write(`${formatHostBypassReport(report)}\n`);
  const failures = [
    ...hostBypassBudgetHistoryFailures(HOST_BYPASS_BUDGET_HISTORY),
    ...hostBypassSliceGuidanceFailures(HOST_BYPASS_SLICE_GUIDANCE),
    ...hostBypassClassificationHistoryFailures(HOST_BYPASS_CLASSIFICATION_HISTORY),
    ...hostBypassV3ProgressHistoryFailures(HOST_BYPASS_V3_PROGRESS_HISTORY),
    ...hostBypassV4ProgressHistoryFailures(HOST_BYPASS_V4_PROGRESS_HISTORY),
    ...bitmapDrawTransferProgressFailures(HOST_BYPASS_V4_PROGRESS_HISTORY),
    ...bitmapEncodeProgressFailures(HOST_BYPASS_V4_PROGRESS_HISTORY),
    ...bitmapReadbackProgressFailures(HOST_BYPASS_V4_PROGRESS_HISTORY),
    ...videoCapabilityProgressFailures(HOST_BYPASS_V4_PROGRESS_HISTORY),
    ...shapeRasterSurfaceProgressFailures(HOST_BYPASS_V4_PROGRESS_HISTORY),
    ...scale9RasterSurfaceProgressFailures(HOST_BYPASS_V4_PROGRESS_HISTORY),
    ...textRasterSurfaceProgressFailures(HOST_BYPASS_V4_PROGRESS_HISTORY),
    ...hostBypassDetectorProvenanceHistoryFailures(HOST_BYPASS_DETECTOR_PROVENANCE_HISTORY),
    ...hostBypassDetectorProvenanceFailures(HOST_BYPASS_DETECTOR_PROVENANCE),
    ...wgpuRenderSurfaceConsumerFailures(process.cwd()),
    ...wgpuSurfaceArgumentFailures(process.cwd()),
    ...wgpuRenderSurfaceRepairFailures(report),
    ...bitmapDrawTransferRepairFailures(report),
    ...bitmapEncodeRepairFailures(report),
    ...bitmapReadbackRepairFailures(report),
    ...videoCapabilityRepairFailures(report),
    ...shapeRasterSurfaceRepairFailures(report),
    ...scale9RasterSurfaceRepairFailures(report),
    ...textRasterSurfaceRepairFailures(report),
    ...hostBypassBudgetFailures(report, HOST_BYPASS_BUDGET),
    ...hostBypassCurrentBudgetFailures(report, HOST_BYPASS_BUDGET),
    ...textRasterSurfaceCurrentFailures(report),
  ];
  if (failures.length > 0) {
    process.stderr.write(`host-bypass ratchet exceeded:\n${failures.map((failure) => `- ${failure}`).join('\n')}\n`);
    process.exitCode = 1;
  }
}

function collectProductionSourceFiles(packagesDirectory: string): string[] {
  const files: string[] = [];
  for (const packageEntry of readdirSync(packagesDirectory, { withFileTypes: true })) {
    if (!packageEntry.isDirectory()) continue;
    if (packageEntry.name.startsWith('tool-')) continue;
    const sourceDirectory = join(packagesDirectory, packageEntry.name, 'src');
    collectTypeScriptFiles(sourceDirectory, files);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function collectTypeScriptFiles(directory: string, files: string[]): void {
  let entries: Dirent<string>[];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectTypeScriptFiles(path, files);
      continue;
    }
    if (
      !entry.isFile() ||
      !entry.name.endsWith('.ts') ||
      entry.name.endsWith('.d.ts') ||
      /\.(?:test|spec)\.ts$/.test(entry.name) ||
      entry.name.endsWith('TestHelper.ts')
    ) {
      continue;
    }
    files.push(path);
  }
}

function exportedFunctionParameterNames(file: string, functionName: string): readonly string[] | null {
  let source: string;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  let names: readonly string[] | null = null;
  const visit = (node: ts.Node): void => {
    if (names === null && ts.isFunctionDeclaration(node) && node.name?.text === functionName) {
      names = node.parameters.map((parameter) => (ts.isIdentifier(parameter.name) ? parameter.name.text : ''));
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return names;
}

function classifyNode(
  node: ts.Node,
  source: ts.SourceFile,
): {
  readonly inputEventName?: string;
  readonly inputListenerOperation?: 'registration' | 'removal';
  readonly kind: HostBypassKind | 'transport';
} | null {
  if (ts.isNewExpression(node)) {
    const constructorName = expressionName(node.expression);
    if (constructorName === 'ImageData' || constructorName === 'OffscreenCanvas') return { kind: 'scratch-surface' };
    if (constructorName !== null && TRANSPORT_CONSTRUCTORS.has(constructorName)) return { kind: 'transport' };
    return null;
  }

  if (ts.isCallExpression(node)) {
    const calledName = expressionName(node.expression);
    if (calledName === 'fetch') return { kind: 'transport' };
    if (calledName === 'getGamepads' && isRootedInBrowserGlobal(node.expression)) {
      return { kind: 'input-ingress' };
    }
    if (isGlobalFrameSchedulingCall(node.expression)) return { kind: 'frame-scheduling' };
    if (calledName === 'createImageBitmap') return { kind: 'scratch-surface' };
    if (calledName === 'createElement' && firstStringArgument(node) === 'canvas') return { kind: 'scratch-surface' };
    if (calledName === 'createElement' || calledName === 'createTextNode') return { kind: 'direct-dom' };
    if (calledName === 'requestAdapter' || calledName === 'requestDevice') return { kind: 'webgpu-acquisition' };
    if (calledName === 'getContext' && firstStringArgument(node) === 'webgpu') return { kind: 'webgpu-acquisition' };
    if (
      (calledName === 'addEventListener' || calledName === 'removeEventListener') &&
      INPUT_EVENT_NAMES.has(firstStringArgument(node) ?? '')
    ) {
      return {
        inputEventName: firstStringArgument(node)!,
        inputListenerOperation: calledName === 'addEventListener' ? 'registration' : 'removal',
        kind: 'input-ingress',
      };
    }
    if (isRootedInBrowserGlobal(node.expression)) {
      return expressionContainsName(node.expression, 'gpu') ? { kind: 'webgpu-acquisition' } : { kind: 'direct-dom' };
    }
    return null;
  }

  if (
    ts.isPropertyAccessExpression(node) &&
    !isInsideRecognizedCallOrConstruction(node, source) &&
    isRootedInBrowserGlobal(node)
  ) {
    if (node.name.text === 'getGamepads') return { kind: 'input-ingress' };
    return expressionContainsName(node, 'gpu') ? { kind: 'webgpu-acquisition' } : { kind: 'direct-dom' };
  }
  return null;
}

function isRenderSurfaceFactory(file: string, functionNames: readonly string[]): boolean {
  return (
    (file === 'packages/render-gl/src/glElement.ts' && functionNames.includes('createGlCanvasElement')) ||
    (file === 'packages/render-wgpu/src/wgpuElement.ts' && functionNames.includes('createWgpuCanvasElement'))
  );
}

function classifyStructuralExclusion(
  file: string,
  functionNames: readonly string[],
  webAdapterFunctions: ReadonlySet<string>,
): HostBypassExclusion | null {
  const parts = file.split('/');
  const packageName = parts[0] === 'packages' ? (parts[1] ?? '') : '';
  const fileName = basename(file);
  if (/\.(?:test|spec)\.ts$/.test(fileName) || fileName.endsWith('TestHelper.ts')) return 'test-support';
  if (functionNames.length > 0 && functionNames.every((name) => /^(?:createTest|initializeTest)/.test(name))) {
    return 'test-support';
  }
  if (packageName.startsWith('host-')) return 'host-implementation';
  if (packageName.startsWith('tool-')) return 'tooling';
  if (packageName === 'application') return 'window-attachment';
  if (packageName.endsWith('-dom') || packageName.endsWith('-canvas')) return 'technology-specific-renderer';
  if (
    functionNames.some((name) => webAdapterFunctions.has(name)) ||
    /^(?:register|web)[A-Z0-9_]*Web[A-Z0-9_]/.test(fileName.replace(/\.ts$/, ''))
  ) {
    return 'explicit-web-adapter';
  }
  return null;
}

function enclosingFunctionNames(node: ts.Node): string[] {
  const names: string[] = [];
  let current: ts.Node | undefined = node.parent;
  while (current !== undefined) {
    if (ts.isFunctionDeclaration(current) && current.name !== undefined) names.push(current.name.text);
    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      ts.isVariableDeclaration(current.parent) &&
      ts.isIdentifier(current.parent.name)
    ) {
      names.push(current.parent.name.text);
    }
    if (ts.isMethodDeclaration(current) && current.name !== undefined) names.push(current.name.getText());
    current = current.parent;
  }
  return names;
}

function expressionName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function firstStringArgument(call: ts.CallExpression): string | null {
  const first = call.arguments[0];
  return first !== undefined && ts.isStringLiteralLike(first) ? first.text : null;
}

function isRootedInBrowserGlobal(expression: ts.Expression): boolean {
  let current = expression;
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) current = current.expression;
  if (!ts.isIdentifier(current)) return false;
  if (current.text === 'document' || current.text === 'navigator' || current.text === 'window') {
    return !isLocallyDeclared(current, current.text);
  }
  return current.text === 'globalThis' && expressionContainsName(expression, 'document', 'navigator', 'window');
}

function isGlobalFrameSchedulingCall(expression: ts.Expression): boolean {
  const name = expressionName(expression);
  if (name !== 'requestAnimationFrame' && name !== 'cancelAnimationFrame') return false;
  if (ts.isIdentifier(expression)) return !isLocallyDeclared(expression, name);
  if (!ts.isPropertyAccessExpression(expression)) return false;

  let root: ts.Expression = expression;
  while (ts.isPropertyAccessExpression(root) || ts.isElementAccessExpression(root)) root = root.expression;
  return (
    ts.isIdentifier(root) &&
    (root.text === 'window' || root.text === 'globalThis') &&
    !isLocallyDeclared(root, root.text)
  );
}

function isLocallyDeclared(identifier: ts.Identifier, name: string): boolean {
  let current: ts.Node | undefined = identifier.parent;
  while (current !== undefined) {
    if (
      ts.isFunctionLike(current) &&
      current.parameters.some((parameter) => bindingContainsName(parameter.name, name))
    ) {
      return true;
    }
    if (ts.isCatchClause(current) && current.variableDeclaration !== undefined) {
      if (bindingContainsName(current.variableDeclaration.name, name)) return true;
    }
    if ((ts.isBlock(current) || ts.isSourceFile(current)) && blockDirectlyDeclaresName(current, name)) return true;
    current = current.parent;
  }
  return false;
}

function blockDirectlyDeclaresName(scope: ts.Block | ts.SourceFile, name: string): boolean {
  for (const statement of scope.statements) {
    if (ts.isVariableStatement(statement)) {
      if (statement.declarationList.declarations.some((declaration) => bindingContainsName(declaration.name, name))) {
        return true;
      }
    }
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) return true;
    if (ts.isClassDeclaration(statement) && statement.name?.text === name) return true;
    if (ts.isImportDeclaration(statement) && statement.importClause !== undefined) {
      const clause = statement.importClause;
      if (clause.name?.text === name) return true;
      const bindings = clause.namedBindings;
      if (bindings !== undefined) {
        if (ts.isNamespaceImport(bindings) && bindings.name.text === name) return true;
        if (ts.isNamedImports(bindings) && bindings.elements.some((element) => element.name.text === name)) return true;
      }
    }
  }
  return false;
}

function bindingContainsName(binding: ts.BindingName, name: string): boolean {
  if (ts.isIdentifier(binding)) return binding.text === name;
  return binding.elements.some(
    (element) => !ts.isOmittedExpression(element) && bindingContainsName(element.name, name),
  );
}

function collectWebAdapterFunctionNames(source: ts.SourceFile): ReadonlySet<string> {
  const callees = new Map<string, Set<string>>();
  const roots = new Set<string>();

  const visit = (node: ts.Node): void => {
    const name = namedFunctionName(node);
    if (name !== null) {
      if (isExplicitWebAdapterName(name)) roots.add(name);
      const called = new Set<string>();
      const collectCalls = (child: ts.Node): void => {
        if (ts.isCallExpression(child)) {
          const calledName = expressionName(child.expression);
          if (calledName !== null) called.add(calledName);
        }
        ts.forEachChild(child, collectCalls);
      };
      ts.forEachChild(node, collectCalls);
      callees.set(name, called);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  const reachable = new Set(roots);
  let grew = true;
  while (grew) {
    grew = false;
    for (const name of [...reachable]) {
      for (const called of callees.get(name) ?? []) {
        if (!callees.has(called) || reachable.has(called)) continue;
        reachable.add(called);
        grew = true;
      }
    }
  }
  return reachable;
}

function namedFunctionName(node: ts.Node): string | null {
  if (ts.isFunctionDeclaration(node) && node.name !== undefined) return node.name.text;
  if (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    ts.isVariableDeclaration(node.parent) &&
    ts.isIdentifier(node.parent.name)
  ) {
    return node.parent.name.text;
  }
  if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text;
  return null;
}

function isExplicitWebAdapterName(name: string): boolean {
  return /Web[A-Z0-9_]/.test(name);
}

function expressionContainsName(expression: ts.Expression, ...names: string[]): boolean {
  const wanted = new Set(names);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && wanted.has(node.text)) found = true;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(expression);
  return found;
}

function isInsideRecognizedCallOrConstruction(node: ts.PropertyAccessExpression, source: ts.SourceFile): boolean {
  const parent = node.parent;
  if (ts.isCallExpression(parent) && parent.expression === node) return classifyNode(parent, source) !== null;
  if (ts.isPropertyAccessExpression(parent) && parent.expression === node) return true;
  if (ts.isElementAccessExpression(parent)) {
    if (parent.expression === node) return true;
  }
  return false;
}

function isMainModule(moduleUrl: string, entry: string | undefined): boolean {
  return entry !== undefined && moduleUrl === pathToFileURL(resolve(entry)).href;
}
