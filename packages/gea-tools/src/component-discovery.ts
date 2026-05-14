import * as fs from 'fs'
import * as path from 'path'

export interface ComponentInfo {
  name: string
  tagName: string
  description?: string
  props?: string[]
  filePath?: string
  declarationOffset?: number
  exportKind?: 'default'
}

export class ComponentDiscovery {
  private components: Map<string, ComponentInfo> = new Map()
  private workspaceRoots: string[] = []

  setWorkspaceRoots(roots: string[]): void {
    this.workspaceRoots = roots.map((root) => this.normalizeFilePath(root))
  }

  scanWorkspace(): void {
    this.components.clear()

    for (const root of this.workspaceRoots) {
      if (!fs.existsSync(root)) {
        continue
      }

      this.scanDirectory(root)
    }
  }

  discoverComponentsInFile(text: string, uri: string): ComponentInfo[] {
    const components: ComponentInfo[] = []
    const filePath = this.normalizeFilePath(uri)

    const discovered = new Map<string, ComponentInfo>()
    this.discoverClassComponents(text, filePath, discovered)
    this.discoverFunctionComponents(text, filePath, discovered)

    components.push(...discovered.values())

    return components
  }

  addComponents(components: ComponentInfo[]): void {
    for (const component of components) {
      const merged = this.mergeComponent(component)
      this.storeComponent(merged)
    }
  }

  getAllComponents(): ComponentInfo[] {
    const uniqueComponents = new Map<string, ComponentInfo>()
    for (const component of this.components.values()) {
      const key = this.getComponentIdentity(component)
      const existing = uniqueComponents.get(key)

      if (!existing) {
        uniqueComponents.set(key, component)
        continue
      }

      uniqueComponents.set(key, this.preferRicherComponent(existing, component))
    }

    return Array.from(uniqueComponents.values())
  }

  getComponent(tagName: string): ComponentInfo | undefined {
    return (
      this.components.get(tagName) ||
      this.components.get(tagName.toLowerCase()) ||
      this.components.get(this.toPascalCase(tagName))
    )
  }

  getBestComponentMatch(tagName: string, fromFilePath?: string): ComponentInfo | undefined {
    const normalizedFromFile = fromFilePath ? this.normalizeFilePath(fromFilePath) : undefined
    const matches = this.getAllComponents().filter((component) => {
      if (!component.filePath || component.exportKind !== 'default') {
        return false
      }

      const lowerName = tagName.toLowerCase()
      return component.name === tagName || component.name.toLowerCase() === lowerName || component.tagName === lowerName
    })

    if (matches.length === 0) {
      return undefined
    }

    matches.sort((left, right) => {
      const leftScore = this.getComponentDistanceScore(left, normalizedFromFile)
      const rightScore = this.getComponentDistanceScore(right, normalizedFromFile)

      if (leftScore !== rightScore) {
        return leftScore - rightScore
      }

      const leftPath = left.filePath ?? ''
      const rightPath = right.filePath ?? ''
      return leftPath.localeCompare(rightPath)
    })

    return matches[0]
  }

  discoverImportedComponents(text: string, currentUri: string): ComponentInfo[] {
    const components: ComponentInfo[] = []
    const filePath = this.normalizeFilePath(currentUri)
    const dir = path.dirname(filePath)

    const defaultImportRegex = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g
    let match: RegExpExecArray | null

    while ((match = defaultImportRegex.exec(text)) !== null) {
      const importName = match[1]
      const importPath = match[2]

      if (!importPath || (!importPath.startsWith('.') && !importPath.startsWith('/'))) {
        continue
      }

      try {
        const resolvedPath = this.resolveImportPath(dir, importPath)

        if (!resolvedPath || !fs.existsSync(resolvedPath)) {
          continue
        }

        const importedText = fs.readFileSync(resolvedPath, 'utf-8')
        const importedComponents = this.discoverComponentsInFile(importedText, `file://${resolvedPath}`)

        const matchedComponent = importedComponents.find((component) => component.name === importName)
        if (matchedComponent) {
          components.push(matchedComponent)
          continue
        }

        if (importedComponents.length > 0) {
          components.push(...importedComponents)
        }
      } catch (error: unknown) {
        if (error instanceof Error && !error.message.includes('ENOENT')) {
          console.error(`Error discovering components from ${importPath}:`, error.message)
        }
      }
    }

    return components
  }

  toRelativeImportPath(fromFilePath: string, targetFilePath: string): string {
    const normalizedFromFile = this.normalizeFilePath(fromFilePath)
    const normalizedTargetFile = this.normalizeFilePath(targetFilePath)
    const fromDir = path.dirname(normalizedFromFile)

    let relativePath = path.relative(fromDir, normalizedTargetFile).replace(/\\/g, '/')
    relativePath = relativePath.replace(/\.(?:jsx?|tsx?)$/, '')

    if (relativePath.endsWith('/index')) {
      relativePath = relativePath.slice(0, -'/index'.length)
    }

    if (!relativePath.startsWith('.')) {
      relativePath = `./${relativePath}`
    }

    return relativePath
  }

  private scanDirectory(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name)
      if (this.shouldIgnorePath(entryPath)) {
        continue
      }

      if (entry.isDirectory()) {
        this.scanDirectory(entryPath)
        continue
      }

      if (!this.isSupportedSourceFile(entryPath)) {
        continue
      }

      try {
        const text = fs.readFileSync(entryPath, 'utf-8')
        const components = this.discoverComponentsInFile(text, `file://${entryPath}`)
        this.addComponents(components)
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.error(`Error scanning ${entryPath}:`, error.message)
        }
      }
    }
  }

  private shouldIgnorePath(filePath: string): boolean {
    const normalizedPath = this.normalizeFilePath(filePath)
    const segments = normalizedPath.split(/[\\/]+/)
    return segments.some((segment) => ['.git', 'dist', 'node_modules', 'out', 'website'].includes(segment))
  }

  private isSupportedSourceFile(filePath: string): boolean {
    return /\.(?:js|jsx|ts|tsx)$/.test(filePath)
  }

  private getComponentDistanceScore(component: ComponentInfo, fromFilePath?: string): number {
    if (!fromFilePath || !component.filePath) {
      return Number.MAX_SAFE_INTEGER
    }

    const relativePath = this.toRelativeImportPath(fromFilePath, component.filePath)
    return relativePath.split('/').length
  }

  private mergeComponent(component: ComponentInfo): ComponentInfo {
    const existing = component.filePath ? this.findExistingComponent(component) : undefined
    if (!existing) {
      return component
    }

    return this.preferRicherComponent(existing, component)
  }

  private findExistingComponent(component: ComponentInfo): ComponentInfo | undefined {
    const existingCandidates = [
      this.components.get(component.name),
      this.components.get(component.name.toLowerCase()),
      this.components.get(component.tagName),
    ]

    return existingCandidates.find((candidate) => candidate?.filePath === component.filePath)
  }

  private preferRicherComponent(left: ComponentInfo, right: ComponentInfo): ComponentInfo {
    const leftScore = this.getComponentRichness(left)
    const rightScore = this.getComponentRichness(right)
    return rightScore >= leftScore ? { ...left, ...right } : { ...right, ...left }
  }

  private getComponentRichness(component: ComponentInfo): number {
    return [component.description, component.filePath, component.declarationOffset, component.props?.length].filter(
      (value) => value !== undefined,
    ).length
  }

  private storeComponent(component: ComponentInfo): void {
    this.components.set(component.tagName, component)
    this.components.set(component.name.toLowerCase(), component)
    this.components.set(component.name, component)
  }

  private getComponentIdentity(component: ComponentInfo): string {
    return `${component.filePath ?? ''}:${component.name}`
  }

  private normalizeFilePath(uriOrPath: string): string {
    let filePath = decodeURIComponent(uriOrPath)
    if (filePath.startsWith('file://')) {
      filePath = filePath.slice('file://'.length)
    }

    if (filePath.match(/^\/[A-Z]:/i)) {
      filePath = filePath.slice(1)
    }

    return path.normalize(filePath)
  }

  private toPascalCase(str: string): string {
    return str
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('')
  }

  private discoverClassComponents(text: string, filePath: string, discovered: Map<string, ComponentInfo>): void {
    const classRegex = /export\s+(default\s+)?class\s+(\w+)\s+extends\s+Component\b/g
    let match: RegExpExecArray | null

    while ((match = classRegex.exec(text)) !== null) {
      const isDefaultExport = Boolean(match[1])
      const className = match[2]
      const classStart = match.index
      const classBody = text.slice(classStart)
      const props = this.extractTemplateProps(classBody)
      const description = this.extractDescription(text, className)

      this.addDiscoveredComponent(discovered, {
        name: className,
        tagName: this.toTagName(className),
        description,
        props,
        filePath,
        declarationOffset: classStart,
        exportKind: isDefaultExport ? 'default' : undefined,
      })
    }
  }

  private discoverFunctionComponents(text: string, filePath: string, discovered: Map<string, ComponentInfo>): void {
    const functionRegex = /export\s+(default\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*\{/g
    let match: RegExpExecArray | null

    while ((match = functionRegex.exec(text)) !== null) {
      const isDefaultExport = Boolean(match[1])
      const name = match[2]
      const params = match[3]
      const functionStart = match.index
      const functionBody = text.slice(functionStart)
      const description = this.extractDescription(text, name)
      const props = this.extractFunctionProps(params, functionBody)

      this.addDiscoveredComponent(discovered, {
        name,
        tagName: this.toTagName(name),
        description,
        props,
        filePath,
        declarationOffset: functionStart,
        exportKind: isDefaultExport ? 'default' : undefined,
      })
    }
  }

  private addDiscoveredComponent(discovered: Map<string, ComponentInfo>, component: ComponentInfo): void {
    discovered.set(component.name, {
      ...component,
      props: component.props?.length ? component.props : undefined,
    })
  }

  private toTagName(name: string): string {
    return name
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase()
  }

  private extractTemplateProps(classBody: string): string[] {
    const templateParamRegex = /template\s*\(\s*([^)]*)\)/m
    const match = classBody.match(templateParamRegex)
    if (!match) return []

    return this.extractPropsFromParameter(match[1], classBody)
  }

  private extractFunctionProps(params: string, functionBody: string): string[] {
    const directProps = this.extractPropsFromParameter(params, functionBody)
    if (directProps.length > 0) {
      return directProps
    }

    const trimmedParams = params.trim()
    if (!trimmedParams || !/^[A-Za-z_$][\w$]*$/.test(trimmedParams)) {
      return []
    }

    return this.extractPropsDestructuredFromIdentifier(functionBody, trimmedParams)
  }

  private extractPropsFromParameter(paramSource: string, functionBody: string): string[] {
    const trimmed = paramSource.trim()
    if (!trimmed) return []

    if (trimmed.startsWith('{')) {
      return this.extractObjectPatternProps(trimmed)
    }

    if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) {
      return this.extractPropsDestructuredFromIdentifier(functionBody, trimmed)
    }

    return []
  }

  private extractPropsDestructuredFromIdentifier(functionBody: string, identifier: string): string[] {
    const destructureRegex = new RegExp(`const\\s*\\{([\\s\\S]*?)\\}\\s*=\\s*${identifier}\\s*[;\\n]`, 'm')
    const match = functionBody.match(destructureRegex)
    if (!match) return []

    return this.extractObjectPatternProps(`{${match[1]}}`)
  }

  private extractObjectPatternProps(patternSource: string): string[] {
    const normalized = patternSource.trim()
    if (!normalized.startsWith('{') || !normalized.endsWith('}')) {
      return []
    }

    const inner = normalized.slice(1, -1)
    const segments = this.splitTopLevel(inner)
    const props: string[] = []

    for (const segment of segments) {
      const candidate = segment.trim()
      if (!candidate || candidate.startsWith('...')) {
        continue
      }

      const name = this.extractPropName(candidate)
      if (name && !props.includes(name)) {
        props.push(name)
      }
    }

    return props
  }

  private splitTopLevel(source: string): string[] {
    const segments: string[] = []
    let current = ''
    let braceDepth = 0
    let bracketDepth = 0
    let parenDepth = 0
    let quote: '"' | "'" | '`' | null = null

    for (let i = 0; i < source.length; i++) {
      const char = source[i]
      const prev = source[i - 1]

      if (quote) {
        current += char
        if (char === quote && prev !== '\\') {
          quote = null
        }
        continue
      }

      if (char === '"' || char === "'" || char === '`') {
        quote = char
        current += char
        continue
      }

      if (char === '{') braceDepth++
      if (char === '}') braceDepth--
      if (char === '[') bracketDepth++
      if (char === ']') bracketDepth--
      if (char === '(') parenDepth++
      if (char === ')') parenDepth--

      if (char === ',' && braceDepth === 0 && bracketDepth === 0 && parenDepth === 0) {
        segments.push(current)
        current = ''
        continue
      }

      current += char
    }

    if (current.trim()) {
      segments.push(current)
    }

    return segments
  }

  private extractPropName(segment: string): string | null {
    const cleaned = segment.trim()
    if (!cleaned) return null

    const withoutDefault = cleaned.split('=').shift()?.trim() ?? cleaned
    const namePart = withoutDefault.split(':').shift()?.trim() ?? withoutDefault
    const match = namePart.match(/^[A-Za-z_$][\w$]*/)
    return match ? match[0] : null
  }

  private resolveImportPath(dir: string, importPath: string): string | null {
    if (importPath.startsWith('/')) {
      return importPath
    }

    const resolvedBase = path.resolve(dir, importPath)
    const candidates = [
      resolvedBase,
      `${resolvedBase}.js`,
      `${resolvedBase}.jsx`,
      `${resolvedBase}.ts`,
      `${resolvedBase}.tsx`,
      path.join(resolvedBase, 'index.js'),
      path.join(resolvedBase, 'index.jsx'),
      path.join(resolvedBase, 'index.ts'),
      path.join(resolvedBase, 'index.tsx'),
    ]

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate
      }
    }

    return null
  }

  private extractDescription(text: string, className: string): string | undefined {
    const classIndex = text.indexOf(`class ${className}`)
    if (classIndex === -1) return undefined

    const beforeClass = text.substring(Math.max(0, classIndex - 500), classIndex)
    const jsdocMatch = beforeClass.match(/\*\s*([^\n]+)/)

    if (jsdocMatch) {
      return jsdocMatch[1].trim()
    }

    return undefined
  }
}
