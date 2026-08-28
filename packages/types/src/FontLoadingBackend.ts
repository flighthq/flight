export interface FontLoadingBackend {
  addFontFace(face: FontFace): void;
  checkFontFace(shorthand: string): boolean;
  loadFontFaces(shorthand: string): Promise<FontFace[]>;
  whenReady(): Promise<void>;
}
