import type { Signal } from './Signal';

// Payload for onTextFieldChange: the field's text after the edit and the text before it.
export interface TextFieldChangeEvent {
  previousText: string;
  text: string;
}

// Payload for onTextFieldLink: the hyperlink URL hit and the field-local point that hit it.
export interface TextFieldLinkEvent {
  url: string;
  x: number;
  y: number;
}

// Payload for onTextFieldScroll: the scroll offsets after the change and the offsets before it.
export interface TextFieldScrollEvent {
  previousScrollH: number;
  previousScrollV: number;
  scrollH: number;
  scrollV: number;
}

// The opt-in text-field notification group attached to a RichText runtime by enableTextFieldSignals
// (@flighthq/text). Null on a static RichText that never enables it; setters emit only when present.
export interface TextFieldSignals {
  onTextFieldChange: Signal<(event: Readonly<TextFieldChangeEvent>) => void>;
  onTextFieldLink: Signal<(event: Readonly<TextFieldLinkEvent>) => void>;
  onTextFieldScroll: Signal<(event: Readonly<TextFieldScrollEvent>) => void>;
}
