// Operating-system shell integration seam. Free functions in @flighthq/shell delegate to the active
// ShellBackend (web default or a native host's). Operations the web cannot perform — revealing a file
// in the OS file manager, moving a path to the trash, opening an arbitrary local path — resolve to
// false rather than throwing. They are expected-failure surfaces on the web, not programmer errors.
export interface ShellBackend {
  openExternal(url: string): Promise<boolean>;
  openPath(path: string): Promise<boolean>;
  showItemInFolder(path: string): Promise<boolean>;
  moveToTrash(path: string): Promise<boolean>;
  beep(): void;
}
