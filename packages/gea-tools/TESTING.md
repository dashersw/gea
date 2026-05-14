# Testing the Gea VS Code Extension Locally

The extension now targets the modern Gea JSX API, so testing should focus on JSX files and component signatures.

## Method 1: Extension Development Host

1. Open `packages/gea-tools` in VS Code or Cursor.
2. Run `npm run compile`.
3. Press `F5` to open an Extension Development Host window.
4. In the host window, open this repository and test against files in:
   - `examples/todo/`
   - `examples/flight-checkin/`

## Method 2: Package and Install

1. Install `vsce` if needed:

```bash
npm install -g @vscode/vsce
```

2. Package the extension:

```bash
cd packages/gea-tools
vsce package
```

3. Install the generated VSIX in VS Code.

## Testing Checklist

- [ ] The extension activates in `.js`, `.ts`, `.jsx`, and `.tsx` files.
- [ ] Typing `<Todo` suggests local components like `TodoItem`, `TodoInput`, and `TodoFilters`.
- [ ] Typing inside `<TodoItem ...>` suggests props from `template({ todo, onToggle, onRemove })`.
- [ ] Typing inside `<TodoFilters ...>` suggests props from function component parameters.
- [ ] Typing inside `<PaymentForm ...>` suggests props discovered from `const { ... } = props`.
- [ ] Event attribute completion suggests `click`, `input`, `change`, `keydown`, `blur`, and `submit`.
- [ ] Hovering `TodoItem` shows component details and discovered props.
- [ ] Go to Definition on an imported JSX component jumps to its declaration.
- [ ] Quick Fix on an unknown JSX component adds the correct relative default import.
- [ ] Quick Fix does not add a duplicate import if the component is already imported.
- [ ] Quick Fix does not appear for HTML tags or built-in Gea Mobile tags.
- [ ] Hovering an event attribute like `click` shows event help.
- [ ] Unknown component diagnostics appear for invalid JSX component tags.
- [ ] Imported components used as JSX tags do not show noisy unused-import diagnostics.
- [ ] Non-standard Gea JSX attributes such as `class` and `click` do not produce distracting TypeScript JSX noise in component bodies.

## Recommended Manual Test Cases

### Class component props

Use `examples/todo/components/TodoItem.jsx`:

```jsx
export default class TodoItem extends Component {
  template({ todo, onToggle, onRemove }) {
    return <li />
  }
}
```

Confirm `<TodoItem ...>` offers `todo`, `onToggle`, and `onRemove`.

### Function component props

Use `examples/todo/components/TodoFilters.jsx`:

```jsx
export default function TodoFilters({ filter, activeCount, completedCount, onFilter }) {
  return <div />
}
```

Confirm `<TodoFilters ...>` offers `filter`, `activeCount`, `completedCount`, and `onFilter`.

### `props` destructuring in body

Use `examples/flight-checkin/src/components/PaymentForm.jsx`:

```jsx
export default function PaymentForm(props) {
  const { passengerName, cardNumber, expiry, totalPrice, onPay } = props
  return <div />
}
```

Confirm `<PaymentForm ...>` offers those props.

### Go to Definition

Use a file that imports `TodoItem` and renders `<TodoItem ... />`.

- Place the cursor on `TodoItem` in JSX.
- Trigger Go to Definition.
- Confirm the editor jumps to the `TodoItem` component declaration.

### Auto import Quick Fix

Temporarily remove the `TodoItem` import from a file that renders `<TodoItem ... />`.

- Confirm the extension shows `Unknown component: TodoItem`.
- Trigger Quick Fix on the diagnostic.
- Confirm the correct `import TodoItem from '...'` line is inserted.
- Trigger Quick Fix again and confirm no duplicate import is created.
- Repeat with built-in tags such as `<view />` and confirm no import Quick Fix is offered.

## Troubleshooting

### Extension does not load

- Check the Debug Console for extension activation errors.
- Re-run `npm run compile`.
- Verify `package.json` is valid.

### Completions do not appear

- Make sure the file is being treated as JS/JSX or TS/TSX.
- Confirm the component is imported with a default import.
- Reload the Extension Development Host window.

### TypeScript diagnostics still look noisy

- Open the TypeScript output panel to confirm the plugin loaded.
- Reload the editor window after rebuilding the extension.
