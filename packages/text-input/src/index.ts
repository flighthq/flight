export type { HandleInputTextKeyboardOptions, ReplaceInputTextOptions } from './inputTextEditing';
export {
  appendInputText,
  applyInputTextRestriction,
  deleteInputTextBackward,
  deleteInputTextForward,
  getInputTextCaretIndex,
  getInputTextCaretRectangle,
  getInputTextCharacterIndexAtPoint,
  getInputTextDisplayText,
  getInputTextSelectionBeginIndex,
  getInputTextSelectionEndIndex,
  getInputTextSelectionRectangles,
  getInputTextSelectionText,
  handleInputTextKeyboard,
  insertInputText,
  moveInputTextCaret,
  replaceInputText,
  replaceSelectedInputText,
  selectAllInputText,
  selectLineAtInputTextIndex,
  selectWordAtInputTextIndex,
  setInputTextSelection,
} from './inputTextEditing';
export type { InputTextInputSource, InputTextManager } from './inputTextManager';
export type { SelectableRichTextManager } from './selectableRichTextManager';
export {
  blurSelectableRichText,
  createSelectableRichTextManager,
  dispatchSelectableRichTextKeyDown,
  dispatchSelectableRichTextPointerDown,
  dispatchSelectableRichTextPointerMove,
  dispatchSelectableRichTextWheel,
  focusSelectableRichText,
  getSelectableRichTextSelectionText,
} from './selectableRichTextManager';
export {
  blurInputText,
  connectInputToInputText,
  createInputTextManager,
  dispatchInputTextInput,
  dispatchInputTextKeyDown,
  dispatchInputTextPointerDown,
  dispatchInputTextPointerMove,
  dispatchInputTextWheel,
  focusInputText,
} from './inputTextManager';
