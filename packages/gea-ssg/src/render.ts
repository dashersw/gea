import { resetUidCounter, Component, ComponentManager } from '@geajs/core'

export interface RenderOptions {
  seed?: number
  /** Component class names to track and mark with data-gea attributes */
  hydrate?: string[]
  onRenderError?: (error: Error) => void
}

/**
 * Render a Gea component tree to an HTML string for SSG output.
 *
 * When `hydrate` is provided, components whose class name matches the list
 * are tracked during instantiation.  Their root elements receive `data-gea`
 * and (if applicable) `data-gea-props` attributes so the client-side
 * `hydrate()` function can reattach JS behaviour without re-rendering.
 */
export interface RenderResult {
  html: string
  /** `true` when at least one component was marked with `data-gea` for client hydration. */
  hasHydrationMarkers: boolean
}

export function renderToString(
  ComponentClass: new (props?: any) => any,
  props?: Record<string, any>,
  options: RenderOptions = {},
): RenderResult {
  const { seed = 0, hydrate = [], onRenderError } = options

  resetUidCounter(seed)
  Component._ssgMode = true

  const cm = ComponentManager.getInstance()
  const tracked: Array<{ id: string; className: string; props?: Record<string, any> }> = []

  // Save original so we can always restore it — never rely on prototype-chain
  // delete tricks which break if ComponentManager defines an own-property later.
  const originalSetComponent = cm.setComponent

  if (hydrate.length) {
    ;(cm as any).setComponent = function (comp: any) {
      originalSetComponent.call(cm, comp)
      if (hydrate.includes(comp.constructor.name)) {
        const entry: { id: string; className: string; props?: Record<string, any> } = {
          id: comp.id,
          className: comp.constructor.name,
        }
        // Capture JSON-serialisable props for client-side reconstruction.
        // Warn on silent data loss (Date→string, undefined→dropped, etc.)
        if (comp.props && typeof comp.props === 'object' && Object.keys(comp.props).length) {
          try {
            const serialized = JSON.stringify(comp.props)
            const roundTripped = JSON.parse(serialized)
            // Detect lossy conversion: keys that changed type or disappeared
            for (const key of Object.keys(comp.props)) {
              const orig = comp.props[key]
              const rt = roundTripped[key]
              if (orig !== undefined && rt === undefined) {
                console.warn(
                  `[gea-ssg] hydrate: prop "${key}" on ${comp.constructor.name} was dropped during serialization (functions/symbols are not serialisable).`,
                )
              } else if (orig instanceof Date && typeof rt === 'string') {
                console.warn(
                  `[gea-ssg] hydrate: prop "${key}" on ${comp.constructor.name} is a Date — it will become a string on the client.`,
                )
              }
            }
            entry.props = roundTripped
          } catch {
            console.warn(
              `[gea-ssg] hydrate: props on ${comp.constructor.name} are not JSON-serialisable — skipping prop transfer.`,
            )
          }
        }
        tracked.push(entry)
      }
    }
  }

  let instance: any = null

  try {
    instance = new ComponentClass(props)
    let html = String(instance.template(instance.props)).trim()

    for (const { id, className, props: cProps } of tracked) {
      const propsAttr = cProps ? ` data-gea-props="${escAttr(JSON.stringify(cProps))}"` : ''
      html = html.replace(` id="${id}"`, ` data-gea="${className}"${propsAttr} id="${id}"`)
    }

    return { html, hasHydrationMarkers: tracked.length > 0 }
  } catch (error) {
    if (onRenderError) {
      onRenderError(error as Error)
      return { html: '', hasHydrationMarkers: false }
    }
    throw error
  } finally {
    Component._ssgMode = false
    if (hydrate.length) {
      ;(cm as any).setComponent = originalSetComponent
    }
    if (instance && typeof instance.dispose === 'function') {
      try {
        instance.dispose()
      } catch {}
    }
  }
}

function escAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
