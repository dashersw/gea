// Per-component subpaths, not the `@geajs/ui` barrel. The barrel eagerly loads
// every component, including NumberInput, whose @zag-js dependency fails to
// resolve its named exports under Node's ESM loader. gea-ui ships one entry per
// component (tsdown.config.ts), so these subpaths are supported and tree-shaken.
import Button from '@geajs/ui/button'
import { Card } from '@geajs/ui/card'
import Checkbox from '@geajs/ui/checkbox'
import Input from '@geajs/ui/input'
import type { ComponentDefinition } from '../types'
import type { BindingContext } from '../binding'
import {
  resolveProps,
  type Catalog,
  type CatalogEntry,
  type PropThunks,
  type WriteFn,
} from '../catalog'
import Text from '../components/text'
import Row from '../components/row'
import Column from '../components/column'

type MapProps = (def: ComponentDefinition, ctx: BindingContext, write: WriteFn | null) => PropThunks

function entry(typeName: string, component: unknown, mapProps: MapProps = resolveProps): CatalogEntry {
  return { typeName, component, mapProps }
}

/** A2UI Button variants are not gea-ui's enum (`primary` is not a member). */
const BUTTON_VARIANTS: Record<string, string> = {
  primary: 'default',
  secondary: 'secondary',
  destructive: 'destructive',
  outline: 'outline',
  ghost: 'ghost',
  link: 'link',
}

/**
 * gea-ui containers render `{props.children}`, whose compiled marker shows up
 * as a literal "0" text node when no `children` thunk is supplied. The
 * interpreter appends real children into `inst.el`, so bind the slot to an
 * empty string to erase the marker. Local containers omit the slot entirely.
 */
const EMPTY_SLOT: MapProps = (def, ctx) => {
  const props = resolveProps(def, ctx)
  props.children = () => ''
  return props
}

/**
 * A2UI prop names do not match @geajs/ui prop names, so each entry owns its
 * translation AND its write-back handler. instantiate.ts decides WHERE a
 * write lands; the entry decides WHICH prop carries it.
 */
export function createBasicCatalog(): Catalog {
  const catalog: Catalog = new Map()

  catalog.set('Text', entry('Text', Text))
  catalog.set('Row', entry('Row', Row))
  catalog.set('Column', entry('Column', Column))
  catalog.set('Card', entry('Card', Card, EMPTY_SLOT))

  catalog.set(
    'Button',
    entry('Button', Button, (def, ctx) => {
      const props = EMPTY_SLOT(def, ctx, null)
      if (props.variant) {
        const source = props.variant
        props.variant = () => BUTTON_VARIANTS[String(source())] ?? 'default'
      }
      return props
    }),
  )

  catalog.set(
    'TextField',
    entry('TextField', Input, (def, ctx, write) => {
      const props = resolveProps(def, ctx)
      // A2UI `label` renders as the Input placeholder; `value` binds through.
      if (props.label) props.placeholder = props.label
      // Input calls `props.onInput?.(e)` with a DOM Event (input.tsx:19).
      if (write) props.onInput = () => (e: Event) => write((e.target as HTMLInputElement).value)
      return props
    }),
  )

  catalog.set(
    'CheckBox',
    entry('CheckBox', Checkbox, (def, ctx, write) => {
      const props = resolveProps(def, ctx)
      // Zag's `value` is the HTML FORM VALUE string (defaults to 'on'), not the
      // checked state (checkbox.tsx:23). A2UI's `value` is the checked state.
      if (props.value) props.checked = props.value
      delete props.value
      // Zag reports changes via onCheckedChange(details) (checkbox.tsx:24).
      if (write) props.onCheckedChange = () => (d: { checked: boolean }) => write(d.checked)
      return props
    }),
  )

  return catalog
}
