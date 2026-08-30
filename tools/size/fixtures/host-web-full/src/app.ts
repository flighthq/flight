import { createApplicationWindow, getWindowBounds, openWindow, setWindowTitle } from '@flighthq/application';
import { webHost } from '@flighthq/host-web';

import { renderHostWebFullCard } from './render';

const applicationWindow = createApplicationWindow();
const opened = openWindow(webHost, applicationWindow, {
  height: window.innerHeight,
  title: 'Flight Web Host',
  width: window.innerWidth,
});
setWindowTitle(webHost, applicationWindow, 'Flight Web Host');

const bounds = getWindowBounds(webHost, applicationWindow, { height: 0, width: 0, x: 0, y: 0 });
const card = renderHostWebFullCard(applicationWindow, bounds, opened);

Reflect.set(globalThis, '__flightHostWebFull', card);
