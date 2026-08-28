export interface AudioBackend {
  canPlayType(mimeType: string): boolean;
}
