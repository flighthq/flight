/**
 * Escapes HTML special characters in a text string for safe embedding as DOM inner HTML.
 * Used internally by the DOM text renderers (RichText, TextLabel) to render text via innerHTML.
 */
export function escapeDomHtmlString(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;');
}
