import { createApplicationWindow, getWindowBounds, openWindow, setWindowTitle } from '@flighthq/application';
import { webHostWindowAppearance, webHostWindowGeometry, webHostWindowLifecycle } from '@flighthq/host-web';

import { renderHostWebWindowCard } from './render.canvas';

const applicationWindow = createApplicationWindow();
const opened = openWindow(webHostWindowLifecycle, webHostWindowGeometry, applicationWindow, {
  height: window.innerHeight,
  title: 'Direct Web Window',
  width: window.innerWidth,
});

setWindowTitle(webHostWindowAppearance, applicationWindow, 'Direct Web Window');

const bounds = getWindowBounds(webHostWindowGeometry, applicationWindow, { height: 0, width: 0, x: 0, y: 0 });
const card = renderHostWebWindowCard(applicationWindow, bounds, opened);

Reflect.set(globalThis, '__flightHostWebWindowOnly', card);
