import electron from 'electron';

const { contextBridge, ipcRenderer } = electron;

// The minimal, safe renderer→main bridge. contextIsolation stays on; the renderer never touches
// Node or Electron directly — it calls these typed methods, which invoke the main-process handlers
// in src/main (each backed by a Flight capability now serviced by Electron). This is the pattern a
// real Flight+Electron app uses for capabilities that must run in main.
const flightHarness = {
  openFileDialog: (): Promise<string[]> => ipcRenderer.invoke('flight:openFileDialog'),
  readClipboard: (): Promise<string> => ipcRenderer.invoke('flight:readClipboard'),
  writeClipboard: (text: string): Promise<boolean> => ipcRenderer.invoke('flight:writeClipboard', text),
  notify: (body: string): Promise<boolean> => ipcRenderer.invoke('flight:notify', body),
};

export type FlightHarnessApi = typeof flightHarness;

contextBridge.exposeInMainWorld('flightHarness', flightHarness);
