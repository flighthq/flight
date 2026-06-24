import type { ImageResource, ResourceLoadReport } from '@flighthq/sdk';
import {
  cancelResourceLoad,
  connectSignal,
  createResourceLoader,
  enableResourceLoaderItemSignals,
  getResourceLoadProgress,
  loadImageResourceFromUrl,
  pauseResourceLoad,
  queueResourceLoad,
  resetResourceLoader,
  resumeResourceLoad,
  startResourceLoad,
} from '@flighthq/sdk';

// Asset list. Each entry has a display name and a URL.
// Weights model relative file size so the progress bar reflects bytes-on-wire rather than
// treating a 4 KB thumbnail and a 400 KB spritesheet as equivalent.
const ASSETS: Array<{ name: string; url: string; weight: number; retries?: number }> = [
  { name: 'wabbit_alpha.png', url: 'assets/wabbit_alpha.png', weight: 10 },
  { name: 'tileset.png', url: 'assets/tileset.png', weight: 60 },
  { name: 'nyancat.png', url: 'assets/nyancat.png', weight: 30, retries: 2 },
];

// DOM refs
const statusEl = document.getElementById('status')!;
const progressBar = document.getElementById('progress-bar')!;
const itemsEl = document.getElementById('items')!;
const imagesEl = document.getElementById('images')!;
const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
const btnPause = document.getElementById('btn-pause') as HTMLButtonElement;
const btnResume = document.getElementById('btn-resume') as HTMLButtonElement;
const btnCancel = document.getElementById('btn-cancel') as HTMLButtonElement;
const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;

// Item row state
const itemDots = new Map<string, HTMLElement>();
const itemDetails = new Map<string, HTMLElement>();

function buildItemRows(): void {
  itemsEl.innerHTML = '';
  itemDots.clear();
  itemDetails.clear();
  for (const asset of ASSETS) {
    const row = document.createElement('div');
    row.className = 'item';

    const dot = document.createElement('div');
    dot.className = 'item-dot';

    const name = document.createElement('span');
    name.className = 'item-name';
    name.textContent = asset.name;

    const detail = document.createElement('span');
    detail.className = 'item-detail';
    detail.textContent = 'pending';

    row.appendChild(dot);
    row.appendChild(name);
    row.appendChild(detail);
    itemsEl.appendChild(row);

    itemDots.set(asset.name, dot);
    itemDetails.set(asset.name, detail);
  }
}

function setItemState(key: string, state: string, detail: string): void {
  const dot = itemDots.get(key);
  const detailEl = itemDetails.get(key);
  if (dot) {
    dot.className = `item-dot ${state}`;
  }
  if (detailEl) {
    detailEl.textContent = detail;
  }
}

function setProgress(ratio: number): void {
  progressBar.style.width = `${Math.round(ratio * 100)}%`;
}

function setStatus(text: string): void {
  statusEl.textContent = text;
}

// Loader setup
// maxConcurrent: 2 — demonstrates bounded concurrency: only 2 images fetch at a time
// retries: 1 — all items retry once on transient failure (individual items may override)
// errorPolicy: 'continue' — a single failed item does not abort the batch
const loader = createResourceLoader({
  errorPolicy: 'continue',
  maxConcurrent: 2,
  retries: 1,
  retryBackoff: 'exponential',
  retryBaseDelayMs: 200,
});

// Opt into per-item lifecycle signals for fine-grained UI updates
const itemSignals = enableResourceLoaderItemSignals(loader);

// Aggregate progress signal: re-reads the pull-style accessor for weight-aware ratio
connectSignal(loader.onProgress, () => {
  const progress = getResourceLoadProgress(loader);
  setProgress(progress);
  setStatus(`Loading… ${Math.round(progress * 100)}%`);
});

// Per-item signals
connectSignal(itemSignals.onItemStart, (key) => {
  setItemState(key, 'running', 'loading…');
});

connectSignal(itemSignals.onItemRetry, (key, attempt, delayMs) => {
  setItemState(key, 'running', `retry ${attempt} (${delayMs}ms)`);
});

connectSignal(itemSignals.onItemError, (key, _error, attempt) => {
  setItemState(key, 'failed', `failed after ${attempt} attempt${attempt !== 1 ? 's' : ''}`);
});

connectSignal(itemSignals.onItemComplete, (key, _value) => {
  setItemState(key, 'loaded', 'loaded');
});

// Aggregate signals
connectSignal(loader.onPause, () => {
  setStatus('Paused.');
  btnPause.disabled = true;
  btnResume.disabled = false;
});

connectSignal(loader.onResume, () => {
  btnPause.disabled = false;
  btnResume.disabled = true;
});

connectSignal(loader.onCancel, () => {
  setStatus('Cancelled.');
  btnPause.disabled = true;
  btnResume.disabled = true;
  btnCancel.disabled = true;
  btnReset.disabled = false;
  btnStart.disabled = false;
});

connectSignal(loader.onError, (_error, key) => {
  setItemState(key, 'failed', 'failed');
});

connectSignal(loader.onComplete, (reports: readonly ResourceLoadReport[]) => {
  const loaded = reports.filter((r) => r.status === 'loaded').length;
  const failed = reports.filter((r) => r.status === 'failed').length;
  const cancelled = reports.filter((r) => r.status === 'cancelled').length;

  const parts: string[] = [`${loaded} loaded`];
  if (failed > 0) parts.push(`${failed} failed`);
  if (cancelled > 0) parts.push(`${cancelled} cancelled`);
  setStatus(`Done: ${parts.join(', ')}.`);
  setProgress(1);

  btnPause.disabled = true;
  btnResume.disabled = true;
  btnCancel.disabled = true;
  btnReset.disabled = false;
  btnStart.disabled = false;
});

// Image handles for display once loaded
const imageHandles = new Map<string, Promise<ImageResource>>();

function queueAssets(): void {
  imageHandles.clear();
  for (const asset of ASSETS) {
    const handle = queueResourceLoad(loader, {
      group: 'images',
      key: asset.name,
      // Thread the AbortSignal into loadImageResourceFromUrl so cancellation and
      // timeout abort the in-flight fetch, not just the loader's promise wrapper.
      load: (signal) => loadImageResourceFromUrl(asset.url, undefined, signal),
      retries: asset.retries,
      weight: asset.weight,
    });
    imageHandles.set(asset.name, handle.promise as Promise<ImageResource>);
  }
}

async function displayImages(): Promise<void> {
  imagesEl.innerHTML = '';
  for (const asset of ASSETS) {
    const promise = imageHandles.get(asset.name);
    if (promise === undefined) continue;
    try {
      const resource = await promise;
      const img = document.createElement('img');
      // Draw the ImageResource into a canvas to get a data URL for display
      const canvas = document.createElement('canvas');
      canvas.width = resource.width;
      canvas.height = resource.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(resource.source as CanvasImageSource, 0, 0);
      img.src = canvas.toDataURL();
      img.alt = asset.name;
      img.title = asset.name;
      imagesEl.appendChild(img);
    } catch {
      // Item failed or was cancelled — skip display
    }
  }
}

// Controls
btnStart.addEventListener('click', () => {
  buildItemRows();
  imagesEl.innerHTML = '';
  setProgress(0);
  setStatus('Loading…');
  queueAssets();

  btnStart.disabled = true;
  btnPause.disabled = false;
  btnCancel.disabled = false;
  btnReset.disabled = true;

  startResourceLoad(loader);

  // Display images as they finish
  void displayImages();
});

btnPause.addEventListener('click', () => {
  pauseResourceLoad(loader);
});

btnResume.addEventListener('click', () => {
  resumeResourceLoad(loader);
});

btnCancel.addEventListener('click', () => {
  cancelResourceLoad(loader);
  for (const asset of ASSETS) {
    const dot = itemDots.get(asset.name);
    if (dot && (dot.className.includes('pending') || dot.className.includes('running'))) {
      setItemState(asset.name, 'cancelled', 'cancelled');
    }
  }
});

btnReset.addEventListener('click', () => {
  resetResourceLoader(loader);
  buildItemRows();
  imagesEl.innerHTML = '';
  setProgress(0);
  setStatus('Ready. Press Start to begin loading.');
  btnStart.disabled = false;
  btnPause.disabled = true;
  btnResume.disabled = true;
  btnCancel.disabled = true;
  btnReset.disabled = true;
});

// Initialize UI
buildItemRows();
