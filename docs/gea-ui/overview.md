# Gea UI Overview

`@geajs/ui` is a component library for [Gea](https://github.com/dashersw/gea) that provides robust, accessible UI primitives. Interactive components are powered by [Zag.js](https://zagjs.com/) state machines — giving you full keyboard navigation, ARIA attributes, and focus management out of the box — while simple styled components offer consistent Tailwind CSS styling with variant support.

## Installation

```bash
npm install @geajs/ui
```

`@geajs/ui` has a peer dependency on `@geajs/core` ^1.0.0. It also requires [Tailwind CSS](https://tailwindcss.com/) **v3** for styling — see [Getting Started](getting-started.md) for the full setup instructions.

## Quick Example

```tsx
import { Component } from '@geajs/core'
import { Button, Dialog, Switch } from '@geajs/ui'
import '@geajs/ui/style.css'

export default class App extends Component {
  template() {
    return (
      <div>
        <Button variant="outline">Click me</Button>

        <Switch label="Dark mode" onCheckedChange={(d) => console.log(d.checked)} />

        <Dialog title="Confirm" description="Are you sure?" triggerLabel="Open">
          <Button variant="destructive">Delete</Button>
        </Dialog>
      </div>
    )
  }
}
```

## Components at a Glance

### Styled Components

Thin wrappers with Tailwind styling and variant support — no JavaScript state machines.

| Component | Purpose |
| --- | --- |
| [Button](styled-components.md#button) | Primary action element with variant and size props |
| [Card](styled-components.md#card) | Content container with header, body, and footer slots |
| [Input](styled-components.md#input) | Text input with consistent styling |
| [Textarea](styled-components.md#textarea) | Multi-line text input |
| [Label](styled-components.md#label) | Form label |
| [Badge](styled-components.md#badge) | Status indicator with variant support |
| [Alert](styled-components.md#alert) | Inline notification with title and description |
| [Separator](styled-components.md#separator) | Horizontal or vertical divider |
| [Skeleton](styled-components.md#skeleton) | Loading placeholder |

### Interactive Components (Zag-Powered)

Backed by Zag.js state machines — full keyboard navigation, ARIA attributes, and focus management.

| Component | Purpose |
| --- | --- |
| [Dialog](interactive-components.md#dialog) | Modal dialog with focus trap and backdrop |
| [Tabs](interactive-components.md#tabs) | Tab panel with keyboard switching |
| [Accordion](interactive-components.md#accordion) | Expandable sections |
| [Tooltip](interactive-components.md#tooltip) | Informational popup on hover |
| [Popover](interactive-components.md#popover) | Floating content panel anchored to a trigger |
| [Menu](interactive-components.md#menu) | Dropdown menu with typeahead |
| [Select](interactive-components.md#select) | Dropdown select with keyboard navigation |
| [Combobox](interactive-components.md#combobox) | Searchable dropdown |
| [Date Picker](interactive-components.md#date-picker) | Calendar date selection with day, month, and year views |
| [Switch](interactive-components.md#switch) | Toggle switch |
| [Checkbox](interactive-components.md#checkbox) | Checkbox with indeterminate support |
| [Radio Group](interactive-components.md#radio-group) | Radio button group |
| [Slider](interactive-components.md#slider) | Range slider |
| [Number Input](interactive-components.md#number-input) | Numeric stepper |
| [Pin Input](interactive-components.md#pin-input) | Verification code input |
| [Tags Input](interactive-components.md#tags-input) | Tag entry field |
| [Toggle Group](interactive-components.md#toggle-group) | Single or multi-select toggle buttons |
| [Progress](interactive-components.md#progress) | Progress bar |
| [Rating Group](interactive-components.md#rating-group) | Star rating input |
| [Clipboard](interactive-components.md#clipboard) | Copy-to-clipboard with feedback |
| [Avatar](interactive-components.md#avatar) | User avatar with fallback |
| [Collapsible](interactive-components.md#collapsible) | Single expand/collapse section |
| [Hover Card](interactive-components.md#hover-card) | Rich preview on hover |
| [Pagination](interactive-components.md#pagination) | Page navigation controls |
| [File Upload](interactive-components.md#file-upload) | File picker with drag-and-drop |
| [Toast](interactive-components.md#toast) | Temporary notification messages |
| [Tree View](interactive-components.md#tree-view) | Hierarchical tree |

### Drag and Drop

A pointer-event-based drag-and-drop system that moves real DOM elements across containers.

| Export | Purpose |
| --- | --- |
| [dndManager](drag-and-drop.md) | Singleton that manages all drag interactions |
| [DragDropContext](drag-and-drop.md#dragdropcontext) | Wrapper component that owns the drag lifecycle |
| [Droppable](drag-and-drop.md#droppable) | Drop target container |
| [Draggable](drag-and-drop.md#draggable) | Draggable item wrapper |

## Next Steps

- [Getting Started](getting-started.md) — Tailwind CSS setup and configuration
- [Styled Components](styled-components.md) — Button, Card, Input, and more
- [Interactive Components](interactive-components.md) — Dialog, Tabs, Select, and more
- [Drag and Drop](drag-and-drop.md) — Sortable lists and kanban boards
- [Theming](theming.md) — CSS variables, dark mode, and custom styling
- [Architecture](architecture.md) — How `ZagComponent` bridges Zag.js and Gea
