import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * vitepress-plugin-llms always emits llms.txt / llms-full.txt into VitePress outDir.
 * Move those two files to the parent folder (e.g. website/ next to website/docs/).
 * Per-page *.md copies stay in outDir so URLs under `base` stay correct.
 */
export function moveLlmsTxtToOutDirParent() {
  let outDir: string | undefined
  let isSsrBuild = false
  return {
    name: 'move-llms-txt-to-outdir-parent',
    apply: 'build' as const,
    enforce: 'post' as const,
    configResolved(resolved: { build: { ssr?: boolean }; vitepress?: { outDir?: string } }) {
      outDir = resolved.vitepress?.outDir
      isSsrBuild = Boolean(resolved.build.ssr)
    },
    async closeBundle() {
      if (isSsrBuild || !outDir) return
      const parent = path.dirname(path.resolve(outDir))
      for (const name of ['llms.txt', 'llms-full.txt'] as const) {
        const from = path.join(outDir, name)
        const to = path.join(parent, name)
        try {
          await fs.rename(from, to)
        } catch (e: unknown) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
        }
      }
    },
  }
}
