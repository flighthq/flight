import { examples } from 'virtual:explorer-examples';

type Renderer = 'dom' | 'canvas' | 'webgl' | 'webgpu';

const ALL_RENDERERS: Renderer[] = ['dom', 'canvas', 'webgl', 'webgpu'];
const STORAGE_KEY = 'explorer-selected';
const FADE_MS = 250;

let exampleIndex = 0;
let renderer: Renderer = 'canvas';

const sidebar = document.getElementById('sidebar')!;
const rendererBar = document.getElementById('renderer-bar')!;
const previewWrap = document.getElementById('preview-wrap')!;

let activeFrame: HTMLIFrameElement | null = null;
let pendingFrame: HTMLIFrameElement | null = null;

function currentExample() {
  return examples[exampleIndex];
}

function hasRenderer(r: Renderer): boolean {
  return (currentExample().renderers as string[]).includes(r);
}

function availableRenderers(): Renderer[] {
  return ALL_RENDERERS.filter((r) => hasRenderer(r));
}

function resolveRenderer(preferred: Renderer): Renderer {
  if (hasRenderer(preferred)) return preferred;
  return currentExample().renderers[0] as Renderer;
}

function buildSidebar(): void {
  sidebar.innerHTML = '';
  examples.forEach((e, i) => {
    const btn = document.createElement('button');
    btn.className = 'example-btn' + (i === exampleIndex ? ' selected' : '');
    btn.textContent = e.name;
    btn.title = e.name;
    btn.addEventListener('click', () => selectExample(i));
    sidebar.appendChild(btn);
  });
  sidebar.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
}

function buildRendererBar(): void {
  rendererBar.innerHTML = '';
  ALL_RENDERERS.forEach((r) => {
    const available = hasRenderer(r);
    const btn = document.createElement('button');
    btn.className = 'renderer-btn' + (r === renderer ? ' selected' : '') + (available ? '' : ' unavailable');
    btn.textContent = r;
    btn.disabled = !available;
    if (available) btn.addEventListener('click', () => selectRenderer(r));
    rendererBar.appendChild(btn);
  });
}

function navigateTo(url: string): void {
  // Abandon any in-flight pending frame.
  if (pendingFrame) {
    pendingFrame.src = 'about:blank';
    pendingFrame.remove();
    pendingFrame = null;
  }

  // Capture the frame we're replacing. Do NOT touch it yet — the old frame
  // stays fully alive and rendering throughout the crossfade so there is
  // nothing to blink. We clean it up only after the new frame is visible.
  const prev = activeFrame;

  const next = document.createElement('iframe');
  next.className = 'preview-frame';
  next.style.opacity = '0';
  pendingFrame = next;

  next.addEventListener(
    'load',
    () => {
      if (next !== pendingFrame) return; // Superseded by a later navigation.

      // Wait for the child frame's first requestAnimationFrame tick. By that
      // point the example's own RAF callback has run and the canvas has
      // content, so the fade-in reveals a live frame rather than a blank page.
      const reveal = () => {
        if (next !== pendingFrame) return;
        pendingFrame = null;
        next.style.opacity = '1';
        activeFrame = next;
        if (prev) {
          setTimeout(() => {
            // New frame is fully visible — safe to destroy the old one now.
            try {
              prev.contentDocument?.querySelectorAll('canvas').forEach((c) => {
                const gl = c.getContext('webgl2') ?? c.getContext('webgl');
                if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
                c.width = 0;
                c.height = 0;
              });
            } catch (_) {} // eslint-disable-line
            prev.src = 'about:blank';
            prev.remove();
          }, FADE_MS + 50);
        }
      };

      const cw = next.contentWindow;
      if (cw) {
        cw.requestAnimationFrame(reveal);
      } else {
        reveal();
      }
    },
    { once: true },
  );

  previewWrap.appendChild(next);
  next.src = url;
}

function updateUrl(): void {
  history.replaceState(
    {
      exampleIndex,
      renderer,
    },
    '',
    `#${hashForCurrent()}`,
  );
}

function hashForCurrent(): string {
  return `/${currentExample().name}/${renderer}/`;
}

function showCurrent(): void {
  buildSidebar();
  buildRendererBar();
  sessionStorage.setItem(STORAGE_KEY, hashForCurrent());
  navigateTo(`${import.meta.env.BASE_URL}examples/${currentExample().name}/${renderer}/`);
}

function selectExample(i: number): void {
  exampleIndex = Math.max(0, Math.min(examples.length - 1, i));
  renderer = resolveRenderer(renderer);
  showCurrent();
  updateUrl();
}

function selectRenderer(r: Renderer): void {
  if (!hasRenderer(r)) return;
  renderer = r;
  buildRendererBar();
  sessionStorage.setItem(STORAGE_KEY, hashForCurrent());
  updateUrl();
  navigateTo(`${import.meta.env.BASE_URL}examples/${currentExample().name}/${renderer}/`);
}

function stateFromHash(hash: string): {
  exampleIndex: number;
  renderer: Renderer;
} | null {
  const parts = hash.replace(/^\//, '').split('/');

  const name = parts[0];
  const r = parts[1] as Renderer | undefined;

  if (!name) return null;

  const i = examples.findIndex((e) => e.name === name);
  if (i < 0) return null;

  const ex = examples[i];
  const resolved = r && (ex.renderers as string[]).includes(r) ? r : (ex.renderers[0] as Renderer);

  return { exampleIndex: i, renderer: resolved };
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectExample(exampleIndex - 1);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectExample(exampleIndex + 1);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    const av = availableRenderers();
    const i = av.indexOf(renderer);
    if (i > 0) selectRenderer(av[i - 1]);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    const av = availableRenderers();
    const i = av.indexOf(renderer);
    if (i < av.length - 1) selectRenderer(av[i + 1]);
  } else if (e.key === ' ') {
    e.preventDefault();
    const av = availableRenderers();
    const i = av.indexOf(renderer);
    if (i < av.length - 1) {
      selectRenderer(av[i + 1]);
    } else {
      // Last renderer of this example — advance to next example (wrap around).
      exampleIndex = (exampleIndex + 1) % examples.length;
      renderer = currentExample().renderers[0] as Renderer;
      showCurrent();
      updateUrl();
    }
  }
});

window.addEventListener('hashchange', () => {
  const state = stateFromHash(location.hash.slice(1));
  if (!state) return;
  if (state.exampleIndex === exampleIndex && state.renderer === renderer) return;
  exampleIndex = state.exampleIndex;
  renderer = state.renderer;
  showCurrent();
});

// Priority: URL hash > sessionStorage > first entry
const initState = (() => {
  const fromHash = stateFromHash(location.hash.slice(1));
  if (fromHash) return fromHash;
  const saved = sessionStorage.getItem(STORAGE_KEY);
  if (saved) {
    const fromSaved = stateFromHash(saved);
    if (fromSaved) return fromSaved;
  }
  return { exampleIndex: 0, renderer: (examples[0]?.renderers[0] as Renderer) ?? 'canvas' };
})();

exampleIndex = initState.exampleIndex;
renderer = initState.renderer;
showCurrent();

if (!location.hash && examples.length > 0) {
  history.replaceState(null, '', `#${hashForCurrent()}`);
}
