import { tests } from 'virtual:functional-test-list';

interface Entry {
  name: string;
  render: string;
}

const entries: Entry[] = tests.flatMap((t) => t.renderers.map((r) => ({ name: t.name, render: r })));

const STORAGE_KEY = 'functional-tests-selected-index';
let selectedIndex = 0;

const sidebar = document.getElementById('sidebar')!;
let preview = document.getElementById('preview') as HTMLIFrameElement;

function buildSidebar(): void {
  sidebar.innerHTML = '';
  let lastTest = '';

  entries.forEach((entry, i) => {
    if (entry.name !== lastTest) {
      lastTest = entry.name;
      const heading = document.createElement('div');
      heading.className = 'test-heading';
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
  navigateTo(`/tests/${name}/${render}/`);
}

function navigateTo(url: string): void {
  try {
    const oldDoc = preview.contentDocument;
    if (oldDoc) {
      oldDoc.querySelectorAll('canvas').forEach((el) => {
        const c = el as HTMLCanvasElement;
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        if (gl) {
          const ext = (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context');
          if (ext) ext.loseContext();
        }
        c.width = 0;
        c.height = 0;
      });
    }
  } catch (_) {} // eslint-disable-line

  const wrap = preview.parentElement!;
  const newFrame = document.createElement('iframe');
  newFrame.id = 'preview';
  wrap.replaceChild(newFrame, preview);
  preview = newFrame;
  newFrame.src = url;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    const next = selectedIndex + (e.key === 'ArrowDown' ? 1 : -1);
    select(Math.max(0, Math.min(entries.length - 1, next)));
  } else if (e.key === 'r' || e.key === 'R') {
    if (!e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      reload();
    }
  }
});

function reload(): void {
  const { name, render } = entries[selectedIndex];
  navigateTo(`/tests/${name}/${render}/`);
}

const saved = parseInt(sessionStorage.getItem(STORAGE_KEY) ?? '0', 10);
buildSidebar();
select(isNaN(saved) || saved >= entries.length ? 0 : saved);
