import { examples } from 'virtual:explorer-examples';

interface Entry {
  name: string;
  render: string;
}

const STORAGE_KEY = 'explorer-selected';

const entries: Entry[] = examples.flatMap((e) => e.renderers.map((r) => ({ name: e.name, render: r })));
let selectedIndex = 0;

const sidebar = document.getElementById('sidebar')!;
const preview = document.getElementById('preview') as HTMLIFrameElement;

function buildSidebar(): void {
  sidebar.innerHTML = '';
  let lastExample = '';

  entries.forEach((entry, i) => {
    if (entry.name !== lastExample) {
      lastExample = entry.name;
      const heading = document.createElement('div');
      heading.className = 'example-heading';
      heading.textContent = entry.name;
      heading.title = entry.name;
      sidebar.appendChild(heading);
    }

    const btn = document.createElement('button');
    btn.className = 'renderer-btn' + (i === selectedIndex ? ' selected' : '');
    btn.textContent = entry.render;
    btn.addEventListener('click', () => select(i));
    sidebar.appendChild(btn);
  });
}

function indexFromHash(hash: string): number {
  const colonIdx = hash.indexOf(':');
  if (colonIdx >= 0) {
    const name = hash.slice(0, colonIdx);
    const render = hash.slice(colonIdx + 1);
    return entries.findIndex((e) => e.name === name && e.render === render);
  }
  // Example name only — pick its first available renderer
  return entries.findIndex((e) => e.name === hash);
}

function showEntry(index: number): void {
  selectedIndex = index;
  buildSidebar();
  sidebar.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  const { name, render } = entries[index];
  sessionStorage.setItem(STORAGE_KEY, `${name}:${render}`);
  preview.src = `${import.meta.env.BASE_URL}examples/${name}/${render}/`;
}

function select(index: number): void {
  showEntry(index);
  const { name, render } = entries[index];
  location.hash = `${name}:${render}`;
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
  history.replaceState(null, '', `#${entries[initIndex].name}:${entries[initIndex].render}`);
}
