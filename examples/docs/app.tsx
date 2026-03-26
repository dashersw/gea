import { Component } from '@geajs/core'
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Input,
  Textarea,
  Label,
  Badge,
  Alert,
  AlertTitle,
  AlertDescription,
  Separator,
  Skeleton,
  Tabs,
  Dialog,
  Menu,
  Popover,
  Tooltip,
  HoverCard,
  Accordion,
  Collapsible,
  Combobox,
  Toaster,
  ToastStore,
  Clipboard,
  ToggleGroup,
  Pagination,
  RatingGroup,
  Select,
  Switch,
  Checkbox,
  RadioGroup,
  Slider,
  NumberInput,
  PinInput,
  TagsInput,
  Progress,
  Avatar,
  FileUpload,
} from '@geajs/ui'

export default class App extends Component {
  inputVal = ''
  textareaVal = ''
  selectVal = ''
  comboboxVal = ''
  switchAirplane = false
  switchDefault = true
  checkTerms = false
  checkDefault = true
  radioVal = 'pro'
  sliderVolume = 50
  sliderRangeMin = 20
  sliderRangeMax = 80
  numberVal = '5'
  pinVal = ['', '', '', '']
  tagsVal = ['TypeScript', 'Gea']
  ratingVal = 3
  ratingHalfVal = 3.5
  toggleVal = []
  tabsVal = 'account'
  pageVal = 1
  dialogAction = 'No action yet'

  template() {
    return (
      <div class="docs-layout">
        <nav class="docs-sidebar">
          <div class="docs-sidebar-logo">gea-ui</div>
          <div class="docs-sidebar-version">v0.1.0</div>

          <h4>General</h4>
          <a href="#button">Button</a>
          <a href="#badge">Badge</a>
          <a href="#separator">Separator</a>
          <a href="#skeleton">Skeleton</a>

          <h4>Layout</h4>
          <a href="#card">Card</a>
          <a href="#alert">Alert</a>

          <h4>Data Display</h4>
          <a href="#avatar">Avatar</a>
          <a href="#progress">Progress</a>

          <h4>Data Entry</h4>
          <a href="#input">Input</a>
          <a href="#textarea">Textarea</a>
          <a href="#select">Select</a>
          <a href="#combobox">Combobox</a>
          <a href="#switch">Switch</a>
          <a href="#checkbox">Checkbox</a>
          <a href="#radio-group">Radio Group</a>
          <a href="#slider">Slider</a>
          <a href="#number-input">Number Input</a>
          <a href="#pin-input">Pin Input</a>
          <a href="#tags-input">Tags Input</a>
          <a href="#rating-group">Rating Group</a>
          <a href="#toggle-group">Toggle Group</a>
          <a href="#file-upload">File Upload</a>
          <a href="#clipboard">Clipboard</a>

          <h4>Navigation</h4>
          <a href="#tabs">Tabs</a>
          <a href="#pagination">Pagination</a>

          <h4>Overlay</h4>
          <a href="#dialog">Dialog</a>
          <a href="#menu">Menu</a>
          <a href="#popover">Popover</a>
          <a href="#tooltip">Tooltip</a>
          <a href="#hover-card">Hover Card</a>

          <h4>Disclosure</h4>
          <a href="#accordion">Accordion</a>
          <a href="#collapsible">Collapsible</a>

          <h4>Feedback</h4>
          <a href="#toast">Toast</a>
        </nav>

        <main class="docs-main">
          <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em' }}>Components</h1>
          <p style={{ color: 'hsl(var(--muted-foreground))', marginBottom: '2rem' }}>
            Comprehensive documentation for every gea-ui component. Each entry includes live demos, code examples, and a
            full property reference.
          </p>

          <Separator class="mb-8" />

          {/* ===== BUTTON ===== */}
          <div class="doc-page" id="button">
            <h2>Button</h2>
            <p class="doc-desc">Triggers an action or event. Supports 6 visual variants and 4 size options.</p>

            <h3>Variants</h3>
            <div class="demo-block">
              <div class="demo-preview">
                <Button>Default</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="link">Link</Button>
              </div>
              <div class="demo-code">{`<Button>Default</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="destructive">Destructive</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>`}</div>
            </div>

            <h3>Sizes</h3>
            <div class="demo-block">
              <div class="demo-preview" style={{ alignItems: 'center' }}>
                <Button size="sm">Small</Button>
                <Button>Default</Button>
                <Button size="lg">Large</Button>
                <Button size="icon">+</Button>
              </div>
              <div class="demo-code">{`<Button size="sm">Small</Button>
<Button>Default</Button>
<Button size="lg">Large</Button>
<Button size="icon">+</Button>`}</div>
            </div>

            <h3>Disabled</h3>
            <div class="demo-block">
              <div class="demo-preview">
                <Button disabled>Disabled</Button>
                <Button variant="outline" disabled>
                  Disabled Outline
                </Button>
              </div>
              <div class="demo-code">{`<Button disabled>Disabled</Button>
<Button variant="outline" disabled>Disabled Outline</Button>`}</div>
            </div>

            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">variant</td>
                  <td class="prop-type">
                    <code>'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link'</code>
                  </td>
                  <td class="prop-default">'default'</td>
                  <td>Visual style variant</td>
                </tr>
                <tr>
                  <td class="prop-name">size</td>
                  <td class="prop-type">
                    <code>'default' | 'sm' | 'lg' | 'icon'</code>
                  </td>
                  <td class="prop-default">'default'</td>
                  <td>Button size</td>
                </tr>
                <tr>
                  <td class="prop-name">disabled</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">false</td>
                  <td>Disable the button</td>
                </tr>
                <tr>
                  <td class="prop-name">type</td>
                  <td class="prop-type">
                    <code>'button' | 'submit' | 'reset'</code>
                  </td>
                  <td class="prop-default">'button'</td>
                  <td>HTML button type</td>
                </tr>
                <tr>
                  <td class="prop-name">class</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Additional CSS classes</td>
                </tr>
                <tr>
                  <td class="prop-name">children</td>
                  <td class="prop-type">
                    <code>any</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Button content</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== BADGE ===== */}
          <div class="doc-page" id="badge">
            <h2>Badge</h2>
            <p class="doc-desc">Displays a status indicator or category label.</p>
            <div class="demo-block">
              <div class="demo-preview">
                <Badge>Default</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="destructive">Destructive</Badge>
                <Badge variant="outline">Outline</Badge>
              </div>
              <div class="demo-code">{`<Badge>Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="destructive">Destructive</Badge>
<Badge variant="outline">Outline</Badge>`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">variant</td>
                  <td class="prop-type">
                    <code>'default' | 'secondary' | 'destructive' | 'outline'</code>
                  </td>
                  <td class="prop-default">'default'</td>
                  <td>Visual variant</td>
                </tr>
                <tr>
                  <td class="prop-name">class</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Additional CSS classes</td>
                </tr>
                <tr>
                  <td class="prop-name">children</td>
                  <td class="prop-type">
                    <code>any</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Badge content</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== SEPARATOR ===== */}
          <div class="doc-page" id="separator">
            <h2>Separator</h2>
            <p class="doc-desc">Visually divides content. Supports horizontal and vertical orientations.</p>
            <div class="demo-block">
              <div class="demo-preview" style={{ flexDirection: 'column' }}>
                <span style={{ fontSize: '0.875rem' }}>Content above</span>
                <Separator />
                <span style={{ fontSize: '0.875rem' }}>Content below</span>
              </div>
              <div class="demo-code">{`<Separator />
<Separator orientation="vertical" />`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">orientation</td>
                  <td class="prop-type">
                    <code>'horizontal' | 'vertical'</code>
                  </td>
                  <td class="prop-default">'horizontal'</td>
                  <td>Direction of the separator</td>
                </tr>
                <tr>
                  <td class="prop-name">class</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Additional CSS classes</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== SKELETON ===== */}
          <div class="doc-page" id="skeleton">
            <h2>Skeleton</h2>
            <p class="doc-desc">Placeholder with pulse animation for loading states.</p>
            <div class="demo-block">
              <div class="demo-preview" style={{ flexDirection: 'column', gap: '0.5rem' }}>
                <Skeleton class="h-4 w-[250px]" />
                <Skeleton class="h-4 w-[200px]" />
                <Skeleton class="h-12 w-12 rounded-full" />
              </div>
              <div class="demo-code">{`<Skeleton class="h-4 w-[250px]" />
<Skeleton class="h-4 w-[200px]" />
<Skeleton class="h-12 w-12 rounded-full" />`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">class</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>CSS classes to control size and shape</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== CARD ===== */}
          <div class="doc-page" id="card">
            <h2>Card</h2>
            <p class="doc-desc">Container with structured sections: Header, Title, Description, Content, Footer.</p>
            <div class="demo-block">
              <div class="demo-preview" style={{ flexDirection: 'column' }}>
                <Card>
                  <CardHeader>
                    <CardTitle>Card Title</CardTitle>
                    <CardDescription>Card description text.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p style={{ fontSize: '0.875rem' }}>Card body content.</p>
                  </CardContent>
                  <CardFooter>
                    <Button size="sm">Action</Button>
                  </CardFooter>
                </Card>
              </div>
              <div class="demo-code">{`<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description.</CardDescription>
  </CardHeader>
  <CardContent>Card body content.</CardContent>
  <CardFooter><Button>Action</Button></CardFooter>
</Card>`}</div>
            </div>
            <h3>Sub-components</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">Card</td>
                  <td>Root container with border and shadow</td>
                </tr>
                <tr>
                  <td class="prop-name">CardHeader</td>
                  <td>Top section with padding and flex column layout</td>
                </tr>
                <tr>
                  <td class="prop-name">CardTitle</td>
                  <td>Heading element (h3)</td>
                </tr>
                <tr>
                  <td class="prop-name">CardDescription</td>
                  <td>Muted description text</td>
                </tr>
                <tr>
                  <td class="prop-name">CardContent</td>
                  <td>Main body section</td>
                </tr>
                <tr>
                  <td class="prop-name">CardFooter</td>
                  <td>Bottom section with flex row layout</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== ALERT ===== */}
          <div class="doc-page" id="alert">
            <h2>Alert</h2>
            <p class="doc-desc">Contextual feedback for typical user actions.</p>
            <div class="demo-block">
              <div class="demo-preview" style={{ flexDirection: 'column' }}>
                <Alert>
                  <AlertTitle>Heads up!</AlertTitle>
                  <AlertDescription>You can add components via the CLI.</AlertDescription>
                </Alert>
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>Your session has expired.</AlertDescription>
                </Alert>
              </div>
              <div class="demo-code">{`<Alert>
  <AlertTitle>Heads up!</AlertTitle>
  <AlertDescription>You can add components via the CLI.</AlertDescription>
</Alert>

<Alert variant="destructive">
  <AlertTitle>Error</AlertTitle>
  <AlertDescription>Your session has expired.</AlertDescription>
</Alert>`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">variant</td>
                  <td class="prop-type">
                    <code>'default' | 'destructive'</code>
                  </td>
                  <td class="prop-default">'default'</td>
                  <td>Visual variant</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== AVATAR ===== */}
          <div class="doc-page" id="avatar">
            <h2>Avatar</h2>
            <p class="doc-desc">
              Displays a user image with fallback to initials. Powered by Zag.js for image load state tracking.
            </p>
            <div class="demo-block">
              <div class="demo-preview" style={{ alignItems: 'center' }}>
                <Avatar src="/logo.jpg" name="Gea" />
                <Avatar name="Armagan Amcalar" />
                <Avatar name="John Doe" fallback="JD" />
              </div>
              <div class="demo-code">{`<Avatar src="/logo.jpg" name="Gea" />
<Avatar name="Armagan Amcalar" />
<Avatar name="John Doe" fallback="JD" />`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">src</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Image URL</td>
                </tr>
                <tr>
                  <td class="prop-name">name</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>User name (used for fallback initials)</td>
                </tr>
                <tr>
                  <td class="prop-name">fallback</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Custom fallback text</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== PROGRESS ===== */}
          <div class="doc-page" id="progress">
            <h2>Progress</h2>
            <p class="doc-desc">Visual indicator of task completion.</p>
            <div class="demo-block">
              <div class="demo-preview" style={{ flexDirection: 'column', width: '100%' }}>
                <Progress label="Upload" value={45} />
                <Progress label="Complete" value={100} />
              </div>
              <div class="demo-code">{`<Progress label="Upload" value={45} />
<Progress label="Complete" value={100} />`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">value</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td class="prop-default">0</td>
                  <td>Current value</td>
                </tr>
                <tr>
                  <td class="prop-name">min</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td class="prop-default">0</td>
                  <td>Minimum value</td>
                </tr>
                <tr>
                  <td class="prop-name">max</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td class="prop-default">100</td>
                  <td>Maximum value</td>
                </tr>
                <tr>
                  <td class="prop-name">label</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Label text</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== INPUT ===== */}
          <div class="doc-page" id="input">
            <h2>Input</h2>
            <p class="doc-desc">Single-line text input field.</p>
            <div class="demo-block">
              <div class="demo-preview" style={{ flexDirection: 'column', width: '100%' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <Label htmlFor="doc-email">Email</Label>
                  <Input
                    inputId="doc-email"
                    type="email"
                    placeholder="you@example.com"
                    value={this.inputVal}
                    onInput={(e: any) => {
                      this.inputVal = e.target.value
                    }}
                  />
                </div>
                <p style={{ width: '100%', margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#71717a' }}>
                  Value: <code>{this.inputVal || '(none)'}</code>
                </p>
                <Input placeholder="Disabled" disabled />
              </div>
              <div class="demo-code">{`<Input
  value={this.email}
  onInput={(e) => { this.email = e.target.value }}
  placeholder="you@example.com"
/>`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">type</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">'text'</td>
                  <td>HTML input type</td>
                </tr>
                <tr>
                  <td class="prop-name">placeholder</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Placeholder text</td>
                </tr>
                <tr>
                  <td class="prop-name">disabled</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">false</td>
                  <td>Disable the input</td>
                </tr>
                <tr>
                  <td class="prop-name">value</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Input value</td>
                </tr>
                <tr>
                  <td class="prop-name">inputId</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>HTML id attribute</td>
                </tr>
                <tr>
                  <td class="prop-name">name</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Form field name</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== TEXTAREA ===== */}
          <div class="doc-page" id="textarea">
            <h2>Textarea</h2>
            <p class="doc-desc">Multi-line text input.</p>
            <div class="demo-block">
              <div class="demo-preview" style={{ width: '100%' }}>
                <Textarea
                  placeholder="Type your message..."
                  rows={3}
                  value={this.textareaVal}
                  onInput={(e: any) => {
                    this.textareaVal = e.target.value
                  }}
                />
                <p style={{ width: '100%', margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#71717a' }}>
                  Value: <code>{this.textareaVal || '(none)'}</code>
                </p>
              </div>
              <div class="demo-code">{`<Textarea
  value={this.message}
  onInput={(e) => { this.message = e.target.value }}
  placeholder="Type your message..."
  rows={3}
/>`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">placeholder</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Placeholder text</td>
                </tr>
                <tr>
                  <td class="prop-name">rows</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Visible row count</td>
                </tr>
                <tr>
                  <td class="prop-name">disabled</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">false</td>
                  <td>Disable the textarea</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== SELECT ===== */}
          <div class="doc-page" id="select">
            <h2>Select</h2>
            <p class="doc-desc">
              Dropdown selection with full keyboard navigation, ARIA roles, and positioning. Powered by Zag.js.
            </p>
            <div class="demo-block">
              <div class="demo-preview" style={{ width: '100%', flexWrap: 'wrap' }}>
                <Select
                  label="Framework"
                  placeholder="Pick one..."
                  value={this.selectVal ? [this.selectVal] : []}
                  items={[
                    { value: 'gea', label: 'Gea' },
                    { value: 'react', label: 'React' },
                    { value: 'vue', label: 'Vue' },
                  ]}
                  onValueChange={(d: any) => {
                    this.selectVal = d.value[0] || ''
                  }}
                />
                <p style={{ width: '100%', margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#71717a' }}>
                  Value: <code>{this.selectVal || '(none)'}</code>
                </p>
              </div>
              <div class="demo-code">{`<Select
  label="Framework"
  placeholder="Pick one..."
  items={[
    { value: 'gea', label: 'Gea' },
    { value: 'react', label: 'React' },
    { value: 'vue', label: 'Vue' },
  ]}
/>`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">items</td>
                  <td class="prop-type">
                    <code>{'{ value, label }[]'}</code>
                  </td>
                  <td class="prop-default">[]</td>
                  <td>List of options</td>
                </tr>
                <tr>
                  <td class="prop-name">label</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Label text</td>
                </tr>
                <tr>
                  <td class="prop-name">placeholder</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">'Select...'</td>
                  <td>Placeholder text</td>
                </tr>
                <tr>
                  <td class="prop-name">value</td>
                  <td class="prop-type">
                    <code>string[]</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Controlled value</td>
                </tr>
                <tr>
                  <td class="prop-name">defaultValue</td>
                  <td class="prop-type">
                    <code>string[]</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Initial value</td>
                </tr>
                <tr>
                  <td class="prop-name">multiple</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">false</td>
                  <td>Allow multi-select</td>
                </tr>
                <tr>
                  <td class="prop-name">disabled</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">false</td>
                  <td>Disable the select</td>
                </tr>
                <tr>
                  <td class="prop-name">onValueChange</td>
                  <td class="prop-type">
                    <code>{'(details) => void'}</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Called when selection changes</td>
                </tr>
                <tr>
                  <td class="prop-name">onOpenChange</td>
                  <td class="prop-type">
                    <code>{'(details) => void'}</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Called when dropdown opens/closes</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== COMBOBOX ===== */}
          <div class="doc-page" id="combobox">
            <h2>Combobox</h2>
            <p class="doc-desc">Searchable select with type-ahead filtering.</p>
            <div class="demo-block">
              <div class="demo-preview" style={{ width: '100%', flexWrap: 'wrap' }}>
                <Combobox
                  label="Country"
                  value={this.comboboxVal ? [this.comboboxVal] : []}
                  items={[
                    { value: 'us', label: 'United States' },
                    { value: 'uk', label: 'United Kingdom' },
                    { value: 'de', label: 'Germany' },
                    { value: 'fr', label: 'France' },
                  ]}
                  onValueChange={(d: any) => {
                    this.comboboxVal = d.value[0] || ''
                  }}
                />
                <p style={{ width: '100%', margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#71717a' }}>
                  Value: <code>{this.comboboxVal || '(none)'}</code>
                </p>
              </div>
              <div class="demo-code">{`<Combobox
  label="Country"
  items={[
    { value: 'us', label: 'United States' },
    { value: 'uk', label: 'United Kingdom' },
    { value: 'de', label: 'Germany' },
    { value: 'fr', label: 'France' },
  ]}
/>`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">items</td>
                  <td class="prop-type">
                    <code>{'{ value, label }[]'}</code>
                  </td>
                  <td class="prop-default">[]</td>
                  <td>Options list</td>
                </tr>
                <tr>
                  <td class="prop-name">label</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Label text</td>
                </tr>
                <tr>
                  <td class="prop-name">placeholder</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Input placeholder</td>
                </tr>
                <tr>
                  <td class="prop-name">inputBehavior</td>
                  <td class="prop-type">
                    <code>'autohighlight' | 'autocomplete' | 'none'</code>
                  </td>
                  <td class="prop-default">'none'</td>
                  <td>Input filtering behavior</td>
                </tr>
                <tr>
                  <td class="prop-name">multiple</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">false</td>
                  <td>Multi-select mode</td>
                </tr>
                <tr>
                  <td class="prop-name">allowCustomValue</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">false</td>
                  <td>Allow free-form values</td>
                </tr>
                <tr>
                  <td class="prop-name">onValueChange</td>
                  <td class="prop-type">
                    <code>{'(details) => void'}</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Selection change callback</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== SWITCH ===== */}
          <div class="doc-page" id="switch">
            <h2>Switch</h2>
            <p class="doc-desc">Boolean toggle. Accessible via keyboard (Space/Enter).</p>
            <div class="demo-block">
              <div class="demo-preview" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                <Switch
                  label="Airplane Mode"
                  checked={this.switchAirplane}
                  onCheckedChange={(d: any) => {
                    this.switchAirplane = d.checked
                  }}
                />
                <Switch
                  label="On by default"
                  checked={this.switchDefault}
                  onCheckedChange={(d: any) => {
                    this.switchDefault = d.checked
                  }}
                />
                <p style={{ width: '100%', margin: 0, fontSize: '0.875rem', color: '#71717a' }}>
                  Airplane Mode: <code>{String(this.switchAirplane)}</code> · On by default:{' '}
                  <code>{String(this.switchDefault)}</code>
                </p>
              </div>
              <div class="demo-code">{`<Switch label="Airplane Mode" />
<Switch label="On by default" defaultChecked />`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">label</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Label text</td>
                </tr>
                <tr>
                  <td class="prop-name">checked</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Controlled state</td>
                </tr>
                <tr>
                  <td class="prop-name">defaultChecked</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">false</td>
                  <td>Initial state</td>
                </tr>
                <tr>
                  <td class="prop-name">disabled</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">false</td>
                  <td>Disable the switch</td>
                </tr>
                <tr>
                  <td class="prop-name">onCheckedChange</td>
                  <td class="prop-type">
                    <code>{'(details) => void'}</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Called when toggled</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== CHECKBOX ===== */}
          <div class="doc-page" id="checkbox">
            <h2>Checkbox</h2>
            <p class="doc-desc">Multi-select control with indeterminate state support.</p>
            <div class="demo-block">
              <div class="demo-preview" style={{ flexDirection: 'column' }}>
                <Checkbox
                  label="Accept terms"
                  checked={this.checkTerms}
                  onCheckedChange={(d: any) => {
                    this.checkTerms = d.checked
                  }}
                />
                <Checkbox
                  label="Checked by default"
                  checked={this.checkDefault}
                  onCheckedChange={(d: any) => {
                    this.checkDefault = d.checked
                  }}
                />
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#71717a' }}>
                  Accept terms: <code>{String(this.checkTerms)}</code> · Checked by default:{' '}
                  <code>{String(this.checkDefault)}</code>
                </p>
              </div>
              <div class="demo-code">{`<Checkbox label="Accept terms" />
<Checkbox label="Checked by default" defaultChecked />`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">label</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Label text</td>
                </tr>
                <tr>
                  <td class="prop-name">checked</td>
                  <td class="prop-type">
                    <code>boolean | 'indeterminate'</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Controlled state</td>
                </tr>
                <tr>
                  <td class="prop-name">defaultChecked</td>
                  <td class="prop-type">
                    <code>boolean | 'indeterminate'</code>
                  </td>
                  <td class="prop-default">false</td>
                  <td>Initial state</td>
                </tr>
                <tr>
                  <td class="prop-name">disabled</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">false</td>
                  <td>Disable the checkbox</td>
                </tr>
                <tr>
                  <td class="prop-name">onCheckedChange</td>
                  <td class="prop-type">
                    <code>{'(details) => void'}</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Called when state changes</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== RADIO GROUP ===== */}
          <div class="doc-page" id="radio-group">
            <h2>Radio Group</h2>
            <p class="doc-desc">Single selection from a set of options.</p>
            <div class="demo-block">
              <div class="demo-preview" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                <RadioGroup
                  label="Plan"
                  value={this.radioVal}
                  items={[
                    { value: 'free', label: 'Free' },
                    { value: 'pro', label: 'Pro' },
                    { value: 'enterprise', label: 'Enterprise' },
                  ]}
                  onValueChange={(d: any) => {
                    this.radioVal = d.value
                  }}
                />
                <p style={{ width: '100%', margin: 0, fontSize: '0.875rem', color: '#71717a' }}>
                  Value: <code>{this.radioVal}</code>
                </p>
              </div>
              <div class="demo-code">{`<RadioGroup
  label="Plan"
  defaultValue="pro"
  items={[
    { value: 'free', label: 'Free' },
    { value: 'pro', label: 'Pro' },
    { value: 'enterprise', label: 'Enterprise' },
  ]}
/>`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">items</td>
                  <td class="prop-type">
                    <code>{'{ value, label }[]'}</code>
                  </td>
                  <td class="prop-default">[]</td>
                  <td>Options</td>
                </tr>
                <tr>
                  <td class="prop-name">label</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Group label</td>
                </tr>
                <tr>
                  <td class="prop-name">value</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Controlled value</td>
                </tr>
                <tr>
                  <td class="prop-name">defaultValue</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Initial value</td>
                </tr>
                <tr>
                  <td class="prop-name">orientation</td>
                  <td class="prop-type">
                    <code>'horizontal' | 'vertical'</code>
                  </td>
                  <td class="prop-default">'vertical'</td>
                  <td>Layout direction</td>
                </tr>
                <tr>
                  <td class="prop-name">onValueChange</td>
                  <td class="prop-type">
                    <code>{'(details) => void'}</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Selection change callback</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== SLIDER ===== */}
          <div class="doc-page" id="slider">
            <h2>Slider</h2>
            <p class="doc-desc">
              Range input with draggable thumb. Pass multiple values in <code>defaultValue</code> to create a range
              slider with multiple thumbs.
            </p>
            <div class="demo-block">
              <div class="demo-preview" style={{ flexDirection: 'column', width: 300, gap: '2rem' }}>
                <div style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Volume</span>
                    <span style={{ fontSize: '0.875rem', color: '#71717a', fontVariantNumeric: 'tabular-nums' }}>
                      {this.sliderVolume}
                    </span>
                  </div>
                  <Slider
                    value={[this.sliderVolume]}
                    min={0}
                    max={100}
                    onValueChange={(d: any) => {
                      this.sliderVolume = d.value[0]
                    }}
                  />
                </div>
                <div style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Price Range</span>
                    <span style={{ fontSize: '0.875rem', color: '#71717a', fontVariantNumeric: 'tabular-nums' }}>
                      {this.sliderRangeMin} – {this.sliderRangeMax}
                    </span>
                  </div>
                  <Slider
                    value={[this.sliderRangeMin, this.sliderRangeMax]}
                    min={0}
                    max={100}
                    onValueChange={(d: any) => {
                      this.sliderRangeMin = d.value[0]
                      this.sliderRangeMax = d.value[1]
                    }}
                  />
                </div>
              </div>
              <div class="demo-code">{`<!-- Single thumb -->
<Slider label="Volume" defaultValue={[50]} min={0} max={100} />

<!-- Range slider (two thumbs) -->
<Slider label="Price Range" defaultValue={[20, 80]} min={0} max={100} />`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">value</td>
                  <td class="prop-type">
                    <code>number[]</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Controlled values (one entry per thumb)</td>
                </tr>
                <tr>
                  <td class="prop-name">defaultValue</td>
                  <td class="prop-type">
                    <code>number[]</code>
                  </td>
                  <td class="prop-default">[50]</td>
                  <td>Initial values — length determines thumb count</td>
                </tr>
                <tr>
                  <td class="prop-name">min</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td class="prop-default">0</td>
                  <td>Minimum</td>
                </tr>
                <tr>
                  <td class="prop-name">max</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td class="prop-default">100</td>
                  <td>Maximum</td>
                </tr>
                <tr>
                  <td class="prop-name">step</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td class="prop-default">1</td>
                  <td>Step increment</td>
                </tr>
                <tr>
                  <td class="prop-name">label</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Label text</td>
                </tr>
                <tr>
                  <td class="prop-name">onValueChange</td>
                  <td class="prop-type">
                    <code>{'(details) => void'}</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Called on value change</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== NUMBER INPUT ===== */}
          <div class="doc-page" id="number-input">
            <h2>Number Input</h2>
            <p class="doc-desc">Numeric input with increment/decrement buttons and keyboard control.</p>
            <div class="demo-block">
              <div class="demo-preview" style={{ width: '100%', flexWrap: 'wrap' }}>
                <NumberInput
                  label="Quantity"
                  value={this.numberVal}
                  min={0}
                  max={99}
                  onValueChange={(d: any) => {
                    this.numberVal = d.value
                  }}
                />
                <p style={{ width: '100%', margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#71717a' }}>
                  Value: <code>{this.numberVal}</code>
                </p>
              </div>
              <div class="demo-code">{`<NumberInput label="Quantity" defaultValue="5" min={0} max={99} />`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">label</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Label text</td>
                </tr>
                <tr>
                  <td class="prop-name">value</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Controlled value</td>
                </tr>
                <tr>
                  <td class="prop-name">defaultValue</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Initial value</td>
                </tr>
                <tr>
                  <td class="prop-name">min</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Minimum allowed value</td>
                </tr>
                <tr>
                  <td class="prop-name">max</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Maximum allowed value</td>
                </tr>
                <tr>
                  <td class="prop-name">step</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td class="prop-default">1</td>
                  <td>Increment step</td>
                </tr>
                <tr>
                  <td class="prop-name">onValueChange</td>
                  <td class="prop-type">
                    <code>{'(details) => void'}</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Value change callback</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== PIN INPUT ===== */}
          <div class="doc-page" id="pin-input">
            <h2>Pin Input</h2>
            <p class="doc-desc">Segmented input for codes and OTPs. Auto-advances between fields.</p>
            <div class="demo-block">
              <div class="demo-preview" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                <PinInput
                  count={4}
                  type="numeric"
                  placeholder="○"
                  value={this.pinVal}
                  onValueChange={(d: any) => {
                    this.pinVal = d.value
                  }}
                />
                <p style={{ width: '100%', margin: 0, fontSize: '0.875rem', color: '#71717a' }}>
                  Value: <code>{this.pinVal.join('') || '(empty)'}</code>
                </p>
              </div>
              <div class="demo-code">{`<PinInput count={4} type="numeric" placeholder="○" />`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">count</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td class="prop-default">4</td>
                  <td>Number of input fields</td>
                </tr>
                <tr>
                  <td class="prop-name">type</td>
                  <td class="prop-type">
                    <code>'alphanumeric' | 'numeric' | 'alphabetic'</code>
                  </td>
                  <td class="prop-default">'numeric'</td>
                  <td>Allowed input type</td>
                </tr>
                <tr>
                  <td class="prop-name">mask</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">false</td>
                  <td>Mask input like password</td>
                </tr>
                <tr>
                  <td class="prop-name">otp</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">false</td>
                  <td>Enable OTP autocomplete</td>
                </tr>
                <tr>
                  <td class="prop-name">placeholder</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">'○'</td>
                  <td>Per-field placeholder</td>
                </tr>
                <tr>
                  <td class="prop-name">onValueComplete</td>
                  <td class="prop-type">
                    <code>{'(details) => void'}</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Called when all fields filled</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== TAGS INPUT ===== */}
          <div class="doc-page" id="tags-input">
            <h2>Tags Input</h2>
            <p class="doc-desc">Add and remove string tags with keyboard (Enter to add, Backspace to remove).</p>
            <div class="demo-block">
              <div class="demo-preview" style={{ width: '100%', flexWrap: 'wrap' }}>
                <TagsInput
                  label="Skills"
                  placeholder="Add skill..."
                  value={this.tagsVal}
                  onValueChange={(d: any) => {
                    this.tagsVal = d.value
                  }}
                />
                <p style={{ width: '100%', margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#71717a' }}>
                  Value: <code>{this.tagsVal.join(', ') || '(none)'}</code>
                </p>
              </div>
              <div class="demo-code">{`<TagsInput
  label="Skills"
  placeholder="Add skill..."
  defaultValue={['TypeScript', 'Gea']}
/>`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">label</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Label text</td>
                </tr>
                <tr>
                  <td class="prop-name">defaultValue</td>
                  <td class="prop-type">
                    <code>string[]</code>
                  </td>
                  <td class="prop-default">[]</td>
                  <td>Initial tags</td>
                </tr>
                <tr>
                  <td class="prop-name">placeholder</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Input placeholder</td>
                </tr>
                <tr>
                  <td class="prop-name">max</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Maximum tags allowed</td>
                </tr>
                <tr>
                  <td class="prop-name">onValueChange</td>
                  <td class="prop-type">
                    <code>{'(details) => void'}</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Tags change callback</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== RATING GROUP ===== */}
          <div class="doc-page" id="rating-group">
            <h2>Rating Group</h2>
            <p class="doc-desc">Star rating input with half-star support.</p>
            <div class="demo-block">
              <div class="demo-preview" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                <RatingGroup
                  count={5}
                  value={this.ratingVal}
                  onValueChange={(d: any) => {
                    this.ratingVal = d.value
                  }}
                />
                <RatingGroup
                  count={5}
                  allowHalf
                  value={this.ratingHalfVal}
                  onValueChange={(d: any) => {
                    this.ratingHalfVal = d.value
                  }}
                />
                <p style={{ width: '100%', margin: 0, fontSize: '0.875rem', color: '#71717a' }}>
                  Integer: <code>{this.ratingVal}</code> · Half-star: <code>{this.ratingHalfVal}</code>
                </p>
              </div>
              <div class="demo-code">{`<RatingGroup count={5} defaultValue={3} />
<RatingGroup count={5} allowHalf defaultValue={3.5} />`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">count</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td class="prop-default">5</td>
                  <td>Number of stars</td>
                </tr>
                <tr>
                  <td class="prop-name">value</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Controlled value</td>
                </tr>
                <tr>
                  <td class="prop-name">defaultValue</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Initial value</td>
                </tr>
                <tr>
                  <td class="prop-name">allowHalf</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">false</td>
                  <td>Enable half-star selection</td>
                </tr>
                <tr>
                  <td class="prop-name">readOnly</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">false</td>
                  <td>Display only</td>
                </tr>
                <tr>
                  <td class="prop-name">onValueChange</td>
                  <td class="prop-type">
                    <code>{'(details) => void'}</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Value change callback</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== TOGGLE GROUP ===== */}
          <div class="doc-page" id="toggle-group">
            <h2>Toggle Group</h2>
            <p class="doc-desc">Grouped toggles with single or multiple selection.</p>
            <div class="demo-block">
              <div class="demo-preview" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                <ToggleGroup
                  value={this.toggleVal}
                  items={[
                    { value: 'bold', label: 'B' },
                    { value: 'italic', label: 'I' },
                    { value: 'underline', label: 'U' },
                  ]}
                  multiple
                  onValueChange={(d: any) => {
                    this.toggleVal = d.value
                  }}
                />
                <p style={{ width: '100%', margin: 0, fontSize: '0.875rem', color: '#71717a' }}>
                  Value: <code>{this.toggleVal.join(', ') || '(none)'}</code>
                </p>
              </div>
              <div class="demo-code">{`<ToggleGroup
  multiple
  items={[
    { value: 'bold', label: 'B' },
    { value: 'italic', label: 'I' },
    { value: 'underline', label: 'U' },
  ]}
/>`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">items</td>
                  <td class="prop-type">
                    <code>{'{ value, label }[]'}</code>
                  </td>
                  <td class="prop-default">[]</td>
                  <td>Toggle options</td>
                </tr>
                <tr>
                  <td class="prop-name">multiple</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">false</td>
                  <td>Allow multi-select</td>
                </tr>
                <tr>
                  <td class="prop-name">defaultValue</td>
                  <td class="prop-type">
                    <code>string[]</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Initially pressed values</td>
                </tr>
                <tr>
                  <td class="prop-name">onValueChange</td>
                  <td class="prop-type">
                    <code>{'(details) => void'}</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Selection change callback</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== FILE UPLOAD ===== */}
          <div class="doc-page" id="file-upload">
            <h2>File Upload</h2>
            <p class="doc-desc">Drag-and-drop or click-to-browse file uploader.</p>
            <div class="demo-block">
              <div class="demo-preview" style={{ width: '100%' }}>
                <FileUpload maxFiles={3} multiple />
              </div>
              <div class="demo-code">{`<FileUpload maxFiles={3} multiple />`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">accept</td>
                  <td class="prop-type">
                    <code>Record&lt;string, string[]&gt;</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Accepted file types</td>
                </tr>
                <tr>
                  <td class="prop-name">maxFiles</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Maximum file count</td>
                </tr>
                <tr>
                  <td class="prop-name">maxFileSize</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Max file size in bytes</td>
                </tr>
                <tr>
                  <td class="prop-name">multiple</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">false</td>
                  <td>Allow multiple files</td>
                </tr>
                <tr>
                  <td class="prop-name">onFileChange</td>
                  <td class="prop-type">
                    <code>{'(details) => void'}</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>File change callback</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== CLIPBOARD ===== */}
          <div class="doc-page" id="clipboard">
            <h2>Clipboard</h2>
            <p class="doc-desc">Copy text to clipboard with visual confirmation.</p>
            <div class="demo-block">
              <div class="demo-preview" style={{ width: '100%' }}>
                <Clipboard value="npm install @geajs/ui" />
              </div>
              <div class="demo-code">{`<Clipboard value="npm install @geajs/ui" />`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">value</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Text to copy</td>
                </tr>
                <tr>
                  <td class="prop-name">label</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Label text</td>
                </tr>
                <tr>
                  <td class="prop-name">timeout</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td class="prop-default">2000</td>
                  <td>Copied indicator duration (ms)</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== TABS ===== */}
          <div class="doc-page" id="tabs">
            <h2>Tabs</h2>
            <p class="doc-desc">Organize content into switchable panels with keyboard arrow navigation.</p>
            <div class="demo-block">
              <div class="demo-preview" style={{ width: '100%', flexWrap: 'wrap' }}>
                <Tabs
                  value={this.tabsVal}
                  items={[
                    { value: 'account', label: 'Account', content: 'Manage your account settings.' },
                    { value: 'password', label: 'Password', content: 'Change your password.' },
                  ]}
                  onValueChange={(d: any) => {
                    this.tabsVal = d.value
                  }}
                />
                <p style={{ width: '100%', margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#71717a' }}>
                  Value: <code>{this.tabsVal}</code>
                </p>
              </div>
              <div class="demo-code">{`<Tabs
  defaultValue="account"
  items={[
    { value: 'account', label: 'Account', content: 'Manage your account settings.' },
    { value: 'password', label: 'Password', content: 'Change your password.' },
  ]}
/>`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">items</td>
                  <td class="prop-type">
                    <code>{'{ value, label, content }[]'}</code>
                  </td>
                  <td class="prop-default">[]</td>
                  <td>Tab definitions</td>
                </tr>
                <tr>
                  <td class="prop-name">value</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Controlled active tab</td>
                </tr>
                <tr>
                  <td class="prop-name">defaultValue</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Initially active tab</td>
                </tr>
                <tr>
                  <td class="prop-name">orientation</td>
                  <td class="prop-type">
                    <code>'horizontal' | 'vertical'</code>
                  </td>
                  <td class="prop-default">'horizontal'</td>
                  <td>Tab list direction</td>
                </tr>
                <tr>
                  <td class="prop-name">activationMode</td>
                  <td class="prop-type">
                    <code>'automatic' | 'manual'</code>
                  </td>
                  <td class="prop-default">'automatic'</td>
                  <td>When tabs activate</td>
                </tr>
                <tr>
                  <td class="prop-name">onValueChange</td>
                  <td class="prop-type">
                    <code>{'(details) => void'}</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Tab change callback</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== PAGINATION ===== */}
          <div class="doc-page" id="pagination">
            <h2>Pagination</h2>
            <p class="doc-desc">Navigate through paged data.</p>
            <div class="demo-block">
              <div class="demo-preview" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                <Pagination
                  count={100}
                  pageSize={10}
                  page={this.pageVal}
                  onPageChange={(d: any) => {
                    this.pageVal = d.page
                  }}
                />
                <p style={{ width: '100%', margin: 0, fontSize: '0.875rem', color: '#71717a' }}>
                  Page: <code>{this.pageVal}</code>
                </p>
              </div>
              <div class="demo-code">{`<Pagination count={100} defaultPageSize={10} />`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">count</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td class="prop-default">0</td>
                  <td>Total item count</td>
                </tr>
                <tr>
                  <td class="prop-name">pageSize</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td class="prop-default">10</td>
                  <td>Items per page</td>
                </tr>
                <tr>
                  <td class="prop-name">page</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Controlled current page</td>
                </tr>
                <tr>
                  <td class="prop-name">defaultPage</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td class="prop-default">1</td>
                  <td>Initial page</td>
                </tr>
                <tr>
                  <td class="prop-name">onPageChange</td>
                  <td class="prop-type">
                    <code>{'(details) => void'}</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Page change callback</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== DIALOG ===== */}
          <div class="doc-page" id="dialog">
            <h2>Dialog</h2>
            <p class="doc-desc">
              Modal overlay with focus trap, scroll lock, backdrop click to close, and Escape key support.
            </p>
            <div class="demo-block">
              <div class="demo-preview">
                <Dialog title="Confirm Delete" description="This cannot be undone." triggerLabel="Open Dialog">
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <button
                      class="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 rounded-md px-3 text-xs"
                      type="button"
                      data-part="close-trigger"
                      click={() => (this.dialogAction = 'Cancel clicked')}
                    >
                      Cancel
                    </button>
                    <button
                      class="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 h-8 rounded-md px-3 text-xs"
                      type="button"
                      data-part="close-trigger"
                      click={() => (this.dialogAction = 'Delete clicked')}
                    >
                      Delete
                    </button>
                  </div>
                </Dialog>
                <p style={{ fontSize: '0.875rem', color: 'hsl(var(--muted-foreground))', marginTop: '0.75rem' }}>
                  Last action: <strong>{this.dialogAction}</strong>
                </p>
              </div>
              <div class="demo-code">{`<Dialog
  title="Confirm Delete"
  description="This cannot be undone."
  triggerLabel="Open Dialog"
>
  <button data-part="close-trigger"
    click={() => (this.dialogAction = 'Cancel clicked')}>
    Cancel
  </button>
  <button data-part="close-trigger"
    click={() => (this.dialogAction = 'Delete clicked')}>
    Delete
  </button>
</Dialog>
<p>Last action: {this.dialogAction}</p>`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">title</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Dialog title</td>
                </tr>
                <tr>
                  <td class="prop-name">description</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Dialog description</td>
                </tr>
                <tr>
                  <td class="prop-name">triggerLabel</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">'Open'</td>
                  <td>Trigger button text</td>
                </tr>
                <tr>
                  <td class="prop-name">open</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Controlled open state</td>
                </tr>
                <tr>
                  <td class="prop-name">modal</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">true</td>
                  <td>Trap focus and lock scroll</td>
                </tr>
                <tr>
                  <td class="prop-name">closeOnEscape</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">true</td>
                  <td>Close on Escape key</td>
                </tr>
                <tr>
                  <td class="prop-name">closeOnInteractOutside</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">true</td>
                  <td>Close on backdrop click</td>
                </tr>
                <tr>
                  <td class="prop-name">role</td>
                  <td class="prop-type">
                    <code>'dialog' | 'alertdialog'</code>
                  </td>
                  <td class="prop-default">'dialog'</td>
                  <td>ARIA role</td>
                </tr>
                <tr>
                  <td class="prop-name">onOpenChange</td>
                  <td class="prop-type">
                    <code>{'(details) => void'}</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Open state change callback</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== MENU ===== */}
          <div class="doc-page" id="menu">
            <h2>Menu</h2>
            <p class="doc-desc">Dropdown menu with arrow key navigation, typeahead, and item separators.</p>
            <div class="demo-block">
              <div class="demo-preview">
                <Menu
                  triggerLabel="Actions"
                  items={[
                    { value: 'edit', label: 'Edit' },
                    { value: 'copy', label: 'Copy' },
                    { type: 'separator' },
                    { value: 'delete', label: 'Delete' },
                  ]}
                />
              </div>
              <div class="demo-code">{`<Menu
  triggerLabel="Actions"
  items={[
    { value: 'edit', label: 'Edit' },
    { value: 'copy', label: 'Copy' },
    { type: 'separator' },
    { value: 'delete', label: 'Delete' },
  ]}
/>`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">items</td>
                  <td class="prop-type">
                    <code>{'{ value, label } | { type: "separator" }'}[]</code>
                  </td>
                  <td class="prop-default">[]</td>
                  <td>Menu items</td>
                </tr>
                <tr>
                  <td class="prop-name">triggerLabel</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">'Menu'</td>
                  <td>Trigger text</td>
                </tr>
                <tr>
                  <td class="prop-name">closeOnSelect</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">true</td>
                  <td>Close after item click</td>
                </tr>
                <tr>
                  <td class="prop-name">onSelect</td>
                  <td class="prop-type">
                    <code>{'(details) => void'}</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Item selection callback</td>
                </tr>
                <tr>
                  <td class="prop-name">onOpenChange</td>
                  <td class="prop-type">
                    <code>{'(details) => void'}</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Open state change callback</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== POPOVER ===== */}
          <div class="doc-page" id="popover">
            <h2>Popover</h2>
            <p class="doc-desc">Floating panel anchored to a trigger element.</p>
            <div class="demo-block">
              <div class="demo-preview">
                <Popover triggerLabel="Settings" title="Dimensions" description="Set layer dimensions.">
                  <p style={{ fontSize: '0.875rem' }}>Width: 100% / Height: auto</p>
                </Popover>
              </div>
              <div class="demo-code">{`<Popover
  triggerLabel="Settings"
  title="Dimensions"
  description="Set layer dimensions."
>
  <p>Width: 100% / Height: auto</p>
</Popover>`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">title</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Popover title</td>
                </tr>
                <tr>
                  <td class="prop-name">description</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Popover description</td>
                </tr>
                <tr>
                  <td class="prop-name">triggerLabel</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">'Open'</td>
                  <td>Trigger text</td>
                </tr>
                <tr>
                  <td class="prop-name">modal</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">false</td>
                  <td>Modal mode</td>
                </tr>
                <tr>
                  <td class="prop-name">onOpenChange</td>
                  <td class="prop-type">
                    <code>{'(details) => void'}</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Open state callback</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== TOOLTIP ===== */}
          <div class="doc-page" id="tooltip">
            <h2>Tooltip</h2>
            <p class="doc-desc">Contextual info popup on hover/focus.</p>
            <div class="demo-block">
              <div class="demo-preview">
                <Tooltip content="Add to library">
                  <Button variant="outline">Hover me</Button>
                </Tooltip>
              </div>
              <div class="demo-code">{`<Tooltip content="Add to library">
  <Button variant="outline">Hover me</Button>
</Tooltip>`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">content</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Tooltip text</td>
                </tr>
                <tr>
                  <td class="prop-name">openDelay</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td class="prop-default">400</td>
                  <td>Delay before showing (ms)</td>
                </tr>
                <tr>
                  <td class="prop-name">closeDelay</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td class="prop-default">150</td>
                  <td>Delay before hiding (ms)</td>
                </tr>
                <tr>
                  <td class="prop-name">interactive</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">false</td>
                  <td>Allow hovering on tooltip content</td>
                </tr>
                <tr>
                  <td class="prop-name">disabled</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">false</td>
                  <td>Disable tooltip</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== HOVER CARD ===== */}
          <div class="doc-page" id="hover-card">
            <h2>Hover Card</h2>
            <p class="doc-desc">Rich content preview that appears on hover.</p>
            <div class="demo-block">
              <div class="demo-preview">
                <HoverCard triggerLabel="@geajs">
                  <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>Gea Framework</p>
                  <p style={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))' }}>
                    Lightweight, reactive UI framework.
                  </p>
                </HoverCard>
              </div>
              <div class="demo-code">{`<HoverCard triggerLabel="@geajs">
  <p>Gea Framework</p>
  <p>Lightweight, reactive UI framework.</p>
</HoverCard>`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">triggerLabel</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">'Hover me'</td>
                  <td>Trigger text</td>
                </tr>
                <tr>
                  <td class="prop-name">href</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">'#'</td>
                  <td>Trigger link URL</td>
                </tr>
                <tr>
                  <td class="prop-name">openDelay</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Open delay (ms)</td>
                </tr>
                <tr>
                  <td class="prop-name">closeDelay</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Close delay (ms)</td>
                </tr>
                <tr>
                  <td class="prop-name">children</td>
                  <td class="prop-type">
                    <code>any</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Card content</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== ACCORDION ===== */}
          <div class="doc-page" id="accordion">
            <h2>Accordion</h2>
            <p class="doc-desc">Expandable content sections. Supports single or multiple open panels.</p>
            <div class="demo-block">
              <div class="demo-preview" style={{ width: '100%' }}>
                <Accordion
                  collapsible
                  items={[
                    { value: 'a', label: 'Is it accessible?', content: 'Yes, full ARIA and keyboard support.' },
                    { value: 'b', label: 'Can multiple be open?', content: 'Yes, set multiple={true}.' },
                  ]}
                />
              </div>
              <div class="demo-code">{`<Accordion
  collapsible
  items={[
    { value: 'a', label: 'Is it accessible?', content: 'Yes, full ARIA and keyboard support.' },
    { value: 'b', label: 'Can multiple be open?', content: 'Yes, set multiple={true}.' },
  ]}
/>`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">items</td>
                  <td class="prop-type">
                    <code>{'{ value, label, content }[]'}</code>
                  </td>
                  <td class="prop-default">[]</td>
                  <td>Sections</td>
                </tr>
                <tr>
                  <td class="prop-name">multiple</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">false</td>
                  <td>Multiple open panels</td>
                </tr>
                <tr>
                  <td class="prop-name">collapsible</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">false</td>
                  <td>Allow all panels to close</td>
                </tr>
                <tr>
                  <td class="prop-name">defaultValue</td>
                  <td class="prop-type">
                    <code>string[]</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Initially expanded panels</td>
                </tr>
                <tr>
                  <td class="prop-name">orientation</td>
                  <td class="prop-type">
                    <code>'horizontal' | 'vertical'</code>
                  </td>
                  <td class="prop-default">'vertical'</td>
                  <td>Layout direction</td>
                </tr>
                <tr>
                  <td class="prop-name">onValueChange</td>
                  <td class="prop-type">
                    <code>{'(details) => void'}</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Expansion change callback</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== COLLAPSIBLE ===== */}
          <div class="doc-page" id="collapsible">
            <h2>Collapsible</h2>
            <p class="doc-desc">Single expandable/collapsible section.</p>
            <div class="demo-block">
              <div class="demo-preview" style={{ width: '100%' }}>
                <Collapsible label="Show Details">
                  <p style={{ fontSize: '0.875rem', padding: '0.5rem 0' }}>These are the hidden details.</p>
                </Collapsible>
              </div>
              <div class="demo-code">{`<Collapsible label="Show Details">
  <p>These are the hidden details.</p>
</Collapsible>`}</div>
            </div>
            <h3>API</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">label</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td class="prop-default">'Toggle'</td>
                  <td>Trigger button text</td>
                </tr>
                <tr>
                  <td class="prop-name">open</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Controlled open state</td>
                </tr>
                <tr>
                  <td class="prop-name">defaultOpen</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">false</td>
                  <td>Initially open</td>
                </tr>
                <tr>
                  <td class="prop-name">disabled</td>
                  <td class="prop-type">
                    <code>boolean</code>
                  </td>
                  <td class="prop-default">false</td>
                  <td>Disable toggle</td>
                </tr>
                <tr>
                  <td class="prop-name">onOpenChange</td>
                  <td class="prop-type">
                    <code>{'(details) => void'}</code>
                  </td>
                  <td class="prop-default">—</td>
                  <td>Open state callback</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== TOAST ===== */}
          <div class="doc-page" id="toast">
            <h2>Toast</h2>
            <p class="doc-desc">
              Temporary notification messages. Place a single {'<Toaster />'} at your app root and use ToastStore
              methods to trigger.
            </p>
            <div class="demo-block">
              <div class="demo-preview">
                <Button size="sm" click={() => ToastStore.success({ title: 'Saved!', description: 'Changes saved.' })}>
                  Success
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  click={() => ToastStore.error({ title: 'Error', description: 'Something failed.' })}
                >
                  Error
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  click={() => ToastStore.info({ title: 'Info', description: 'Useful tip.' })}
                >
                  Info
                </Button>
              </div>
              <div class="demo-code">{`import { Toaster, ToastStore } from '@geajs/ui'

// In your template:
<Toaster />

// Trigger from anywhere:
ToastStore.success({ title: 'Saved!', description: 'Done.' })
ToastStore.error({ title: 'Error', description: 'Failed.' })
ToastStore.info({ title: 'Info', description: 'Tip.' })
ToastStore.loading({ title: 'Loading...', description: 'Wait.' })`}</div>
            </div>
            <h3>ToastStore Methods</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">create(options)</td>
                  <td>Create a toast with custom type</td>
                </tr>
                <tr>
                  <td class="prop-name">success(options)</td>
                  <td>Success toast</td>
                </tr>
                <tr>
                  <td class="prop-name">error(options)</td>
                  <td>Error toast</td>
                </tr>
                <tr>
                  <td class="prop-name">info(options)</td>
                  <td>Info toast</td>
                </tr>
                <tr>
                  <td class="prop-name">loading(options)</td>
                  <td>Loading toast</td>
                </tr>
                <tr>
                  <td class="prop-name">dismiss(id?)</td>
                  <td>Dismiss a specific or all toasts</td>
                </tr>
              </tbody>
            </table>
            <h3>Toast Options</h3>
            <table class="prop-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="prop-name">title</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td>Toast title</td>
                </tr>
                <tr>
                  <td class="prop-name">description</td>
                  <td class="prop-type">
                    <code>string</code>
                  </td>
                  <td>Toast description</td>
                </tr>
                <tr>
                  <td class="prop-name">type</td>
                  <td class="prop-type">
                    <code>'success' | 'error' | 'info' | 'loading'</code>
                  </td>
                  <td>Toast type</td>
                </tr>
                <tr>
                  <td class="prop-name">duration</td>
                  <td class="prop-type">
                    <code>number</code>
                  </td>
                  <td>Auto-dismiss duration (ms)</td>
                </tr>
              </tbody>
            </table>
          </div>

          <Separator class="my-8" />

          <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))', padding: '2rem 0' }}>
            gea-ui v0.1.0 — 35 components, fully accessible, keyboard navigable, and screen reader friendly.
          </p>
        </main>
        <Toaster />
      </div>
    )
  }
}
