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

## Open questions

1. **SplitPane** — should the controller catalog include a split-pane (resizable divider between two content areas)? Common in editors.
2. **TreeView** — a hierarchical expandable list is essential for an editor's scene tree panel. Should it be a distinct controller or a mode of ListController?
3. **ColorPicker** — editors need one. Is it a single controller or a composition of Slider + canvas + TextInput controllers?
4. **PropertyGrid** — an editor's property inspector is a specialized list of label+editor pairs. Controller or composition?
