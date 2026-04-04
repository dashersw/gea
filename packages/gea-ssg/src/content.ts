import type { ContentFile } from './types'
export type { ContentFile } from './types'

const cache = new Map<string, ContentFile[]>()

/**
 * Load markdown files from immediate subdirectories of `rootDir`.
 * Each subdirectory becomes a content collection accessible via `ssg.content(name)`.
 * Markdown is parsed with `gray-matter` (frontmatter) and `marked` (HTML).
 *
 * Note: only one level of subdirectories is scanned — nested subdirectories
 * within a collection are not traversed.
 */
export async function preloadContent(rootDir: string): Promise<void> {
  const { readdir, readFile } = await import('node:fs/promises')
  const { join, basename, extname } = await import('node:path')
  const matter = (await import('gray-matter')).default
  const { marked } = await import('marked')

  cache.clear()

  const entries = await readdir(rootDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const subdir = entry.name
    const dirPath = join(rootDir, subdir)
    const files = (await readdir(dirPath)).filter((f) => f.endsWith('.md')).sort()

    const items: ContentFile[] = []
    for (const file of files) {
      const raw = await readFile(join(dirPath, file), 'utf-8')
      const { data, content } = matter(raw)
      const html = await marked(content.trim())

      for (const [key, value] of Object.entries(data)) {
        if (value instanceof Date) {
          data[key] = value.toISOString()
        }
      }

      items.push({
        slug: basename(file, extname(file)),
        frontmatter: data,
        content: content.trim(),
        html,
      })
    }

    cache.set(subdir, items)
  }
}

/** Clear the in-memory content cache (called automatically after SSG generation). */
export function clearContentCache(): void {
  cache.clear()
}

/** Serialize the full content cache including raw markdown `content` field. */
export function serializeContentCache(): string {
  const obj: Record<string, ContentFile[]> = {}
  for (const [key, value] of cache) {
    obj[key] = value
  }
  return JSON.stringify(obj)
}

/** Serialize for client bundle — strips raw markdown `content` field to reduce payload */
export function serializeContentCacheForClient(): string {
  const obj: Record<string, Omit<ContentFile, 'content'>[]> = {}
  for (const [key, value] of cache) {
    obj[key] = value.map(({ content: _content, ...rest }) => rest)
  }
  return JSON.stringify(obj)
}

/** Return all slugs in a content subdirectory (used for dynamic route generation). */
export function getContentSlugs(subdir: string): string[] {
  return (cache.get(subdir) || []).map((f) => f.slug)
}

export const ssg = {
  content<T = Record<string, any>>(
    subdir: string,
    options?: { sort?: (a: ContentFile<T>, b: ContentFile<T>) => number },
  ): ContentFile<T>[] {
    const g = globalThis as any
    if (g.__SSG_CONTENT__) {
      const items = [...(g.__SSG_CONTENT__[subdir] || [])] as ContentFile<T>[]
      if (options?.sort) items.sort(options.sort)
      return items
    }

    const items = [...(cache.get(subdir) || [])] as ContentFile<T>[]
    if (options?.sort) items.sort(options.sort)
    return items
  },

  file<T = Record<string, any>>(subdir: string, slug: string): ContentFile<T> | null {
    const g = globalThis as any
    if (g.__SSG_CONTENT__) {
      const items = (g.__SSG_CONTENT__[subdir] || []) as ContentFile<T>[]
      return items.find((f) => f.slug === slug) || null
    }

    const items = (cache.get(subdir) || []) as ContentFile<T>[]
    return items.find((f) => f.slug === slug) || null
  },
}
