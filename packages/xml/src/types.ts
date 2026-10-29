/** Literal text or a child element in source order. */
export type XmlContent = string | XmlElement;

/** A parsed XML element and its direct content projections. */
export interface XmlElement {
  attributes: Record<string, string>;
  /** Direct child elements. Text content and comments are discarded as elements. */
  children: XmlElement[];
  /** Raw direct text nodes and child elements in source order. */
  content: XmlContent[];
  name: string;
  /** Raw text content (trimmed), concatenation of text nodes. */
  text: string;
}
