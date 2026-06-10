# Interactive Components

These components are powered by [Zag.js](https://zagjs.com/) state machines. They handle keyboard navigation, ARIA attributes, focus management, and complex interaction patterns automatically. You get accessible behavior without writing any of it yourself.

Every interactive component accepts a `class` prop for additional Tailwind classes.

## Dialog

A modal dialog with focus trap, escape-to-close, and backdrop click to dismiss.

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

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | `string` | — | Dialog heading |
| `description` | `string` | — | Subheading text |
| `triggerLabel` | `string` | `'Open'` | Text for the trigger button |
| `open` | `boolean` | — | Controlled open state |
| `defaultOpen` | `boolean` | — | Initial open state |
| `modal` | `boolean` | `true` | Whether the dialog is modal |
| `closeOnInteractOutside` | `boolean` | `true` | Close when clicking the backdrop |
| `closeOnEscape` | `boolean` | `true` | Close on Escape key |
| `trapFocus` | `boolean` | `true` | Trap focus inside the dialog |
| `preventScroll` | `boolean` | `true` | Prevent body scroll when open |
| `role` | `'dialog' \| 'alertdialog'` | `'dialog'` | ARIA role |
| `onOpenChange` | `(details: { open: boolean }) => void` | — | Called when open state changes |

## Tabs

Tab panels with keyboard switching (arrow keys, Home, End).

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

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `items` | `Array<{ value, label, content }>` | `[]` | Tab definitions |
| `defaultValue` | `string` | — | Initially active tab |
| `value` | `string` | — | Controlled active tab |
| `onValueChange` | `(details: { value: string }) => void` | — | Called when active tab changes |

## Accordion

Expandable content sections. Supports single or multiple open panels and a collapsible mode where all panels can be closed.

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

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `items` | `Array<{ value, label, content }>` | `[]` | Accordion items |
| `collapsible` | `boolean` | `false` | Allow all panels to close |
| `multiple` | `boolean` | `false` | Allow multiple panels open at once |
| `defaultValue` | `string[]` | — | Initially open panels |
| `value` | `string[]` | — | Controlled open panels |
| `orientation` | `'vertical' \| 'horizontal'` | `'vertical'` | Layout direction |
| `onValueChange` | `(details: { value: string[] }) => void` | — | Called when open panels change |

## Tooltip

Informational popup that appears on hover with a configurable delay.

```tsx
import { Tooltip } from '@geajs/ui'

<Tooltip content="Add to library">
  <Button variant="outline">Hover me</Button>
</Tooltip>

<Tooltip content="Bold (Ctrl+B)" openDelay={200}>
  <Button variant="outline" size="icon">B</Button>
</Tooltip>
```

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `content` | `string` | — | Tooltip text |
| `openDelay` | `number` | — | Milliseconds before showing |
| `closeDelay` | `number` | — | Milliseconds before hiding |

## Popover

A floating content panel anchored to a trigger button with auto-positioning.

```tsx
import { Popover } from '@geajs/ui'

<Popover title="Settings" description="Configure your preferences.">
  <p>Popover content...</p>
</Popover>
```

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | `string` | — | Popover heading |
| `description` | `string` | — | Subheading text |
| `triggerLabel` | `string` | `'Open'` | Text for the trigger button |

## Menu

Dropdown menu with keyboard navigation, typeahead search, and separator support.

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

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `triggerLabel` | `string` | — | Text for the trigger button |
| `items` | `Array<{ value, label } \| { type: 'separator' }>` | `[]` | Menu items |
| `onSelect` | `(details: { value: string }) => void` | — | Called when an item is selected |

## Select

Dropdown select with keyboard navigation and auto-positioning.

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

For advanced usage with grouped items or custom filtering, pass a Zag `collection` prop built with `select.collection()`.

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `label` | `string` | — | Label text |
| `placeholder` | `string` | `'Select...'` | Placeholder when no value selected |
| `items` | `Array<{ value, label }>` | `[]` | Options |
| `collection` | `ListCollection` | — | Advanced: Zag collection for custom item handling |
| `value` | `string[]` | — | Controlled selected values |
| `defaultValue` | `string[]` | — | Initially selected values |
| `multiple` | `boolean` | — | Allow multiple selections |
| `disabled` | `boolean` | — | Disable the select |
| `onValueChange` | `(details: { value: string[] }) => void` | — | Called when selection changes |
| `onOpenChange` | `(details: { open: boolean }) => void` | — | Called when dropdown opens/closes |

## Combobox

Searchable dropdown with keyboard navigation and typeahead filtering.

```tsx
import { Combobox } from '@geajs/ui'

<Combobox
  label="Country"
  placeholder="Search..."
  items={[
    { value: 'us', label: 'United States' },
    { value: 'uk', label: 'United Kingdom' },
    { value: 'de', label: 'Germany' },
  ]}
/>
```

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `label` | `string` | — | Label text |
| `placeholder` | `string` | — | Input placeholder |
| `items` | `Array<{ value, label }>` | `[]` | Options |
| `collection` | `ListCollection` | — | Advanced: Zag collection |

## Switch

A toggle switch.

```tsx
import { Switch } from '@geajs/ui'

<Switch label="Airplane Mode" onCheckedChange={(d) => console.log(d.checked)} />
```

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `label` | `string` | — | Label text |
| `checked` | `boolean` | — | Controlled checked state |
| `defaultChecked` | `boolean` | — | Initial checked state |
| `disabled` | `boolean` | — | Disable the switch |
| `name` | `string` | — | Form field name |
| `onCheckedChange` | `(details: { checked: boolean }) => void` | — | Called when toggled |

## Checkbox

A checkbox with optional indeterminate state.

```tsx
import { Checkbox } from '@geajs/ui'

<Checkbox label="Accept terms" onCheckedChange={(d) => console.log(d.checked)} />
```

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `label` | `string` | — | Label text |
| `checked` | `boolean` | — | Controlled checked state |
| `defaultChecked` | `boolean` | — | Initial checked state |
| `disabled` | `boolean` | — | Disable the checkbox |
| `name` | `string` | — | Form field name |
| `onCheckedChange` | `(details: { checked: boolean }) => void` | — | Called when toggled |

## Radio Group

A group of mutually exclusive radio buttons.

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

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `label` | `string` | — | Group label |
| `items` | `Array<{ value, label }>` | `[]` | Radio options |
| `defaultValue` | `string` | — | Initially selected value |
| `value` | `string` | — | Controlled selected value |
| `onValueChange` | `(details: { value: string }) => void` | — | Called when selection changes |

## Slider

A range slider.

```tsx
import { Slider } from '@geajs/ui'

<Slider label="Volume" defaultValue={[50]} min={0} max={100} step={1} />
```

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `label` | `string` | — | Label text |
| `defaultValue` | `number[]` | — | Initial thumb positions |
| `value` | `number[]` | — | Controlled thumb positions |
| `min` | `number` | `0` | Minimum value |
| `max` | `number` | `100` | Maximum value |
| `step` | `number` | `1` | Step increment |
| `onValueChange` | `(details: { value: number[] }) => void` | — | Called when value changes |

## Number Input

A numeric input with increment/decrement buttons.

```tsx
import { NumberInput } from '@geajs/ui'

<NumberInput label="Quantity" min={0} max={99} step={1} />
```

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `label` | `string` | — | Label text |
| `min` | `number` | — | Minimum value |
| `max` | `number` | — | Maximum value |
| `step` | `number` | `1` | Step increment |
| `defaultValue` | `string` | — | Initial value |
| `onValueChange` | `(details: { value: string, valueAsNumber: number }) => void` | — | Called when value changes |

## Pin Input

A multi-field input for verification codes.

```tsx
import { PinInput } from '@geajs/ui'

<PinInput
  label="Verification Code"
  count={6}
  type="numeric"
  onValueComplete={(d) => console.log(d.valueAsString)}
/>
```

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `label` | `string` | — | Label text |
| `count` | `number` | `4` | Number of input fields |
| `type` | `'alphanumeric' \| 'numeric' \| 'alphabetic'` | `'alphanumeric'` | Allowed characters |
| `mask` | `boolean` | `false` | Mask the input (like a password) |
| `onValueComplete` | `(details: { value: string[], valueAsString: string }) => void` | — | Called when all fields are filled |

## Tags Input

A field for entering and managing tags.

```tsx
import { TagsInput } from '@geajs/ui'

<TagsInput
  label="Tags"
  placeholder="Add tag..."
  defaultValue={['gea', 'ui']}
  onValueChange={(d) => console.log(d.value)}
/>
```

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `label` | `string` | — | Label text |
| `placeholder` | `string` | — | Input placeholder |
| `defaultValue` | `string[]` | — | Initial tags |
| `value` | `string[]` | — | Controlled tags |
| `onValueChange` | `(details: { value: string[] }) => void` | — | Called when tags change |

## Toggle Group

A group of toggle buttons supporting single or multiple selection.

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

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `items` | `Array<{ value, label }>` | `[]` | Toggle options |
| `multiple` | `boolean` | `false` | Allow multiple active toggles |
| `defaultValue` | `string[]` | — | Initially active values |
| `value` | `string[]` | — | Controlled active values |
| `onValueChange` | `(details: { value: string[] }) => void` | — | Called when selection changes |

## Progress

A progress bar.

```tsx
import { Progress } from '@geajs/ui'

<Progress label="Upload" value={65} />
```

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `label` | `string` | — | Label text |
| `value` | `number` | `0` | Current progress (0–100) |
| `max` | `number` | `100` | Maximum value |

## Rating Group

A star rating input.

```tsx
import { RatingGroup } from '@geajs/ui'

<RatingGroup label="Rating" count={5} defaultValue={3} />
<RatingGroup label="Half stars" count={5} allowHalf defaultValue={3.5} />
```

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `label` | `string` | — | Label text |
| `count` | `number` | `5` | Number of stars |
| `defaultValue` | `number` | — | Initial rating |
| `value` | `number` | — | Controlled rating |
| `allowHalf` | `boolean` | `false` | Enable half-star increments |
| `onValueChange` | `(details: { value: number }) => void` | — | Called when rating changes |

## Clipboard

A copy-to-clipboard field with visual feedback.

```tsx
import { Clipboard } from '@geajs/ui'

<Clipboard label="API Key" value="sk-abc123..." />
```

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `label` | `string` | — | Label text |
| `value` | `string` | — | Text to copy |

## Avatar

A user avatar with image and fallback support.

```tsx
import { Avatar } from '@geajs/ui'

<Avatar src="/avatar.jpg" name="John Doe" />
<Avatar name="JD" />
```

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `src` | `string` | — | Image URL |
| `name` | `string` | — | Fallback text (initials) |

## Collapsible

A single expandable/collapsible section.

```tsx
import { Collapsible } from '@geajs/ui'

<Collapsible label="Show more">
  <p>Hidden content revealed on toggle.</p>
</Collapsible>
```

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `label` | `string` | — | Trigger button text |
| `open` | `boolean` | — | Controlled open state |
| `defaultOpen` | `boolean` | — | Initial open state |
| `onOpenChange` | `(details: { open: boolean }) => void` | — | Called when toggled |

## Hover Card

A rich content preview that appears when hovering over a trigger.

```tsx
import { HoverCard } from '@geajs/ui'

<HoverCard triggerLabel="@dashersw">
  <p>Profile information...</p>
</HoverCard>
```

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `triggerLabel` | `string` | — | Trigger text |
| `href` | `string` | — | Optional link URL for the trigger |
| `openDelay` | `number` | — | Milliseconds before showing |
| `closeDelay` | `number` | — | Milliseconds before hiding |

## Pagination

Page navigation controls with previous/next buttons and page numbers.

```tsx
import { Pagination } from '@geajs/ui'

<Pagination
  count={100}
  defaultPageSize={10}
  onPageChange={(d) => console.log(d.page)}
/>
```

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `count` | `number` | — | Total number of items |
| `defaultPageSize` | `number` | `10` | Items per page |
| `defaultPage` | `number` | `1` | Initially active page |
| `page` | `number` | — | Controlled active page |
| `onPageChange` | `(details: { page: number }) => void` | — | Called when page changes |

## File Upload

A file picker with drag-and-drop support and file type filtering.

```tsx
import { FileUpload } from '@geajs/ui'

<FileUpload
  label="Upload Documents"
  accept={{ 'application/pdf': ['.pdf'] }}
  maxFiles={5}
  onFileChange={(d) => console.log(d.acceptedFiles)}
/>
```

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `label` | `string` | — | Label text |
| `accept` | `Record<string, string[]>` | — | Accepted MIME types and extensions |
| `maxFiles` | `number` | — | Maximum number of files |
| `maxFileSize` | `number` | — | Maximum file size in bytes |
| `onFileChange` | `(details: { acceptedFiles: File[], rejectedFiles: File[] }) => void` | — | Called when files are selected |

## Toast

Temporary notification messages with auto-dismiss. Unlike other components, toasts use a global store pattern.

### Setup

Add the `Toaster` component once at your app root:

```tsx
import { Component } from '@geajs/core'
import { Toaster } from '@geajs/ui'

class App extends Component {
  template() {
    return (
      <div>
        {/* Your app content */}
        <Toaster />
      </div>
    )
  }
}
```

### Creating Toasts

Use the `ToastStore` singleton to create toasts from anywhere in your app:

```tsx
import { ToastStore } from '@geajs/ui'

ToastStore.success({ title: 'Saved!', description: 'Your changes have been saved.' })
ToastStore.error({ title: 'Error', description: 'Something went wrong.' })
ToastStore.info({ title: 'Info', description: 'Here is some information.' })
ToastStore.loading({ title: 'Loading...', description: 'Please wait.' })
```

### ToastStore Methods

| Method | Description |
| --- | --- |
| `create(options)` | Create a toast with full control over type and options |
| `success(options)` | Create a success toast |
| `error(options)` | Create an error toast |
| `info(options)` | Create an info toast |
| `loading(options)` | Create a loading toast |
| `dismiss(id?)` | Dismiss a specific toast, or all toasts if no ID given |

### Toast Options

| Option | Type | Description |
| --- | --- | --- |
| `title` | `string` | Toast heading |
| `description` | `string` | Body text |
| `type` | `'success' \| 'error' \| 'info' \| 'loading'` | Toast variant (set automatically by convenience methods) |
| `duration` | `number` | Auto-dismiss delay in milliseconds (default: 5000) |

## Date Picker

Calendar date selection with day, month, and year views, keyboard navigation, and full accessibility support. Powered by `@zag-js/date-picker`.

```tsx
import { DatePicker } from '@geajs/ui'

<DatePicker
  label="Date of Birth"
  onValueChange={(details) => console.log(details.valueAsString)}
/>
```

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `label` | `string` | — | Label text above the input |
| `value` | `DateValue[]` | — | Controlled selected date(s) |
| `defaultValue` | `DateValue[]` | — | Initial selected date(s) |
| `focusedValue` | `DateValue` | — | Controlled focused date |
| `defaultFocusedValue` | `DateValue` | — | Initial focused date |
| `open` | `boolean` | — | Controlled open state |
| `defaultOpen` | `boolean` | — | Initial open state |
| `disabled` | `boolean` | — | Disable the date picker |
| `readOnly` | `boolean` | — | Make the date picker read-only |
| `required` | `boolean` | — | Mark as required for form validation |
| `invalid` | `boolean` | — | Mark the input as invalid |
| `min` | `DateValue` | — | Minimum selectable date |
| `max` | `DateValue` | — | Maximum selectable date |
| `locale` | `string` | `'en-US'` | Locale for formatting |
| `timeZone` | `string` | `'UTC'` | IANA time zone |
| `selectionMode` | `'single' \| 'multiple' \| 'range'` | `'single'` | How dates are selected |
| `closeOnSelect` | `boolean` | `true` | Close the popover after selecting a date |
| `name` | `string` | — | Name attribute for form submission |
| `placeholder` | `string` | — | Placeholder text for the input |
| `inline` | `boolean` | — | Render the calendar inline (no popover) |
| `startOfWeek` | `number` | — | First day of the week (0 = Sunday) |
| `fixedWeeks` | `boolean` | — | Always show 6 weeks in the day view |
| `view` | `'day' \| 'month' \| 'year'` | — | Controlled calendar view |
| `defaultView` | `'day' \| 'month' \| 'year'` | `'day'` | Initial calendar view |
| `isDateUnavailable` | `(date: DateValue) => boolean` | — | Mark specific dates as unavailable |
| `positioning` | `PositioningOptions` | — | Popover positioning options |
| `format` | `(date: DateValue) => string` | — | Custom date formatting function |
| `parse` | `(value: string) => DateValue[]` | — | Custom date parsing function |
| `onValueChange` | `(details: { value: DateValue[], valueAsString: string[] }) => void` | — | Called when the selected date changes |
| `onOpenChange` | `(details: { open: boolean }) => void` | — | Called when the popover opens or closes |
| `onViewChange` | `(details: { view: string }) => void` | — | Called when the calendar view changes |
| `onFocusChange` | `(details: { focusedValue: DateValue, view: string }) => void` | — | Called when the focused date changes |

**Note:** `DateValue` types come from `@internationalized/date`, a peer dependency of `@zag-js/date-picker`.

## Tree View

A hierarchical tree for displaying nested data. Accepts a Zag tree `collection` for full control over the data structure.

```tsx
import { TreeView } from '@geajs/ui'

<TreeView collection={treeCollection}>
  {/* Render tree nodes */}
</TreeView>
```

See the [Zag.js Tree View docs](https://zagjs.com/components/react/tree-view) for details on building tree collections.
