# GUI Controller Architecture

_2026-08-27. Architecture record — the behavioral widget layer for Flight. Controllers wire caller-provided visual objects into interactive UI elements._

**Status: unratified.** Read before working on `gui` or any editor UI feature.

## What it is

`gui` is a new package (`@flighthq/gui`) that provides UI controllers — behavioral wiring that takes caller-authored visual objects (any `Node2D`) and coordinates them into functioning interactive elements. A controller does not create, own, or render visuals. It accepts scene graph nodes, attaches pointer/keyboard handlers via `interaction`, manages state transitions, and repositions parts as needed.

This is the "magic wand" pattern: the caller draws a scrollbar track, a thumb, and two arrow buttons as scene graph nodes (in a `.flight` document, from SVG, or in code). Then `createScrollBarController` takes those four nodes and makes them behave as a scrollbar. The visual design is entirely the caller's; the behavioral contract is entirely the controller's.

## Why this pattern

Three alternatives and why they lose:

1. **Opinionated widget toolkit** (Qt, Flutter) — renders its own visuals, provides themes/skins. Works out of the box but is extremely difficult to make look different. Fights Flight's explicit-data, no-side-effect philosophy. Couples rendering to behavior.

2. **Code-only UI** (dear imgui, custom) — the caller builds every visual from code. Correct appearance is hard to achieve and maintain. No scene-document integration.

3. **Controller-only** (skylark-ui) — the caller owns all visuals; the library owns all behavior. Fully skinnable by construction. Scene-document friendly. Tree-shakable. Each controller is a standalone import. This is the Flight way: explicit data (the visuals) + explicit behavior (the controller), no hidden coupling.

## Design rules

- A controller is a plain entity (created by `create*Controller`), not a node. It holds references to the nodes it was given and the state it manages. It is not added to the scene graph.
- Controllers use `interaction` signals for input — `onPointerDown`, `onPointerMove`, `onPointerUp`, `onClick`, `onPointerOver`, `onPointerOut` on the parts they were given. They call `setNodeHitTestEnabled` and `enableInteractionSignals` on parts as needed.
- State transitions (hover, pressed, disabled, checked) are expressed by swapping visibility, alpha, or position of the caller's visual objects — never by creating or destroying nodes.
- Animation uses `tween` for smooth transitions (fade, slide). A controller never sets a visual property without going through a tween when the change is user-visible. Tween duration is configurable.
- Controllers emit signals for state changes (`onChange`, `onClick`, `onScroll`, `onSelect`). The caller listens; the controller never reaches outside its own parts.
- Every part parameter is optional except the minimum needed for the controller to function. Omitting a part removes that behavior gracefully — no error, no stub.
- Controllers are tree-shakable. Importing `createButtonController` does not pull in `createScrollBarController`.
- Layout is the caller's responsibility. The controller may reposition parts within their local coordinate space (e.g., sliding a thumb along a track), but does not run layout resolution. If the caller wants flex/grid layout around controllers, they use `layout` separately.
- A controller does not manage its own lifecycle in the scene graph. The caller adds and removes the visual nodes; the controller's `dispose*` detaches its signal listeners and clears references.

## Controller catalog

### Button

```typescript
const button = createButtonController({
  upState: myUpSprite,            // required — the default visual
  overState: myOverSprite,        // optional — shown on hover
  downState: myDownSprite,        // optional — shown on press
  hitArea: myHitAreaShape,        // optional — custom hit region
  disabled: false,
});

// Signals
getButtonControllerSignals(button).onClick   // Signal<() => void>
getButtonControllerSignals(button).onPress   // Signal<() => void>
getButtonControllerSignals(button).onRelease // Signal<() => void>

// State
setButtonControllerDisabled(button, true);
isButtonControllerDisabled(button);
```

The controller swaps visibility of `upState`/`overState`/`downState` based on pointer state. Only `upState` is required — a button with just `upState` is clickable but has no visual hover/press feedback.

### Toggle / CheckBox

```typescript
const toggle = createToggleController({
  uncheckedState: myUncheckedSprite,  // required
  checkedState: myCheckedSprite,      // required
  overState: myOverSprite,            // optional
  label: myLabelText,                 // optional — clickable label area
  checked: false,
});

getToggleControllerSignals(toggle).onChange  // Signal<(checked: boolean) => void>
setToggleControllerChecked(toggle, true);
isToggleControllerChecked(toggle);
```

### RadioGroup

```typescript
const group = createRadioGroupController({
  toggles: [toggle1, toggle2, toggle3],  // ToggleController instances
  selectedIndex: 0,
});

getRadioGroupControllerSignals(group).onChange  // Signal<(index: number) => void>
```

Enforces mutual exclusion across toggles. Selecting one unchecks the others.

### ScrollBar

```typescript
const scrollbar = createScrollBarController({
  track: myTrackShape,           // required — the background rail
  thumb: myThumbSprite,          // required — the draggable handle
  upButton: myUpButton,          // optional — repeat-click to scroll up
  downButton: myDownButton,      // optional — repeat-click to scroll down
  orientation: 'vertical',       // 'vertical' | 'horizontal'
  minimum: 0,
  maximum: 100,
  pageSize: 10,
  value: 0,
});

getScrollBarControllerSignals(scrollbar).onChange  // Signal<(value: number) => void>
setScrollBarControllerValue(scrollbar, 42);
getScrollBarControllerValue(scrollbar);
```

The controller positions the thumb along the track proportionally. Thumb dragging, track click-to-page, and button repeat-click are wired automatically. Omitting buttons removes button scrolling; the track and thumb still work.

### Slider

```typescript
const slider = createSliderController({
  track: myTrackShape,           // required
  thumb: myThumbSprite,          // required
  orientation: 'horizontal',
  minimum: 0,
  maximum: 1,
  step: 0.01,                   // optional — snap to step increments
  value: 0.5,
});
```

Like ScrollBar but for value selection. No page-size concept; optional step snapping.

### ScrollView

```typescript
const scrollView = createScrollViewController({
  viewport: myMaskRectangle,         // required — the visible area
  content: myContentContainer,       // required — the scrollable content
  horizontalScrollBar: scrollbar1,   // optional — ScrollBarController
  verticalScrollBar: scrollbar2,     // optional — ScrollBarController
  mouseWheelEnabled: true,
});
```

Coordinates content panning within a masked viewport. Binds to optional ScrollBarControllers for synchronized scrolling. Handles mouse wheel and touch drag.

### TextInput

```typescript
const textInput = createTextInputController({
  textField: myNativeText,           // required — text node to edit
  background: myBackgroundShape,     // optional — visual behind text
  caret: myCaretShape,               // optional — cursor visual
});

getTextInputControllerSignals(textInput).onChange  // Signal<(text: string) => void>
getTextInputControllerSignals(textInput).onSubmit  // Signal<(text: string) => void>
```

Wraps the existing `textinput` package with visual state management (focus highlight, caret positioning, selection rendering).

### TabBar

```typescript
const tabs = createTabBarController({
  tabs: [
    { selectedState: tab1Selected, unselectedState: tab1Unselected },
    { selectedState: tab2Selected, unselectedState: tab2Unselected },
    { selectedState: tab3Selected, unselectedState: tab3Unselected },
  ],
  selectedIndex: 0,
});

getTabBarControllerSignals(tabs).onChange  // Signal<(index: number) => void>
```

Swaps visibility of selected/unselected states. Selecting one tab deselects the others.

### ProgressBar

```typescript
const progress = createProgressBarController({
  track: myTrackShape,              // required — background
  fill: myFillShape,                // required — scaled/masked to show progress
  orientation: 'horizontal',
  minimum: 0,
  maximum: 100,
  value: 0,
});

setProgressBarControllerValue(progress, 75);
```

Scales or masks the fill node proportionally within the track bounds.

### Window / Panel

```typescript
const window = createWindowController({
  frame: myFrameShape,              // required — the window background
  titleBar: myTitleBarSprite,        // optional — drag handle for moving
  closeButton: myCloseButton,        // optional — ButtonController
  resizeHandle: myResizeCorner,      // optional — drag to resize
  content: myContentContainer,       // optional — content area
  draggable: true,
  resizable: true,
  minimumWidth: 200,
  minimumHeight: 150,
});

getWindowControllerSignals(window).onClose   // Signal<() => void>
getWindowControllerSignals(window).onResize  // Signal<(width: number, height: number) => void>
getWindowControllerSignals(window).onMove    // Signal<(x: number, y: number) => void>
```

### Tooltip

```typescript
const tooltip = createTooltipController({
  content: myTooltipContainer,       // required — the tooltip visual
  target: myTargetNode,              // required — the node to hover over
  delay: 500,                        // milliseconds before showing
  offset: { x: 0, y: 20 },
});
```

Shows/hides the content visual on hover over the target, with configurable delay and offset.

### List

```typescript
const list = createListController({
  viewport: myViewportMask,          // required
  content: myContentContainer,       // required
  items: myItemNodes,                // Node2D[] — the item visuals
  scrollBar: scrollbar,              // optional — ScrollBarController
  selectable: true,
});

getListControllerSignals(list).onSelect      // Signal<(index: number) => void>
getListControllerSignals(list).onActivate    // Signal<(index: number) => void>  (double-click/enter)
```

### ComboBox / DropDown

```typescript
const combo = createComboBoxController({
  button: myDropdownButton,          // required — ButtonController that opens the list
  list: myListController,            // required — ListController for the dropdown
  display: myDisplayText,            // optional — shows selected item text
});
```

## Dependencies

- `interaction` — pointer/keyboard dispatch, hit testing, focus management
- `tween` — smooth state transitions
- `signals` — controller signal emission
- `node` — hierarchy traversal, transform reads
- `types` — all type definitions (entity, signal, node traits)

Does not depend on: `render`, `layout`, `application`, `scene2d`, `scene3d`, any renderer package, any host package, `scene-document`.

## Scope boundaries

**In scope**: behavioral controllers for standard UI elements, signal emission, visual state management (visibility/position/alpha swaps on caller-provided nodes), pointer/keyboard wiring.

**Out of scope**: rendering, layout resolution, visual creation, theming/skinning (the caller is the skin), animation systems beyond tween, accessibility (a future concern — `accessibility` package exists but the wiring pattern needs design), internationalization.

## Interactive states — document-level visual phases (2026-08-31, user-approved)

Interactive state is a **node capability**, not a separate kind. Any node can carry visual states gated on pointer phase (idle, hover, pressed, disabled). The visual state data lives in the `.flight` document as an optional field on the node — it describes how something *looks* under interaction, not what it *does*. Behavior (click handlers, navigation, state transitions) lives in code.

```yaml
- kind: DisplayObject
  id: submit-btn
  alpha: 1
  interactiveStates:
    hover: { alpha: 0.8 }
    pressed: { scaleX: 0.95, scaleY: 0.95 }
    disabled: { alpha: 0.4 }
  transition: { duration: 150, easing: easeOut }
```

The code side wires behavior onto the node by ID:

```typescript
onInteractiveActivate(getNodeById(scene, 'submit-btn'), handleSubmit);
```

This separation keeps the document purely visual — a designer can author and preview interactive states in a GUI editor without touching code. An agent can read and modify them because the field names match the TS types directly (per V1 of scene-document-model).

The `gui` controllers consume interactive state but do not own the primitive. A button controller is a node with interactive state enabled plus a click handler. A scrollbar thumb is a node with interactive state plus drag behavior. The shared primitive is the state tracking; what varies across controllers is composition and wiring.

★ **This replaces the Flash `SimpleButton` model.** Flash's `SimpleButton` was a rigid kind with four hardcoded slots and instant swaps between states — no transitions, unusable for high-quality work. Here, transitions are opt-in data on the node (per G2's ruling that transitions are opt-in, not mandatory), the visual response is expressed as property deltas rather than separate display objects, and any node can participate.

## Package scope — application GUI layer (2026-08-31)

`@flighthq/gui` sits between the platform tier (`menu`, `dialog`, `tray`, `shortcut` — OS-native integration) and a specific editor application. It provides behavioral wiring for **application-level UI**: controllers that any Flight application might need, not just an editor.

The naming convention uses the `Gui` prefix to distinguish from platform-tier types: `GuiDialog` (application-level managed dialog queue) vs `Dialog` (OS-native prompt). `GuiMenu` (in-app context menu with dynamic item registration) vs `Menu` (system menu bar). Types are `GuiButton`, `GuiDialog`, `GuiDockLayout`, `GuiScrollbar`, `GuiToggle`, etc. in `@flighthq/types`.

Scope includes: docking/panel layout, application-level dialogs, in-app context menus, toolbar systems, command palettes — anything an application built on Flight would want that isn't OS-native. Scope excludes: editor-specific patterns (undo/redo history, selection model, collaboration), which remain in flight-editor.

## Open questions

1. **SplitPane** — RULED YES by G3 (introduces a behavior primitive — divider-drag with min/max constraints).
2. **TreeView** — RULED YES, its own controller by G3 (expand/collapse is different state, not a flag on a flat list).
3. **ColorPicker** — RULED NO by G3 (composition of existing primitives; belongs in an example).
4. **PropertyGrid** — RULED NO by G3 (composition of layout + existing controllers; belongs in an example).

---

# Manager rulings — PRESERVED VERBATIM after a records collision, 2026-08-28

★ **Why this section exists.** A records rewrite built from a base that predated these rulings landed and
dropped every ruling section below. The code still implements them and tests pin several, but the
*reasoning* was lost while the conclusions survived — and the reasoning is the part that stops a future
agent re-deriving a decision that was already withdrawn.

Reproduced **verbatim** rather than re-summarised, because summarising a ruling is exactly how this was
lost the first time. Where a ruling is already pinned by a test, the test is the enforcement and this is
the explanation. Where anything here conflicts with the sections above, the *conclusions* above are
current wherever the user has since ruled; this is what those conclusions were built on.

## Manager rulings — 2026-08-27

**Deliverable ruled by the user: THE PACKAGES ONLY.** `gui`, `selection`, `gizmo` and `command` are built
as SDK cells to AAA completeness, each usable standalone by anyone building an editor or tool. **No
editor application ships from this work.** The "editor data flow" in the handoff is motivation, not a
deliverable — do not let an app shell, panel layout, project model, or file management appear in any of
these packages. An editor is a possible follow-on the user will scope separately.

**Sequencing ruled by the user: PARALLEL with `scene-document`.** `selection` and `command` depend only
on `node`, `signals`, `geometry` and `types` and touch nothing `scene-document` touches, so they start
immediately. `gui` needs `interaction`, which exists. Only `gizmo` has real coupling, through the
overlay scene.

**G1. The controller-only pattern — APPROVED.** It is the right call and the record argues it well:
explicit data (the caller's visuals) plus explicit behavior (the controller), no hidden coupling,
skinnable by construction, tree-shakable per controller.

**G2. THE MANDATORY TWEEN IS REJECTED.** The record states a controller "never sets a visual property
without going through a tween when the change is user-visible." That is exactly the implicit, stateful
runtime behavior this SDK is designed against — the caller did not ask for an animation and cannot see
where it came from. It also forces `tween` into the dependency graph of every controller, so
`createButtonController` would drag a tween engine in behind it and the per-controller tree-shaking
claimed two rules above would be false.

Ruling: **transitions are opt-in data.** A controller accepts an optional transition descriptor; with
none given it sets the property directly. `tween` becomes a dependency only of callers who ask for it.

**G3. The four catalog questions — ruled by one test: does it introduce a behavior primitive that does
not already exist?**
- **SplitPane — YES, its own controller.** Divider-drag with min/max constraints on two regions is a
  behavior nothing else provides.
- **TreeView — YES, its own controller, NOT a mode of `ListController`.** Expand/collapse state and
  hierarchical navigation are different state, not a flag on a flat list. A `mode` flag here is the
  config-gated-branch smell: a primitive not yet extracted.
- **ColorPicker — NO, a composition.** Sliders plus a text input plus a caller-drawn gradient. It adds
  no behavior primitive, and shipping it as a controller would bake one visual convention into a
  library whose whole premise is that visuals are the caller's.
- **PropertyGrid — NO, a composition.** Label-and-editor pairs are `layout` plus existing controllers.

Composition answers are not "not worth building" — they are worth an example, and an example is where
they belong.

