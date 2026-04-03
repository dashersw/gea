---
name: gea-ui-components
description: Guide for using @geajs/ui — a Tailwind-styled, Zag.js-powered component library for the Gea framework. Use when building UIs with @geajs/ui components like Button, Select, Dialog, Tabs, Toast, or any pre-built component from the library.
---

# @geajs/ui Components

@geajs/ui is a component library for the Gea framework that pairs Tailwind CSS styling with [Zag.js](https://zagjs.com/) state machines for accessible, interactive components. It provides ~35 ready-to-use components: simple styled primitives (Button, Card, Input) and behavior-rich widgets (Select, Dialog, Tabs, Toast).

Read `reference.md` in this skill directory for the full component API with props tables.

## Setup

### Install

```bash
npm install @geajs/core @geajs/ui
npm install -D vite @geajs/vite-plugin tailwindcss @tailwindcss/vite
```

### Vite config

```js
import { defineConfig } from 'vite'
import { geaPlugin } from '@geajs/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [geaPlugin(), tailwindcss()],
})
```

### Import styles

```ts
import '@geajs/ui/style.css'
```

### Import components

```tsx
import { Button, Select, Dialog, Toaster, ToastStore } from '@geajs/ui'
```

## Component Categories

### Simple styled components (no state machine)

Button, Card (+ CardHeader/CardTitle/CardDescription/CardContent/CardFooter), Input, Textarea, Label, Badge, Alert (+ AlertTitle/AlertDescription), Separator, Skeleton.

These are thin Gea `Component` wrappers with Tailwind classes. They accept `class` for custom styling and `children` for content.

### Zag-powered components (interactive)

Accordion, Avatar, Checkbox, Clipboard, Collapsible, Combobox, Dialog, FileUpload, HoverCard, Menu, NumberInput, Pagination, PinInput, Popover, Progress, RadioGroup, RatingGroup, Select, Slider, Switch, Tabs, TagsInput, Toast (Toaster + ToastStore), ToggleGroup, Tooltip, TreeView.

These extend `ZagComponent` — a base class that connects Zag.js state machines to Gea's reactivity system. They manage ARIA attributes, keyboard interactions, and focus automatically.

## Usage Patterns

### Basic usage

```tsx
import { Component } from '@geajs/core'
import { Button, Badge, Separator } from '@geajs/ui'

export default class App extends Component {
  template() {
    return (
      <div>
        <Button click={() => console.log('clicked')}>Save</Button>
        <Button variant="destructive">Delete</Button>
        <Button variant="outline" size="sm">Cancel</Button>
        <Badge variant="secondary">Draft</Badge>
        <Separator />
      </div>
    )
  }
}
```

### Controlled components

Zag-powered components follow a controlled pattern: pass `value` (or `checked`/`open`) and listen for changes via `onValueChange` (or `onCheckedChange`/`onOpenChange`). Store the value in a class field so Gea's reactivity keeps the UI in sync.

```tsx
import { Component } from '@geajs/core'
import { Select, Switch, Slider } from '@geajs/ui'

export default class Settings extends Component {
  theme = ''
  darkMode = false
  volume = 50

  template() {
    return (
      <div>
        <Select
          label="Theme"
          items={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'system', label: 'System' },
          ]}
          value={this.theme ? [this.theme] : []}
          onValueChange={(d: any) => { this.theme = d.value[0] || '' }}
        />
        <p>Selected: {this.theme || '(none)'}</p>

        <Switch
          label="Dark mode"
          checked={this.darkMode}
          onCheckedChange={(d: any) => { this.darkMode = d.checked }}
        />

        <Slider
          label="Volume"
          value={[this.volume]}
          min={0}
          max={100}
          onValueChange={(d: any) => { this.volume = d.value[0] }}
        />
      </div>
    )
  }
}
```

### Toast notifications

Toast uses a static `ToastStore` class and a `<Toaster />` component rendered once at the root.

```tsx
import { Component } from '@geajs/core'
import { Button, Toaster, ToastStore } from '@geajs/ui'

export default class App extends Component {
  save() {
    ToastStore.success({ title: 'Saved!', description: 'Changes persisted.' })
  }

  template() {
    return (
      <div>
        <Button click={this.save}>Save</Button>
        <Toaster />
      </div>
    )
  }
}
```

Toast methods: `ToastStore.success(opts)`, `.error(opts)`, `.info(opts)`, `.loading(opts)`, `.create(opts)`, `.dismiss(id?)`.

### Dialog

```tsx
<Dialog title="Confirm" description="Are you sure?" triggerLabel="Open">
  <p>Dialog body content goes here.</p>
</Dialog>
```

### Tabs

```tsx
<Tabs
  defaultValue="account"
  items={[
    { value: 'account', label: 'Account', content: <p>Account settings</p> },
    { value: 'security', label: 'Security', content: <p>Security settings</p> },
  ]}
/>
```

### Cards with form inputs

```tsx
<Card>
  <CardHeader>
    <CardTitle>Profile</CardTitle>
    <CardDescription>Update your details</CardDescription>
  </CardHeader>
  <CardContent>
    <Label htmlFor="name">Name</Label>
    <Input inputId="name" placeholder="Enter your name" value={this.name} />
  </CardContent>
  <CardFooter>
    <Button click={this.save}>Save</Button>
  </CardFooter>
</Card>
```

## Theming

@geajs/ui uses CSS custom properties for theming. Override them in your stylesheet:

```css
:root {
  --primary: 222 47% 11%;
  --primary-foreground: 210 40% 98%;
  --radius: 0.75rem;
}
```

Dark mode activates with the `dark` class on `<html>`:

```html
<html class="dark">
```

Base color CSS variables: `--background`, `--foreground`.

Color CSS variables related to elements containing text (styled with `-foreground` counterpart): `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--card`, `--popover`.

Color CSS variables related to elements without text: `--border`, `--input` (input field borders), `--ring` (focus ring color), `--dialog-background`.

Other CSS variables: `--radius` (base border radius).

## Styling components

- Pass `class` to any component for additional Tailwind classes.
- Use `data-part` and `data-state` selectors for fine-grained CSS overrides on Zag-powered components:

```css
.select-trigger[data-state="open"] { border-color: hsl(var(--ring)); }
.switch-control[data-state="checked"] { background: hsl(var(--primary)); }
```

## Extending: Creating Custom Zag Components

To wrap a new Zag.js machine, extend `ZagComponent` and implement five methods:

```tsx
import * as myWidget from '@zag-js/my-widget'
import { normalizeProps } from '@zag-js/vanilla'
import { ZagComponent } from '@geajs/ui'
import type { SpreadMap } from '@geajs/ui'

export default class MyWidget extends ZagComponent {
  declare open: boolean

  createMachine() { return myWidget.machine }

  getMachineProps(props: any) {
    return {
      id: this.id,
      // map Gea props → Zag machine props
      onOpenChange: (d: any) => { this.open = d.open; props.onOpenChange?.(d) },
    }
  }

  connectApi(service: any) {
    return myWidget.connect(service, normalizeProps)
  }

  getSpreadMap(): SpreadMap {
    return {
      '[data-part="root"]': 'getRootProps',
      '[data-part="trigger"]': 'getTriggerProps',
      '[data-part="content"]': 'getContentProps',
    }
  }

  syncState(api: any) { this.open = api.open }

  template(props: any) {
    return (
      <div data-part="root">
        <button data-part="trigger">Toggle</button>
        <div data-part="content">{props.children}</div>
      </div>
    )
  }
}
```

The `SpreadMap` maps CSS selectors to Zag API getter names (strings) or functions `(api, el) => props`. After each render, `ZagComponent` applies Zag's ARIA/event attributes to matching DOM elements via `spreadProps`.

## `cn` Utility

Merge Tailwind classes (powered by `clsx` + `tailwind-merge`):

```ts
import { cn } from '@geajs/ui'

const cls = cn('px-4 py-2', active && 'bg-primary', className)
```
