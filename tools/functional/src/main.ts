import { tests } from 'virtual:functional-test-list';

const STORAGE_KEY = 'functional-selected';
const FADE_MS = 250;

let testIndex = 0;
let renderer = '';

const sidebar = document.getElementById('sidebar')!;
const rendererBar = document.getElementById('renderer-bar')!;
const previewWrap = document.getElementById('preview-wrap')!;

let activeFrame: HTMLIFrameElement | null = null;
let pendingFrame: HTMLIFrameElement | null = null;

function currentTest() {
  return tests[testIndex];
}

function availableRenderers(): string[] {
  return currentTest().renderers;
}

function resolveRenderer(preferred: string): string {
  const av = availableRenderers();
  return av.includes(preferred) ? preferred : (av[0] ?? '');
}

function buildSidebar(): void {
  sidebar.innerHTML = '';
  tests.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.className = 'example-btn' + (i === testIndex ? ' selected' : '');
    btn.textContent = t.name;
    btn.title = t.name;
    btn.addEventListener('click', () => selectTest(i));
    sidebar.appendChild(btn);
  });
  sidebar.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
}

function buildRendererBar(): void {
  rendererBar.innerHTML = '';
  availableRenderers().forEach((r) => {
    const btn = document.createElement('button');
    btn.className = 'renderer-btn' + (r === renderer ? ' selected' : '');
    btn.textContent = r;
    btn.addEventListener('click', () => selectRenderer(r));
    rendererBar.appendChild(btn);
  });
}

function navigateTo(url: string): void {
  const target = new URL(url, location.href).href;
  if (activeFrame && activeFrame.src === target) return;

  if (pendingFrame) {
    pendingFrame.src = 'about:blank';
    pendingFrame.remove();
    pendingFrame = null;
  }

  const prev = activeFrame;

  const next = document.createElement('iframe');
  next.className = 'preview-frame';
  next.style.opacity = '0';
  pendingFrame = next;

  next.addEventListener(
    'load',
    () => {
      if (next !== pendingFrame) return;

      const reveal = () => {
        if (next !== pendingFrame) return;
        pendingFrame = null;
        next.style.opacity = '1';
        activeFrame = next;
        if (prev) {
          setTimeout(() => {
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

function hashForCurrent(): string {
  return `/functional/${currentTest().name}/${renderer}`;
}

function showCurrent(): void {
  buildSidebar();
  buildRendererBar();
  sessionStorage.setItem(STORAGE_KEY, hashForCurrent());
  navigateTo(`/tests/${currentTest().name}/${renderer}/`);
}

function selectTest(i: number): void {
  testIndex = Math.max(0, Math.min(tests.length - 1, i));
  renderer = resolveRenderer(renderer);
  showCurrent();
  location.hash = hashForCurrent();
}

function selectRenderer(r: string): void {
  if (!availableRenderers().includes(r)) return;
  renderer = r;
  buildRendererBar();
  sessionStorage.setItem(STORAGE_KEY, hashForCurrent());
  location.hash = hashForCurrent();
  navigateTo(`/tests/${currentTest().name}/${renderer}/`);
}

function stateFromHash(hash: string): { testIndex: number; renderer: string } | null {
  const parts = hash.replace(/^\//, '').split('/');
  if (parts[0] !== 'functional' || !parts[1]) return null;
  const name = parts[1];
  const r = parts[2] ?? '';
  const i = tests.findIndex((t) => t.name === name);
  if (i < 0) return null;
  const t = tests[i];
  const resolved = r && t.renderers.includes(r) ? r : (t.renderers[0] ?? '');
  return { testIndex: i, renderer: resolved };
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectTest(testIndex - 1);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectTest(testIndex + 1);
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
      testIndex = (testIndex + 1) % tests.length;
      renderer = currentTest().renderers[0] ?? '';
      showCurrent();
      location.hash = hashForCurrent();
    }
  }
});

window.addEventListener('hashchange', () => {
  const state = stateFromHash(location.hash.slice(1));
  if (!state) return;
  if (state.testIndex === testIndex && state.renderer === renderer) return;
  testIndex = state.testIndex;
  renderer = state.renderer;
  showCurrent();
});

const initState = (() => {
  const fromHash = stateFromHash(location.hash.slice(1));
  if (fromHash) return fromHash;
  const saved = sessionStorage.getItem(STORAGE_KEY);
  if (saved) {
    const fromSaved = stateFromHash(saved);
    if (fromSaved) return fromSaved;
  }
  return { testIndex: 0, renderer: tests[0]?.renderers[0] ?? '' };
})();

testIndex = initState.testIndex;
renderer = initState.renderer;

// Adopt any iframe already in the DOM from a previous HMR cycle so navigateTo can
// detect the URL match and skip an unnecessary reload.
const _hmrFrame = previewWrap.querySelector<HTMLIFrameElement>('.preview-frame');
if (_hmrFrame) activeFrame = _hmrFrame;

showCurrent();

if (!location.hash && tests.length > 0) {
  history.replaceState(null, '', `#${hashForCurrent()}`);
}
