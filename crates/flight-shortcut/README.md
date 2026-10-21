# flight-shortcut

Keyboard accelerator parsing, normalization and display plus global-shortcut registration over explicit host capabilities. The crate performs no native hotkey work.

The source module's attachment, accelerator and pending registries become a caller-owned `ShortcutState`. A live shortcut stores its exact subscription and originating provider privately; the state's accelerator index owns attached shortcuts while each attachment keeps only a non-owning reference back to its state. Locks are released before provider futures and trigger callbacks run.

## Precision

This crate has no floating-point values.
