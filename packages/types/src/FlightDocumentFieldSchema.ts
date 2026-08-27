export type FlightDocumentScalar = boolean | number | string | null;

export type FlightDocumentValue = FlightDocumentScalar | FlightDocumentValue[] | FlightDocumentFields;

// An interface breaks the recursive value/map cycle for the compiler and for the generated headers
// while retaining the plain string-keyed object shape used by the logical model.
export interface FlightDocumentFields {
  [name: string]: FlightDocumentValue;
}

export type FlightDocumentFieldValidator = (value: FlightDocumentValue) => boolean;

// One field understood by a registered node or resource kind. Defaults belong to the schema rather
// than the text: the logical model stays normalized while its YAML codec may elide default values.
export interface FlightDocumentFieldSchema {
  defaultValue?: FlightDocumentValue;
  name: string;
  required: boolean;
  validate: FlightDocumentFieldValidator;
}
