import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  capacitorHostAccessibility,
  capacitorHostGraphics,
  capacitorHostIpc,
  capacitorHostMedia,
  capacitorHostMenu,
  capacitorHostMidi,
  capacitorHostNet,
  capacitorHostPower,
  capacitorHostScreen,
  capacitorHostShell,
  capacitorHostShortcut,
  capacitorHostText,
  capacitorHostTray,
  capacitorHostUpdater,
  capacitorHostWindow,
} from './capacitorDefaultHostGroups';

describe('capacitorHostAccessibility', () => {
  it('claims no accessibility slots', () => expect(capacitorHostAccessibility()).toEqual({}));
});

describe('capacitorHostGraphics', () => {
  it('claims no graphics slots', () => expect(capacitorHostGraphics()).toEqual({}));
});

describe('capacitorHostIpc', () => {
  it('claims no IPC slots', () => expect(capacitorHostIpc()).toEqual({}));
});

describe('capacitorHostMedia', () => {
  it('claims no media slots', () => expect(capacitorHostMedia()).toEqual({}));
});

describe('capacitorHostMenu', () => {
  it('claims no menu slots', () => expect(capacitorHostMenu()).toEqual({}));
});

describe('capacitorHostMidi', () => {
  it('claims no MIDI slots', () => expect(capacitorHostMidi()).toEqual({}));
});

describe('capacitorHostNet', () => {
  it('claims no net slots', () => expect(capacitorHostNet()).toEqual({}));
});

describe('capacitorHostPower', () => {
  it('claims no power slots', () => expect(capacitorHostPower()).toEqual({}));
});

describe('capacitorHostScreen', () => {
  it('claims no screen slots', () => expect(capacitorHostScreen()).toEqual({}));
});

describe('capacitorHostShell', () => {
  it('claims no shell slots', () => expect(capacitorHostShell()).toEqual({}));
});

describe('capacitorHostShortcut', () => {
  it('claims no shortcut slots', () => expect(capacitorHostShortcut()).toEqual({}));
});

describe('capacitorHostText', () => {
  it('claims no text slots', () => expect(capacitorHostText()).toEqual({}));
});

describe('capacitorHostTray', () => {
  it('claims no tray slots', () => expect(capacitorHostTray()).toEqual({}));
});

describe('capacitorHostUpdater', () => {
  it('claims no updater slots', () => expect(capacitorHostUpdater()).toEqual({}));
});

describe('capacitorHostWindow', () => {
  it('claims no window operations while preserving Entity construction', () => {
    const window = capacitorHostWindow();
    expect(Object.keys(window)).toEqual([]);
    expect(EntityRuntimeKey in window).toBe(true);
  });
});
