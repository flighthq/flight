import { createApplicationWindow, getWindowBounds, openWindow, setWindowTitle } from '@flighthq/application';
import { webHost } from '@flighthq/host-web';

import { renderHostWebFullCard } from './render.canvas';

const applicationWindow = createApplicationWindow();
const opened = openWindow(webHost, applicationWindow, {
  height: window.innerHeight,
  title: 'Flight Web Host',
  width: window.innerWidth,
});

const readBounds = webHost.window.getBounds;
const setTitle = webHost.window.setTitle;
if (readBounds === undefined || setTitle === undefined) {
  throw new Error('The aggregate web host must provide window title and bounds operations.');
}
const windowOperations = { window: { getBounds: readBounds, setTitle } };
setWindowTitle(windowOperations, applicationWindow, 'Flight Web Host');

const bounds = getWindowBounds(windowOperations, applicationWindow, { height: 0, width: 0, x: 0, y: 0 });
const card = renderHostWebFullCard(applicationWindow, bounds, opened);

Reflect.set(globalThis, '__flightHostWebFull', card);
