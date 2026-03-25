export interface ContentFile<T = Record<string, any>> {
  slug: string
  frontmatter: T
  /** Raw markdown — available during SSR, omitted in client bundle */
  content?: string
  html: string
}

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
