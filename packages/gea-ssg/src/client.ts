/// <reference lib="dom" />
/**
 * Lightweight browser-only module.
 * vite-plugin aliases `@geajs/ssg` to this file for client builds.
 * Reads content from `window.__SSG_CONTENT__` injected by the SSG build.
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
 * Scans for elements with `data-gea` attributes and attaches
 * component instances to existing DOM without re-rendering.
 */
export function hydrate(components: Record<string, new (props?: any) => any>): boolean {
  const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-gea]'))
  if (!elements.length) return false

  const cm = ComponentManager.getInstance()
  const originalGetUid = cm.getUid

  for (const el of elements) {
    const className = el.getAttribute('data-gea')
    if (!className) continue

    const Ctor = components[className]
    if (!Ctor) {
      console.warn(`[gea-ssg] hydrate: "${className}" not found in component map`)
      continue
    }

    cm.getUid = () => el.id

    try {
      const instance = new Ctor()
      instance.render()
    } catch (e) {
      console.error(`[gea-ssg] hydrate failed for "${className}":`, e)
    }
  }

  cm.getUid = originalGetUid
  return true
}
