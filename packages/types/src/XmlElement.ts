// A parsed XML element: tag name, attributes, direct child elements, and text content. `content`
// preserves the source order of mixed text and elements; `children` and `text` remain the convenient
// element-only and direct-text projections used by data-oriented XML formats.
export interface XmlElement {
  attributes: Record<string, string>;
  /** Direct child elements. Text content and comments are discarded as elements. */
  children: XmlElement[];
  /** Raw direct text nodes and child elements in source order. */
  content: Array<string | XmlElement>;
  name: string;
  /** Raw text content (trimmed), concatenation of text nodes. */
  text: string;
}
