// Prop thunks with JSX in them dispose the nodes a read of them built once no
// slot shows them (see `reactiveText`). A read made while `created()` runs is
// kept instead, until the parent is disposed: user code there keeps `children`
// to show later, like the panes of tabs. Compiled code reads this depth
// through a global, so it and the runtime needn't come from one version.
const JSX_CREATING = Symbol.for('gea.jsx.creating')

/** Calls `component.created(props)`, keeping the prop reads it makes. */
export function runCreated(component: { created(props?: any): void }, props: unknown): void {
  const g = globalThis as any
  const depth = typeof g[JSX_CREATING] === 'number' ? g[JSX_CREATING] : 0
  g[JSX_CREATING] = depth + 1
  try {
    component.created(props)
  } finally {
    g[JSX_CREATING] = depth
  }
}
