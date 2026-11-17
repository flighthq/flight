// Generated from crates/flight-xml/src/types.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { XmlRecord } from './xmlNative.ts';

/**
 * Union type for mixed XML content: either literal text or a child element.
 *
 * Element entries share the exact child node held by [`XmlElement::children`], matching the
 * TypeScript model where the same object appears in both arrays (`xmlParse.ts`).
 *
 * Shared nodes have no value equality; compare two entries with [`std::sync::Arc::ptrEq`] when
 * identity matters. `XmlContent` therefore has no `PartialEq`.
 */
export type XmlContent = string | XmlElement;

/**
 * A parsed XML element: tag name, attributes, direct child elements, and text content.
 * `content` preserves the source order of mixed text and elements; `children` and `text`
 * remain the convenient element-only and direct-text projections used by data-oriented
 * XML formats.
 *
 * `children` and `content` share one `Ref` per child, so the tree is a single object graph
 * with linear memory, as in TypeScript. `Clone` is shallow for shared children (a new reference
 * to the same node), exactly like copying an object reference in TypeScript.
 */
export interface XmlElement {
  attributes: XmlRecord<string, string>;
  /**
   * Direct child elements. Text content and comments are discarded as elements.
   */
  children: XmlElement[];
  /**
   * Raw direct text nodes and child elements in source order.
   */
  content: XmlContent[];
  name: string;
  /**
   * Raw text content (trimmed), concatenation of text nodes.
   */
  text: string;
}
