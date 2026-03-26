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
  template() {
    return (
      <div class="showcase">
        <div class="showcase-hero">
          <h1>gea-ui</h1>
          <p>Accessible UI components for Gea, powered by Zag.js and Tailwind CSS.</p>
        </div>

        <div class="showcase-nav">
          <a href="#general">General</a>
          <a href="#data-display">Data Display</a>
          <a href="#data-entry">Data Entry</a>
          <a href="#feedback">Feedback</a>
          <a href="#navigation">Navigation</a>
          <a href="#overlay">Overlay</a>
          <a href="#disclosure">Disclosure</a>
        </div>

        <Separator class="mb-8" />

        {/* ======== GENERAL ======== */}
        <div class="category" id="general">
          <h2 class="category-title">General</h2>
          <p class="category-desc">Basic building blocks for any interface.</p>
          <div class="component-grid">
            <div class="component-card">
              <div class="component-card-header">
                <h3>Button</h3>
                <p>Triggers actions. 6 variants, 4 sizes.</p>
              </div>
              <div class="component-card-body">
                <div class="inline">
                  <Button>Default</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="destructive">Destructive</Button>
                </div>
                <div class="inline">
                  <Button variant="outline">Outline</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="link">Link</Button>
                </div>
                <div class="inline">
                  <Button size="sm">Small</Button>
                  <Button>Default</Button>
                  <Button size="lg">Large</Button>
                  <Button size="icon">+</Button>
                </div>
                <Button disabled>Disabled</Button>
              </div>
            </div>

            <div class="component-card">
              <div class="component-card-header">
                <h3>Badge</h3>
                <p>Status indicator or label. 4 variants.</p>
              </div>
              <div class="component-card-body centered">
                <div class="inline">
                  <Badge>Default</Badge>
                  <Badge variant="secondary">Secondary</Badge>
                  <Badge variant="destructive">Destructive</Badge>
                  <Badge variant="outline">Outline</Badge>
                </div>
              </div>
            </div>

            <div class="component-card">
              <div class="component-card-header">
                <h3>Separator</h3>
                <p>Visual divider between content sections.</p>
              </div>
              <div class="component-card-body">
                <p style={{ fontSize: '0.875rem' }}>Content above</p>
                <Separator />
                <p style={{ fontSize: '0.875rem' }}>Content below</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', height: 24 }}>
                  <span style={{ fontSize: '0.875rem' }}>Left</span>
                  <Separator orientation="vertical" />
                  <span style={{ fontSize: '0.875rem' }}>Right</span>
                </div>
              </div>
            </div>

            <div class="component-card">
              <div class="component-card-header">
                <h3>Skeleton</h3>
                <p>Loading placeholder with pulse animation.</p>
              </div>
              <div class="component-card-body">
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <Skeleton class="h-10 w-10 rounded-full" />
                  <div style={{ flex: 1 }}>
                    <Skeleton class="h-4 w-3/4 mb-1.5" />
                    <Skeleton class="h-3 w-1/2" />
                  </div>
                </div>
                <Skeleton class="h-24 w-full rounded-lg" />
              </div>
            </div>
          </div>
        </div>

        {/* ======== DATA DISPLAY ======== */}
        <div class="category" id="data-display">
          <h2 class="category-title">Data Display</h2>
          <p class="category-desc">Present information clearly and consistently.</p>
          <div class="component-grid">
            <div class="component-card">
              <div class="component-card-header">
                <h3>Card</h3>
                <p>Container with header, content, and footer sections.</p>
              </div>
              <div class="component-card-body">
                <Card>
                  <CardHeader>
                    <CardTitle>Notifications</CardTitle>
                    <CardDescription>You have 3 unread messages.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p style={{ fontSize: '0.875rem' }}>Card body content goes here.</p>
                  </CardContent>
                  <CardFooter>
                    <Button size="sm" variant="outline">
                      View All
                    </Button>
                  </CardFooter>
                </Card>
              </div>
            </div>

            <div class="component-card">
              <div class="component-card-header">
                <h3>Avatar</h3>
                <p>User image with fallback initials.</p>
              </div>
              <div class="component-card-body centered">
                <div class="inline">
                  <Avatar name="Armagan Amcalar" />
                  <Avatar name="John Doe" />
                  <Avatar name="Sofia Davis" />
                  <Avatar name="?" />
                </div>
              </div>
            </div>

            <div class="component-card">
              <div class="component-card-header">
                <h3>Alert</h3>
                <p>Contextual feedback messages.</p>
              </div>
              <div class="component-card-body">
                <Alert>
                  <AlertTitle>Heads up!</AlertTitle>
                  <AlertDescription>You can add components to your app using the CLI.</AlertDescription>
                </Alert>
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>Your session has expired.</AlertDescription>
                </Alert>
              </div>
            </div>

            <div class="component-card">
              <div class="component-card-header">
                <h3>Progress</h3>
                <p>Visual indicator of completion percentage.</p>
              </div>
              <div class="component-card-body">
                <Progress label="Upload" value={33} />
                <Progress label="Processing" value={66} />
                <Progress label="Complete" value={100} />
              </div>
            </div>
          </div>
        </div>

        {/* ======== DATA ENTRY ======== */}
        <div class="category" id="data-entry">
          <h2 class="category-title">Data Entry</h2>
          <p class="category-desc">Form controls and user input components.</p>
          <div class="component-grid">
            <div class="component-card">
              <div class="component-card-header">
                <h3>Input</h3>
                <p>Text input field with label support.</p>
              </div>
              <div class="component-card-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <Label htmlFor="sc-email">Email</Label>
                  <Input inputId="sc-email" type="email" placeholder="you@example.com" />
                </div>
                <Input placeholder="Disabled" disabled />
              </div>
            </div>

            <div class="component-card">
              <div class="component-card-header">
                <h3>Textarea</h3>
                <p>Multi-line text input.</p>
              </div>
              <div class="component-card-body">
                <Textarea placeholder="Write a message..." rows={3} />
              </div>
            </div>

            <div class="component-card">
              <div class="component-card-header">
                <h3>Select</h3>
                <p>Dropdown selection with keyboard navigation.</p>
              </div>
              <div class="component-card-body">
                <Select
                  label="Framework"
                  placeholder="Pick one..."
                  items={[
                    { value: 'gea', label: 'Gea' },
                    { value: 'react', label: 'React' },
                    { value: 'vue', label: 'Vue' },
                    { value: 'solid', label: 'SolidJS' },
                  ]}
                />
              </div>
            </div>

            <div class="component-card">
              <div class="component-card-header">
                <h3>Combobox</h3>
                <p>Searchable select with type-ahead filtering.</p>
              </div>
              <div class="component-card-body">
                <Combobox
                  label="Country"
                  items={[
                    { value: 'us', label: 'United States' },
                    { value: 'uk', label: 'United Kingdom' },
                    { value: 'de', label: 'Germany' },
                    { value: 'fr', label: 'France' },
                    { value: 'jp', label: 'Japan' },
                    { value: 'tr', label: 'Turkey' },
                  ]}
                />
              </div>
            </div>

            <div class="component-card">
              <div class="component-card-header">
                <h3>Switch</h3>
                <p>Boolean toggle control.</p>
              </div>
              <div class="component-card-body centered">
                <Switch label="Airplane Mode" />
                <Switch label="Dark Mode" defaultChecked />
              </div>
            </div>

            <div class="component-card">
              <div class="component-card-header">
                <h3>Checkbox</h3>
                <p>Multi-select form control.</p>
              </div>
              <div class="component-card-body">
                <Checkbox label="Accept terms and conditions" />
                <Checkbox label="Subscribe to newsletter" defaultChecked />
              </div>
            </div>

            <div class="component-card">
              <div class="component-card-header">
                <h3>Radio Group</h3>
                <p>Single selection from a set of options.</p>
              </div>
              <div class="component-card-body">
                <RadioGroup
                  label="Plan"
                  defaultValue="pro"
                  items={[
                    { value: 'free', label: 'Free' },
                    { value: 'pro', label: 'Pro' },
                    { value: 'enterprise', label: 'Enterprise' },
                  ]}
                />
              </div>
            </div>

            <div class="component-card">
              <div class="component-card-header">
                <h3>Slider</h3>
                <p>Range input with thumb control.</p>
              </div>
              <div class="component-card-body">
                <Slider label="Volume" defaultValue={[65]} min={0} max={100} />
              </div>
            </div>

            <div class="component-card">
              <div class="component-card-header">
                <h3>Number Input</h3>
                <p>Numeric input with increment/decrement.</p>
              </div>
              <div class="component-card-body">
                <NumberInput label="Quantity" defaultValue="5" min={0} max={99} />
              </div>
            </div>

            <div class="component-card">
              <div class="component-card-header">
                <h3>Pin Input</h3>
                <p>Segmented code/OTP entry.</p>
              </div>
              <div class="component-card-body centered">
                <PinInput count={4} type="numeric" placeholder="○" />
              </div>
            </div>

            <div class="component-card">
              <div class="component-card-header">
                <h3>Tags Input</h3>
                <p>Add/remove tags with keyboard.</p>
              </div>
              <div class="component-card-body">
                <TagsInput label="Tags" placeholder="Add tag..." defaultValue={['gea', 'ui', 'zag']} />
              </div>
            </div>

            <div class="component-card">
              <div class="component-card-header">
                <h3>Rating Group</h3>
                <p>Star rating selection.</p>
              </div>
              <div class="component-card-body centered">
                <RatingGroup count={5} defaultValue={3} />
              </div>
            </div>

            <div class="component-card">
              <div class="component-card-header">
                <h3>Toggle Group</h3>
                <p>Grouped toggle buttons.</p>
              </div>
              <div class="component-card-body centered">
                <ToggleGroup
                  multiple
                  items={[
                    { value: 'bold', label: 'B' },
                    { value: 'italic', label: 'I' },
                    { value: 'underline', label: 'U' },
                  ]}
                />
              </div>
            </div>

            <div class="component-card">
              <div class="component-card-header">
                <h3>File Upload</h3>
                <p>Drag-and-drop or click to upload files.</p>
              </div>
              <div class="component-card-body">
                <FileUpload maxFiles={3} multiple />
              </div>
            </div>

            <div class="component-card">
              <div class="component-card-header">
                <h3>Clipboard</h3>
                <p>Copy-to-clipboard with visual feedback.</p>
              </div>
              <div class="component-card-body">
                <Clipboard value="npm install @geajs/ui" />
              </div>
            </div>
          </div>
        </div>

        {/* ======== FEEDBACK ======== */}
        <div class="category" id="feedback">
          <h2 class="category-title">Feedback</h2>
          <p class="category-desc">Communicate status and results to users.</p>
          <div class="component-grid">
            <div class="component-card">
              <div class="component-card-header">
                <h3>Toast</h3>
                <p>Temporary notifications that auto-dismiss.</p>
              </div>
              <div class="component-card-body">
                <div class="inline">
                  <Button
                    size="sm"
                    click={() => ToastStore.success({ title: 'Saved!', description: 'Changes saved.' })}
                  >
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
                    click={() => ToastStore.info({ title: 'Tip', description: 'Try keyboard shortcuts.' })}
                  >
                    Info
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ======== NAVIGATION ======== */}
        <div class="category" id="navigation">
          <h2 class="category-title">Navigation</h2>
          <p class="category-desc">Help users move through your application.</p>
          <div class="component-grid">
            <div class="component-card">
              <div class="component-card-header">
                <h3>Tabs</h3>
                <p>Organize content into switchable panels.</p>
              </div>
              <div class="component-card-body">
                <Tabs
                  defaultValue="account"
                  items={[
                    { value: 'account', label: 'Account', content: 'Account settings panel.' },
                    { value: 'password', label: 'Password', content: 'Password settings panel.' },
                    { value: 'team', label: 'Team', content: 'Team management panel.' },
                  ]}
                />
              </div>
            </div>

            <div class="component-card">
              <div class="component-card-header">
                <h3>Pagination</h3>
                <p>Navigate through paged content.</p>
              </div>
              <div class="component-card-body centered">
                <Pagination count={100} defaultPageSize={10} />
              </div>
            </div>
          </div>
        </div>

        {/* ======== OVERLAY ======== */}
        <div class="category" id="overlay">
          <h2 class="category-title">Overlay</h2>
          <p class="category-desc">Floating content layers triggered by user interaction.</p>
          <div class="component-grid">
            <div class="component-card">
              <div class="component-card-header">
                <h3>Dialog</h3>
                <p>Modal window with focus trap and backdrop.</p>
              </div>
              <div class="component-card-body centered">
                <Dialog title="Confirm" description="Are you sure?" triggerLabel="Open Dialog">
                  <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Dialog body here.</p>
                </Dialog>
              </div>
            </div>

            <div class="component-card">
              <div class="component-card-header">
                <h3>Menu</h3>
                <p>Dropdown action menu.</p>
              </div>
              <div class="component-card-body centered">
                <Menu
                  triggerLabel="Open Menu"
                  items={[
                    { value: 'edit', label: 'Edit' },
                    { value: 'copy', label: 'Copy' },
                    { type: 'separator' },
                    { value: 'delete', label: 'Delete' },
                  ]}
                />
              </div>
            </div>

            <div class="component-card">
              <div class="component-card-header">
                <h3>Popover</h3>
                <p>Anchored floating panel.</p>
              </div>
              <div class="component-card-body centered">
                <Popover triggerLabel="Open Popover" title="Settings" description="Panel settings.">
                  <p style={{ fontSize: '0.875rem' }}>Content here.</p>
                </Popover>
              </div>
            </div>

            <div class="component-card">
              <div class="component-card-header">
                <h3>Tooltip</h3>
                <p>Contextual info on hover.</p>
              </div>
              <div class="component-card-body centered">
                <Tooltip content="This is a tooltip">
                  <Button variant="outline">Hover me</Button>
                </Tooltip>
              </div>
            </div>

            <div class="component-card">
              <div class="component-card-header">
                <h3>Hover Card</h3>
                <p>Rich preview on hover.</p>
              </div>
              <div class="component-card-body centered">
                <HoverCard triggerLabel="@geajs">
                  <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>Gea Framework</p>
                  <p style={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))' }}>Reactive UI framework.</p>
                </HoverCard>
              </div>
            </div>
          </div>
        </div>

        {/* ======== DISCLOSURE ======== */}
        <div class="category" id="disclosure">
          <h2 class="category-title">Disclosure</h2>
          <p class="category-desc">Show and hide content sections.</p>
          <div class="component-grid">
            <div class="component-card">
              <div class="component-card-header">
                <h3>Accordion</h3>
                <p>Expandable content sections.</p>
              </div>
              <div class="component-card-body">
                <Accordion
                  collapsible
                  items={[
                    { value: 'a', label: 'What is gea-ui?', content: 'A component library for Gea.' },
                    { value: 'b', label: 'Is it accessible?', content: 'Yes, powered by Zag.js.' },
                  ]}
                />
              </div>
            </div>

            <div class="component-card">
              <div class="component-card-header">
                <h3>Collapsible</h3>
                <p>Single toggle section.</p>
              </div>
              <div class="component-card-body">
                <Collapsible label="Show Details">
                  <p style={{ fontSize: '0.875rem', padding: '0.5rem 0' }}>Hidden content revealed.</p>
                </Collapsible>
              </div>
            </div>
          </div>
        </div>

        <Separator class="my-6" />

        <p class="footer-note">gea-ui — {35} components. Built with Gea, Zag.js, and Tailwind CSS.</p>

        <Toaster />
      </div>
    )
  }
}
