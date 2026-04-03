# Theming

@geajs/ui uses CSS custom properties (variables) for its entire color system, making it straightforward to customize the look and feel without changing component source code.

## CSS Variables

The theme stylesheet (`@geajs/ui/style.css`) defines variables in HSL format on `:root`. Override them in your own CSS to change the palette globally:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;

  --primary: 222 47% 11%;
  --primary-foreground: 210 40% 98%;

  --secondary: 210 40% 96%;
  --secondary-foreground: 222 47% 11%;

  --destructive: 0 84% 60%;
  --destructive-foreground: 210 40% 98%;

  --muted: 210 40% 96%;
  --muted-foreground: 215 16% 47%;

  --accent: 210 40% 96%;
  --accent-foreground: 222 47% 11%;

  --popover: 0 0% 100%;
  --popover-foreground: 222 47% 11%;

  --card: 0 0% 100%;
  --card-foreground: 222 47% 11%;

  --border: 214 32% 91%;
  --input: 214 32% 91%;
  --ring: 222 47% 11%;
  --dialog-background: var(--background);

  --radius: 0.5rem;
}
```

Each variable holds the HSL values without the `hsl()` wrapper. The theme CSS maps them to Tailwind utilities via `@theme inline` (e.g. `hsl(var(--primary))`), so you only need to provide the three numbers (hue, saturation, lightness).

## Available Tokens

| Token | Used by |
| --- | --- |
| `--background` / `--foreground` | Page background and default text |
| `--primary` / `--primary-foreground` | Primary buttons, links, active states |
| `--secondary` / `--secondary-foreground` | Secondary buttons and badges |
| `--destructive` / `--destructive-foreground` | Error states, delete actions |
| `--muted` / `--muted-foreground` | Subtle backgrounds and dimmed text |
| `--accent` / `--accent-foreground` | Hover highlights and focus indicators |
| `--popover` / `--popover-foreground` | Popovers, menus, dropdown panels |
| `--card` / `--card-foreground` | Card surfaces |
| `--border` | Borders on inputs, cards, separators |
| `--input` | Input field borders |
| `--ring` | Focus ring color |
| `--radius` | Base border radius (components derive `lg`, `md`, `sm` from this) |
| `--dialog-background` | Dialog content background, useful mainly for dark theme |

## Dark Mode

@geajs/ui supports dark mode via the `class` strategy. Add the `dark` class to your `<html>` element:

```html
<html class="dark">
```

Then define dark-mode overrides:

```css
.dark {
  --background: 222 47% 11%;
  --foreground: 210 40% 98%;

  --primary: 210 40% 98%;
  --primary-foreground: 222 47% 11%;

  --secondary: 217 33% 17%;
  --secondary-foreground: 210 40% 98%;

  --destructive: 0 63% 31%;
  --destructive-foreground: 210 40% 98%;

  --muted: 217 33% 17%;
  --muted-foreground: 215 20% 65%;

  --accent: 217 33% 17%;
  --accent-foreground: 210 40% 98%;

  --popover: 222 47% 11%;
  --popover-foreground: 210 40% 98%;

  --card: 222 47% 11%;
  --card-foreground: 210 40% 98%;

  --border: 217 33% 17%;
  --input: 217 33% 17%;
  --ring: 212 27% 84%;
  --dialog-background: 344.35 7.21% 9.8%;
}
```

## Toggling Dark Mode

A common pattern is toggling the `dark` class on `<html>` from a Switch component:

```tsx
import { Switch } from '@geajs/ui'

<Switch
  label="Dark mode"
  onCheckedChange={(d) => {
    document.documentElement.classList.toggle('dark', d.checked)
  }}
/>
```

## Targeting Component Parts with CSS

All Zag-powered components emit semantic `data-part` and `data-state` attributes on their DOM elements. You can use these for custom CSS that goes beyond Tailwind utilities:

```css
/* Custom entrance animation for dialogs */
[data-part="content"][data-state="open"] {
  animation: slide-in 200ms ease;
}

[data-part="content"][data-state="closed"] {
  animation: slide-out 150ms ease;
}

/* Highlight the active accordion trigger */
[data-part="item-trigger"][data-state="open"] {
  color: hsl(var(--primary));
  font-weight: 600;
}
```

Styled components also apply semantic class names (`dialog-trigger`, `tabs-content`, `select-item`, etc.) that you can target directly:

```css
.select-item:hover {
  background: hsl(var(--accent));
}
```

## Border Radius

The `--radius` variable controls the base radius. The theme derives four tokens from it:

| Token | Value |
| --- | --- |
| `rounded-lg` | `var(--radius)` |
| `rounded-md` | `calc(var(--radius) - 2px)` |
| `rounded-sm` | `calc(var(--radius) - 4px)` |
| `rounded-xs` | `calc(var(--radius) - 6px)` |

Change `--radius` once and all components update:

```css
:root {
  --radius: 0.75rem; /* more rounded */
}
```
