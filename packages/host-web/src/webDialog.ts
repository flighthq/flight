// Browser dialog implementations are stateless capability values. Re-export them from the web host
// package so applications can assemble a full host or import only the dialog slots they need.
export { webFileDialogBackend, webMessageDialogBackend, webPromptDialogBackend } from '@flighthq/dialog/contract';
