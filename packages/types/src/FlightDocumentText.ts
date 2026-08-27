// Physical YAML text is named independently from FlightDocument, the parsed logical model. It stays an
// ordinary string rather than a branded wrapper so the text boundary remains a plain portable value.
export type FlightDocumentText = string;
