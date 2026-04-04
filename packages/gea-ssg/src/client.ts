/// <reference lib="dom" />
/**
 * Lightweight browser-only module.
 * vite-plugin aliases `@geajs/ssg` to this file for client builds.
 * Reads content from `window.__SSG_CONTENT__` injected by the SSG build.
 *
 * In MPA/hydrate mode, `__SSG_CONTENT__` is NOT available because
 * no global `content.js` is generated — content is baked into the SSG HTML
 * at build time.  `ssg.content()` / `ssg.file()` will return empty results
 * in that mode; use them only on pages that ship JS **without** hydrate,
 * or access content data through the pre-rendered HTML.
 */
import { ComponentManager } from '@geajs/core'
import type { ContentFile } from './types'
export type { ContentFile } from './types'

function getData(): Record<string, ContentFile[]> {
  const g = globalThis as any
  if (g.__SSG_CONTENT__) {
    return g.__SSG_CONTENT__
  }
  return {}
}

/** Query loaded content files by subdirectory. */
export const ssg = {
  content<T = Record<string, any>>(
    subdir: string,
    options?: { sort?: (a: ContentFile<T>, b: ContentFile<T>) => number },
  ): ContentFile<T>[] {
    const items = [...(getData()[subdir] || [])] as ContentFile<T>[]
    if (options?.sort) items.sort(options.sort)
    return items
  },

  file<T = Record<string, any>>(subdir: string, slug: string): ContentFile<T> | null {
    const items = (getData()[subdir] || []) as ContentFile<T>[]
    return items.find((f) => f.slug === slug) || null
  },
}

/**
 * Hydrate interactive components on SSG-rendered pages.
 *
 * Scans for elements with `data-gea` attributes and attaches
 * component instances to existing DOM without re-rendering.
 * Props serialised at build time (via `data-gea-props`) are
 * passed to the component constructor so stateful components
 * initialise with the correct values.
 *
 * @returns `true` if at least one component was hydrated, `false` otherwise.
 */
export function hydrate(components: Record<string, new (props?: any) => any>): boolean {
  const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-gea]'))
  if (!elements.length) return false

  const cm = ComponentManager.getInstance()
  const originalGetUid = cm.getUid
  let hydrated = 0

  for (const el of elements) {
    const className = el.getAttribute('data-gea')
    if (!className) continue

    const Ctor = components[className]
    if (!Ctor) {
      console.warn(`[gea-ssg] hydrate: "${className}" not found in component map`)
      continue
    }

    // Parse serialised props (if present)
    let props: Record<string, any> | undefined
    const propsJson = el.getAttribute('data-gea-props')
    if (propsJson) {
      try {
        props = JSON.parse(propsJson)
      } catch {
        console.warn(`[gea-ssg] hydrate: invalid props JSON for "${className}"`)
      }
    }

    // One-shot UID override: only the root component receives the SSG id.
    // Any child components created during the constructor get fresh ids
    // from the original generator — preventing duplicate-id collisions.
    let idConsumed = false
    cm.getUid = () => {
      if (!idConsumed) {
        idConsumed = true
        return el.id
      }
      return originalGetUid()
    }

    try {
      const instance = new Ctor(props)
      instance.render()
      hydrated++
    } catch (e) {
      console.error(`[gea-ssg] hydrate failed for "${className}":`, e)
    }
  }

  cm.getUid = originalGetUid
  return hydrated > 0
}
