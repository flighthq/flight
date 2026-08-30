import type { ApplicationWindow, WindowBounds } from '@flighthq/types';

export function renderHostWebWindowCard(
  applicationWindow: Readonly<ApplicationWindow>,
  bounds: Readonly<WindowBounds>,
  opened: boolean,
): HTMLElement {
  document.body.style.margin = '0';
  document.body.style.minHeight = '100vh';
  document.body.style.background = 'linear-gradient(145deg, #11251f, #196457)';
  document.body.style.color = '#f5fffb';
  document.body.style.fontFamily = 'system-ui, sans-serif';
  document.body.style.display = 'grid';
  document.body.style.placeItems = 'center';

  const card = document.createElement('main');
  card.style.width = 'min(520px, calc(100vw - 64px))';
  card.style.boxSizing = 'border-box';
  card.style.padding = '42px';
  card.style.border = '1px solid rgba(143, 255, 218, 0.55)';
  card.style.borderRadius = '24px';
  card.style.background = 'rgba(6, 40, 34, 0.86)';
  card.style.boxShadow = '0 28px 80px rgba(0, 0, 0, 0.38)';

  const status = document.createElement('p');
  status.textContent = opened ? 'DIRECT WINDOW ATTACHED' : 'DIRECT WINDOW UNAVAILABLE';
  status.style.margin = '0 0 16px';
  status.style.color = opened ? '#8fffd4' : '#ffb4a2';
  status.style.fontSize = '13px';
  status.style.fontWeight = '750';
  status.style.letterSpacing = '0.16em';

  const title = document.createElement('h1');
  title.textContent = applicationWindow.title;
  title.style.margin = '0 0 12px';
  title.style.fontSize = '42px';
  title.style.lineHeight = '1.05';

  const detail = document.createElement('p');
  detail.textContent = `Viewport ${bounds.width} × ${bounds.height}`;
  detail.style.margin = '0';
  detail.style.color = '#b8f2df';
  detail.style.fontSize = '18px';

  card.append(status, title, detail);
  document.body.replaceChildren(card);
  return card;
}
