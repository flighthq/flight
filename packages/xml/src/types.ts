import type { XmlElement as SharedXmlElement } from '@flighthq/types/contract';

export type XmlContent = SharedXmlElement['content'][number];
export type XmlElement = SharedXmlElement;
