/**
 * Node module hooks that compile Gea `.tsx` leaves for `node:test`.
 *
 * `tsx` transpiles JSX but never runs the Gea compiler, so an uncompiled
 * `Component` subclass mounts to nothing (`inst.el === null`). At build time
 * `geaPlugin()` rewrites each class into a `CompiledComponent` with a
 * `GEA_CREATE_TEMPLATE` method; tests need the same transform.
 *
 * `geaPlugin().transform` is synchronous, so the synchronous `registerHooks`
 * API is enough — no off-thread loader required.
 *
 * The compiled output imports `virtual:gea-compiler-runtime`, a specifier only
 * Vite resolves. The resolve hook maps it onto the real module.
 */
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { transformSync } from 'esbuild'
import { geaPlugin } from '../../vite-plugin-gea/src/index'

const plugin = geaPlugin() as {
  transform?: unknown
}
const rawTransform = plugin.transform as
  | ((code: string, id: string) => { code: string } | string | null | undefined)
  | { handler: (code: string, id: string) => { code: string } | string | null | undefined }
const transform = typeof rawTransform === 'function' ? rawTransform : rawTransform.handler

const HERE = dirname(fileURLToPath(import.meta.url))

const VIRTUAL_MODULES: Record<string, string> = {
  'virtual:gea-compiler-runtime': pathToFileURL(
    resolve(HERE, '../../gea/src/compiler-runtime.ts'),
  ).href,
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const mapped = VIRTUAL_MODULES[specifier]
    if (mapped) return { url: mapped, format: 'module', shortCircuit: true }
    return nextResolve(specifier, context)
  },

  load(url, context, nextLoad) {
    if (!url.startsWith('file:') || !url.endsWith('.tsx')) return nextLoad(url, context)

    const path = fileURLToPath(url)
    const source = readFileSync(path, 'utf8')
    const transformed = transform.call({} as never, source, path)
    const compiled =
      transformed == null
        ? source
        : typeof transformed === 'string'
          ? transformed
          : transformed.code

    const { code } = transformSync(compiled, {
      loader: 'tsx',
      format: 'esm',
      target: 'esnext',
      sourcefile: path,
    })

    return { format: 'module', shortCircuit: true, source: code }
  },
})
