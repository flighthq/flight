// A keyboard accelerator (chord) in its canonical normalized string form, e.g. 'Control+Shift+K'.
// Modifiers appear in canonical order (Control < Alt < Shift < Meta < Super < CommandOrControl)
// joined to the key with '+'. CommandOrControl sorts last so a chord carrying both it and a concrete
// Control has one input-independent form.
export type Accelerator = string;
