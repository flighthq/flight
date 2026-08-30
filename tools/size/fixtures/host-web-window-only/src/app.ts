import { createApplicationWindow, getWindowBounds, openWindow, setWindowTitle } from '@flighthq/application';
import { webWindowBackend } from '@flighthq/host-web';

import { renderHostWebWindowCard } from './render.canvas';

const applicationWindow = createApplicationWindow();
const windowHost = { window: webWindowBackend };
const opened = openWindow(windowHost, applicationWindow, {
  height: window.innerHeight,
  title: 'Direct Web Window',
  width: window.innerWidth,
});

const readBounds = webWindowBackend.getBounds;
const setTitle = webWindowBackend.setTitle;
if (readBounds === undefined || setTitle === undefined) {
  throw new Error('The direct web window backend must provide title and bounds operations.');
}
const windowOperations = { window: { getBounds: readBounds, setTitle } };
setWindowTitle(windowOperations, applicationWindow, 'Direct Web Window');

const bounds = getWindowBounds(windowOperations, applicationWindow, { height: 0, width: 0, x: 0, y: 0 });
const card = renderHostWebWindowCard(applicationWindow, bounds, opened);

Reflect.set(globalThis, '__flightHostWebWindowOnly', card);
