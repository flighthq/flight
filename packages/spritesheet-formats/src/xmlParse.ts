// XML parsing for the Starling and Cocos plist parsers is owned by @flighthq/textureatlas-formats.
// Re-export the canonical parser so spritesheet-formats users (and the SDK barrel) resolve a
// single shared declaration rather than a duplicate.
export type { XmlElement } from '@flighthq/textureatlas-formats';
export { parseXmlAttributes, parseXmlDocument } from '@flighthq/textureatlas-formats';
