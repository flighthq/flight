// @ts-expect-error -- virtual module typed below
import { tests as _tests } from 'virtual:gallery-manifest';

interface GalleryCellProvenance {
  hostInstanceId: string | null;
  environmentId: string | null;
}

type CommissionState = 'included' | 'differs' | 'not-commissioned' | 'requested';

interface GalleryCell {
  renderer: string;
  state: 'ready' | 'error';
  error: string | null;
  changed: boolean | null;
  hash: string | null;
  provenance: GalleryCellProvenance | null;
  commissionState: CommissionState;
  holdReason: string | null;
}

interface GalleryTest {
  tool: string;
  name: string;
  cells: GalleryCell[];
  expectedImageDescription?: string;
  sourceHasDescription: boolean;
}

const STORAGE_KEY = 'gallery-selected';
const allTests = _tests as GalleryTest[];

let filterQuery = '';
let selectedKey = ''; // `${tool}/${name}`
let selectedRenderer = '';

const filterInput = document.getElementById('filter-input') as HTMLInputElement;
const testList = document.getElementById('test-list')!;
const rendererBar = document.getElementById('renderer-bar')!;
const preview = document.getElementById('preview')!;

// Images for the current test, in DOM and ready to blink between
let activeImgs: HTMLImageElement[] = [];

// Off-DOM image cache: key = `${tool}/${name}`, pre-loads neighboring tests
const imgCache = new Map<string, HTMLImageElement[]>();

function screenshotUrl(tool: string, name: string, renderer: string): string {
  return `/artifacts/${tool}/${name}/${renderer}/screenshot.png`;
}

function testKey(t: GalleryTest): string {
  return `${t.tool}/${t.name}`;
}

function visibleTests(): GalleryTest[] {
  const q = filterQuery.toLowerCase().trim();
  return q ? allTests.filter((t) => t.name.includes(q) || t.tool.includes(q)) : allTests;
}

function currentTest(): GalleryTest | null {
  return visibleTests().find((t) => testKey(t) === selectedKey) ?? visibleTests()[0] ?? null;
}

function currentCellIndex(): number {
  const t = currentTest();
  if (!t) return 0;
  const i = t.cells.findIndex((c) => c.renderer === selectedRenderer);
  return i >= 0 ? i : 0;
}

function testStatus(t: GalleryTest): 'error' | 'changed' | 'pass' {
  if (t.cells.some((c) => c.state === 'error')) return 'error';
  if (t.cells.some((c) => c.changed)) return 'changed';
  return 'pass';
}

function ensureCached(t: GalleryTest): HTMLImageElement[] {
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

    for (const t of visible.filter((v) => v.tool === tool)) {
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

  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sidebar-empty';
    empty.textContent = allTests.length === 0 ? 'No captures yet' : 'No matches';
    testList.appendChild(empty);
  }

  testList.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
}

async function holdCurrentTest(): Promise<void> {
  const t = currentTest();
  if (!t) return;

  const reason = prompt('Hold reason (mandatory — explain what is wrong with this render):');
  if (!reason || reason.trim().length === 0) return;

  try {
    const res = await fetch('/api/hold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: t.tool,
        entry: t.name,
        renderers: t.cells.map((c) => c.renderer),
        reason: reason.trim(),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      showCommissionFeedback(`Error: ${(err as { error: string }).error}`, true);
      return;
    }
    const result = (await res.json()) as { keys: string[]; path: string };
    showCommissionFeedback(`Held ${result.keys.length} cell(s) in ${result.path}`, false);
  } catch (e) {
    showCommissionFeedback(`Network error: ${e}`, true);
  }
}

async function commissionCurrentTest(): Promise<void> {
  const t = currentTest();
  if (!t) return;

  const cells = t.cells.map((c) => ({
    renderer: c.renderer,
    pixelSha256: c.hash,
    hostInstanceId: c.provenance?.hostInstanceId ?? null,
    environmentId: c.provenance?.environmentId ?? null,
  }));

  try {
    const res = await fetch('/api/commission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: t.tool,
        entry: t.name,
        cells,
        reason: 'Commissioned from gallery',
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      showCommissionFeedback(`Error: ${(err as { error: string }).error}`, true);
      return;
    }
    const result = (await res.json()) as { id: string; path: string };
    showCommissionFeedback(`Written: ${result.path}`, false);
  } catch (e) {
    showCommissionFeedback(`Network error: ${e}`, true);
  }
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

function commissionStateLabel(state: CommissionState): string {
  switch (state) {
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

function testCommissionSummary(t: GalleryTest): { state: CommissionState; canCommission: boolean } {
  const hasIncluded = t.cells.some((c) => c.commissionState === 'included');
  const hasDiffers = t.cells.some((c) => c.commissionState === 'differs');
  const hasRequested = t.cells.some((c) => c.commissionState === 'requested');

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
  t.cells.forEach((cell, i) => {
    const btn = document.createElement('button');
    btn.className = 'renderer-btn' + (i === ci ? ' selected' : '');
    if (cell.state === 'error') btn.setAttribute('data-status', 'error');
    else if (cell.changed) btn.setAttribute('data-status', 'changed');

    const label = commissionStateLabel(cell.commissionState);
    if (label) btn.setAttribute('data-commission', cell.commissionState);
    btn.textContent = cell.renderer;
    btn.addEventListener('click', () => {
      selectedRenderer = cell.renderer;
      buildRendererBar();
      showRenderer();
      saveState();
    });
    rendererBar.appendChild(btn);
  });

  const summary = testCommissionSummary(t);
  const isHeld = t.cells.some((c) => c.holdReason !== null);
  const commissionBtn = document.createElement('button');
  commissionBtn.className = 'commission-btn';

  if (isHeld) {
    commissionBtn.textContent = 'Held — cannot commission';
    commissionBtn.title = 'One or more cells are held — resolve the hold before commissioning';
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
  } else if (summary.state === 'differs') {
    commissionBtn.textContent = 'Commission (differs)';
    commissionBtn.title = 'This capture differs from the locked reference — commission to update';
    commissionBtn.addEventListener('click', () => void commissionCurrentTest());
  } else {
    commissionBtn.textContent = 'Commission';
    commissionBtn.title = 'Write a reference image request for all renderers of this scene';
    commissionBtn.addEventListener('click', () => void commissionCurrentTest());
  }

  rendererBar.appendChild(commissionBtn);

  const anyHeld = t.cells.some((c) => c.holdReason !== null);
  const holdBtn = document.createElement('button');
  holdBtn.className = 'hold-btn';
  if (anyHeld) {
    holdBtn.textContent = 'Held';
    holdBtn.title = 'One or more cells are held — see the status overlay for the reason';
    holdBtn.disabled = true;
    holdBtn.setAttribute('data-held', 'true');
  } else {
    holdBtn.textContent = 'Hold';
    holdBtn.title = 'Hold this render — marks all cells as not ready for commissioning (requires a reason)';
    holdBtn.addEventListener('click', () => void holdCurrentTest());
  }
  rendererBar.appendChild(holdBtn);
}

function commissionStateMessage(state: CommissionState): string {
  switch (state) {
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
    } else {
      stateEl.textContent = commissionStateMessage(cell.commissionState);
      stateEl.setAttribute('data-commission', cell.commissionState);
    }
  } else {
    stateEl?.remove();
  }
}

function updatePreview(): void {
  activeImgs.forEach((img) => img.remove());
  activeImgs = [];
  preview.querySelector('.error-overlay')?.remove();
  preview.querySelector('.empty-state')?.remove();
  preview.querySelector('.expected-description')?.remove();
  preview.querySelector('.commission-state')?.remove();

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
  const renderer = selectedRenderer || t.cells[currentCellIndex()]?.renderer || '';
  const path = `/${t.tool}/${t.name}/${renderer}`;
  sessionStorage.setItem(STORAGE_KEY, path);
  history.replaceState({}, '', `#${path}`);
}

function selectTest(t: GalleryTest): void {
  selectedKey = testKey(t);
  if (!t.cells.some((c) => c.renderer === selectedRenderer)) {
    selectedRenderer = t.cells[0]?.renderer ?? '';
  }
  showCurrent();
  saveState();
}

function selectTestByDelta(delta: -1 | 1): void {
  const visible = visibleTests();
  const i = visible.findIndex((t) => testKey(t) === selectedKey);
  const next = visible[i + delta];
  if (next) selectTest(next);
}

function cycleRenderer(delta: -1 | 1): void {
  const t = currentTest();
  if (!t) return;
  const ci = currentCellIndex();
  const ni = (ci + delta + t.cells.length) % t.cells.length;
  selectedRenderer = t.cells[ni]?.renderer ?? selectedRenderer;
  buildRendererBar();
  showRenderer();
  saveState();
}

document.addEventListener('keydown', (e) => {
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
  }
});

filterInput.addEventListener('input', () => {
  filterQuery = filterInput.value;
  const visible = visibleTests();
  if (!visible.some((t) => testKey(t) === selectedKey)) {
    const first = visible[0];
    if (first) {
      selectedKey = testKey(first);
      selectedRenderer = first.cells[0]?.renderer ?? '';
    }
  }
  showCurrent();
});

function stateFromPath(path: string): { key: string; renderer: string } | null {
  const parts = path.replace(/^#?\//, '').split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const [tool, name, renderer = ''] = parts;
  const key = `${tool}/${name}`;
  if (!allTests.some((t) => testKey(t) === key)) return null;
  return { key, renderer };
}

const initState = stateFromPath(location.hash.slice(1)) ?? stateFromPath(sessionStorage.getItem(STORAGE_KEY) ?? '');

if (initState) {
  selectedKey = initState.key;
  selectedRenderer = initState.renderer;
} else {
  const first = allTests[0];
  if (first) {
    selectedKey = testKey(first);
    selectedRenderer = first.cells[0]?.renderer ?? '';
  }
}

showCurrent();
if (!location.hash && allTests.length > 0) saveState();
