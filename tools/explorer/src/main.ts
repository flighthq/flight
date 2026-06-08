import { examples } from 'virtual:explorer-examples';

interface Entry {
  name: string;
  render: string;
}

const STORAGE_KEY = 'explorer-selected';

const entries: Entry[] = examples.flatMap((e) => e.renderers.map((r) => ({ name: e.name, render: r })));
let selectedIndex = 0;

const sidebar = document.getElementById('sidebar')!;
let preview = document.getElementById('preview') as HTMLIFrameElement;

function buildSidebar(): void {
  sidebar.innerHTML = '';
  let lastExample = '';

  entries.forEach((entry, i) => {
    if (entry.name !== lastExample) {
      lastExample = entry.name;
      const heading = document.createElement('div');
      heading.className = 'example-heading';
      heading.title = entry.name;
      heading.textContent = entry.name;
      sidebar.appendChild(heading);
    }

    const btn = document.createElement('button');
    btn.className = 'renderer-btn' + (i === selectedIndex ? ' selected' : '');
    btn.textContent = entry.render;
    btn.addEventListener('click', () => select(i));
    sidebar.appendChild(btn);
  });
}

// Parses #/explorer/name or #/explorer/name/render (hash value after stripping '#')
function indexFromHash(hash: string): number {
  const parts = hash.replace(/^\//, '').split('/');
  if (parts[0] !== 'explorer' || !parts[1]) return -1;
  const name = parts[1];
  const render = parts[2];
  if (render) {
    return entries.findIndex((e) => e.name === name && e.render === render);
  }
  return entries.findIndex((e) => e.name === name);
}

function hashForEntry(name: string, render: string): string {
  return `/explorer/${name}/${render}`;
}

function navigateTo(url: string): void {
  try {
    const doc = preview.contentDocument;
    if (doc) {
      doc.querySelectorAll('canvas').forEach((c) => {
        const gl = c.getContext('webgl2') ?? c.getContext('webgl');
        if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
        c.width = 0;
        c.height = 0;
      });
    }
  } catch (_) {} // eslint-disable-line

  const wrap = preview.parentElement!;
  const next = document.createElement('iframe');
  next.id = 'preview';
  wrap.replaceChild(next, preview);
  preview = next;
  next.src = url;
}

function showEntry(index: number): void {
  selectedIndex = index;
  buildSidebar();
  sidebar.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  const { name, render } = entries[index];
  sessionStorage.setItem(STORAGE_KEY, hashForEntry(name, render));
  navigateTo(`${import.meta.env.BASE_URL}examples/${name}/${render}/`);
}

function select(index: number): void {
  showEntry(index);
  const { name, render } = entries[index];
  location.hash = hashForEntry(name, render);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    const next = selectedIndex + (e.key === 'ArrowDown' ? 1 : -1);
    select(Math.max(0, Math.min(entries.length - 1, next)));
  }
});

window.addEventListener('hashchange', () => {
  const index = indexFromHash(location.hash.slice(1));
  if (index >= 0 && index !== selectedIndex) showEntry(index);
});

// Priority: URL hash > sessionStorage (survives HMR soft-reloads) > first entry
const initHash = location.hash.slice(1);
const initIndex = (() => {
  if (initHash) {
    const i = indexFromHash(initHash);
    if (i >= 0) return i;
  }
  const saved = sessionStorage.getItem(STORAGE_KEY);
  if (saved) {
    const i = indexFromHash(saved);
    if (i >= 0) return i;
  }
  return 0;
})();

showEntry(initIndex);
if (!initHash && entries.length > 0) {
  history.replaceState(null, '', `#${hashForEntry(entries[initIndex].name, entries[initIndex].render)}`);
}
