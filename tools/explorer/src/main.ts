import { examples } from 'virtual:explorer-examples';

interface Entry {
  name: string;
  render: string;
}

// Flat list of all navigable items
const entries: Entry[] = examples.flatMap((e) => e.renderers.map((r) => ({ name: e.name, render: r })));

const STORAGE_KEY = 'explorer-selected-index';
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

function select(index: number): void {
  selectedIndex = index;
  sessionStorage.setItem(STORAGE_KEY, String(index));
  buildSidebar();
  sidebar.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  const { name, render } = entries[index];
  preview.src = `${import.meta.env.BASE_URL}examples/${name}/${render}/`;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    const next = selectedIndex + (e.key === 'ArrowDown' ? 1 : -1);
    select(Math.max(0, Math.min(entries.length - 1, next)));
  }
});

const saved = parseInt(sessionStorage.getItem(STORAGE_KEY) ?? '0', 10);
buildSidebar();
select(isNaN(saved) || saved >= entries.length ? 0 : saved);
