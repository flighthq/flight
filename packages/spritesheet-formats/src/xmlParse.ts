// XML parsing for the Starling and Cocos plist parsers is owned by @flighthq/resource-formats.
// Re-export the canonical parser so spritesheet-formats users (and the SDK barrel) resolve a
// single shared declaration rather than a duplicate.

export type { XmlElement } from '@flighthq/resource-formats';
export { parseXmlAttributes, parseXmlDocument } from '@flighthq/resource-formats';
