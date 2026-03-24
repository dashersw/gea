# @geajs/ui

Accessible UI components for [Gea](https://github.com/dashersw/gea), powered by [Zag.js](https://zagjs.com/) state machines and styled with [Tailwind CSS](https://tailwindcss.com/).

## Installation

```bash
npm install @geajs/ui
```

Peer dependency:
```bash
npm install @geajs/core
```

## Tailwind CSS Setup

### 1. Add @geajs/ui to your Tailwind content paths

```js
// tailwind.config.js
import geaPreset from '@geajs/ui/tailwind-preset'

export default {
  presets: [geaPreset],
  content: [
    './src/**/*.{tsx,ts,jsx,js}',
    './node_modules/@geajs/ui/dist/**/*.js',
  ],
}
```

### 2. Import the theme CSS

In your main CSS file:

```css
@import '@geajs/ui/style.css';
```

Or in your entry point:

```ts
import '@geajs/ui/style.css'
```

## Components

### Simple Styled Components

These components are thin wrappers with Tailwind styling and variant support.

#### Button

```tsx
import { Button } from '@geajs/ui'

class MyApp extends Component {
  template() {
    return (
      <div>
        <Button>Default</Button>
        <Button variant="destructive">Delete</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="link">Link</Button>
        <Button size="sm">Small</Button>
        <Button size="lg">Large</Button>
        <Button size="icon">🔍</Button>
      </div>
    )
  }
}
```

#### Card

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@geajs/ui'

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description text.</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Card content goes here.</p>
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

#### Input

```tsx
import { Input } from '@geajs/ui'

<Input type="email" placeholder="Email" />
<Input disabled placeholder="Disabled" />
```

#### Textarea

```tsx
import { Textarea } from '@geajs/ui'

<Textarea placeholder="Type your message..." rows={4} />
```

#### Label

```tsx
import { Label } from '@geajs/ui'

<Label htmlFor="email">Email</Label>
```

#### Badge

```tsx
import { Badge } from '@geajs/ui'

<Badge>Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="destructive">Destructive</Badge>
<Badge variant="outline">Outline</Badge>
```

#### Alert

```tsx
import { Alert, AlertTitle, AlertDescription } from '@geajs/ui'

<Alert>
  <AlertTitle>Heads up!</AlertTitle>
  <AlertDescription>This is an alert description.</AlertDescription>
</Alert>
<Alert variant="destructive">
  <AlertTitle>Error</AlertTitle>
  <AlertDescription>Something went wrong.</AlertDescription>
</Alert>
```

#### Separator

```tsx
import { Separator } from '@geajs/ui'

<Separator />
<Separator orientation="vertical" />
```

#### Skeleton

```tsx
import { Skeleton } from '@geajs/ui'

<Skeleton class="h-4 w-[250px]" />
<Skeleton class="h-12 w-12 rounded-full" />
```

### Zag-Powered Components

These components are backed by Zag.js state machines, providing full keyboard navigation, ARIA attributes, and focus management out of the box.

#### Dialog

```tsx
import { Dialog } from '@geajs/ui'

<Dialog
  title="Confirm Action"
  description="Are you sure you want to proceed?"
  triggerLabel="Open Dialog"
  onOpenChange={(details) => console.log(details.open)}
>
  <p>Dialog body content here.</p>
</Dialog>
```

#### Tabs

```tsx
import { Tabs } from '@geajs/ui'

<Tabs
  defaultValue="tab1"
  items={[
    { value: 'tab1', label: 'Account', content: 'Account settings...' },
    { value: 'tab2', label: 'Password', content: 'Password settings...' },
    { value: 'tab3', label: 'Notifications', content: 'Notification preferences...' },
  ]}
/>
```

#### Accordion

```tsx
import { Accordion } from '@geajs/ui'

<Accordion
  collapsible
  items={[
    { value: 'item1', label: 'What is @geajs/ui?', content: 'A component library for Gea.' },
    { value: 'item2', label: 'Is it accessible?', content: 'Yes, powered by Zag.js.' },
  ]}
/>
```

#### Tooltip

```tsx
import { Tooltip } from '@geajs/ui'

<Tooltip content="This is a tooltip">
  Hover me
</Tooltip>
```

#### Popover

```tsx
import { Popover } from '@geajs/ui'

<Popover title="Settings" description="Configure your preferences.">
  <p>Popover content...</p>
</Popover>
```

#### Menu

```tsx
import { Menu } from '@geajs/ui'

<Menu
  triggerLabel="Actions"
  items={[
    { value: 'edit', label: 'Edit' },
    { value: 'duplicate', label: 'Duplicate' },
    { type: 'separator' },
    { value: 'delete', label: 'Delete' },
  ]}
  onSelect={(details) => console.log(details.value)}
/>
```

#### Select

```tsx
import { Select } from '@geajs/ui'

<Select
  label="Framework"
  placeholder="Select a framework..."
  items={[
    { value: 'gea', label: 'Gea' },
    { value: 'react', label: 'React' },
    { value: 'vue', label: 'Vue' },
    { value: 'solid', label: 'Solid' },
  ]}
  onValueChange={(details) => console.log(details.value)}
/>
```

**Note:** For Select and Combobox, pass a Zag `collection` prop for advanced usage with `ListCollection`.

#### Switch

```tsx
import { Switch } from '@geajs/ui'

<Switch label="Airplane Mode" onCheckedChange={(d) => console.log(d.checked)} />
```

#### Checkbox

```tsx
import { Checkbox } from '@geajs/ui'

<Checkbox label="Accept terms" onCheckedChange={(d) => console.log(d.checked)} />
```

#### Radio Group

```tsx
import { RadioGroup } from '@geajs/ui'

<RadioGroup
  label="Plan"
  defaultValue="pro"
  items={[
    { value: 'free', label: 'Free' },
    { value: 'pro', label: 'Pro' },
    { value: 'enterprise', label: 'Enterprise' },
  ]}
  onValueChange={(d) => console.log(d.value)}
/>
```

#### Slider

```tsx
import { Slider } from '@geajs/ui'

<Slider
  label="Volume"
  defaultValue={[50]}
  min={0}
  max={100}
  step={1}
/>
```

#### Number Input

```tsx
import { NumberInput } from '@geajs/ui'

<NumberInput label="Quantity" min={0} max={99} step={1} />
```

#### Pin Input

```tsx
import { PinInput } from '@geajs/ui'

<PinInput
  label="Verification Code"
  count={6}
  type="numeric"
  onValueComplete={(d) => console.log(d.valueAsString)}
/>
```

#### Tags Input

```tsx
import { TagsInput } from '@geajs/ui'

<TagsInput
  label="Tags"
  placeholder="Add tag..."
  defaultValue={['gea', 'ui']}
  onValueChange={(d) => console.log(d.value)}
/>
```

#### Progress

```tsx
import { Progress } from '@geajs/ui'

<Progress label="Upload" value={65} />
```

#### Rating Group

```tsx
import { RatingGroup } from '@geajs/ui'

<RatingGroup label="Rating" count={5} defaultValue={3} />
```

#### Clipboard

```tsx
import { Clipboard } from '@geajs/ui'

<Clipboard label="API Key" value="sk-abc123..." />
```

#### Avatar

```tsx
import { Avatar } from '@geajs/ui'

<Avatar src="/avatar.jpg" name="John Doe" />
<Avatar name="JD" />
```

#### Toggle Group

```tsx
import { ToggleGroup } from '@geajs/ui'

<ToggleGroup
  items={[
    { value: 'bold', label: 'B' },
    { value: 'italic', label: 'I' },
    { value: 'underline', label: 'U' },
  ]}
  multiple
/>
```

#### Combobox

```tsx
import { Combobox } from '@geajs/ui'

<Combobox
  label="Country"
  items={[
    { value: 'us', label: 'United States' },
    { value: 'uk', label: 'United Kingdom' },
    { value: 'de', label: 'Germany' },
  ]}
/>
```

#### Date Picker

```tsx
import { DatePicker } from '@geajs/ui'

<DatePicker
  label="Date of Birth"
  onValueChange={(details) => console.log(details.valueAsString)}
/>
```

#### Collapsible

```tsx
import { Collapsible } from '@geajs/ui'

<Collapsible label="Show more">
  <p>Hidden content revealed on toggle.</p>
</Collapsible>
```

#### Hover Card

```tsx
import { HoverCard } from '@geajs/ui'

<HoverCard triggerLabel="@dashersw">
  <p>Profile information...</p>
</HoverCard>
```

#### Pagination

```tsx
import { Pagination } from '@geajs/ui'

<Pagination
  count={100}
  defaultPageSize={10}
  onPageChange={(d) => console.log(d.page)}
/>
```

#### File Upload

```tsx
import { FileUpload } from '@geajs/ui'

<FileUpload
  label="Upload Documents"
  accept={{ 'application/pdf': ['.pdf'] }}
  maxFiles={5}
  onFileChange={(d) => console.log(d.acceptedFiles)}
/>
```

#### Toast

```tsx
import { Toaster, ToastStore } from '@geajs/ui'

// Add the Toaster to your app root
class App extends Component {
  template() {
    return (
      <div>
        <Button onClick={() => ToastStore.success({ title: 'Saved!', description: 'Your changes have been saved.' })}>
          Show Toast
        </Button>
        <Toaster />
      </div>
    )
  }
}

// ToastStore methods: create, success, error, info, loading, dismiss
```

#### Tree View

```tsx
import { TreeView } from '@geajs/ui'

<TreeView collection={treeCollection}>
  {/* Render tree nodes as children */}
</TreeView>
```

## Custom Styling

### CSS Variables

Override CSS variables to customize the theme:

```css
:root {
  --primary: 222 47% 11%;
  --primary-foreground: 210 40% 98%;
  --radius: 0.75rem;
}
```

### Dark Mode

Add the `dark` class to your `<html>` element to enable dark mode:

```html
<html class="dark">
```

### Component Classes

All components use semantic class names (e.g., `dialog-trigger`, `tabs-content`) alongside `data-part` and `data-state` attributes, making it easy to target them with custom CSS:

```css
[data-part="content"][data-state="open"] {
  animation: custom-enter 200ms ease;
}
```

## Architecture

@geajs/ui uses a "shell component" pattern:

1. **Zag.js** provides framework-agnostic state machines for complex UI behavior (keyboard navigation, focus traps, ARIA attributes)
2. **ZagComponent** base class bridges Zag's vanilla adapter with Gea's reactive system
3. Zag's `spreadProps` applies dynamic attributes and event listeners imperatively after Gea's DOM patches
4. Gea's reactive properties drive visual state (open/closed, checked, value)
5. Tailwind CSS handles all styling through utility classes and CSS custom properties

## License

MIT
