import { readdirSync, readFileSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import ts from 'typescript';

import { formatGateProvenance, readGateTreeState } from './gate-provenance';

type P5HostBypassKindV1 = 'direct-dom' | 'input-ingress' | 'scratch-surface' | 'webgpu-acquisition';

type P5HostBypassKindV3 = P5HostBypassKindV1 | 'frame-scheduling';

export type P5HostBypassKind = P5HostBypassKindV3 | 'render-surface';

export type P5HostBypassExclusion =
  | 'explicit-web-adapter'
  | 'host-implementation'
  | 'p3-transport'
  | 'p4-window-attachment'
  | 'technology-specific-renderer'
  | 'test-support'
  | 'tooling';

export interface P5HostBypassSite {
  readonly column: number;
  readonly expression: string;
  readonly exclusion: P5HostBypassExclusion | null;
  readonly file: string;
  readonly functionName: string | null;
  readonly inputEventName: string | null;
  readonly inputListenerOperation: 'registration' | 'removal' | null;
  readonly kind: P5HostBypassKind | 'p3-transport';
  readonly line: number;
}

export interface P5InputIngressListenerOperations {
  readonly registrationNames: readonly string[];
  readonly removalNames: readonly string[];
}

export interface P5HostBypassReport {
  readonly excluded: readonly P5HostBypassSite[];
  readonly p5: readonly P5HostBypassSite[];
  readonly scannedFiles: number;
}

// The empty report, owned beside the type it builds. See `createEmptyBackendLifecycleReport` for why
// every report type carries one: a fixture that needs a valid report rather than a particular one
// starts here, so a new field is supplied once instead of at each construction site.
export function createEmptyP5HostBypassReport(): P5HostBypassReport {
  return { excluded: [], p5: [], scannedFiles: 0 };
}

export type P5HostBypassBudget = Readonly<Record<P5HostBypassKind, number>>;

type P5HostBypassBudgetV1 = Readonly<Record<P5HostBypassKindV1, number>>;

type P5HostBypassBudgetV3 = Readonly<Record<P5HostBypassKindV3, number>>;

export interface P5HostBypassBudgetEvidence {
  readonly budget: P5HostBypassBudgetV1;
  readonly reason: string;
  readonly total: number;
}

export interface P5HostBypassV3BudgetEvidence {
  readonly budget: P5HostBypassBudgetV3;
  readonly reason: string;
  readonly total: number;
}

export interface P5HostBypassV4BudgetEvidence {
  readonly budget: P5HostBypassBudget;
  readonly reason: string;
  // Sites this checkpoint repaired, DECLARED by the entry rather than inferred from its position. The
  // delta alone cannot tell "repaired three sites" from "repaired one and mis-stated the total", and the
  // index-keyed table this replaces encoded that fact in a place no entry could keep true: inserting a
  // checkpoint ahead of pointer-lock would have silently reassigned its exception to a different repair.
  readonly repairedSites: number;
  readonly total: number;
}

const P5_HOST_BYPASS_ACCEPTED_SLICE_GUIDANCE =
  'a P5 seam repair is complete only when every existing production consumer migrates in the same slice; a lowered census alone is incomplete';

export const P5_HOST_BYPASS_SLICE_GUIDANCE = P5_HOST_BYPASS_ACCEPTED_SLICE_GUIDANCE;

type P5HostBypassVersionedBudget = Readonly<Partial<Record<P5HostBypassKind, number>>>;

export interface P5HostBypassRecategorisation {
  readonly count: number;
  readonly from: P5HostBypassKind;
  readonly reason: string;
  readonly to: P5HostBypassKind;
}

export interface P5HostBypassNewDetection {
  readonly count: number;
  readonly kind: P5HostBypassKind;
  readonly reason: string;
}

export interface P5HostBypassClassificationEvidence {
  readonly fromBudget: P5HostBypassVersionedBudget;
  readonly fromTotal: number;
  readonly fromVersion: number;
  readonly newlyDetected: readonly P5HostBypassNewDetection[];
  readonly reason: string;
  readonly recategorised: readonly P5HostBypassRecategorisation[];
  readonly toBudget: P5HostBypassVersionedBudget;
  readonly toTotal: number;
  readonly toVersion: number;
}

export interface P5HostBypassDetectorProvenance {
  readonly detects: string;
  readonly zeroMeaning: string;
}

export interface P5HostBypassVersionedDetectorProvenance extends P5HostBypassDetectorProvenance {
  readonly taxonomyVersion: number;
}

// IMMUTABLE PREFIX. These accepted checkpoints pin every category, total and reason. History
// validation compares against this full prefix, so even a coherent category-and-total rewrite fails.
const P5_HOST_BYPASS_ACCEPTED_BUDGET_HISTORY_PREFIX = [
  {
    budget: { 'direct-dom': 18, 'input-ingress': 26, 'scratch-surface': 18, 'webgpu-acquisition': 6 },
    reason: 'initial runtime-derived P5 host-bypass census',
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
] as const satisfies readonly P5HostBypassBudgetEvidence[];

// APPEND ONLY. Each entry is an evidenced repair state, not a current number to edit in place. Future
// repairs append a lower state with its category breakdown and reason without editing the accepted
// prefix above.
export const P5_HOST_BYPASS_BUDGET_HISTORY = [
  ...P5_HOST_BYPASS_ACCEPTED_BUDGET_HISTORY_PREFIX,
] as const satisfies readonly P5HostBypassBudgetEvidence[];

// Classification changes are append-only evidence, not repairs. A pure relabel preserves the census;
// a discovery explicitly raises it. Keeping these events separate prevents a detector improvement from
// being disguised as repair progress or used to rewrite the accepted v1 checkpoints above.
const P5_HOST_BYPASS_ACCEPTED_CLASSIFICATION_HISTORY_PREFIX = [
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
    reason: 'gamepad frame scheduling added to P5 classification coverage',
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
] as const satisfies readonly P5HostBypassClassificationEvidence[];

export const P5_HOST_BYPASS_CLASSIFICATION_HISTORY: readonly P5HostBypassClassificationEvidence[] = [
  ...P5_HOST_BYPASS_ACCEPTED_CLASSIFICATION_HISTORY_PREFIX,
] as const satisfies readonly P5HostBypassClassificationEvidence[];

const P5_HOST_BYPASS_ACCEPTED_V3_PROGRESS_HISTORY_PREFIX = [
  {
    budget: {
      'direct-dom': 12,
      'input-ingress': 2,
      'frame-scheduling': 3,
      'scratch-surface': 16,
      'webgpu-acquisition': 0,
    },
    reason: 'P5 taxonomy v3 classification baseline',
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
] as const satisfies readonly P5HostBypassV3BudgetEvidence[];

export const P5_HOST_BYPASS_V3_PROGRESS_HISTORY = [
  ...P5_HOST_BYPASS_ACCEPTED_V3_PROGRESS_HISTORY_PREFIX,
] as const satisfies readonly P5HostBypassV3BudgetEvidence[];

const P5_HOST_BYPASS_ACCEPTED_V4_PROGRESS_HISTORY_PREFIX = [
  {
    budget: {
      'direct-dom': 12,
      'input-ingress': 0,
      'frame-scheduling': 0,
      'scratch-surface': 14,
      'render-surface': 2,
      'webgpu-acquisition': 0,
    },
    reason: 'P5 taxonomy v4 classification baseline',
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
] as const satisfies readonly P5HostBypassV4BudgetEvidence[];

const P5_HOST_BYPASS_S09_V4_PROGRESS = {
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
} as const satisfies P5HostBypassV4BudgetEvidence;

const P5_HOST_BYPASS_INPUT_POINTER_LOCK_V4_PROGRESS = {
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
} as const satisfies P5HostBypassV4BudgetEvidence;

const P5_HOST_BYPASS_S10_V4_PROGRESS = {
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
} as const satisfies P5HostBypassV4BudgetEvidence;

const P5_HOST_BYPASS_S10_FONT_LOAD_V4_PROGRESS = {
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
} as const satisfies P5HostBypassV4BudgetEvidence;

const P5_HOST_BYPASS_S10_FONT_ADD_V4_PROGRESS = {
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
} as const satisfies P5HostBypassV4BudgetEvidence;

const P5_HOST_BYPASS_S10_FONT_CHECK_V4_PROGRESS = {
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
} as const satisfies P5HostBypassV4BudgetEvidence;

const P5_HOST_BYPASS_S10_FONT_READY_V4_PROGRESS = {
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
} as const satisfies P5HostBypassV4BudgetEvidence;

const P5_HOST_BYPASS_H12_CAPTURE_V4_PROGRESS = {
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
} as const satisfies P5HostBypassV4BudgetEvidence;

const P5_HOST_BYPASS_BITMAP_ENCODE_CANVAS_V4_PROGRESS = {
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
} as const satisfies P5HostBypassV4BudgetEvidence;

const P5_HOST_BYPASS_BITMAP_ENCODE_IMAGE_DATA_V4_PROGRESS = {
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
} as const satisfies P5HostBypassV4BudgetEvidence;

// One checkpoint for one slice. Both window-management sites were routed together, so the honest evidence
// is a single entry declaring what it repaired rather than two synthetic one-site steps.
const P5_HOST_BYPASS_SCREEN_PERMISSION_V4_PROGRESS = {
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
} as const satisfies P5HostBypassV4BudgetEvidence;

const P5_HOST_BYPASS_SHAPE_RASTER_SURFACE_V4_PROGRESS = {
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
} as const satisfies P5HostBypassV4BudgetEvidence;

const P5_HOST_BYPASS_H8C_VIDEO_ELEMENT_V4_PROGRESS = {
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
} as const satisfies P5HostBypassV4BudgetEvidence;

const P5_HOST_BYPASS_BITMAP_READBACK_V4_PROGRESS = {
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
} as const satisfies P5HostBypassV4BudgetEvidence;

const P5_HOST_BYPASS_SCALE9_RASTER_SURFACE_V4_PROGRESS = {
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
} as const satisfies P5HostBypassV4BudgetEvidence;

const P5_HOST_BYPASS_TEXT_RASTER_SURFACE_V4_PROGRESS = {
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
} as const satisfies P5HostBypassV4BudgetEvidence;
export const P5_HOST_BYPASS_V4_PROGRESS_HISTORY = [
  ...P5_HOST_BYPASS_ACCEPTED_V4_PROGRESS_HISTORY_PREFIX,
  P5_HOST_BYPASS_S09_V4_PROGRESS,
  P5_HOST_BYPASS_INPUT_POINTER_LOCK_V4_PROGRESS,
  P5_HOST_BYPASS_S10_V4_PROGRESS,
  P5_HOST_BYPASS_S10_FONT_LOAD_V4_PROGRESS,
  P5_HOST_BYPASS_S10_FONT_ADD_V4_PROGRESS,
  P5_HOST_BYPASS_S10_FONT_CHECK_V4_PROGRESS,
  P5_HOST_BYPASS_S10_FONT_READY_V4_PROGRESS,
  P5_HOST_BYPASS_H12_CAPTURE_V4_PROGRESS,
  P5_HOST_BYPASS_BITMAP_ENCODE_CANVAS_V4_PROGRESS,
  P5_HOST_BYPASS_BITMAP_ENCODE_IMAGE_DATA_V4_PROGRESS,
  P5_HOST_BYPASS_SCREEN_PERMISSION_V4_PROGRESS,
  P5_HOST_BYPASS_SHAPE_RASTER_SURFACE_V4_PROGRESS,
  P5_HOST_BYPASS_H8C_VIDEO_ELEMENT_V4_PROGRESS,
  P5_HOST_BYPASS_BITMAP_READBACK_V4_PROGRESS,
  P5_HOST_BYPASS_SCALE9_RASTER_SURFACE_V4_PROGRESS,
  P5_HOST_BYPASS_TEXT_RASTER_SURFACE_V4_PROGRESS,
] as const satisfies readonly P5HostBypassV4BudgetEvidence[];

const P5_HOST_BYPASS_ACCEPTED_DETECTOR_PROVENANCE_HISTORY_PREFIX = [
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
] as const satisfies readonly P5HostBypassVersionedDetectorProvenance[];

export const P5_HOST_BYPASS_DETECTOR_PROVENANCE_HISTORY = [
  ...P5_HOST_BYPASS_ACCEPTED_DETECTOR_PROVENANCE_HISTORY_PREFIX,
] as const satisfies readonly P5HostBypassVersionedDetectorProvenance[];

export const P5_HOST_BYPASS_DETECTOR_PROVENANCE: P5HostBypassVersionedDetectorProvenance = {
  ...P5_HOST_BYPASS_DETECTOR_PROVENANCE_HISTORY[P5_HOST_BYPASS_DETECTOR_PROVENANCE_HISTORY.length - 1],
};

// Category upper bounds, not source membership. The active budget is the latest evidenced repair in
// the current taxonomy, so there is no second lone number an ordinary bypass addition can edit green.
export const P5_HOST_BYPASS_BUDGET: P5HostBypassBudget =
  P5_HOST_BYPASS_V4_PROGRESS_HISTORY[P5_HOST_BYPASS_V4_PROGRESS_HISTORY.length - 1].budget;

const P3_CONSTRUCTORS = new Set(['EventSource', 'Image', 'Request', 'WebSocket', 'XMLHttpRequest']);
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
export function scanP5HostBypasses(root: string): P5HostBypassReport {
  const packagesDirectory = join(root, 'packages');
  const files = collectProductionSourceFiles(packagesDirectory);
  const sites = files.flatMap((file) =>
    scanP5HostBypassSource(relative(root, file).split(sep).join('/'), readFileSync(file, 'utf8')),
  );
  return createP5HostBypassReport(files.length, sites);
}

export function scanP5HostBypassSource(file: string, source: string): P5HostBypassSite[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const webAdapterFunctions = collectWebAdapterFunctionNames(parsed);
  const sites: P5HostBypassSite[] = [];

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
        exclusion: finding.kind === 'p3-transport' ? 'p3-transport' : structuralExclusion,
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

export function p5GlRenderSurfaceConsumerSourceFailures(file: string, source: string): string[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && expressionName(node.expression) === 'createGlCanvasElement') calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  if (calls.length === 0) return [];

  const importsEnabler = parsed.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === '@flighthq/host-web' &&
      statement.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(statement.importClause.namedBindings) &&
      statement.importClause.namedBindings.elements.some(
        (element) => element.propertyName === undefined && element.name.text === 'enableHostWebGlRenderSurface',
      ),
  );
  const failures = importsEnabler ? [] : [`${file}: GL consumer does not import enableHostWebGlRenderSurface`];

  for (const call of calls) {
    const statement = statementInList(call);
    const position = parsed.getLineAndCharacterOfPosition(call.getStart(parsed));
    if (statement === null) {
      failures.push(`${file}:${position.line + 1}: GL surface creation is not owned by a statement list`);
      continue;
    }
    const statements = statementList(statement.parent);
    const previous = statements[statements.indexOf(statement) - 1];
    if (!isEnableHostWebGlRenderSurfaceStatement(previous)) {
      failures.push(
        `${file}:${position.line + 1}: GL surface creation is not immediately preceded by enableHostWebGlRenderSurface()`,
      );
    }
  }
  return failures;
}

export function p5GlExampleRunnerOwnershipFailures(source: string): string[] {
  const failures: string[] = [];
  const branchStart = source.indexOf("if (render === 'webgl') {");
  const nextRendererBranch = source.indexOf("if (!VERIFY_SKIP.has(name) && render === 'dom')", branchStart);
  const exampleImport = source.indexOf("const __example = await import('___app___${name}:${render}')");
  if (branchStart === -1 || nextRendererBranch === -1) {
    return ['examples Web runner does not own a WebGL-only GL surface enabler branch'];
  }
  const branch = source.slice(branchStart, nextRendererBranch);
  const importIndex = branch.indexOf("import { enableHostWebGlRenderSurface } from '@flighthq/host-web';");
  const callIndex = branch.indexOf('enableHostWebGlRenderSurface();');
  if (importIndex === -1) failures.push('examples WebGL entry does not import enableHostWebGlRenderSurface');
  if (callIndex === -1) failures.push('examples WebGL entry does not call enableHostWebGlRenderSurface()');
  if (importIndex !== -1 && callIndex !== -1 && importIndex > callIndex) {
    failures.push('examples WebGL entry calls enableHostWebGlRenderSurface() before importing it');
  }
  if (exampleImport === -1 || branchStart > exampleImport) {
    failures.push('examples WebGL enabler does not run before the app dynamic import');
  }
  return failures;
}

export function p5GlRenderSurfaceProviderBoundaryFailures(source: string): string[] {
  const failures: string[] = [];
  if (/render-wgpu|createWgpuCanvasElement|\bWgpu\b/.test(source)) {
    failures.push('portable GL surface provider crosses into the WGPU surface boundary');
  }
  if (/\bdocument\s*(?:\.|\[)/.test(source)) {
    failures.push('portable GL surface provider reads document instead of returning null');
  }
  return failures;
}

export function p5GlRenderSurfaceConsumerFailures(root: string): string[] {
  const failures: string[] = [];
  const functionalFiles: string[] = [];
  collectTypeScriptFiles(join(root, 'functional'), functionalFiles);
  for (const path of functionalFiles) {
    const file = relative(root, path).split(sep).join('/');
    failures.push(...p5GlRenderSurfaceConsumerSourceFailures(file, readFileSync(path, 'utf8')));
  }

  const harnessFile = 'tools/harness/webgl.ts';
  const harnessSource = readFileSync(join(root, harnessFile), 'utf8');
  if (!harnessSource.includes('createGlCanvasElement(')) {
    failures.push(`${harnessFile}: shared WebGL harness no longer creates the GL surface`);
  } else {
    failures.push(...p5GlRenderSurfaceConsumerSourceFailures(harnessFile, harnessSource));
  }

  const runnerSource = readFileSync(join(root, 'examples/runners/web/vite.config.ts'), 'utf8');
  failures.push(...p5GlExampleRunnerOwnershipFailures(runnerSource));
  return failures;
}

export function p5WgpuRenderSurfaceConsumerSourceFailures(file: string, source: string): string[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && expressionName(node.expression) === 'createWgpuCanvasElement') calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  if (calls.length === 0) return [];

  const importsEnabler = parsed.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === '@flighthq/host-web' &&
      statement.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(statement.importClause.namedBindings) &&
      statement.importClause.namedBindings.elements.some(
        (element) => element.propertyName === undefined && element.name.text === 'enableHostWebWgpuRenderSurface',
      ),
  );
  const failures = importsEnabler ? [] : [`${file}: WGPU consumer does not import enableHostWebWgpuRenderSurface`];

  for (const call of calls) {
    const statement = statementInList(call);
    const position = parsed.getLineAndCharacterOfPosition(call.getStart(parsed));
    if (statement === null) {
      failures.push(`${file}:${position.line + 1}: WGPU surface creation is not owned by a statement list`);
      continue;
    }
    const statements = statementList(statement.parent);
    const previous = statements[statements.indexOf(statement) - 1];
    if (!isEnableHostWebWgpuRenderSurfaceStatement(previous)) {
      failures.push(
        `${file}:${position.line + 1}: WGPU surface creation is not immediately preceded by enableHostWebWgpuRenderSurface()`,
      );
    }
  }
  return failures;
}

export function p5WgpuExampleRunnerOwnershipFailures(source: string): string[] {
  const failures: string[] = [];
  const branchStart = source.indexOf("if (render === 'webgpu') {");
  const nextRendererBranch = source.indexOf("if (!VERIFY_SKIP.has(name) && render === 'dom')", branchStart);
  const captureBranch = source.indexOf("if (!VERIFY_SKIP.has(name) && render === 'webgpu')");
  const exampleImport = source.indexOf("const __example = await import('___app___${name}:${render}')");
  if (branchStart === -1) {
    return ['examples Web runner does not own a WebGPU-only WGPU surface enabler branch'];
  }
  if (nextRendererBranch === -1) {
    const misplaced = ['examples Web runner does not own a WebGPU-only WGPU surface enabler branch'];
    if (captureBranch !== -1 && branchStart > captureBranch) {
      misplaced.push('examples WebGPU enabler does not run before the capture render dynamic import');
    }
    if (exampleImport !== -1 && branchStart > exampleImport) {
      misplaced.push('examples WebGPU enabler does not run before the app dynamic import');
    }
    return misplaced;
  }
  const branch = source.slice(branchStart, nextRendererBranch);
  const importIndex = branch.indexOf("import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';");
  const callIndex = branch.indexOf('enableHostWebWgpuRenderSurface();');
  if (importIndex === -1) failures.push('examples WebGPU entry does not import enableHostWebWgpuRenderSurface');
  if (callIndex === -1) failures.push('examples WebGPU entry does not call enableHostWebWgpuRenderSurface()');
  if (importIndex !== -1 && callIndex !== -1 && importIndex > callIndex) {
    failures.push('examples WebGPU entry calls enableHostWebWgpuRenderSurface() before importing it');
  }
  if (captureBranch === -1 || branchStart > captureBranch) {
    failures.push('examples WebGPU enabler does not run before the capture render dynamic import');
  }
  if (exampleImport === -1 || branchStart > exampleImport) {
    failures.push('examples WebGPU enabler does not run before the app dynamic import');
  }
  return failures;
}

export function p5WgpuRenderSurfaceProviderBoundaryFailures(source: string): string[] {
  const failures: string[] = [];
  if (/render-gl|createGlCanvasElement|GlRenderSurface/.test(source)) {
    failures.push('portable WGPU surface provider crosses into the GL surface boundary');
  }
  if (/WgpuHostBackend|getWgpuHostBackend|setWgpuHostBackend|installWgpuHostBackend/.test(source)) {
    failures.push('portable WGPU surface provider crosses into the WGPU acquisition boundary');
  }
  if (/\bdocument\s*(?:\.|\[)/.test(source)) {
    failures.push('portable WGPU surface provider reads document instead of returning null');
  }
  return failures;
}

export function p5WgpuRenderSurfaceConsumerFailures(root: string): string[] {
  const failures: string[] = [];
  const functionalFiles: string[] = [];
  collectTypeScriptFiles(join(root, 'functional'), functionalFiles);
  for (const path of functionalFiles) {
    const file = relative(root, path).split(sep).join('/');
    failures.push(...p5WgpuRenderSurfaceConsumerSourceFailures(file, readFileSync(path, 'utf8')));
  }

  const harnessFile = 'tools/harness/webgpu.ts';
  const harnessSource = readFileSync(join(root, harnessFile), 'utf8');
  if (!harnessSource.includes('createWgpuCanvasElement(')) {
    failures.push(`${harnessFile}: shared WebGPU harness no longer creates the WGPU surface`);
  } else {
    failures.push(...p5WgpuRenderSurfaceConsumerSourceFailures(harnessFile, harnessSource));
  }

  const runnerSource = readFileSync(join(root, 'examples/runners/web/vite.config.ts'), 'utf8');
  failures.push(...p5WgpuExampleRunnerOwnershipFailures(runnerSource));
  return failures;
}

export function p5WgpuRenderSurfaceRepairFailures(report: Readonly<P5HostBypassReport>): string[] {
  const remaining = report.p5
    .filter((site) => site.kind === 'render-surface')
    .map((site) => `${site.file}:${site.functionName ?? '<module>'}`);
  return remaining.length === 0 ? [] : [`S08 must leave no render surfaces; found [${remaining.join(', ')}]`];
}

export function p5BitmapDrawTransferRepairFailures(report: Readonly<P5HostBypassReport>): string[] {
  const remaining = report.p5
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

export function p5BitmapEncodeRepairFailures(report: Readonly<P5HostBypassReport>): string[] {
  const remaining = report.p5
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

export function p5BitmapReadbackRepairFailures(report: Readonly<P5HostBypassReport>): string[] {
  const remaining = report.p5
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

export function p5ShapeRasterSurfaceRepairFailures(report: Readonly<P5HostBypassReport>): string[] {
  const remaining = report.p5
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

export function p5Scale9RasterSurfaceRepairFailures(report: Readonly<P5HostBypassReport>): string[] {
  const remaining = report.p5
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

export function p5TextRasterSurfaceRepairFailures(report: Readonly<P5HostBypassReport>): string[] {
  const remaining = report.p5
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

export function p5VideoCapabilityRepairFailures(report: Readonly<P5HostBypassReport>): string[] {
  const failures: string[] = [];
  const target = report.p5.filter(
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
  const repaired = report.p5.filter(
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

export function createP5HostBypassReport(scannedFiles: number, sites: readonly P5HostBypassSite[]): P5HostBypassReport {
  const sorted = [...sites].sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.kind.localeCompare(b.kind),
  );
  return {
    excluded: sorted.filter((site) => site.exclusion !== null),
    p5: sorted.filter((site) => site.exclusion === null),
    scannedFiles,
  };
}

export function countP5HostBypasses(report: Readonly<P5HostBypassReport>): Record<P5HostBypassKind, number> {
  const counts: Record<P5HostBypassKind, number> = {
    'direct-dom': 0,
    'input-ingress': 0,
    'frame-scheduling': 0,
    'scratch-surface': 0,
    'render-surface': 0,
    'webgpu-acquisition': 0,
  };
  for (const site of report.p5) counts[site.kind as P5HostBypassKind]++;
  return counts;
}

export function deriveP5InputIngressListenerOperations(
  report: Readonly<P5HostBypassReport>,
): P5InputIngressListenerOperations {
  const sites = [...report.p5, ...report.excluded].filter(
    (site) => site.kind === 'input-ingress' && site.file.startsWith('packages/input/'),
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

export function p5InputIngressPairingFailures(operations: Readonly<P5InputIngressListenerOperations>): string[] {
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

export function p5HostBypassBudgetFailures(report: Readonly<P5HostBypassReport>, budget: P5HostBypassBudget): string[] {
  const counts = countP5HostBypasses(report);
  return (Object.keys(counts) as P5HostBypassKind[])
    .filter((kind) => counts[kind] > budget[kind])
    .map((kind) => `${kind}: found ${counts[kind]}, budget ${budget[kind]}`);
}

export function p5HostBypassCurrentBudgetFailures(
  report: Readonly<P5HostBypassReport>,
  budget: P5HostBypassBudget,
): string[] {
  const counts = countP5HostBypasses(report);
  const failures = (Object.keys(counts) as P5HostBypassKind[])
    .filter((kind) => counts[kind] !== budget[kind])
    .map((kind) => `P5 current ${kind}: found ${counts[kind]}, expected ${budget[kind]}`);
  const expectedTotal = totalP5HostBypassBudget(budget);
  if (report.p5.length !== expectedTotal) {
    failures.push(`P5 current outstanding: found ${report.p5.length}, expected ${expectedTotal}`);
  }
  return failures;
}

export function p5TextRasterSurfaceCurrentFailures(report: Readonly<P5HostBypassReport>): string[] {
  return p5HostBypassCurrentBudgetFailures(report, P5_HOST_BYPASS_TEXT_RASTER_SURFACE_V4_PROGRESS.budget);
}

export function p5HostBypassBudgetHistoryFailures(history: readonly P5HostBypassBudgetEvidence[]): string[] {
  if (history.length === 0) return ['P5 budget history is empty'];
  const failures: string[] = [];
  for (let index = 0; index < P5_HOST_BYPASS_ACCEPTED_BUDGET_HISTORY_PREFIX.length; index++) {
    const accepted = P5_HOST_BYPASS_ACCEPTED_BUDGET_HISTORY_PREFIX[index];
    const entry = history[index];
    if (entry === undefined || !p5HostBypassBudgetEvidenceMatches(entry, accepted)) {
      failures.push(
        `P5 budget history[${index}] rewrites immutable accepted checkpoint total ${accepted.total} (categories and reason are pinned)`,
      );
    }
  }
  for (let index = 0; index < history.length; index++) {
    const entry = history[index];
    const categoryTotal = totalP5HostBypassVersionedBudget(entry.budget);
    if (categoryTotal !== entry.total) {
      failures.push(
        `P5 budget history[${index}] category sum ${categoryTotal} does not match evidenced total ${entry.total}`,
      );
    }
    const prior = history[index - 1];
    if (prior !== undefined && entry.total >= prior.total) {
      failures.push(`P5 budget history[${index}] total ${entry.total} is not below prior total ${prior.total}`);
    }
  }
  return failures;
}

export function p5HostBypassSliceGuidanceFailures(guidance: string): string[] {
  return guidance === P5_HOST_BYPASS_ACCEPTED_SLICE_GUIDANCE
    ? []
    : ['P5 seam-slice guidance no longer requires same-slice production consumer migration'];
}

export function p5HostBypassClassificationHistoryFailures(
  history: readonly P5HostBypassClassificationEvidence[],
): string[] {
  if (history.length === 0) return ['P5 taxonomy history is empty'];
  const failures: string[] = [];
  for (let index = 0; index < P5_HOST_BYPASS_ACCEPTED_CLASSIFICATION_HISTORY_PREFIX.length; index++) {
    const accepted = P5_HOST_BYPASS_ACCEPTED_CLASSIFICATION_HISTORY_PREFIX[index];
    const entry = history[index];
    if (entry === undefined || !p5HostBypassClassificationEvidenceMatches(entry, accepted)) {
      failures.push(`P5 taxonomy history[${index}] rewrites immutable accepted classification evidence`);
    }
  }
  for (let index = 0; index < history.length; index++) {
    const entry = history[index];
    const fromCategoryTotal = totalP5HostBypassVersionedBudget(entry.fromBudget);
    const toCategoryTotal = totalP5HostBypassVersionedBudget(entry.toBudget);
    if (fromCategoryTotal !== entry.fromTotal) {
      failures.push(
        `P5 taxonomy history[${index}] before-category sum ${fromCategoryTotal} does not match evidenced total ${entry.fromTotal}`,
      );
    }
    if (toCategoryTotal !== entry.toTotal) {
      failures.push(
        `P5 taxonomy history[${index}] after-category sum ${toCategoryTotal} does not match evidenced total ${entry.toTotal}`,
      );
    }

    const newCount = entry.newlyDetected.reduce((sum, evidence) => sum + evidence.count, 0);
    if (newCount === 0 && entry.fromTotal !== entry.toTotal) {
      failures.push(`P5 taxonomy history[${index}] pure relabel changes total ${entry.fromTotal} -> ${entry.toTotal}`);
    }
    if (entry.toTotal - entry.fromTotal !== newCount) {
      failures.push(
        `P5 taxonomy history[${index}] census delta ${entry.toTotal - entry.fromTotal} does not match ${newCount} newly detected sites`,
      );
    }

    const derived = completeP5HostBypassBudget(entry.fromBudget);
    for (const recategorisation of entry.recategorised) {
      derived[recategorisation.from] -= recategorisation.count;
      derived[recategorisation.to] += recategorisation.count;
    }
    for (const detection of entry.newlyDetected) derived[detection.kind] += detection.count;
    if (!p5HostBypassBudgetsMatch(derived, entry.toBudget)) {
      failures.push(`P5 taxonomy history[${index}] derived categories do not match its evidenced after-budget`);
    }

    if (entry.toVersion !== entry.fromVersion + 1) {
      failures.push(
        `P5 taxonomy history[${index}] version ${entry.fromVersion} does not advance exactly once to ${entry.toVersion}`,
      );
    }
    const prior = history[index - 1];
    if (
      prior !== undefined &&
      (entry.fromVersion !== prior.toVersion ||
        (!p5HostBypassBudgetsMatch(entry.fromBudget, prior.toBudget) &&
          !p5HostBypassClassificationStartsFromAcceptedProgress(entry)))
    ) {
      failures.push(`P5 taxonomy history[${index}] does not continue the prior classification state`);
    }
  }
  return failures;
}

export function p5HostBypassV3ProgressHistoryFailures(history: readonly P5HostBypassV3BudgetEvidence[]): string[] {
  if (history.length === 0) return ['P5 taxonomy v3 progress history is empty'];
  const failures: string[] = [];
  for (let index = 0; index < P5_HOST_BYPASS_ACCEPTED_V3_PROGRESS_HISTORY_PREFIX.length; index++) {
    const accepted = P5_HOST_BYPASS_ACCEPTED_V3_PROGRESS_HISTORY_PREFIX[index];
    const entry = history[index];
    if (entry === undefined || !p5HostBypassV3BudgetEvidenceMatches(entry, accepted)) {
      failures.push(`P5 taxonomy v3 progress history[${index}] rewrites immutable accepted checkpoint`);
    }
  }
  for (let index = 0; index < history.length; index++) {
    const entry = history[index];
    const categoryTotal = totalP5HostBypassVersionedBudget(entry.budget);
    if (categoryTotal !== entry.total) {
      failures.push(
        `P5 taxonomy v3 progress history[${index}] category sum ${categoryTotal} does not match evidenced total ${entry.total}`,
      );
    }
    const prior = history[index - 1];
    if (prior !== undefined && entry.total >= prior.total) {
      failures.push(
        `P5 taxonomy v3 progress history[${index}] total ${entry.total} is not below prior total ${prior.total}`,
      );
    }
  }
  return failures;
}

export function p5HostBypassV4ProgressHistoryFailures(history: readonly P5HostBypassV4BudgetEvidence[]): string[] {
  if (history.length === 0) return ['P5 taxonomy v4 progress history is empty'];
  const failures: string[] = [];
  for (let index = 0; index < P5_HOST_BYPASS_ACCEPTED_V4_PROGRESS_HISTORY_PREFIX.length; index++) {
    const accepted = P5_HOST_BYPASS_ACCEPTED_V4_PROGRESS_HISTORY_PREFIX[index];
    const entry = history[index];
    if (entry === undefined || !p5HostBypassV4BudgetEvidenceMatches(entry, accepted)) {
      failures.push(`P5 taxonomy v4 progress history[${index}] rewrites immutable accepted checkpoint`);
    }
  }
  const pointerLockEntry = findP5HostBypassV4ProgressEntry(
    history,
    P5_HOST_BYPASS_INPUT_POINTER_LOCK_V4_PROGRESS.reason,
  );
  if (
    pointerLockEntry === undefined ||
    !p5HostBypassV4BudgetEvidenceMatches(pointerLockEntry, P5_HOST_BYPASS_INPUT_POINTER_LOCK_V4_PROGRESS)
  ) {
    failures.push(
      'Input pointer-lock taxonomy v4 progress checkpoint no longer pins the exact total, categories, and reason',
    );
  }
  for (let index = 0; index < history.length; index++) {
    const entry = history[index];
    const categoryTotal = totalP5HostBypassBudget(entry.budget);
    if (categoryTotal !== entry.total) {
      failures.push(
        `P5 taxonomy v4 progress history[${index}] category sum ${categoryTotal} does not match evidenced total ${entry.total}`,
      );
    }
    const prior = history[index - 1];
    if (prior !== undefined && entry.total >= prior.total) {
      failures.push(
        `P5 taxonomy v4 progress history[${index}] total ${entry.total} is not below prior total ${prior.total}`,
      );
    }
    if (prior !== undefined && entry.total !== prior.total - entry.repairedSites) {
      failures.push(
        `P5 taxonomy v4 progress history[${index}] declares ${entry.repairedSites} repaired site(s) but moves ${prior.total} -> ${entry.total}`,
      );
    }
  }
  return failures;
}

export function p5BitmapDrawTransferProgressFailures(history: readonly P5HostBypassV4BudgetEvidence[]): string[] {
  const entry = findP5HostBypassV4ProgressEntry(history, P5_HOST_BYPASS_S09_V4_PROGRESS.reason);
  return entry !== undefined && p5HostBypassV4BudgetEvidenceMatches(entry, P5_HOST_BYPASS_S09_V4_PROGRESS)
    ? []
    : ['S09 taxonomy v4 progress checkpoint no longer pins the exact total, categories, and reason'];
}

export function p5BitmapEncodeProgressFailures(history: readonly P5HostBypassV4BudgetEvidence[]): string[] {
  const canvas = history[11];
  const imageData = history[12];
  return canvas !== undefined &&
    imageData !== undefined &&
    p5HostBypassV4BudgetEvidenceMatches(canvas, P5_HOST_BYPASS_BITMAP_ENCODE_CANVAS_V4_PROGRESS) &&
    p5HostBypassV4BudgetEvidenceMatches(imageData, P5_HOST_BYPASS_BITMAP_ENCODE_IMAGE_DATA_V4_PROGRESS)
    ? []
    : ['Bitmap encode taxonomy v4 progress checkpoints no longer pin the exact totals, categories, and reasons'];
}

export function p5BitmapReadbackProgressFailures(history: readonly P5HostBypassV4BudgetEvidence[]): string[] {
  const entry = findP5HostBypassV4ProgressEntry(history, P5_HOST_BYPASS_BITMAP_READBACK_V4_PROGRESS.reason);
  return entry !== undefined && p5HostBypassV4BudgetEvidenceMatches(entry, P5_HOST_BYPASS_BITMAP_READBACK_V4_PROGRESS)
    ? []
    : [
        'H15 bitmap-readback taxonomy v4 progress checkpoint no longer pins the exact total, categories, repair count, and reason',
      ];
}

export function p5VideoCapabilityProgressFailures(history: readonly P5HostBypassV4BudgetEvidence[]): string[] {
  const entry = findP5HostBypassV4ProgressEntry(history, P5_HOST_BYPASS_S10_V4_PROGRESS.reason);
  return entry !== undefined && p5HostBypassV4BudgetEvidenceMatches(entry, P5_HOST_BYPASS_S10_V4_PROGRESS)
    ? []
    : ['S10 taxonomy v4 progress checkpoint no longer pins the exact total, categories, and reason'];
}

export function p5ShapeRasterSurfaceProgressFailures(history: readonly P5HostBypassV4BudgetEvidence[]): string[] {
  const entry = findP5HostBypassV4ProgressEntry(history, P5_HOST_BYPASS_SHAPE_RASTER_SURFACE_V4_PROGRESS.reason);
  return entry !== undefined &&
    p5HostBypassV4BudgetEvidenceMatches(entry, P5_HOST_BYPASS_SHAPE_RASTER_SURFACE_V4_PROGRESS)
    ? []
    : [
        'H8 shape-raster taxonomy v4 progress checkpoint no longer pins the exact total, categories, repair count, and reason',
      ];
}

export function p5Scale9RasterSurfaceProgressFailures(history: readonly P5HostBypassV4BudgetEvidence[]): string[] {
  const entry = findP5HostBypassV4ProgressEntry(history, P5_HOST_BYPASS_SCALE9_RASTER_SURFACE_V4_PROGRESS.reason);
  return entry !== undefined &&
    p5HostBypassV4BudgetEvidenceMatches(entry, P5_HOST_BYPASS_SCALE9_RASTER_SURFACE_V4_PROGRESS)
    ? []
    : [
        'Scale9 raster taxonomy v4 progress checkpoint no longer pins the exact total, categories, repair count, and reason',
      ];
}

export function p5TextRasterSurfaceProgressFailures(history: readonly P5HostBypassV4BudgetEvidence[]): string[] {
  const entry = findP5HostBypassV4ProgressEntry(history, P5_HOST_BYPASS_TEXT_RASTER_SURFACE_V4_PROGRESS.reason);
  return entry !== undefined &&
    p5HostBypassV4BudgetEvidenceMatches(entry, P5_HOST_BYPASS_TEXT_RASTER_SURFACE_V4_PROGRESS)
    ? []
    : [
        'H13 text-raster taxonomy v4 progress checkpoint no longer pins the exact total, categories, repair count, and reason',
      ];
}

export function p5HostBypassDetectorProvenanceHistoryFailures(
  history: readonly P5HostBypassVersionedDetectorProvenance[],
): string[] {
  const failures: string[] = [];
  for (let index = 0; index < P5_HOST_BYPASS_ACCEPTED_DETECTOR_PROVENANCE_HISTORY_PREFIX.length; index++) {
    const accepted = P5_HOST_BYPASS_ACCEPTED_DETECTOR_PROVENANCE_HISTORY_PREFIX[index];
    const entry = history[index];
    if (entry === undefined || JSON.stringify(entry) !== JSON.stringify(accepted)) {
      failures.push(
        `P5 detector provenance history[${index}] rewrites immutable taxonomy v${accepted.taxonomyVersion}`,
      );
    }
  }
  return failures;
}

export function p5HostBypassDetectorProvenanceFailures(provenance: Readonly<P5HostBypassDetectorProvenance>): string[] {
  const accepted = P5_HOST_BYPASS_ACCEPTED_DETECTOR_PROVENANCE_HISTORY_PREFIX.at(-1)!;
  const failures: string[] = [];
  if (provenance.detects !== accepted.detects) {
    failures.push('P5 detector provenance rewrites the accepted hand-written detection floor');
  }
  if (provenance.zeroMeaning !== accepted.zeroMeaning) {
    failures.push('P5 detector provenance rewrites the accepted non-exhaustive zero meaning');
  }
  return failures;
}

function p5HostBypassBudgetEvidenceMatches(
  entry: Readonly<P5HostBypassBudgetEvidence>,
  accepted: Readonly<P5HostBypassBudgetEvidence>,
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

function p5HostBypassClassificationEvidenceMatches(
  entry: Readonly<P5HostBypassClassificationEvidence>,
  accepted: Readonly<P5HostBypassClassificationEvidence>,
): boolean {
  return JSON.stringify(entry) === JSON.stringify(accepted);
}

function p5HostBypassClassificationStartsFromAcceptedProgress(
  entry: Readonly<P5HostBypassClassificationEvidence>,
): boolean {
  if (entry.fromVersion !== 3) return false;
  const latest = P5_HOST_BYPASS_V3_PROGRESS_HISTORY[P5_HOST_BYPASS_V3_PROGRESS_HISTORY.length - 1];
  return entry.fromTotal === latest.total && p5HostBypassBudgetsMatch(entry.fromBudget, latest.budget);
}

function p5HostBypassV3BudgetEvidenceMatches(
  entry: Readonly<P5HostBypassV3BudgetEvidence>,
  accepted: Readonly<P5HostBypassV3BudgetEvidence>,
): boolean {
  return (
    entry.total === accepted.total &&
    entry.reason === accepted.reason &&
    p5HostBypassBudgetsMatch(entry.budget, accepted.budget)
  );
}

function p5HostBypassV4BudgetEvidenceMatches(
  entry: Readonly<P5HostBypassV4BudgetEvidence>,
  accepted: Readonly<P5HostBypassV4BudgetEvidence>,
): boolean {
  return (
    entry.total === accepted.total &&
    entry.reason === accepted.reason &&
    entry.repairedSites === accepted.repairedSites &&
    p5HostBypassBudgetsMatch(entry.budget, accepted.budget)
  );
}

function findP5HostBypassV4ProgressEntry(
  history: readonly P5HostBypassV4BudgetEvidence[],
  reason: string,
): P5HostBypassV4BudgetEvidence | undefined {
  return history.find((entry) => entry.reason === reason);
}

function completeP5HostBypassBudget(budget: P5HostBypassVersionedBudget): Record<P5HostBypassKind, number> {
  return {
    'direct-dom': budget['direct-dom'] ?? 0,
    'input-ingress': budget['input-ingress'] ?? 0,
    'frame-scheduling': budget['frame-scheduling'] ?? 0,
    'scratch-surface': budget['scratch-surface'] ?? 0,
    'render-surface': budget['render-surface'] ?? 0,
    'webgpu-acquisition': budget['webgpu-acquisition'] ?? 0,
  };
}

function p5HostBypassBudgetsMatch(left: P5HostBypassVersionedBudget, right: P5HostBypassVersionedBudget): boolean {
  const completedLeft = completeP5HostBypassBudget(left);
  const completedRight = completeP5HostBypassBudget(right);
  return (Object.keys(completedLeft) as P5HostBypassKind[]).every(
    (kind) => completedLeft[kind] === completedRight[kind],
  );
}

function totalP5HostBypassVersionedBudget(budget: P5HostBypassVersionedBudget): number {
  return Object.values(budget).reduce((sum, count) => sum + (count ?? 0), 0);
}

export function totalP5HostBypassBudget(budget: P5HostBypassBudget): number {
  return Object.values(budget).reduce((sum, count) => sum + count, 0);
}

export function formatP5HostBypassReport(report: Readonly<P5HostBypassReport>): string {
  const counts = countP5HostBypasses(report);
  const lines = [
    formatGateProvenance(
      {
        command: 'npm run check:p5-host-bypass (scripts/p5-host-bypass.ts)',
        counting:
          'one unit = one packages/*/src/**/*.ts file scanned; a site is one direct host-API expression, tallied per detected kind',
        scope:
          'runtime directory walk of packages/*/src/**/*.ts with no file roster; tests and helpers, host-* implementations, tool-* sources, explicit *Web* adapters, *-dom and *-canvas technology adapters, P4 window attachment and P3 transport syntax all excluded',
      },
      readGateTreeState(process.cwd()),
    ),
    'P5 host-bypass census',
    `SCANNED ${report.scannedFiles} packages/*/src/**/*.ts files (runtime directory walk; no file roster)`,
    `SLICE ${P5_HOST_BYPASS_SLICE_GUIDANCE}`,
    `TAXONOMY v${P5_HOST_BYPASS_DETECTOR_PROVENANCE.taxonomyVersion}`,
    `DETECTS ${P5_HOST_BYPASS_DETECTOR_PROVENANCE.detects}`,
    `ZERO ${P5_HOST_BYPASS_DETECTOR_PROVENANCE.zeroMeaning}`,
    'EXCLUDES tests/helpers, host-* implementations, tool-* sources, explicit *Web* adapters, *-dom/*-canvas technology adapters, application P4 window attachment, and P3 fetch/socket/EventSource/WebSocket/XHR/Request/Image transport syntax',
    `P5 outstanding=${report.p5.length} ${Object.entries(counts)
      .map(([kind, count]) => `${kind}=${count}`)
      .join(' ')}`,
    'P5 budget history (append-only)',
  ];
  for (let index = 0; index < P5_HOST_BYPASS_BUDGET_HISTORY.length; index++) {
    const entry = P5_HOST_BYPASS_BUDGET_HISTORY[index];
    const prior = P5_HOST_BYPASS_BUDGET_HISTORY[index - 1];
    const delta = prior === undefined ? '' : ` (-${prior.total - entry.total} fixed)`;
    lines.push(
      `  ${entry.total}${delta} ${Object.entries(entry.budget)
        .map(([kind, count]) => `${kind}=${count}`)
        .join(' ')} — ${entry.reason}`,
    );
  }
  lines.push('P5 taxonomy history (append-only)');
  for (const entry of P5_HOST_BYPASS_CLASSIFICATION_HISTORY) {
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
  lines.push('P5 repair history (taxonomy v3)');
  for (let index = 0; index < P5_HOST_BYPASS_V3_PROGRESS_HISTORY.length; index++) {
    const entry = P5_HOST_BYPASS_V3_PROGRESS_HISTORY[index];
    const prior = P5_HOST_BYPASS_V3_PROGRESS_HISTORY[index - 1];
    const delta = prior === undefined ? '' : ` (-${prior.total - entry.total} fixed)`;
    lines.push(
      `  ${entry.total}${delta} ${Object.entries(entry.budget)
        .map(([kind, count]) => `${kind}=${count}`)
        .join(' ')} — ${entry.reason}`,
    );
  }
  lines.push('P5 repair history (taxonomy v4)');
  for (let index = 0; index < P5_HOST_BYPASS_V4_PROGRESS_HISTORY.length; index++) {
    const entry = P5_HOST_BYPASS_V4_PROGRESS_HISTORY[index];
    const prior = P5_HOST_BYPASS_V4_PROGRESS_HISTORY[index - 1];
    const delta = prior === undefined ? '' : ` (-${prior.total - entry.total} fixed)`;
    lines.push(
      `  ${entry.total}${delta} ${Object.entries(entry.budget)
        .map(([kind, count]) => `${kind}=${count}`)
        .join(' ')} — ${entry.reason}`,
    );
  }
  for (const site of report.p5)
    lines.push(`  ${site.kind} ${site.file}:${site.line}:${site.column} ${site.expression}`);

  const excludedCounts = new Map<P5HostBypassExclusion, number>();
  for (const site of report.excluded) {
    const exclusion = site.exclusion as P5HostBypassExclusion;
    excludedCounts.set(exclusion, (excludedCounts.get(exclusion) ?? 0) + 1);
  }
  lines.push(
    `EXCLUDED ${[...excludedCounts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([reason, count]) => `${reason}=${count}`)
      .join(' ')}`,
  );
  lines.push(
    'P3 PARTITION owner=builder3 primitives=fetch,XMLHttpRequest,Request,Image,WebSocket,EventSource (reported here; enforced only by the independent P3 transport gate)',
  );
  for (const site of report.excluded.filter((candidate) => candidate.exclusion === 'p3-transport')) {
    lines.push(`  P3 ${site.file}:${site.line}:${site.column} ${site.expression}`);
  }
  return lines.join('\n');
}

if (isMainModule(import.meta.url, process.argv[1])) {
  const report = scanP5HostBypasses(process.cwd());
  process.stdout.write(`${formatP5HostBypassReport(report)}\n`);
  const failures = [
    ...p5HostBypassBudgetHistoryFailures(P5_HOST_BYPASS_BUDGET_HISTORY),
    ...p5HostBypassSliceGuidanceFailures(P5_HOST_BYPASS_SLICE_GUIDANCE),
    ...p5HostBypassClassificationHistoryFailures(P5_HOST_BYPASS_CLASSIFICATION_HISTORY),
    ...p5HostBypassV3ProgressHistoryFailures(P5_HOST_BYPASS_V3_PROGRESS_HISTORY),
    ...p5HostBypassV4ProgressHistoryFailures(P5_HOST_BYPASS_V4_PROGRESS_HISTORY),
    ...p5BitmapDrawTransferProgressFailures(P5_HOST_BYPASS_V4_PROGRESS_HISTORY),
    ...p5BitmapEncodeProgressFailures(P5_HOST_BYPASS_V4_PROGRESS_HISTORY),
    ...p5BitmapReadbackProgressFailures(P5_HOST_BYPASS_V4_PROGRESS_HISTORY),
    ...p5VideoCapabilityProgressFailures(P5_HOST_BYPASS_V4_PROGRESS_HISTORY),
    ...p5ShapeRasterSurfaceProgressFailures(P5_HOST_BYPASS_V4_PROGRESS_HISTORY),
    ...p5Scale9RasterSurfaceProgressFailures(P5_HOST_BYPASS_V4_PROGRESS_HISTORY),
    ...p5TextRasterSurfaceProgressFailures(P5_HOST_BYPASS_V4_PROGRESS_HISTORY),
    ...p5HostBypassDetectorProvenanceHistoryFailures(P5_HOST_BYPASS_DETECTOR_PROVENANCE_HISTORY),
    ...p5HostBypassDetectorProvenanceFailures(P5_HOST_BYPASS_DETECTOR_PROVENANCE),
    ...p5GlRenderSurfaceProviderBoundaryFailures(
      readFileSync(join(process.cwd(), 'packages/render-gl/src/glElement.ts'), 'utf8'),
    ),
    ...p5GlRenderSurfaceConsumerFailures(process.cwd()),
    ...p5WgpuRenderSurfaceProviderBoundaryFailures(
      readFileSync(join(process.cwd(), 'packages/render-wgpu/src/wgpuElement.ts'), 'utf8'),
    ),
    ...p5WgpuRenderSurfaceConsumerFailures(process.cwd()),
    ...p5WgpuRenderSurfaceRepairFailures(report),
    ...p5BitmapDrawTransferRepairFailures(report),
    ...p5BitmapEncodeRepairFailures(report),
    ...p5BitmapReadbackRepairFailures(report),
    ...p5VideoCapabilityRepairFailures(report),
    ...p5ShapeRasterSurfaceRepairFailures(report),
    ...p5Scale9RasterSurfaceRepairFailures(report),
    ...p5TextRasterSurfaceRepairFailures(report),
    ...p5HostBypassBudgetFailures(report, P5_HOST_BYPASS_BUDGET),
    ...p5HostBypassCurrentBudgetFailures(report, P5_HOST_BYPASS_BUDGET),
    ...p5TextRasterSurfaceCurrentFailures(report),
  ];
  if (failures.length > 0) {
    process.stderr.write(`P5 host-bypass ratchet exceeded:\n${failures.map((failure) => `- ${failure}`).join('\n')}\n`);
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

function statementInList(node: ts.Node): ts.Statement | null {
  let current = node;
  while (current.parent !== undefined) {
    const statements = statementList(current.parent);
    if (statements.includes(current as ts.Statement)) return current as ts.Statement;
    current = current.parent;
  }
  return null;
}

function statementList(node: ts.Node): readonly ts.Statement[] {
  return ts.isSourceFile(node) || ts.isBlock(node) ? node.statements : [];
}

function isEnableHostWebGlRenderSurfaceStatement(statement: ts.Statement | undefined): boolean {
  return (
    statement !== undefined &&
    ts.isExpressionStatement(statement) &&
    ts.isCallExpression(statement.expression) &&
    ts.isIdentifier(statement.expression.expression) &&
    statement.expression.expression.text === 'enableHostWebGlRenderSurface' &&
    statement.expression.arguments.length === 0
  );
}

function isEnableHostWebWgpuRenderSurfaceStatement(statement: ts.Statement | undefined): boolean {
  return (
    statement !== undefined &&
    ts.isExpressionStatement(statement) &&
    ts.isCallExpression(statement.expression) &&
    ts.isIdentifier(statement.expression.expression) &&
    statement.expression.expression.text === 'enableHostWebWgpuRenderSurface' &&
    statement.expression.arguments.length === 0
  );
}

function classifyNode(
  node: ts.Node,
  source: ts.SourceFile,
): {
  readonly inputEventName?: string;
  readonly inputListenerOperation?: 'registration' | 'removal';
  readonly kind: P5HostBypassKind | 'p3-transport';
} | null {
  if (ts.isNewExpression(node)) {
    const constructorName = expressionName(node.expression);
    if (constructorName === 'ImageData' || constructorName === 'OffscreenCanvas') return { kind: 'scratch-surface' };
    if (constructorName !== null && P3_CONSTRUCTORS.has(constructorName)) return { kind: 'p3-transport' };
    return null;
  }

  if (ts.isCallExpression(node)) {
    const calledName = expressionName(node.expression);
    if (calledName === 'fetch') return { kind: 'p3-transport' };
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
): P5HostBypassExclusion | null {
  const parts = file.split('/');
  const packageName = parts[0] === 'packages' ? (parts[1] ?? '') : '';
  const fileName = basename(file);
  if (/\.(?:test|spec)\.ts$/.test(fileName) || fileName.endsWith('TestHelper.ts')) return 'test-support';
  if (packageName.startsWith('host-')) return 'host-implementation';
  if (packageName.startsWith('tool-')) return 'tooling';
  if (packageName === 'application') return 'p4-window-attachment';
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
