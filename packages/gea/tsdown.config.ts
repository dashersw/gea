import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { defineConfig } from 'tsdown'
import { geaPlugin } from '../vite-plugin-gea/src/index'

const esmOpts = {
  plugins: [geaPlugin() as any],
  format: 'esm' as const,
  outDir: 'dist',
  sourcemap: true,
  dts: { build: true },
  target: 'es2022' as const,
  platform: 'browser' as const,
  define: {
    'import.meta.hot': 'undefined',
    'import.meta.url': '""',
  },
  hash: false,
  fixedExtension: true,
}

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
    },
    ...esmOpts,
    clean: true,
  },
  {
    entry: {
      router: 'src/router-subpath.ts',
    },
    ...esmOpts,
    clean: false,
    deps: {
      neverBundle: (id) => /[/\\]src[/\\]index\.ts$/.test(id),
    },
    hooks: {
      async 'build:done'({ chunks }) {
        for (const chunk of chunks) {
          if (chunk.fileName === 'router.mjs' && 'outDir' in chunk && typeof chunk.outDir === 'string') {
            const file = path.join(chunk.outDir, chunk.fileName)
            let code = await readFile(file, 'utf8')
            if (code.includes('./index.ts')) {
              code = code.replace(/\.\/index\.ts/g, './index.mjs')
              await writeFile(file, code)
            }
          }
        }
      },
    },
  },
  {
    entry: {
      gea: 'src/index.ts',
    },
    format: 'iife',
    globalName: 'gea',
    outDir: 'dist',
    clean: false,
    minify: true,
    sourcemap: true,
    target: 'es2022',
    platform: 'browser',
    define: {
      'import.meta.hot': 'undefined',
      'import.meta.url': '""',
    },
    hash: false,
    outputOptions: {
      exports: 'named',
      entryFileNames: '[name].js',
    },
  },
])
