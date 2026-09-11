import { createApplicationWindow, getWindowBounds, openWindow, setWindowTitle } from '@flighthq/application';
import { webHostWindow } from '@flighthq/host-web';

import { renderHostWebWindowCard } from './render.canvas';

const applicationWindow = createApplicationWindow();
const opened = openWindow(webHostWindow, applicationWindow, {
  height: window.innerHeight,
  title: 'Direct Web Window',
  width: window.innerWidth,
});

const readBounds = webHostWindow.getBounds;
const setTitle = webHostWindow.setTitle;
if (readBounds === undefined || setTitle === undefined) {
  throw new Error('The direct Web window provider must provide title and bounds operations.');
}
const windowOperations = webHostWindow as typeof webHostWindow & {
  getBounds: typeof readBounds;
  setTitle: typeof setTitle;
};
setWindowTitle(windowOperations, applicationWindow, 'Direct Web Window');

const bounds = getWindowBounds(windowOperations, applicationWindow, { height: 0, width: 0, x: 0, y: 0 });
const card = renderHostWebWindowCard(applicationWindow, bounds, opened);

Reflect.set(globalThis, '__flightHostWebWindowOnly', card);
