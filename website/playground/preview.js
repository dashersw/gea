// website/playground/preview.js

function playgroundModuleUrl(filename) {
  return new URL(filename, import.meta.url).href
}

function escapeForScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function splitTopLevelComma(value) {
  let depth = 0
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (ch === '{') depth++
    else if (ch === '}') depth--
    else if (ch === ',' && depth === 0) return [value.slice(0, i), value.slice(i + 1)]
  }
  return [value]
}

function namedImportPattern(named) {
  const inner = named
    .trim()
    .replace(/^\{\s*/, '')
    .replace(/\s*\}$/, '')
  return inner
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/)
      return match ? `${match[1]}: ${match[2]}` : part
    })
    .join(', ')
}

function importReplacement(specifiers, source, index) {
  const dep = `__dep${index}`
  const lines = [`const ${dep} = require(${JSON.stringify(source)});`]
  const spec = specifiers.trim()
  const [head, tail] = splitTopLevelComma(spec)

  if (tail != null) {
    const defaultName = head.trim()
    if (defaultName) lines.push(`const ${defaultName} = ${dep}.default;`)

    const rest = tail.trim()
    if (rest.startsWith('{')) {
      const named = namedImportPattern(rest)
      if (named) lines.push(`const { ${named} } = ${dep};`)
    } else if (rest.startsWith('* as ')) {
      lines.push(`const ${rest.slice(5).trim()} = ${dep};`)
    }
    return lines.join('\n')
  }

  if (spec.startsWith('{')) {
    const named = namedImportPattern(spec)
    if (named) lines.push(`const { ${named} } = ${dep};`)
  } else if (spec.startsWith('* as ')) {
    lines.push(`const ${spec.slice(5).trim()} = ${dep};`)
  } else if (spec) {
    lines.push(`const ${spec} = ${dep}.default;`)
  }

  return lines.join('\n')
}

function exportAssignments(specifiers) {
  return specifiers
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^([A-Za-z_$][\w$]*|default)\s+as\s+([A-Za-z_$][\w$]*)$/)
      if (match) return `exports.${match[2]} = ${match[1]};`
      return `exports.${part} = ${part};`
    })
    .join('\n')
}

function transformModule(code) {
  let importIndex = 0
  const assignments = []

  let transformed = code
    .replace(/\bimport\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/g, (_match, specifiers, source) =>
      importReplacement(specifiers, source, importIndex++),
    )
    .replace(/\bimport\s+['"]([^'"]+)['"];?/g, (_match, source) => `require(${JSON.stringify(source)});`)

  transformed = transformed
    .replace(/\bexport\s+default\s+class\s+([A-Za-z_$][\w$]*)/g, (_match, name) => {
      assignments.push(`exports.default = ${name};`)
      return `class ${name}`
    })
    .replace(/\bexport\s+default\s+function\s+([A-Za-z_$][\w$]*)/g, (_match, name) => {
      assignments.push(`exports.default = ${name};`)
      return `function ${name}`
    })
    .replace(/\bexport\s+default\s+/g, 'exports.default = ')
    .replace(/\bexport\s+\{([^}]+)\};?/g, (_match, specifiers) => exportAssignments(specifiers))
    .replace(/\bexport\s+class\s+([A-Za-z_$][\w$]*)/g, (_match, name) => {
      assignments.push(`exports.${name} = ${name};`)
      return `class ${name}`
    })
    .replace(/\bexport\s+function\s+([A-Za-z_$][\w$]*)/g, (_match, name) => {
      assignments.push(`exports.${name} = ${name};`)
      return `function ${name}`
    })
    .replace(/\bexport\s+(const|let|var)\s+([A-Za-z_$][\w$]*)/g, (_match, kind, name) => {
      assignments.push(`exports.${name} = ${name};`)
      return `${kind} ${name}`
    })

  if (assignments.length > 0) transformed += `\n${assignments.join('\n')}`
  return transformed
}

function createExecutableModules(compiledModules, fileOrder) {
  const modules = {}
  for (const filename of fileOrder) {
    const code = compiledModules[filename]
    if (!code) continue
    modules[filename] = transformModule(code)
  }
  return modules
}

function generateSrcdoc(modules, entryFile, previewCSS) {
  const runtimeUrl = playgroundModuleUrl('gea-playground-runtime.js')
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: system-ui, sans-serif; color: #e0dff5; margin: 16px; }
  ${previewCSS || ''}
</style>
</head>
<body>
<div id="app"></div>
<script type="module">
  import * as geaRuntime from '${runtimeUrl}'

  const moduleDefinitions = ${escapeForScript(modules)}
  const entryFile = ${escapeForScript(entryFile)}
  const moduleCache = new Map()
  const externalModules = {
    '@geajs/core': geaRuntime,
    '@geajs/core/compiler-runtime': geaRuntime,
    'virtual:gea-compiler-runtime': geaRuntime,
  }

  function normalizeModuleId(specifier, parentId) {
    if (externalModules[specifier]) return specifier
    if (!specifier.startsWith('.')) return specifier

    const base = parentId ? parentId.split('/') : []
    base.pop()
    for (const part of specifier.split('/')) {
      if (!part || part === '.') continue
      if (part === '..') base.pop()
      else base.push(part)
    }

    const normalized = base.join('/')
    const candidates = [normalized, normalized + '.ts', normalized + '.tsx', normalized + '.js', normalized + '.jsx']
    return candidates.find((candidate) => moduleDefinitions[candidate]) || normalized
  }

  function requireModule(specifier, parentId) {
    const id = normalizeModuleId(specifier, parentId)
    if (externalModules[id]) return externalModules[id]
    if (moduleCache.has(id)) return moduleCache.get(id).exports

    const source = moduleDefinitions[id]
    if (source == null) throw new Error('Playground module not found: ' + specifier + ' from ' + parentId)

    const module = { exports: {} }
    moduleCache.set(id, module)
    const localRequire = (childSpecifier) => requireModule(childSpecifier, id)
    const factory = new Function('exports', 'module', 'require', source + '\\n//# sourceURL=playground://' + id)
    factory(module.exports, module, localRequire)
    return module.exports
  }

  function showRuntimeError(error) {
    const pre = document.createElement('pre')
    pre.style.color = '#ff6b6b'
    pre.style.whiteSpace = 'pre-wrap'
    pre.textContent = error && error.stack ? error.stack : String(error)
    document.body.replaceChildren(pre)
  }

  try {
    requireModule(entryFile, null)
  } catch (error) {
    showRuntimeError(error)
    throw error
  }
</script>
</body>
</html>`
}

function generateErrorSrcdoc(errors) {
  const errorHtml = errors
    .map(
      (e) =>
        `<div style="margin-bottom:12px"><strong>${e.file}</strong><pre style="color:#ff6b6b;white-space:pre-wrap;margin:4px 0">${escapeHtml(e.message)}</pre></div>`,
    )
    .join('')
  return `<!DOCTYPE html>
<html>
<head><style>body{font-family:'IBM Plex Mono',monospace;background:#0a0a1a;color:#e0dff5;padding:16px;}pre{font-size:13px;}</style></head>
<body>
<h3 style="color:#ff2d95;margin-top:0">Compilation Error</h3>
${errorHtml}
</body>
</html>`
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function renderPreview(iframe, compiledModules, fileOrder, errors, previewCSS) {
  if (errors && errors.length > 0) {
    iframe.srcdoc = generateErrorSrcdoc(errors)
    return
  }

  const modules = createExecutableModules(compiledModules, fileOrder)
  const entryFile = fileOrder[fileOrder.length - 1]
  iframe.srcdoc = generateSrcdoc(modules, entryFile, previewCSS)
}
