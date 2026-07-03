import { examples } from 'virtual:examples-examples';

type Implementation = 'typescript' | 'rust-wasm';
type Renderer = 'dom' | 'canvas' | 'webgl' | 'webgpu';

const ALL_IMPLEMENTATIONS: Implementation[] = ['typescript', 'rust-wasm'];
const ALL_RENDERERS: Renderer[] = ['dom', 'canvas', 'webgl', 'webgpu'];
const STORAGE_KEY = 'examples-selected';
const FADE_MS = 250;

let exampleIndex = 0;
let implementation: Implementation = 'typescript';
let renderer: Renderer = 'canvas';

const sidebar = document.getElementById('sidebar')!;
const implementationBar = document.getElementById('implementation-bar')!;
const rendererBar = document.getElementById('renderer-bar')!;
const previewWrap = document.getElementById('preview-wrap')!;

let activeFrame: HTMLIFrameElement | null = null;
let pendingFrame: HTMLIFrameElement | null = null;

function currentExample() {
  return examples[exampleIndex];
}

function hasRenderer(r: Renderer): boolean {
  if (implementation === 'rust-wasm') return r === 'canvas' && currentExample().renderers.includes('wasm');
  return (currentExample().renderers as string[]).includes(r);
}

function hasImplementation(value: Implementation): boolean {
  return value === 'typescript'
    ? currentExample().renderers.some((value) => value !== 'wasm')
    : currentExample().renderers.includes('wasm');
}

function availableRenderers(): Renderer[] {
  return ALL_RENDERERS.filter((r) => hasRenderer(r));
}

function resolveRenderer(preferred: Renderer): Renderer {
  if (hasRenderer(preferred)) return preferred;
  return availableRenderers()[0] ?? 'canvas';
}

function resolveImplementation(preferred: Implementation): Implementation {
  return hasImplementation(preferred) ? preferred : 'typescript';
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

function buildImplementationBar(): void {
  implementationBar.innerHTML = '';
  ALL_IMPLEMENTATIONS.forEach((value) => {
    const available = hasImplementation(value);
    const btn = document.createElement('button');
    btn.className =
      'implementation-btn' + (value === implementation ? ' selected' : '') + (available ? '' : ' unavailable');
    btn.textContent = value === 'rust-wasm' ? 'rust/wasm' : value;
    btn.disabled = !available;
    if (available) btn.addEventListener('click', () => selectImplementation(value));
    implementationBar.appendChild(btn);
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
      implementation,
      renderer,
    },
    '',
    `#${hashForCurrent()}`,
  );
}

function hashForCurrent(): string {
  return `/${currentExample().name}/${implementation}/${renderer}/`;
}

function showCurrent(): void {
  buildSidebar();
  buildImplementationBar();
  buildRendererBar();
  sessionStorage.setItem(STORAGE_KEY, hashForCurrent());
  const route = implementation === 'rust-wasm' ? 'wasm' : renderer;
  navigateTo(`${import.meta.env.BASE_URL}examples/${currentExample().name}/${route}/`);
}

function selectExample(i: number): void {
  exampleIndex = Math.max(0, Math.min(examples.length - 1, i));
  implementation = resolveImplementation(implementation);
  renderer = resolveRenderer(renderer);
  showCurrent();
  updateUrl();
}

function selectImplementation(value: Implementation): void {
  if (!hasImplementation(value)) return;
  implementation = value;
  renderer = resolveRenderer(renderer);
  showCurrent();
  updateUrl();
}

function selectRenderer(r: Renderer): void {
  if (!hasRenderer(r)) return;
  renderer = r;
  showCurrent();
  updateUrl();
}

function stateFromHash(hash: string): {
  exampleIndex: number;
  implementation: Implementation;
  renderer: Renderer;
} | null {
  const parts = hash.replace(/^\//, '').split('/');

  const name = parts[0];
  const implementationPart = parts[1] as Implementation | undefined;
  const rendererPart = parts[2] as Renderer | undefined;

  if (!name) return null;

  const i = examples.findIndex((e) => e.name === name);
  if (i < 0) return null;

  const ex = examples[i];
  const legacyRenderer = parts[1] as Renderer | undefined;
  const resolvedImplementation: Implementation =
    (implementationPart === 'rust-wasm' || parts[1] === 'wasm') && ex.renderers.includes('wasm')
      ? 'rust-wasm'
      : 'typescript';
  const candidates =
    resolvedImplementation === 'rust-wasm'
      ? (['canvas'] as Renderer[])
      : ALL_RENDERERS.filter((value) => ex.renderers.includes(value));
  const requestedRenderer = rendererPart ?? legacyRenderer;
  const resolvedRenderer =
    requestedRenderer && candidates.includes(requestedRenderer) ? requestedRenderer : (candidates[0] ?? 'canvas');

  return { exampleIndex: i, implementation: resolvedImplementation, renderer: resolvedRenderer };
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
      implementation = resolveImplementation(implementation);
      renderer = resolveRenderer(renderer);
      showCurrent();
      updateUrl();
    }
  }
});

window.addEventListener('hashchange', () => {
  const state = stateFromHash(location.hash.slice(1));
  if (!state) return;
  if (state.exampleIndex === exampleIndex && state.implementation === implementation && state.renderer === renderer)
    return;
  exampleIndex = state.exampleIndex;
  implementation = state.implementation;
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
  return { exampleIndex: 0, implementation: 'typescript' as Implementation, renderer: 'canvas' as Renderer };
})();

exampleIndex = initState.exampleIndex;
implementation = initState.implementation;
renderer = initState.renderer;
showCurrent();

if (!location.hash && examples.length > 0) {
  history.replaceState(null, '', `#${hashForCurrent()}`);
}
