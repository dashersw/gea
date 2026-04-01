# Getting Started with Gea UI

## Installation

```bash
npm install @geajs/ui
```

`@geajs/ui` requires `@geajs/core` as a peer dependency:

```bash
npm install @geajs/core
```

## Tailwind CSS Setup

@geajs/ui uses [Tailwind CSS](https://tailwindcss.com/) **v4** for styling. The theme CSS shipped with the library sets up Tailwind and all design tokens.

### 1. Install Tailwind and its Vite plugin

```bash
npm install -D tailwindcss @tailwindcss/vite
```

Add the plugin to your `vite.config.ts`:

```ts
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss()],
})
```

### 2. Import the Theme CSS

Import the theme stylesheet once in your entry point. It sets up Tailwind, all semantic color tokens, and dark mode support:

```ts
// main.ts
import '@geajs/ui/style.css'
```

### 3. (Optional) Extend with Your Own CSS

If you need additional Tailwind utilities or custom styles, create a CSS file and import it after the theme:

```css
/* src/style.css */
@import "tailwindcss";

/* your custom theme extensions or utilities */
```

```ts
// main.ts
// make sure the theme is imported first
import '@geajs/ui/style.css'
import './style.css'
```

## Minimal Example

```tsx
import { Component } from '@geajs/core'
import { Button, Card, CardHeader, CardTitle, CardContent } from '@geajs/ui'
import '@geajs/ui/style.css'

export default class App extends Component {
  template() {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Your Gea UI setup is working.</p>
          <Button>Get Started</Button>
        </CardContent>
      </Card>
    )
  }
}
```

## The `cn` Utility

@geajs/ui exports a `cn` helper that merges class names with [clsx](https://github.com/lukeed/clsx) and [tailwind-merge](https://github.com/dcastil/tailwind-merge). Use it when you need to conditionally compose Tailwind classes without conflicts:

```tsx
import { cn } from '@geajs/ui'

const classes = cn(
  'px-4 py-2 rounded',
  isActive && 'bg-primary text-primary-foreground',
  isDisabled && 'opacity-50 pointer-events-none',
)
```
