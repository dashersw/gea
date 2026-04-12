import type { Plugin } from 'vite'
import { transformSource } from './transform/index.js'

export interface GeaPluginOptions {
  // Future options
}

/**
 * Vite plugin that transforms JSX/TSX into direct DOM manipulation calls
 * powered by signals.
 */
export { geaPlugin }
export default function geaPlugin(_options?: GeaPluginOptions): Plugin {
  return {
    name: 'gea-plugin',
    enforce: 'pre',

    config() {
      // Resolve gea-ui imports to source files so Vite compiles them fresh
      // with the gea plugin, avoiding stale dist files from the old engine.
      // Navigate from this plugin's location to the gea-ui source directory.
      const pluginDir = new URL('.', import.meta.url).pathname
      // pluginDir is packages/vite-plugin-gea/dist/ — go up to packages/, then into gea-ui/src/components/
      const geaUiSrc = pluginDir + '../../gea-ui/src'

      return {
        resolve: {
          alias: [
            { find: /^@geajs\/ui\/(.*)$/, replacement: geaUiSrc + '/$1' },
          ],
        },
      }
    },

    transform(code: string, id: string) {
      // Transform .ts, .tsx, .js, .jsx files that import from '@geajs/core'
      if (!/\.[jt]sx?$/.test(id)) return null

      // Skip @geajs/core internal source files — they already use the
      // runtime primitives directly via relative imports.
      if (/\/packages\/gea\/src\//.test(id)) return null

      const result = transformSource(code, id)
      if (result === null) return null

      return {
        code: result,
        map: null, // TODO: source maps
      }
    },
  }
}

// Re-export internals for testing
export { transformSource } from './transform/index.js'
export { parse } from './parse.js'
export { codegen } from './codegen.js'
export { analyzeImports, identifyReactiveSources, buildSubstitutionMap, scanDestructuringStatements } from './analyze/index.js'
