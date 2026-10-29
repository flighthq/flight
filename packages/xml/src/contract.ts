// Generated from crates/flight-xml/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export type { XmlContent, XmlElement } from './types.ts';
export { parseXmlAttributes, parseXmlDocument } from './xmlParse.ts';
export {
  getXmlElementAttribute,
  getXmlElementAttributeNumber,
  getXmlElementChildByName,
  getXmlElementChildrenByName,
} from './xmlQuery.ts';
