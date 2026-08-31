// @ts-expect-error -- virtual module typed below
import { tests as _tests } from 'virtual:review-manifest';

import { parseReviewApprovals, serializeReviewApprovals } from './approvalState';
import {
  isReviewableCell,
  nextReviewableCell,
  referenceCells,
  reviewableCells,
  selectedReviewableCell,
} from './cellRole';
import type { ReviewCellRole } from './cellRole';
import {
  isReviewCommissionEligible,
  reviewCommissionIneligibility,
  reviewCommissionIneligibilityMessage,
  selectReviewCommissionCells,
} from './commissionEligibility';
import { reviewMissingReferenceMessage } from './commissionState';
import type { ReviewCommissionState as CommissionState } from './commissionState';
import { createReviewCommissionPayloadCell, markReviewCommissionRequested } from './referenceImageCommission';
import { filterReviewItems } from './reviewFilter';
import {
  orderReviewItems,
  resolveReviewAttentionGroup,
  REVIEW_ATTENTION_GROUP_ORDER,
  reviewItemByVisualDelta,
} from './reviewOrder';
import type { ReviewAttentionGroup as AttentionGroup } from './reviewOrder';

interface ReviewCellProvenance {
  hostInstanceId: string | null;
  environmentId: string | null;
}

interface ReviewBuildProvenance {
  commit: string | null;
  dirty: string[];
  dirtyOmitted: number;
}

type ParityStatus = 'passed' | 'failed' | 'no-data';

/** Serialized server result; policy behavior remains exclusively in scripts/reference-image-tolerance.ts. */
interface ReviewReferenceImageComparison {
  fraction: number;
  maxChannelDelta: number;
  dimensionMismatch: boolean;
}

interface ReviewReferenceImageTolerance {
  channelTolerance: number;
  comparisonPolicyId: string;
  gateOnMaxChannelDelta: boolean;
  maxChannelDelta: number;
  maxFraction: number;
  overridden: boolean;
  reason: string | null;
  scene: string;
}

interface ReviewCell {
  renderer: string;
  role: ReviewCellRole;
  state: 'ready' | 'error';
  error: string | null;
  changed: boolean | null;
  hash: string | null;
  referencePixelSha256: string | null;
  provenance: ReviewCellProvenance | null;
  build: ReviewBuildProvenance | null;
  commissionState: CommissionState | null;
  comparisonPolicy: ReviewReferenceImageTolerance | null;
  referenceComparison: ReviewReferenceImageComparison | null;
  referenceComparisonMatches: boolean | null;
  referenceComparisonMeasured: boolean;
  referenceComparisonProblem: string | null;
  holdReason: string | null;
  parityStatus: ParityStatus;
}

interface ReviewTest {
  tool: string;
  name: string;
  cells: ReviewCell[];
  expectedImageDescription?: string;
  sourceHasDescription: boolean;
  toleranceWritable: boolean;
  withheldReason?: string;
}

const STORAGE_KEY = 'review-selected';
const APPROVALS_STORAGE_KEY = 'review-approvals';
const allTests = _tests as ReviewTest[];

for (const t of allTests) {
  const reviewable = reviewableCells(t.cells);
  const group = resolveReviewAttentionGroup(reviewable);
  if (group !== 'included' && group !== 'requested') {
    const cells = reviewable.map((c) => ({
      renderer: c.renderer,
      commission: c.commissionState,
      changed: c.changed,
      matches: c.referenceComparisonMatches,
      fraction: c.referenceComparison?.fraction ?? null,
    }));
    // eslint-disable-next-line no-console
    console.warn(`[review] ${t.name} → ${group}`, cells);
  }
}

if (import.meta.hot) {
  import.meta.hot.on('review:commission-requested', (event: { cells: string[] }) => {
    if (markReviewCommissionRequested(allTests, event.cells) > 0) showCurrent();
  });
}

let filterQuery = '';
let includeSingleCellScenes = false;
let selectedKey = ''; // `${tool}/${name}`
let selectedRenderer = '';

const filterInput = document.getElementById('filter-input') as HTMLInputElement;
const includeSingleCellInput = document.getElementById('include-single-cell') as HTMLInputElement;
const testList = document.getElementById('test-list')!;
const rendererBar = document.getElementById('renderer-bar')!;
const preview = document.getElementById('preview')!;

// Images for the current test, in DOM and ready to blink between
let activeImgs: HTMLImageElement[] = [];

// Off-DOM image cache: key = `${tool}/${name}`, pre-loads neighboring tests
const imgCache = new Map<string, HTMLImageElement[]>();

type CompareMode = 'off' | 'side-by-side' | 'onion-skin';
let compareMode: CompareMode = 'side-by-side';
let onionOpacity = 0.5;

const approvedCells = parseReviewApprovals(sessionStorage.getItem(APPROVALS_STORAGE_KEY));
let promptOpen = false;

function approvalKey(t: ReviewTest, renderer: string): string {
  return `${t.tool}/${t.name}/${renderer}`;
}

function saveApprovals(): void {
  sessionStorage.setItem(APPROVALS_STORAGE_KEY, serializeReviewApprovals(approvedCells));
}

// Kept for the two places a reset is the INTENT — after a commission consumes the marks, and when the
// visible set changes under the single-cell filter. It is no longer called on plain navigation: the keys
// are `tool/name/renderer`, so they are test-scoped already and clearing on every selectTest destroyed
// marks without scoping anything.
function clearApprovals(): void {
  approvedCells.clear();
  saveApprovals();
}

function screenshotUrl(tool: string, name: string, renderer: string): string {
  return `/artifacts/${tool}/${name}/${renderer}/screenshot.png`;
}

function referenceUrl(tool: string, name: string, renderer: string): string {
  return `/reference/${tool}/${name}/${renderer}.png`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

function sizesDiffer(a: HTMLImageElement, b: HTMLImageElement): boolean {
  return a.naturalWidth !== b.naturalWidth || a.naturalHeight !== b.naturalHeight;
}

function computeDelta(
  candidateImg: HTMLImageElement,
  referenceImg: HTMLImageElement,
  tolerance: number,
): { canvas: HTMLCanvasElement; fraction: string; maxDelta: number; dimMismatch: string | null } {
  if (
    candidateImg.naturalWidth !== referenceImg.naturalWidth ||
    candidateImg.naturalHeight !== referenceImg.naturalHeight
  ) {
    return {
      canvas: document.createElement('canvas'),
      dimMismatch: `Cannot compare: ${candidateImg.naturalWidth}×${candidateImg.naturalHeight} vs ${referenceImg.naturalWidth}×${referenceImg.naturalHeight}`,
      fraction: 'N/A',
      maxDelta: 0,
    };
  }
  const w = candidateImg.naturalWidth;
  const h = candidateImg.naturalHeight;

  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = w;
  tmpCanvas.height = h;
  const ctx = tmpCanvas.getContext('2d')!;

  ctx.drawImage(candidateImg, 0, 0);
  const candidateData = ctx.getImageData(0, 0, w, h).data;

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(referenceImg, 0, 0);
  const referenceData = ctx.getImageData(0, 0, w, h).data;

  const deltaCanvas = document.createElement('canvas');
  deltaCanvas.width = w;
  deltaCanvas.height = h;
  const deltaCtx = deltaCanvas.getContext('2d')!;
  const deltaImage = deltaCtx.createImageData(w, h);
  const dd = deltaImage.data;

  let mismatchedPixels = 0;
  let maxChannelDelta = 0;
  const totalPixels = w * h;

  for (let i = 0; i < candidateData.length; i += 4) {
    const dr = Math.abs(candidateData[i] - referenceData[i]);
    const dg = Math.abs(candidateData[i + 1] - referenceData[i + 1]);
    const db = Math.abs(candidateData[i + 2] - referenceData[i + 2]);
    const da = Math.abs(candidateData[i + 3] - referenceData[i + 3]);
    const pixelDelta = Math.max(dr, dg, db, da);
    if (pixelDelta > maxChannelDelta) maxChannelDelta = pixelDelta;
    if (pixelDelta > tolerance) mismatchedPixels++;
    if (dr !== 0 || dg !== 0 || db !== 0 || da !== 0) {
      dd[i] = dr;
      dd[i + 1] = dg;
      dd[i + 2] = db;
      dd[i + 3] = 255;
    }
  }

  deltaCtx.putImageData(deltaImage, 0, 0);
  const frac = totalPixels === 0 ? 0 : mismatchedPixels / totalPixels;
  return {
    canvas: deltaCanvas,
    dimMismatch: null,
    fraction: `${(frac * 100).toFixed(4)}% (${mismatchedPixels}/${totalPixels})`,
    maxDelta: maxChannelDelta,
  };
}

function testKey(t: ReviewTest): string {
  return `${t.tool}/${t.name}`;
}

// ★ THE ORDER YOU SEE AND THE ORDER THE TOOL SELECTS IN MUST BE ONE ORDER. `filterReviewItems` says so
// in its own doc comment — "preserving manifest order for later visual sorting" — and the visual sort was
// never applied here. The sidebar sorted independently by attention group, so the list opened with
// "Differs (N)" at the top while the initial selection was `visibleTests()[0]`, i.e. the alphabetically
// first scene, which is almost always buried in "Included". You landed on a passing scene and had to go
// find the failing ones that were already on screen above you.
function visibleTests(): ReviewTest[] {
  return orderReviewItems(
    filterReviewItems(
      allTests,
      { includeSingleCellScenes, query: filterQuery },
      {
        name: (test) => test.name,
        reviewableCellCount: (test) => reviewableCells(test.cells).length,
        tool: (test) => test.tool,
      },
    ),
    REVIEW_ORDER_ACCESSORS,
  );
}

function currentTest(): ReviewTest | null {
  return visibleTests().find((t) => testKey(t) === selectedKey) ?? visibleTests()[0] ?? null;
}

function currentCellIndex(): number {
  const t = currentTest();
  if (!t) return 0;
  const selected = selectedReviewableCell(t.cells, selectedRenderer);
  const i = selected === null ? -1 : t.cells.indexOf(selected);
  return i >= 0 ? i : 0;
}

function testStatus(t: ReviewTest): 'error' | 'changed' | 'pass' {
  const cells = reviewableCells(t.cells);
  if (cells.some((c) => c.state === 'error')) return 'error';
  if (cells.some((c) => c.changed && c.commissionState !== 'included')) return 'changed';
  return 'pass';
}

function testAttentionGroup(t: ReviewTest): AttentionGroup {
  return resolveReviewAttentionGroup(reviewableCells(t.cells));
}

function firstAttentionCell(t: ReviewTest): ReviewCell | null {
  const cells = reviewableCells(t.cells);
  const group = resolveReviewAttentionGroup(cells);
  switch (group) {
    case 'differs':
      return cells.find((c) => c.commissionState === 'differs' && c.holdReason === null) ?? null;
    case 'changed':
      return cells.find((c) => c.changed === true && c.holdReason === null && c.commissionState !== 'included') ?? null;
    case 'not-commissioned':
      return cells.find((c) => c.commissionState === 'not-commissioned' && c.holdReason === null) ?? null;
    default:
      return null;
  }
}

// The labels say what the GATE does with each group, because that is the question a reviewer opens the
// tool holding. "Differs" and "Not commissioned" are the two shapes the gate fails on; "Held" is the one
// that looks like them and passes.
const ATTENTION_GROUP_LABELS: Record<AttentionGroup, string> = {
  differs: 'Differs — gate fails',
  changed: 'Changed',
  'not-commissioned': 'Not commissioned — gate fails',
  held: 'Held — deferred, gate passes',
  requested: 'Requested',
  included: 'Included',
};

const REVIEW_ORDER_ACCESSORS = {
  key: testKey,
  tool: (test: ReviewTest) => test.tool,
  name: (test: ReviewTest) => test.name,
  attentionGroup: testAttentionGroup,
};

function ensureCached(t: ReviewTest): HTMLImageElement[] {
  const key = testKey(t);
  if (!imgCache.has(key)) {
    imgCache.set(
      key,
      t.cells.map((cell) => {
        const img = new Image();
        img.src = screenshotUrl(t.tool, t.name, cell.renderer);
        return img;
      }),
    );
  }
  return imgCache.get(key)!;
}

function buildSidebar(): void {
  testList.innerHTML = '';

  // visibleTests() is already in visual order — one owner for the order, so the sidebar and the
  // selection cannot drift apart again.
  const visible = visibleTests();
  const tools = [...new Set(visible.map((t) => t.tool))];
  const multiTool = tools.length > 1;

  for (const tool of tools) {
    if (multiTool) {
      const header = document.createElement('div');
      header.className = 'tool-header';
      header.textContent = tool;
      testList.appendChild(header);
    }

    const toolTests = visible.filter((v) => v.tool === tool);
    const grouped = new Map<AttentionGroup, ReviewTest[]>();
    for (const t of toolTests) {
      const group = testAttentionGroup(t);
      let arr = grouped.get(group);
      if (!arr) {
        arr = [];
        grouped.set(group, arr);
      }
      arr.push(t);
    }

    for (const group of REVIEW_ATTENTION_GROUP_ORDER) {
      const tests = grouped.get(group);
      if (!tests || tests.length === 0) continue;

      const groupHeader = document.createElement('div');
      groupHeader.className = 'attention-header';
      groupHeader.setAttribute('data-attention', group);
      groupHeader.textContent = `${ATTENTION_GROUP_LABELS[group]} (${tests.length})`;
      testList.appendChild(groupHeader);

      for (const t of tests) {
        const key = testKey(t);
        const btn = document.createElement('button');
        btn.className = 'test-btn' + (key === selectedKey ? ' selected' : '');
        btn.setAttribute('data-status', testStatus(t));
        btn.textContent = t.name;
        btn.title = multiTool ? `${t.tool}: ${t.name}` : t.name;
        btn.addEventListener('click', () => selectTest(t));
        testList.appendChild(btn);
      }
    }
  }

  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sidebar-empty';
    empty.textContent =
      allTests.length === 0
        ? 'No captures yet'
        : !includeSingleCellScenes && allTests.every((test) => reviewableCells(test.cells).length < 2)
          ? 'No multi-cell scenes'
          : 'No matches';
    testList.appendChild(empty);
  }

  testList.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
}

async function holdRenderers(renderers: readonly string[]): Promise<void> {
  const t = currentTest();
  if (!t) return;

  promptOpen = true;
  const reason = prompt('Hold reason (mandatory — explain what is wrong with this render):');
  promptOpen = false;
  if (!reason || reason.trim().length === 0) return;

  try {
    const res = await fetch('/api/hold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: t.tool,
        entry: t.name,
        renderers,
        reason: reason.trim(),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      showCommissionFeedback(`Error: ${(err as { error: string }).error}`, true);
      return;
    }
    const result = (await res.json()) as { actor: string; keys: string[]; path: string };
    for (const cell of t.cells) {
      if (result.keys.includes(`${t.tool}/${t.name}/${cell.renderer}`)) cell.holdReason = reason.trim();
    }
    showCommissionFeedback(`Held ${result.keys.length} cell(s) as ${result.actor} in ${result.path}`, false);
    showCurrent();
  } catch (e) {
    showCommissionFeedback(`Network error: ${e}`, true);
  }
}

async function releaseHeldRenderers(renderers: readonly string[]): Promise<void> {
  const t = currentTest();
  if (!t || renderers.length === 0) return;

  promptOpen = true;
  const reason = prompt('Release reason (mandatory — explain why the hold no longer applies):');
  promptOpen = false;
  if (!reason || reason.trim().length === 0) return;

  try {
    const res = await fetch('/api/hold', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: t.tool,
        entry: t.name,
        renderers,
        reason: reason.trim(),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      showCommissionFeedback(`Error: ${(err as { error: string }).error}`, true);
      return;
    }
    const result = (await res.json()) as { actor: string; keys: string[]; path: string };
    for (const cell of t.cells) {
      if (result.keys.includes(`${t.tool}/${t.name}/${cell.renderer}`)) cell.holdReason = null;
    }
    showCommissionFeedback(`Released ${result.keys.length} hold(s) as ${result.actor} in ${result.path}`, false);
    showCurrent();
  } catch (e) {
    showCommissionFeedback(`Network error: ${e}`, true);
  }
}

async function configureCurrentTolerance(): Promise<void> {
  const t = currentTest();
  if (!t) return;
  const cells = reviewableCells(t.cells);
  const policy = cells.find((cell) => cell.comparisonPolicy !== null)?.comparisonPolicy;
  if (policy === null || policy === undefined) return;
  if (!t.toleranceWritable) {
    showCommissionFeedback('Cannot set tolerance until flight-reference-images registers the policy identity', true);
    return;
  }
  const measurements = cells.filter((cell) => cell.referenceComparisonMeasured && cell.referenceComparison !== null);
  if (measurements.length === 0) {
    showCommissionFeedback('No full-resolution comparison is available — fetch the blessed references first', true);
    return;
  }

  promptOpen = true;
  try {
    if (
      policy.overridden &&
      confirm(
        `Remove the ${policy.scene} override and restore exact comparison?\n\nOK removes it. Cancel keeps it and opens the editor.`,
      )
    ) {
      await writeTolerance(t, null);
      return;
    }

    const measured = measurements
      .map((cell) => {
        const comparison = cell.referenceComparison!;
        return `${cell.renderer}: fraction ${comparison.fraction.toFixed(6)}, max channel delta ${comparison.maxChannelDelta}`;
      })
      .join('\n');
    const channelTolerance = promptNumber(
      `${policy.scene}\n\nCurrent full-resolution measurements:\n${measured}\n\nPer-channel tolerance (integer 0-255):`,
      policy.channelTolerance,
      { integer: true, minimum: 0, maximum: 255 },
    );
    if (channelTolerance === null) return;
    const maxFraction = promptNumber('Maximum mismatched fraction (0-1):', policy.maxFraction, {
      integer: false,
      minimum: 0,
      maximum: 1,
    });
    if (maxFraction === null) return;
    const gateText = prompt(
      'Gate on maximum channel delta? Enter true or false:',
      String(policy.gateOnMaxChannelDelta),
    );
    if (gateText === null) return;
    if (gateText !== 'true' && gateText !== 'false') {
      showCommissionFeedback('Gate value must be true or false', true);
      return;
    }
    const maxChannelDelta = promptNumber('Maximum channel delta (integer 0-255):', policy.maxChannelDelta, {
      integer: true,
      minimum: 0,
      maximum: 255,
    });
    if (maxChannelDelta === null) return;
    const reason = prompt(
      'Reason (mandatory — record the measured renderer behavior this scene policy permits):',
      policy.reason ?? '',
    );
    if (reason === null || reason.trim() === '') return;

    await writeTolerance(t, {
      channelTolerance,
      gateOnMaxChannelDelta: gateText === 'true',
      maxChannelDelta,
      maxFraction,
      reason: reason.trim(),
    });
  } finally {
    promptOpen = false;
  }
}

function promptNumber(
  message: string,
  current: number,
  range: { integer: boolean; minimum: number; maximum: number },
): number | null {
  const raw = prompt(message, String(current));
  if (raw === null) return null;
  const value = Number(raw);
  if (
    !Number.isFinite(value) ||
    (range.integer && !Number.isInteger(value)) ||
    value < range.minimum ||
    value > range.maximum
  ) {
    showCommissionFeedback(
      `Value must be ${range.integer ? 'an integer' : 'a number'} from ${range.minimum} through ${range.maximum}`,
      true,
    );
    return null;
  }
  return value;
}

async function writeTolerance(
  t: ReviewTest,
  tolerance: {
    channelTolerance: number;
    maxFraction: number;
    gateOnMaxChannelDelta: boolean;
    maxChannelDelta: number;
    reason: string;
  } | null,
): Promise<void> {
  try {
    const res = await fetch('/api/tolerance', {
      method: tolerance === null ? 'DELETE' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: t.tool, entry: t.name, tolerance }),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: res.statusText }));
      showCommissionFeedback(`Error: ${(error as { error: string }).error}`, true);
      return;
    }
    const result = (await res.json()) as { path: string };
    showCommissionFeedback(
      tolerance === null ? `Restored exact comparison in ${result.path}` : `Updated scene tolerance in ${result.path}`,
      false,
    );
  } catch (error) {
    showCommissionFeedback(`Network error: ${error}`, true);
  }
}

async function holdCurrentTest(): Promise<void> {
  const t = currentTest();
  if (!t) return;
  await holdRenderers(reviewableCells(t.cells).map((c) => c.renderer));
}

async function commissionCurrentTest(): Promise<void> {
  const t = currentTest();
  if (!t) return;

  const reviewable = reviewableCells(t.cells);
  const selectedCells = selectReviewCommissionCells(reviewable, (cell) =>
    approvedCells.get(approvalKey(t, cell.renderer)),
  );

  if (selectedCells.length === 0) {
    showCommissionFeedback('Cannot commission: no eligible captured cells', true);
    return;
  }

  const cells = selectedCells.map(createReviewCommissionPayloadCell);

  const totalCells = reviewable.length;
  try {
    const res = await fetch('/api/commission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: t.tool,
        entry: t.name,
        cells,
        reason: 'Commissioned from review',
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      showCommissionFeedback(`Error: ${(err as { error: string }).error}`, true);
      return;
    }
    const result = (await res.json()) as {
      id: string;
      path: string;
      committed: number;
      total: number;
      held: string[];
      skipped: string[];
      coverageAdded: number;
      buildCommit: string | null;
      dirty: string[];
      dirtyOmitted: number;
    };
    // Held cells are already reported on their own line; counting them again as "not approved" would say
    // the reviewer withheld approval they were never offered.
    const notApproved = reviewable
      .filter((c) => c.holdReason === null && !selectedCells.includes(c))
      .map((c) => c.renderer);
    const parts: string[] = [];
    if (notApproved.length > 0) {
      parts.push(`${notApproved.length} not approved`);
    }
    if (result.held.length > 0) {
      parts.push(`held ${result.held.join(', ')}`);
    }
    if (result.skipped.length > 0) {
      parts.push(`skipped ${result.skipped.join(', ')} (no capture hash)`);
    }
    const scope =
      parts.length === 0
        ? `all ${totalCells} renderer(s)`
        : `${result.committed} of ${totalCells} renderer(s) — ${parts.join(', ')}`;
    const coverage = result.coverageAdded > 0 ? `, ${result.coverageAdded} coverage entr(y/ies) declared` : '';
    const build = ` from reviewed build ${result.buildCommit?.slice(0, 12) ?? 'UNSTAMPED'}`;
    const dirty =
      result.dirty.length === 0 && result.dirtyOmitted === 0
        ? ''
        : ` — WARNING: Built with uncommitted changes: ${formatDirtyPaths(result.dirty, result.dirtyOmitted)}`;
    markReviewCommissionRequested(
      allTests,
      selectedCells
        .filter((cell) => !result.skipped.includes(cell.renderer))
        .map((cell) => `${t.tool}/${t.name}/${cell.renderer}`),
    );
    showCommissionFeedback(
      `Requested ${scope}${coverage}${build}${dirty} → ${result.path}`,
      result.skipped.length > 0 || result.dirty.length > 0 || result.dirtyOmitted > 0,
    );
    clearApprovals();
    showCurrent();
  } catch (e) {
    showCommissionFeedback(`Network error: ${e}`, true);
  }
}

function formatDirtyPaths(paths: readonly string[], alreadyOmitted = 0, limit = 5): string {
  const visible = paths.slice(0, limit).join(', ');
  const remaining = paths.length - Math.min(paths.length, limit) + alreadyOmitted;
  return remaining === 0 ? visible : `${visible}${visible === '' ? '' : ', '}… ${remaining} more`;
}

function showCommissionFeedback(message: string, isError: boolean): void {
  let el = document.querySelector<HTMLElement>('.commission-feedback');
  if (!el) {
    el = document.createElement('div');
    el.className = 'commission-feedback';
    preview.appendChild(el);
  }
  el.textContent = message;
  el.style.color = isError ? '#c05050' : '#50c050';
  setTimeout(() => el?.remove(), 4000);
}

function commissionStateLabel(state: CommissionState | null): string {
  switch (state) {
    case null:
      return '';
    case 'included':
      return 'included';
    case 'differs':
      return 'differs';
    case 'requested':
      return 'requested';
    case 'not-commissioned':
      return '';
  }
}

function testCommissionSummary(t: ReviewTest): { state: CommissionState; canCommission: boolean } {
  const cells = reviewableCells(t.cells);
  const hasIncluded = cells.some((c) => c.commissionState === 'included');
  const hasDiffers = cells.some((c) => c.commissionState === 'differs');
  const hasRequested = cells.some((c) => c.commissionState === 'requested');

  if (hasRequested) return { state: 'requested', canCommission: false };
  if (hasIncluded && !hasDiffers) return { state: 'included', canCommission: false };
  if (hasDiffers) return { state: 'differs', canCommission: true };
  return { state: 'not-commissioned', canCommission: true };
}

function buildRendererBar(): void {
  rendererBar.innerHTML = '';
  const t = currentTest();
  if (!t) return;

  const ci = currentCellIndex();
  const reviewable = reviewableCells(t.cells);
  t.cells.forEach((cell, i) => {
    if (!isReviewableCell(cell)) {
      const label = document.createElement('span');
      label.className = 'renderer-reference';
      label.textContent = `${cell.renderer} · reference`;
      label.title = 'Context only — never selected, approved, held, or commissioned';
      rendererBar.appendChild(label);
      return;
    }
    const btn = document.createElement('button');
    btn.className = 'renderer-btn' + (i === ci ? ' selected' : '');
    if (cell.state === 'error') btn.setAttribute('data-status', 'error');
    else if (cell.changed) btn.setAttribute('data-status', 'changed');

    const label = commissionStateLabel(cell.commissionState);
    if (label) btn.setAttribute('data-commission', label);

    const mark = approvedCells.get(approvalKey(t, cell.renderer));
    if (mark === true) btn.setAttribute('data-approval', 'approved');

    btn.textContent = cell.renderer;
    if (cell.parityStatus !== 'no-data') {
      const indicator = document.createElement('span');
      indicator.className = 'parity-indicator';
      indicator.setAttribute('data-parity', cell.parityStatus);
      indicator.textContent = cell.parityStatus === 'failed' ? '≢' : '≡';
      indicator.title = cell.parityStatus === 'failed' ? 'Parity: FAILED' : 'Parity: passed';
      btn.appendChild(indicator);
    }
    btn.addEventListener('click', () => {
      selectedRenderer = cell.renderer;
      buildRendererBar();
      showRenderer();
      saveState();
    });
    rendererBar.appendChild(btn);
  });

  const summary = testCommissionSummary(t);
  // ★ A HELD SIBLING NO LONGER BLOCKS THE TEST. Holding and commissioning answer different questions —
  // "is this picture one to bless" versus "capture what this build renders" — so a hold subtracts its own
  // cell from the commission and leaves the rest of the row alone. Only a fully held test has nothing left
  // to commission, and that is a fact about the row being empty, not a policy about holds.
  const heldCells = reviewable.filter((c) => c.holdReason !== null);
  const allHeld = reviewable.length > 0 && heldCells.length === reviewable.length;
  const commissionBtn = document.createElement('button');
  commissionBtn.className = 'commission-btn';

  if (allHeld) {
    commissionBtn.textContent = 'Every cell held — nothing to commission';
    commissionBtn.title = 'Every reviewable cell is held, so no cell is left to commission';
    commissionBtn.disabled = true;
    commissionBtn.setAttribute('data-commission', 'held');
  } else if (summary.state === 'included') {
    commissionBtn.textContent = 'Already included';
    commissionBtn.title = 'All cells match their locked reference images';
    commissionBtn.disabled = true;
    commissionBtn.setAttribute('data-commission', 'included');
  } else if (summary.state === 'requested') {
    commissionBtn.textContent = 'Request pending';
    commissionBtn.title = 'A commission request is already queued for this scene';
    commissionBtn.disabled = true;
    commissionBtn.setAttribute('data-commission', 'requested');
  } else {
    const approvedCount = reviewable.filter((c) => approvedCells.get(approvalKey(t, c.renderer)) === true).length;
    const hasMarks = reviewable.some((c) => approvedCells.has(approvalKey(t, c.renderer)));
    if (hasMarks && approvedCount > 0) {
      commissionBtn.textContent = `Commission (${approvedCount} of ${reviewable.length})`;
      commissionBtn.title = `Commission ${approvedCount} approved cell(s) — 'a' marks another, 'h' holds one, 'c' commissions`;
    } else if (hasMarks && approvedCount === 0) {
      commissionBtn.textContent = 'Commission (none approved)';
      commissionBtn.title =
        "No cells marked — 'a' marks the current cell; 'c' with nothing marked commissions every eligible cell";
      commissionBtn.disabled = true;
    } else if (summary.state === 'differs') {
      commissionBtn.textContent = 'Commission (differs)';
      commissionBtn.title = 'This capture differs from the locked reference — commission to update';
    } else {
      commissionBtn.textContent = 'Commission';
      commissionBtn.title = "Write a reference image request for all renderers of this scene ('c')";
    }
    // Named, not just counted: "Commission (3 of 4)" alone reads as an approval shortfall, and the one
    // cell that will not travel is the one the reviewer most needs to know about.
    if (heldCells.length > 0) {
      commissionBtn.textContent += ` · ${heldCells.length} held`;
      commissionBtn.title += ` — excluding held cell(s): ${heldCells.map((cell) => cell.renderer).join(', ')}`;
    }
    const dirtyPaths = [...new Set(reviewable.flatMap((cell) => cell.build?.dirty ?? []))];
    const dirtyOmitted = Math.max(0, ...reviewable.map((cell) => cell.build?.dirtyOmitted ?? 0));
    if (dirtyPaths.length > 0 || dirtyOmitted > 0) {
      commissionBtn.title += ` — WARNING: Built with uncommitted changes: ${formatDirtyPaths(dirtyPaths, dirtyOmitted)}`;
      commissionBtn.setAttribute('data-build-dirty', 'true');
    }
    const missingCaptures = reviewable.filter(
      (cell) => reviewCommissionIneligibility(cell) === 'missing-capture',
    ).length;
    const missingBuildStamps = reviewable.filter(
      (cell) => reviewCommissionIneligibility(cell) === 'missing-build-stamp',
    ).length;
    const missingHostIdentities = reviewable.filter(
      (cell) => reviewCommissionIneligibility(cell) === 'missing-host-identity',
    ).length;
    if (missingCaptures > 0) {
      commissionBtn.title += ` — ${missingCaptures} cell(s) have no capture and will be skipped; capture them before commissioning`;
    }
    if (missingBuildStamps > 0) {
      commissionBtn.title += ` — ${missingBuildStamps} captured cell(s) have no build stamp and will be skipped; re-capture now that the build is complete`;
    }
    if (missingHostIdentities > 0) {
      commissionBtn.title += ` — ${missingHostIdentities} captured cell(s) have no host identity and will be skipped; re-capture them so the machine identity is recorded`;
    }
    if (reviewable.every((cell) => isReviewCommissionEligible(cell))) {
      commissionBtn.title +=
        ' — selected pixel hashes record what you reviewed; CI recreates the recorded build commit, and any decoded-pixel difference is preserved in request-image-differences.json for review';
    }
    if (!hasMarks && !reviewable.some((cell) => isReviewCommissionEligible(cell))) {
      commissionBtn.textContent = 'Commission (no eligible captures)';
      commissionBtn.disabled = true;
    }
    commissionBtn.addEventListener('click', () => void commissionCurrentTest());
  }

  rendererBar.appendChild(commissionBtn);

  const anyHeld = reviewable.some((c) => c.holdReason !== null);
  const holdBtn = document.createElement('button');
  holdBtn.className = 'hold-btn';
  if (anyHeld) {
    const heldRenderers = reviewable.filter((cell) => cell.holdReason !== null).map((cell) => cell.renderer);
    holdBtn.textContent = heldRenderers.length === 1 ? 'Release hold' : `Release ${heldRenderers.length} holds`;
    holdBtn.title = 'Release the held cell(s) after recording who released them and why';
    holdBtn.setAttribute('data-held', 'true');
    holdBtn.addEventListener('click', () => void releaseHeldRenderers(heldRenderers));
  } else {
    holdBtn.textContent = 'Hold';
    holdBtn.title =
      "Hold this render — marks all cells as not ready for commissioning, requires a reason ('h' holds just the current cell)";
    holdBtn.addEventListener('click', () => void holdCurrentTest());
  }
  rendererBar.appendChild(holdBtn);

  const tolerancePolicy = reviewable.find((cell) => cell.comparisonPolicy !== null)?.comparisonPolicy;
  const toleranceBtn = document.createElement('button');
  toleranceBtn.className = 'tolerance-btn';
  toleranceBtn.textContent = tolerancePolicy?.overridden ? 'Tolerance: custom' : 'Tolerance: exact';
  const measured = reviewable.some((cell) => cell.referenceComparisonMeasured && cell.referenceComparison !== null);
  if (!t.toleranceWritable) {
    toleranceBtn.disabled = true;
    toleranceBtn.title = 'Waiting for flight-reference-images to register the per-scene comparison policy identity';
  } else if (!measured) {
    toleranceBtn.disabled = true;
    toleranceBtn.title = 'Fetch a blessed reference to expose full-resolution measurements before setting policy';
  } else {
    toleranceBtn.title = tolerancePolicy?.overridden
      ? `Edit or remove the declared policy — ${tolerancePolicy.reason}`
      : 'Declare a measured per-scene comparison policy with a mandatory reason';
    toleranceBtn.addEventListener('click', () => void configureCurrentTolerance());
  }
  rendererBar.appendChild(toleranceBtn);

  const sep = document.createElement('span');
  sep.className = 'renderer-sep';
  rendererBar.appendChild(sep);

  for (const mode of ['off', 'side-by-side', 'onion-skin'] as CompareMode[]) {
    const btn = document.createElement('button');
    btn.className = 'compare-btn' + (compareMode === mode ? ' selected' : '');
    btn.textContent = mode === 'off' ? 'Preview' : mode === 'side-by-side' ? 'Side-by-side' : 'Onion skin';
    btn.title = mode === 'off' ? 'Normal preview' : `Compare: ${mode}`;
    btn.addEventListener('click', () => {
      compareMode = mode;
      buildRendererBar();
      showRenderer();
    });
    rendererBar.appendChild(btn);
  }
}

function commissionStateMessage(state: CommissionState | null): string {
  switch (state) {
    case null:
      return 'Reference cell — context only, never reviewed or commissioned.';
    case 'included':
      return 'Already included — this capture matches the locked reference image.';
    case 'differs':
      return 'Commissioned — this capture DIFFERS from the locked reference image.';
    case 'requested':
      return 'Request pending — a commission request is already queued for this cell.';
    case 'not-commissioned':
      return 'Not commissioned — no reference image entry for this cell.';
  }
}

function showRenderer(): void {
  const ci = currentCellIndex();
  activeImgs.forEach((img, i) => {
    img.style.visibility = i === ci ? 'visible' : 'hidden';
  });

  const t = currentTest();
  const cell = t?.cells[ci];
  let errorEl = preview.querySelector<HTMLElement>('.error-overlay');
  if (cell?.state === 'error') {
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.className = 'error-overlay';
      preview.appendChild(errorEl);
    }
    errorEl.textContent = cell.error ?? 'Capture failed';
  } else {
    errorEl?.remove();
  }

  let stateEl = preview.querySelector<HTMLElement>('.commission-state');
  if (cell) {
    if (!stateEl) {
      stateEl = document.createElement('div');
      stateEl.className = 'commission-state';
      preview.appendChild(stateEl);
    }
    if (cell.holdReason) {
      stateEl.textContent = `HELD — ${cell.holdReason}`;
      stateEl.setAttribute('data-commission', 'held');
    } else if (t && approvedCells.get(approvalKey(t, cell.renderer)) === true) {
      stateEl.textContent = 'Approved for commissioning (not yet filed)';
      stateEl.setAttribute('data-commission', 'approved');
    } else {
      stateEl.textContent = commissionStateMessage(cell.commissionState);
      stateEl.setAttribute('data-commission', cell.commissionState ?? 'not-commissioned');
    }
  } else {
    stateEl?.remove();
  }

  let buildEl = preview.querySelector<HTMLElement>('.build-warning');
  const commissionIneligibility = cell ? reviewCommissionIneligibility(cell) : null;
  const buildDirty = (cell?.build?.dirty.length ?? 0) > 0 || (cell?.build?.dirtyOmitted ?? 0) > 0;
  if (cell && (commissionIneligibility !== null || buildDirty)) {
    if (!buildEl) {
      buildEl = document.createElement('div');
      buildEl.className = 'build-warning';
      preview.appendChild(buildEl);
    }
    buildEl.textContent = commissionIneligibility
      ? reviewCommissionIneligibilityMessage(commissionIneligibility)
      : `Built with uncommitted changes: ${formatDirtyPaths(cell.build!.dirty, cell.build!.dirtyOmitted)}`;
  } else {
    buildEl?.remove();
  }

  let parityEl = preview.querySelector<HTMLElement>('.parity-state');
  if (cell) {
    if (!parityEl) {
      parityEl = document.createElement('div');
      parityEl.className = 'parity-state';
      preview.appendChild(parityEl);
    }
    parityEl.setAttribute('data-parity', cell.parityStatus);
    if (cell.parityStatus === 'passed') {
      parityEl.textContent = 'Parity: passed';
    } else if (cell.parityStatus === 'failed') {
      parityEl.textContent = 'Parity: FAILED';
    } else {
      parityEl.textContent = 'No parity data — run npm run test:functional:parity';
    }
  } else {
    parityEl?.remove();
  }

  preview.querySelector('.compare-view')?.remove();
  if (t && cell && (compareMode !== 'off' || referenceCells(t.cells).length > 0)) {
    showCompareView(t, cell);
  }
}

// `.compare-view` is an absolute overlay (inset: 0), so it covers the description the preview rendered
// underneath it. The description travels into the overlay rather than being hidden by it — and sits
// BELOW the images: you look first, then read what it should have been, so the text does not prime the
// eye before it has seen the pixels.
function appendCompareDescription(container: HTMLElement, t: ReviewTest): void {
  if (!t.expectedImageDescription) return;
  const desc = document.createElement('div');
  desc.className = 'compare-description';
  desc.textContent = t.expectedImageDescription;
  container.appendChild(desc);
}

function makeComparePanel(title: string, element: HTMLElement): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'compare-panel';
  const label = document.createElement('div');
  label.className = 'compare-label';
  label.textContent = title;
  panel.appendChild(label);
  panel.appendChild(element);
  return panel;
}

function setCompareGridColumns(grid: HTMLElement): void {
  grid.style.gridTemplateColumns = `repeat(${grid.childElementCount}, minmax(0, 1fr))`;
}

function comparisonStats(cell: ReviewCell): string {
  if (cell.referenceComparisonProblem !== null)
    return `Policy comparison unavailable: ${cell.referenceComparisonProblem}`;
  const comparison = cell.referenceComparison;
  const policy = cell.comparisonPolicy;
  if (comparison === null || policy === null) return 'Policy comparison unavailable';
  const verdict = cell.referenceComparisonMatches ? 'WITHIN POLICY' : 'OUTSIDE POLICY';
  const maxGate = policy.gateOnMaxChannelDelta ? String(policy.maxChannelDelta) : 'reported only';
  const kind = policy.overridden ? 'scene override' : 'exact-by-absence';
  return `${verdict} · fraction ${comparison.fraction.toFixed(6)} / ${policy.maxFraction} · max channel delta ${comparison.maxChannelDelta} / ${maxGate} · channel tolerance ${policy.channelTolerance} · ${kind}`;
}

async function showCompareView(t: ReviewTest, cell: ReviewCell): Promise<void> {
  if (!isReviewableCell(cell) || cell.commissionState === null) return;
  const container = document.createElement('div');
  container.className = 'compare-view';

  const candidateSrc = screenshotUrl(t.tool, t.name, cell.renderer);
  const referenceSrc = referenceUrl(t.tool, t.name, cell.renderer);
  const contextCells = referenceCells(t.cells);

  // Loaded INDEPENDENTLY on purpose. Most cells have no reference image yet, and a single
  // Promise.all rejection used to discard the candidate too — so the common case rendered an empty
  // pane and the capture, which always exists, became invisible for want of a referent.
  const [candidateImg, referenceImg, contextImages] = await Promise.all([
    loadImage(candidateSrc).catch(() => null),
    compareMode === 'off' ? Promise.resolve(null) : loadImage(referenceSrc).catch(() => null),
    Promise.all(
      contextCells.map(async (contextCell) => ({
        cell: contextCell,
        image: await loadImage(screenshotUrl(t.tool, t.name, contextCell.renderer)).catch(() => null),
      })),
    ),
  ]);

  if (candidateImg === null) {
    container.innerHTML = `<div class="compare-message">No capture for this cell — capture it before commissioning</div>`;
    appendCompareDescription(container, t);
    preview.appendChild(container);
    return;
  }

  const appendContextPanels = (grid: HTMLElement): void => {
    for (const context of contextImages) {
      const content = context.image ?? document.createElement('div');
      if (context.image) {
        context.image.className = 'compare-img';
      } else {
        content.className = 'compare-placeholder';
        content.textContent = 'Reference capture unavailable';
      }
      grid.appendChild(makeComparePanel(`Reference · ${context.cell.renderer}`, content));
    }
  };

  if (compareMode === 'off') {
    const grid = document.createElement('div');
    grid.className = 'compare-grid';
    candidateImg.className = 'compare-img';
    grid.appendChild(makeComparePanel('Candidate', candidateImg));
    appendContextPanels(grid);
    setCompareGridColumns(grid);
    container.appendChild(grid);
    appendCompareDescription(container, t);
    preview.appendChild(container);
    return;
  }

  // No blessed reference: show the capture and any authored context, and name WHICH absence remains.
  if (referenceImg === null) {
    const grid = document.createElement('div');
    grid.className = 'compare-grid';
    candidateImg.className = 'compare-img';
    grid.appendChild(makeComparePanel('Candidate', candidateImg));
    appendContextPanels(grid);
    const placeholder = document.createElement('div');
    placeholder.className = 'compare-placeholder';
    placeholder.textContent = reviewMissingReferenceMessage(cell.commissionState);
    grid.appendChild(makeComparePanel('Blessed reference', placeholder));
    setCompareGridColumns(grid);

    container.appendChild(grid);
    appendCompareDescription(container, t);
    preview.appendChild(container);
    return;
  }

  if (compareMode === 'side-by-side' || (compareMode === 'onion-skin' && sizesDiffer(candidateImg, referenceImg))) {
    const delta = computeDelta(candidateImg, referenceImg, cell.comparisonPolicy?.channelTolerance ?? 0);

    const grid = document.createElement('div');
    grid.className = 'compare-grid';
    candidateImg.className = 'compare-img';
    grid.appendChild(makeComparePanel('Candidate', candidateImg));
    appendContextPanels(grid);
    const refClone = referenceImg.cloneNode(true) as HTMLImageElement;
    refClone.className = 'compare-img';
    grid.appendChild(makeComparePanel('Blessed reference', refClone));
    // ★ ONLY THE DELTA IS IMPOSSIBLE AT DIFFERENT SIZES — THE PICTURES ARE FINE. This used to replace the
    // WHOLE view with one line of text, so a scene that had been resized showed no image of any kind:
    // not the capture, not the blessed reference, not the authored context columns. The reviewer was
    // shown nothing at precisely the moment they most needed to look, and the remedy — re-commission from
    // the new size — is a judgement that needs the two pictures side by side to make.
    if (delta.dimMismatch) {
      const placeholder = document.createElement('div');
      placeholder.className = 'compare-placeholder';
      placeholder.textContent = `${delta.dimMismatch} — the pictures are shown at their own sizes; a per-pixel delta needs equal dimensions`;
      grid.appendChild(makeComparePanel('Delta', placeholder));
    } else {
      delta.canvas.className = 'compare-img';
      grid.appendChild(makeComparePanel('Delta', delta.canvas));
    }
    setCompareGridColumns(grid);

    container.appendChild(grid);

    const stats = document.createElement('div');
    stats.className = 'compare-stats';
    stats.textContent = comparisonStats(cell);
    container.appendChild(stats);
  } else if (compareMode === 'onion-skin') {
    // Sizes are known equal here: the branch above claims the mismatched case and falls back to the
    // side-by-side layout, because stacking two differently-sized images teaches a reviewer nothing.
    const onionWrap = document.createElement('div');
    onionWrap.className = 'onion-wrap';
    candidateImg.className = 'onion-layer onion-candidate';
    referenceImg.className = 'onion-layer onion-reference';
    referenceImg.style.opacity = String(onionOpacity);
    onionWrap.appendChild(candidateImg);
    onionWrap.appendChild(referenceImg);
    const grid = document.createElement('div');
    grid.className = 'compare-grid';
    grid.appendChild(makeComparePanel('Candidate / blessed reference', onionWrap));
    appendContextPanels(grid);
    setCompareGridColumns(grid);
    container.appendChild(grid);

    const controls = document.createElement('div');
    controls.className = 'onion-controls';
    const label = document.createElement('span');
    label.textContent = 'Reference opacity: ';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.01';
    slider.value = String(onionOpacity);
    slider.addEventListener('input', () => {
      onionOpacity = Number(slider.value);
      referenceImg.style.opacity = String(onionOpacity);
    });
    controls.appendChild(label);
    controls.appendChild(slider);
    container.appendChild(controls);

    const stats = document.createElement('div');
    stats.className = 'compare-stats';
    stats.textContent = comparisonStats(cell);
    container.appendChild(stats);
  }

  appendCompareDescription(container, t);
  preview.appendChild(container);
}

function updatePreview(): void {
  activeImgs.forEach((img) => img.remove());
  activeImgs = [];
  preview.querySelector('.error-overlay')?.remove();
  preview.querySelector('.empty-state')?.remove();
  preview.querySelector('.expected-description')?.remove();
  preview.querySelector('.commission-state')?.remove();
  preview.querySelector('.parity-state')?.remove();

  const t = currentTest();
  if (!t) {
    const el = document.createElement('div');
    el.className = 'empty-state';
    el.textContent =
      allTests.length === 0
        ? 'No captures yet — run npm run capture:functional to generate screenshots.'
        : 'No matches.';
    preview.appendChild(el);
    return;
  }

  activeImgs = ensureCached(t);
  activeImgs.forEach((img) => {
    img.className = 'preview-img';
    preview.appendChild(img);
  });

  const desc = document.createElement('div');
  desc.className = 'expected-description';
  if (t.expectedImageDescription) {
    desc.textContent = t.expectedImageDescription;
    // A withheld scene has no description ON PURPOSE. Falling through to the absent branch would tell the
    // reviewer to author work somebody deliberately declined, which is the same misdirection the stale
    // branch exists to prevent — so show the reason instead of asking for the thing.
  } else if (t.withheldReason !== undefined) {
    desc.textContent = `Description deliberately withheld — ${t.withheldReason}`;
    desc.classList.add('expected-description-withheld');
  } else if (t.sourceHasDescription) {
    desc.textContent = 'No description recorded in this capture — re-capture to populate.';
    desc.classList.add('expected-description-stale');
  } else {
    desc.textContent = 'This scene has no expectedImageDescription.';
    desc.classList.add('expected-description-absent');
  }
  preview.appendChild(desc);

  // Pre-warm neighboring tests
  const visible = visibleTests();
  const idx = visible.findIndex((v) => testKey(v) === testKey(t));
  for (const delta of [-1, 1]) {
    const neighbor = visible[idx + delta];
    if (neighbor) ensureCached(neighbor);
  }

  showRenderer();
}

function showCurrent(): void {
  buildSidebar();
  buildRendererBar();
  updatePreview();
}

function saveState(): void {
  const t = currentTest();
  if (!t) return;
  const renderer = selectedReviewableCell(t.cells, selectedRenderer)?.renderer ?? '';
  selectedRenderer = renderer;
  const path = `/${t.tool}/${t.name}/${renderer}`;
  sessionStorage.setItem(STORAGE_KEY, path);
  history.replaceState({}, '', `#${path}`);
}

function selectTest(t: ReviewTest): void {
  selectedKey = testKey(t);
  const selected = selectedReviewableCell(t.cells, selectedRenderer);
  const attentionCell = firstAttentionCell(t);
  if (attentionCell && selected?.commissionState !== attentionCell.commissionState) {
    selectedRenderer = attentionCell.renderer;
  } else if (selected?.renderer !== selectedRenderer) {
    selectedRenderer = selected?.renderer ?? '';
  }
  showCurrent();
  saveState();
}

function selectTestByDelta(delta: -1 | 1): void {
  const next = reviewItemByVisualDelta(visibleTests(), selectedKey, delta, REVIEW_ORDER_ACCESSORS);
  if (next) selectTest(next);
}

function cycleRenderer(delta: -1 | 1): void {
  const t = currentTest();
  if (!t) return;
  selectedRenderer = nextReviewableCell(t.cells, selectedRenderer, delta)?.renderer ?? selectedRenderer;
  buildRendererBar();
  showRenderer();
  saveState();
}

document.addEventListener('keydown', (e) => {
  if (promptOpen) return;
  if (e.target === filterInput) {
    if (e.key === 'Escape') {
      filterInput.value = '';
      filterQuery = '';
      showCurrent();
      filterInput.blur();
    }
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectTestByDelta(-1);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectTestByDelta(1);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    cycleRenderer(-1);
  } else if (e.key === 'ArrowRight' || e.key === ' ') {
    e.preventDefault();
    cycleRenderer(1);
  } else if (e.key === '/') {
    e.preventDefault();
    filterInput.focus();
    filterInput.select();
  } else if (e.key === 'v') {
    // View mode moved off `c` so that `c` can name the action a reviewer actually reaches for. The keys
    // now spell what they do: c commissions, h holds, a marks, v changes the view.
    e.preventDefault();
    const modes: CompareMode[] = ['off', 'side-by-side', 'onion-skin'];
    compareMode = modes[(modes.indexOf(compareMode) + 1) % modes.length];
    buildRendererBar();
    showRenderer();
  } else if (e.key === 'a') {
    e.preventDefault();
    approveCurrentCell();
  } else if (e.key === 'c') {
    e.preventDefault();
    void commissionCurrentTest();
  } else if (e.key === 'h') {
    e.preventDefault();
    void denyCurrentCell();
  }
});

function approveCurrentCell(): void {
  const t = currentTest();
  if (!t) return;
  const ci = currentCellIndex();
  const cell = t.cells[ci];
  if (!cell || !isReviewableCell(cell)) return;

  const commissionIneligibility = reviewCommissionIneligibility(cell);
  if (commissionIneligibility !== null) {
    showCommissionFeedback(
      `Cannot approve ${cell.renderer}: ${reviewCommissionIneligibilityMessage(commissionIneligibility)}`,
      true,
    );
    return;
  }
  const key = approvalKey(t, cell.renderer);
  const current = approvedCells.get(key);
  if (current === true) {
    approvedCells.delete(key);
  } else {
    approvedCells.set(key, true);
  }
  saveApprovals();
  buildRendererBar();
  showRenderer();
}

async function denyCurrentCell(): Promise<void> {
  const t = currentTest();
  if (!t) return;
  const ci = currentCellIndex();
  const cell = t.cells[ci];
  if (!cell || !isReviewableCell(cell)) return;

  approvedCells.delete(approvalKey(t, cell.renderer));
  saveApprovals();
  await holdRenderers([cell.renderer]);
}

function reconcileVisibleSelection(): void {
  const visible = visibleTests();
  if (!visible.some((t) => testKey(t) === selectedKey)) {
    const first = visible[0];
    if (first) {
      selectedKey = testKey(first);
      selectedRenderer = reviewableCells(first.cells)[0]?.renderer ?? '';
    } else {
      selectedKey = '';
      selectedRenderer = '';
    }
  }
  showCurrent();
}

filterInput.addEventListener('input', () => {
  filterQuery = filterInput.value;
  reconcileVisibleSelection();
});

includeSingleCellInput.addEventListener('change', () => {
  includeSingleCellScenes = includeSingleCellInput.checked;
  clearApprovals();
  reconcileVisibleSelection();
});

function stateFromPath(path: string): { key: string; renderer: string } | null {
  const parts = path.replace(/^#?\//, '').split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const [tool, name, renderer = ''] = parts;
  const key = `${tool}/${name}`;
  const test = allTests.find((candidate) => testKey(candidate) === key);
  if (!test) return null;
  return { key, renderer: selectedReviewableCell(test.cells, renderer)?.renderer ?? '' };
}

const hashState = stateFromPath(location.hash.slice(1));
const initState = hashState ?? stateFromPath(sessionStorage.getItem(STORAGE_KEY) ?? '');

// A direct link is an explicit opt-in: keep it addressable even when it names a scene excluded from the
// default queue. Merely restoring a prior session does not silently widen the next review pass.
if (hashState) {
  const linked = allTests.find((test) => testKey(test) === hashState.key);
  if (linked && reviewableCells(linked.cells).length < 2) {
    includeSingleCellScenes = true;
    includeSingleCellInput.checked = true;
  }
}

if (initState && visibleTests().some((test) => testKey(test) === initState.key)) {
  selectedKey = initState.key;
  selectedRenderer = initState.renderer;
} else {
  const first = visibleTests()[0];
  if (first) {
    selectedKey = testKey(first);
    selectedRenderer = reviewableCells(first.cells)[0]?.renderer ?? '';
  }
}

showCurrent();
if (!location.hash && allTests.length > 0) saveState();
