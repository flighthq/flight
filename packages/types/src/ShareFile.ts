// A portable file descriptor for sharing: the file content as a data URL plus its MIME type and
// display name. Backends convert this to their platform's file type at the share boundary (the web
// backend parses the data URL into a DOM File for navigator.share).
export interface ShareFile {
  name: string;
  mimeType: string;
  dataUrl: string;
}
