//! flight-compiler: target-native
//! flight-compiler: contract computeRichTextBottomScrollV computeRichTextLineCount computeRichTextMaxScrollH
//! flight-compiler: contract computeRichTextMaxScrollV computeRichTextTextHeight computeRichTextTextWidth
//! flight-compiler: contract getRichTextScrollYOffset
//! flight-compiler: root-only computeRichTextBottomScrollV computeRichTextLineCount computeRichTextMaxScrollH
//! flight-compiler: root-only computeRichTextMaxScrollV computeRichTextTextHeight computeRichTextTextWidth
//! flight-compiler: root-only getRichTextScrollYOffset

// Runtime-dependent rich-text metrics stay target-native until their display-object owner migrates.
