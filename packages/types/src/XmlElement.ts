// A parsed XML element: tag name, attributes, direct child elements, and concatenated text content.
export interface XmlElement {
  attributes: Record<string, string>;
  /** Direct child elements. Text content and comments are discarded as elements. */
  children: XmlElement[];
  name: string;
  /** Raw text content (trimmed), concatenation of text nodes. */
  text: string;
}
