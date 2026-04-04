# @geajs/ui — Component API Reference

## Table of Contents

- [Simple Styled Components](#simple-styled-components)
  - [Button](#button)
  - [Badge](#badge)
  - [Card](#card)
  - [Input](#input)
  - [Textarea](#textarea)
  - [Label](#label)
  - [Alert](#alert)
  - [Separator](#separator)
  - [Skeleton](#skeleton)
- [Zag-Powered Components](#zag-powered-components)
  - [Accordion](#accordion)
  - [Avatar](#avatar)
  - [Checkbox](#checkbox)
  - [Clipboard](#clipboard)
  - [Collapsible](#collapsible)
  - [Combobox](#combobox)
  - [Dialog](#dialog)
  - [FileUpload](#file-upload)
  - [HoverCard](#hover-card)
  - [Menu](#menu)
  - [NumberInput](#number-input)
  - [Pagination](#pagination)
  - [PinInput](#pin-input)
  - [Popover](#popover)
  - [Progress](#progress)
  - [RadioGroup](#radio-group)
  - [RatingGroup](#rating-group)
  - [Select](#select)
  - [Slider](#slider)
  - [Switch](#switch)
  - [Tabs](#tabs)
  - [TagsInput](#tags-input)
  - [Toast](#toast)
  - [ToggleGroup](#toggle-group)
  - [Tooltip](#tooltip)
  - [TreeView](#tree-view)
- [ZagComponent Base Class](#zagcomponent-base-class)
- [Utilities](#utilities)

---

## Simple Styled Components

### Button

Triggers an action or event.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'default' \| 'secondary' \| 'destructive' \| 'outline' \| 'ghost' \| 'link'` | `'default'` | Visual style |
| `size` | `'default' \| 'sm' \| 'lg' \| 'icon'` | `'default'` | Button size |
| `disabled` | `boolean` | `false` | Disable the button |
| `type` | `'button' \| 'submit' \| 'reset'` | `'button'` | HTML button type |
| `class` | `string` | — | Additional CSS classes |
| `children` | `any` | — | Button content |
| `click` | `(e: Event) => void` | — | Click handler |

```tsx
<Button>Default</Button>
<Button variant="destructive" size="lg">Delete</Button>
<Button variant="outline" disabled>Disabled</Button>
<Button variant="icon" click={handleClick}>+</Button>
```

### Badge

Displays a status indicator or category label.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'default' \| 'secondary' \| 'destructive' \| 'outline'` | `'default'` | Visual variant |
| `class` | `string` | — | Additional CSS classes |
| `children` | `any` | — | Badge content |

```tsx
<Badge>New</Badge>
<Badge variant="secondary">Draft</Badge>
<Badge variant="destructive">Error</Badge>
<Badge variant="outline">v1.0</Badge>
```

### Card

Layout container with optional header, title, description, content, and footer sections.

**Sub-components:** `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`

All accept `class` and `children` props.

```tsx
<Card>
  <CardHeader>
    <CardTitle>Account</CardTitle>
    <CardDescription>Manage your settings</CardDescription>
  </CardHeader>
  <CardContent>
    <Label htmlFor="email">Email</Label>
    <Input inputId="email" placeholder="you@example.com" />
  </CardContent>
  <CardFooter>
    <Button click={this.save}>Save</Button>
  </CardFooter>
</Card>
```

### Input

Text input field.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `type` | `string` | `'text'` | HTML input type |
| `placeholder` | `string` | — | Placeholder text |
| `value` | `string` | — | Current value |
| `disabled` | `boolean` | `false` | Disable the input |
| `name` | `string` | — | Form field name |
| `inputId` | `string` | — | HTML `id` attribute |
| `onInput` | `(e: Event) => void` | — | Input event handler |
| `class` | `string` | — | Additional CSS classes |

```tsx
<Input placeholder="Enter your name" value={this.name} onInput={(e: any) => { this.name = e.target.value }} />
<Input type="email" placeholder="you@example.com" disabled />
```

### Textarea

Multi-line text input.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `placeholder` | `string` | — | Placeholder text |
| `value` | `string` | — | Current value |
| `disabled` | `boolean` | `false` | Disable the textarea |
| `name` | `string` | — | Form field name |
| `rows` | `number` | — | Number of visible rows |
| `onInput` | `(e: Event) => void` | — | Input event handler |
| `class` | `string` | — | Additional CSS classes |

```tsx
<Textarea placeholder="Write a message..." rows={4} />
```

### Label

Form label element.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `htmlFor` | `string` | — | Associated input `id` |
| `class` | `string` | — | Additional CSS classes |
| `children` | `any` | — | Label text |

```tsx
<Label htmlFor="name">Full Name</Label>
<Input inputId="name" />
```

### Alert

Feedback message container.

**Sub-components:** `Alert`, `AlertTitle`, `AlertDescription`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'default' \| 'destructive'` | `'default'` | Visual variant |
| `class` | `string` | — | Additional CSS classes |
| `children` | `any` | — | Alert content |

```tsx
<Alert>
  <AlertTitle>Heads up!</AlertTitle>
  <AlertDescription>This action cannot be undone.</AlertDescription>
</Alert>
<Alert variant="destructive">
  <AlertTitle>Error</AlertTitle>
  <AlertDescription>Something went wrong.</AlertDescription>
</Alert>
```

### Separator

Divider line.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Direction |
| `class` | `string` | — | Additional CSS classes |

```tsx
<Separator />
<Separator orientation="vertical" />
```

### Skeleton

Loading placeholder with pulse animation.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `class` | `string` | — | CSS classes (set width/height) |

```tsx
<Skeleton class="h-4 w-48" />
<Skeleton class="h-10 w-10 rounded-full" />
```

---

## Zag-Powered Components

All Zag-powered components support controlled usage with `value`/`onValueChange` (or `checked`/`onCheckedChange`, `open`/`onOpenChange`) and uncontrolled usage with `defaultValue` (or `defaultChecked`, `defaultOpen`).

### Accordion

Expandable content sections.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `items` | `{ value: string, label: string, content: any }[]` | `[]` | Accordion items |
| `value` | `string[]` | — | Controlled open item(s) |
| `defaultValue` | `string[]` | — | Initial open item(s) |
| `multiple` | `boolean` | `false` | Allow multiple open |
| `collapsible` | `boolean` | `false` | Allow all closed |
| `disabled` | `boolean` | — | Disable all items |
| `orientation` | `'vertical' \| 'horizontal'` | `'vertical'` | Layout direction |
| `onValueChange` | `(details: { value: string[] }) => void` | — | Open state changed |
| `class` | `string` | — | Additional CSS classes |

```tsx
<Accordion
  collapsible
  items={[
    { value: 'faq-1', label: 'What is Gea?', content: <p>A lightweight JS framework.</p> },
    { value: 'faq-2', label: 'How does reactivity work?', content: <p>Proxy-based stores.</p> },
  ]}
/>
```

### Avatar

User avatar with image and initials fallback.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `src` | `string` | — | Image URL |
| `name` | `string` | — | User name (for initials fallback) |
| `fallback` | `string` | — | Custom fallback text |
| `class` | `string` | — | Additional CSS classes |
| `onStatusChange` | `(details) => void` | — | Image load status changed |

```tsx
<Avatar src="/photo.jpg" name="Jane Doe" />
<Avatar name="John Smith" />
```

### Checkbox

Toggle checkbox.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `checked` | `boolean \| 'indeterminate'` | — | Controlled checked state |
| `defaultChecked` | `boolean` | — | Initial checked state |
| `label` | `string` | — | Label text |
| `disabled` | `boolean` | — | Disable the checkbox |
| `invalid` | `boolean` | — | Mark as invalid |
| `required` | `boolean` | — | Mark as required |
| `readOnly` | `boolean` | — | Read-only mode |
| `name` | `string` | — | Form field name |
| `value` | `string` | `'on'` | Form value when checked |
| `onCheckedChange` | `(details: { checked: boolean }) => void` | — | Checked state changed |
| `class` | `string` | — | Additional CSS classes |

```tsx
<Checkbox label="Accept terms" checked={this.accepted} onCheckedChange={(d: any) => { this.accepted = d.checked }} />
<Checkbox label="Newsletter" defaultChecked />
```

### Clipboard

Copy-to-clipboard button.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | — | Text to copy |
| `defaultValue` | `string` | — | Initial text to copy |
| `label` | `string` | — | Label text |
| `timeout` | `number` | — | Reset delay after copy (ms) |
| `onStatusChange` | `(details) => void` | — | Copy status changed |

```tsx
<Clipboard value="npm install @geajs/core" label="Install command" />
```

### Collapsible

Collapsible content panel.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `open` | `boolean` | — | Controlled open state |
| `defaultOpen` | `boolean` | — | Initial open state |
| `label` | `string` | — | Trigger label |
| `disabled` | `boolean` | — | Disable toggle |
| `children` | `any` | — | Collapsible content |
| `onOpenChange` | `(details: { open: boolean }) => void` | — | Open state changed |

```tsx
<Collapsible label="Show details" defaultOpen>
  <p>Hidden content here.</p>
</Collapsible>
```

### Combobox

Searchable select with type-ahead filtering.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `items` | `{ value: string, label: string }[]` | `[]` | Selectable items |
| `value` | `string[]` | — | Controlled selected value(s) |
| `defaultValue` | `string[]` | — | Initial selected value(s) |
| `label` | `string` | — | Label text |
| `placeholder` | `string` | — | Input placeholder |
| `multiple` | `boolean` | — | Allow multiple selection |
| `allowCustomValue` | `boolean` | — | Allow values not in the list |
| `disabled` | `boolean` | — | Disable the combobox |
| `onValueChange` | `(details: { value: string[] }) => void` | — | Selection changed |
| `onInputValueChange` | `(details: { inputValue: string }) => void` | — | Input text changed |
| `onOpenChange` | `(details: { open: boolean }) => void` | — | Dropdown open changed |
| `class` | `string` | — | Additional CSS classes |

```tsx
<Combobox
  label="Framework"
  items={[
    { value: 'gea', label: 'Gea' },
    { value: 'react', label: 'React' },
    { value: 'vue', label: 'Vue' },
  ]}
  onValueChange={(d: any) => { this.framework = d.value[0] || '' }}
/>
```

### Dialog

Modal dialog overlay.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | — | Dialog title |
| `description` | `string` | — | Dialog description |
| `triggerLabel` | `string` | `'Open'` | Trigger button text |
| `open` | `boolean` | — | Controlled open state |
| `defaultOpen` | `boolean` | — | Initial open state |
| `modal` | `boolean` | `true` | Modal behavior |
| `closeOnInteractOutside` | `boolean` | `true` | Close on outside click |
| `closeOnEscape` | `boolean` | `true` | Close on Escape key |
| `children` | `any` | — | Dialog body content |
| `onOpenChange` | `(details: { open: boolean }) => void` | — | Open state changed |
| `class` | `string` | — | Additional CSS classes |

```tsx
<Dialog title="Delete item?" description="This action is permanent." triggerLabel="Delete">
  <div>
    <p>Are you sure you want to delete this item?</p>
    <Button variant="destructive">Confirm Delete</Button>
  </div>
</Dialog>
```

### FileUpload

Drag-and-drop file upload area.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `JSXNode` | — | Label text |
| `accept` | `string \| string[] \| Record<string, string[]>` | — | Accepted file types |
| `maxFiles` | `number` | — | Maximum number of files |
| `minFileSize` | `number` | — | Minimum file size in bytes |
| `maxFileSize` | `number` | — | Maximum file size in bytes |
| `allowDrop` | `boolean` | `true` | Allow drag&drop selection |
| `preventDocumentDrop` | `boolean` | `true` | Prevent dropping file outside the dropzone |
| `name` | `string` | — | Input name (for usage in form) |
| `class` | `string` | — | Class name(s) added to the root element |
| `disabled` | `boolean` | `false` | Disable interaction |
| `formatFileSize` | `(bytes: number) => string` | localized, 2 decimal points, suffix | Function formatting file size in the file list |
| `onFileChange` | `(details: { acceptedFiles: File[], rejectedFiles: { file: File, errors: string[] }[] }) => void` | — | Called when files are selected  |
| `translations` | `Partial<FileUploadTranslations>` | see Translations | Override UI strings |

#### Translations

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `dropzone` | `string` | Drag and drop files here | Default dropzone text |
| `dropzoneButton` | `string` | Choose Files | Button triggering file selection |
| `dropzoneActive` | `string` | Drop your files here | Dropzone text while files are being dragged |
| `deleteFile` | `(file: File) => string` | ``(file: File) => `Remove file ${file.name}` `` | Button removing single file from the list |
| `clearAllButton` | `string` | Clear all | Button removing all files from the list |

```tsx
<FileUpload label="Upload images" accept="image/*" maxFiles={3} />
```

### HoverCard

Popover that appears on hover.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `triggerLabel` | `string` | — | Trigger link text |
| `href` | `string` | — | Trigger link URL |
| `open` | `boolean` | — | Controlled open state |
| `openDelay` | `number` | — | Delay before opening (ms) |
| `closeDelay` | `number` | — | Delay before closing (ms) |
| `children` | `any` | — | Card content |

```tsx
<HoverCard triggerLabel="@dashersw" href="https://github.com/dashersw">
  <p>Full-stack developer and open-source enthusiast.</p>
</HoverCard>
```

### Menu

Dropdown menu.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `triggerLabel` | `string` | `'Menu'` | Trigger button text |
| `items` | `({ value: string, label: string } \| { type: 'separator' })[]` | `[]` | Menu items |
| `closeOnSelect` | `boolean` | `true` | Close after selecting |
| `onSelect` | `(details: { value: string }) => void` | — | Item selected |
| `onOpenChange` | `(details: { open: boolean }) => void` | — | Open state changed |
| `class` | `string` | — | Additional CSS classes |

```tsx
<Menu
  triggerLabel="Actions"
  items={[
    { value: 'edit', label: 'Edit' },
    { value: 'duplicate', label: 'Duplicate' },
    { type: 'separator' },
    { value: 'delete', label: 'Delete' },
  ]}
  onSelect={(d: any) => this.handleAction(d.value)}
/>
```

### NumberInput

Stepper number input with increment/decrement buttons.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | — | Label text |
| `value` | `string` | — | Controlled value (string) |
| `defaultValue` | `string` | — | Initial value |
| `min` | `number` | — | Minimum value |
| `max` | `number` | — | Maximum value |
| `step` | `number` | — | Step increment |
| `disabled` | `boolean` | — | Disable the input |
| `onValueChange` | `(details: { value: string, valueAsNumber: number }) => void` | — | Value changed |
| `class` | `string` | — | Additional CSS classes |

```tsx
<NumberInput label="Quantity" value={this.qty} min={1} max={99} step={1}
  onValueChange={(d: any) => { this.qty = d.value }} />
```

### Pagination

Page navigation control.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `count` | `number` | — | Total item count |
| `page` | `number` | — | Controlled current page |
| `defaultPage` | `number` | — | Initial page |
| `pageSize` | `number` | — | Items per page |
| `defaultPageSize` | `number` | — | Initial page size |
| `onPageChange` | `(details: { page: number }) => void` | — | Page changed |
| `class` | `string` | — | Additional CSS classes |

```tsx
<Pagination count={100} pageSize={10} page={this.page}
  onPageChange={(d: any) => { this.page = d.page }} />
```

### PinInput

OTP / verification code input.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | — | Label text |
| `count` | `number` | `4` | Number of input fields |
| `type` | `'alphanumeric' \| 'numeric' \| 'alphabetic'` | — | Allowed characters |
| `value` | `string[]` | — | Controlled values |
| `defaultValue` | `string[]` | — | Initial values |
| `onValueComplete` | `(details: { value: string[], valueAsString: string }) => void` | — | All fields filled |
| `onValueChange` | `(details: { value: string[] }) => void` | — | Any field changed |
| `class` | `string` | — | Additional CSS classes |

```tsx
<PinInput label="Verification code" count={6} type="numeric"
  onValueComplete={(d: any) => this.verify(d.valueAsString)} />
```

### Popover

Popover panel triggered by a button.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `triggerLabel` | `string` | — | Trigger button text |
| `title` | `string` | — | Popover title |
| `description` | `string` | — | Popover description |
| `open` | `boolean` | — | Controlled open state |
| `children` | `any` | — | Popover body content |
| `onOpenChange` | `(details: { open: boolean }) => void` | — | Open state changed |

```tsx
<Popover triggerLabel="Settings" title="Display" description="Customize appearance.">
  <Slider label="Font size" min={12} max={24} defaultValue={[16]} />
</Popover>
```

### Progress

Progress bar indicator.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | — | Label text |
| `value` | `number` | — | Controlled value |
| `defaultValue` | `number` | — | Initial value |
| `min` | `number` | `0` | Minimum value |
| `max` | `number` | `100` | Maximum value |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Direction |
| `class` | `string` | — | Additional CSS classes |

```tsx
<Progress label="Upload" value={this.uploadPercent} />
```

### RadioGroup

Radio button group.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | — | Group label |
| `items` | `{ value: string, label: string }[]` | `[]` | Radio options |
| `value` | `string` | — | Controlled selected value |
| `defaultValue` | `string` | — | Initial selected value |
| `orientation` | `'vertical' \| 'horizontal'` | `'vertical'` | Layout direction |
| `disabled` | `boolean` | — | Disable all options |
| `onValueChange` | `(details: { value: string }) => void` | — | Selection changed |
| `class` | `string` | — | Additional CSS classes |

```tsx
<RadioGroup
  label="Plan"
  items={[
    { value: 'free', label: 'Free' },
    { value: 'pro', label: 'Pro' },
    { value: 'enterprise', label: 'Enterprise' },
  ]}
  value={this.plan}
  onValueChange={(d: any) => { this.plan = d.value }}
/>
```

### RatingGroup

Star rating input.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | — | Label text |
| `count` | `number` | `5` | Number of stars |
| `value` | `number` | — | Controlled rating |
| `defaultValue` | `number` | — | Initial rating |
| `allowHalf` | `boolean` | `false` | Allow half-star values |
| `onValueChange` | `(details: { value: number }) => void` | — | Rating changed |
| `class` | `string` | — | Additional CSS classes |

```tsx
<RatingGroup label="Rating" count={5} value={this.rating}
  onValueChange={(d: any) => { this.rating = d.value }} />
<RatingGroup label="Half stars" allowHalf defaultValue={3.5} />
```

### Select

Dropdown select.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | — | Label text |
| `items` | `{ value: string, label: string }[]` | `[]` | Selectable options |
| `placeholder` | `string` | `'Select...'` | Placeholder text |
| `value` | `string[]` | — | Controlled selected value(s) |
| `defaultValue` | `string[]` | — | Initial selected value(s) |
| `multiple` | `boolean` | — | Allow multiple selection |
| `disabled` | `boolean` | — | Disable the select |
| `onValueChange` | `(details: { value: string[], items: any[] }) => void` | — | Selection changed |
| `onOpenChange` | `(details: { open: boolean }) => void` | — | Dropdown open changed |
| `class` | `string` | — | Additional CSS classes |

```tsx
<Select
  label="Theme"
  placeholder="Choose a theme"
  items={[
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
  ]}
  value={this.theme ? [this.theme] : []}
  onValueChange={(d: any) => { this.theme = d.value[0] || '' }}
/>
```

**Note:** `value` is always an array (even for single select). Wrap a scalar in `[value]` and unwrap with `d.value[0]`.

### Slider

Range slider.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | — | Label text |
| `value` | `number[]` | — | Controlled value(s) |
| `defaultValue` | `number[]` | `[50]` | Initial value(s) |
| `min` | `number` | `0` | Minimum |
| `max` | `number` | `100` | Maximum |
| `step` | `number` | `1` | Step increment |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Direction |
| `disabled` | `boolean` | — | Disable the slider |
| `onValueChange` | `(details: { value: number[] }) => void` | — | Value changed |
| `onValueChangeEnd` | `(details: { value: number[] }) => void` | — | Drag ended |
| `class` | `string` | — | Additional CSS classes |

```tsx
<Slider label="Volume" value={[this.volume]} min={0} max={100}
  onValueChange={(d: any) => { this.volume = d.value[0] }} />
```

For a range slider, pass two values:

```tsx
<Slider label="Price range" value={[this.min, this.max]} min={0} max={1000}
  onValueChange={(d: any) => { this.min = d.value[0]; this.max = d.value[1] }} />
```

### Switch

Toggle switch.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | — | Label text |
| `checked` | `boolean` | — | Controlled checked state |
| `defaultChecked` | `boolean` | — | Initial checked state |
| `disabled` | `boolean` | — | Disable the switch |
| `name` | `string` | — | Form field name |
| `onCheckedChange` | `(details: { checked: boolean }) => void` | — | Checked state changed |
| `class` | `string` | — | Additional CSS classes |

```tsx
<Switch label="Airplane mode" checked={this.airplane}
  onCheckedChange={(d: any) => { this.airplane = d.checked }} />
```

### Tabs

Tabbed interface.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `items` | `{ value: string, label: string, content: any }[]` | `[]` | Tab items |
| `value` | `string` | — | Controlled active tab |
| `defaultValue` | `string` | — | Initial active tab |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Layout direction |
| `onValueChange` | `(details: { value: string }) => void` | — | Active tab changed |
| `class` | `string` | — | Additional CSS classes |

```tsx
<Tabs
  defaultValue="account"
  items={[
    { value: 'account', label: 'Account', content: <p>Account settings here.</p> },
    { value: 'security', label: 'Security', content: <p>Security settings here.</p> },
    { value: 'billing', label: 'Billing', content: <p>Billing info here.</p> },
  ]}
/>
```

### TagsInput

Tag chip input with add/remove.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | — | Label text |
| `value` | `string[]` | — | Controlled tags |
| `defaultValue` | `string[]` | — | Initial tags |
| `placeholder` | `string` | — | Input placeholder |
| `max` | `number` | — | Maximum number of tags |
| `allowDuplicates` | `boolean` | — | Allow duplicate values |
| `onValueChange` | `(details: { value: string[] }) => void` | — | Tags changed |
| `class` | `string` | — | Additional CSS classes |

```tsx
<TagsInput label="Skills" value={this.skills} placeholder="Add a skill..."
  onValueChange={(d: any) => { this.skills = d.value }} />
```

### Toast

Toast notification system. Uses two exports: `Toaster` (component) and `ToastStore` (static API).

**Toaster** — Render once at the root of your app:

```tsx
<Toaster />
<Toaster class="top-0 right-0" />  {/* custom position */}
```

**ToastStore** — Static methods to create/dismiss toasts:

| Method | Description |
|--------|-------------|
| `ToastStore.success(opts)` | Show success toast |
| `ToastStore.error(opts)` | Show error toast |
| `ToastStore.info(opts)` | Show info toast |
| `ToastStore.loading(opts)` | Show loading toast |
| `ToastStore.create(opts)` | Show custom toast |
| `ToastStore.dismiss(id?)` | Dismiss one or all toasts |

**Options:** `{ title?: string, description?: string, duration?: number, type?: string }`

```tsx
ToastStore.success({ title: 'Saved!', description: 'Your changes were saved.' })
ToastStore.error({ title: 'Error', description: 'Could not save.' })
ToastStore.dismiss()
```

### ToggleGroup

Group of toggle buttons (single or multi-select).

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `items` | `{ value: string, label: string }[]` | `[]` | Toggle options |
| `value` | `string[]` | — | Controlled selected value(s) |
| `defaultValue` | `string[]` | — | Initial selected value(s) |
| `multiple` | `boolean` | `false` | Allow multiple selection |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Layout direction |
| `onValueChange` | `(details: { value: string[] }) => void` | — | Selection changed |
| `class` | `string` | — | Additional CSS classes |

```tsx
<ToggleGroup
  items={[
    { value: 'bold', label: 'B' },
    { value: 'italic', label: 'I' },
    { value: 'underline', label: 'U' },
  ]}
  multiple
  value={this.formatting}
  onValueChange={(d: any) => { this.formatting = d.value }}
/>
```

### Tooltip

Hover tooltip.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `content` | `string` | — | Tooltip text |
| `children` | `any` | — | Trigger element |
| `openDelay` | `number` | — | Delay before showing (ms) |
| `closeDelay` | `number` | — | Delay before hiding (ms) |

```tsx
<Tooltip content="Copy to clipboard">
  <Button variant="outline">Copy</Button>
</Tooltip>
```

### TreeView

Hierarchical tree structure.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | — | Tree label |
| `collection` | `TreeCollection` | — | Tree data (from `@zag-js/tree-view`) |
| `selectedValue` | `string[]` | — | Controlled selected nodes |
| `expandedValue` | `string[]` | — | Controlled expanded nodes |
| `children` | `any` | — | Custom tree content |
| `onSelectionChange` | `(details) => void` | — | Selection changed |
| `onExpandedChange` | `(details) => void` | — | Expanded nodes changed |

---

## ZagComponent Base Class

All Zag-powered components extend `ZagComponent`. Override these methods to create a custom Zag integration:

| Method | Purpose |
|--------|---------|
| `createMachine(props)` | Return the Zag machine definition |
| `getMachineProps(props)` | Map Gea props to Zag machine context (include `id: this.id`) |
| `connectApi(service)` | Connect the machine service with `normalizeProps` |
| `getSpreadMap()` | Map CSS selectors → Zag API getter names or functions |
| `syncState(api)` | Copy Zag state into reactive class fields |

### SpreadMap

```ts
interface SpreadMap {
  [selector: string]: string | ((api: any, el: Element) => Record<string, any>)
}
```

- String values call `api[methodName]()` — e.g. `'getRootProps'`
- Function values receive `(api, element)` for per-element props — e.g. item props that depend on `data-value`

After each Gea render cycle, `ZagComponent._applyAllSpreads()` applies Zag's ARIA attributes, event handlers, and data attributes to matching DOM elements.

---

## Utilities

### `cn(...inputs)`

Merge class names with `clsx` + `tailwind-merge` (deduplicates conflicting Tailwind utilities):

```ts
import { cn } from '@geajs/ui'

cn('px-4 py-2', active && 'bg-primary', props.class)
// → deduplicated, conflict-resolved class string
```
