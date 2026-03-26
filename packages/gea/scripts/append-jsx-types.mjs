import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distPath = join(__dirname, '..', 'dist', 'index.d.mts')
const jsxTypesPath = join(__dirname, '..', 'src', 'jsx-global.d.ts')
const content = readFileSync(distPath, 'utf-8')

let jsxDeclaration = readFileSync(jsxTypesPath, 'utf-8')
// Bundled declaration file is already a module; drop the stub export.
jsxDeclaration = jsxDeclaration.replace(/\nexport\s*\{\s*\}\s*$/m, '')

// Append before the sourcemap comment if present, otherwise at the end
const sourcemapIndex = content.lastIndexOf('//# sourceMappingURL=')
const insertAt = sourcemapIndex >= 0 ? sourcemapIndex : content.length
const newContent = content.slice(0, insertAt) + '\n' + jsxDeclaration + content.slice(insertAt)

writeFileSync(distPath, newContent)
