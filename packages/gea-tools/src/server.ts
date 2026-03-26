import * as fs from 'fs'
import { pathToFileURL } from 'url'
import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  CompletionItem,
  CompletionItemKind,
  createConnection,
  Diagnostic,
  DiagnosticSeverity,
  Definition,
  DefinitionParams,
  DidChangeConfigurationNotification,
  Hover,
  InitializeParams,
  InitializeResult,
  Location,
  MarkupKind,
  Position,
  ProposedFeatures,
  Range,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  TextDocuments,
  WorkspaceEdit,
} from 'vscode-languageserver/node'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { ComponentDiscovery, type ComponentInfo } from './component-discovery'

interface LanguageServerSettings {
  languageServer?: {
    enable?: boolean
  }
}

interface OpenTagContext {
  start: number
  end: number
  source: string
  sourceBeforeCursor: string
  tagName: string
}

interface ComponentMatchContext {
  component?: ComponentInfo
  context: OpenTagContext
}

const connection = createConnection(ProposedFeatures.all)
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument)

let hasConfigurationCapability = false
let hasWorkspaceFolderCapability = false

const componentDiscovery = new ComponentDiscovery()

const BUILTIN_COMPONENTS: ComponentInfo[] = [
  { name: 'view', tagName: 'view', description: 'Base view component' },
  { name: 'sidebar', tagName: 'sidebar', description: 'Sidebar navigation component' },
  { name: 'tab-view', tagName: 'tab-view', description: 'Tab view component' },
  { name: 'navbar', tagName: 'navbar', description: 'Navigation bar component' },
  { name: 'pull-to-refresh', tagName: 'pull-to-refresh', description: 'Pull to refresh component' },
  { name: 'infinite-scroll', tagName: 'infinite-scroll', description: 'Infinite scroll component' },
]

const EVENT_TYPES = [
  'blur',
  'change',
  'click',
  'dblclick',
  'focus',
  'input',
  'keydown',
  'keypress',
  'keyup',
  'mousedown',
  'mousemove',
  'mouseout',
  'mouseover',
  'mouseup',
  'scroll',
  'submit',
  'touchend',
  'touchmove',
  'touchstart',
]

const COMMON_COMPONENT_PROPS = ['key', 'class', 'className', 'style', 'id']
const UNKNOWN_COMPONENT_CODE = 'gea.unknownComponent'

const HTML_ELEMENTS = new Set([
  'a',
  'article',
  'aside',
  'blockquote',
  'br',
  'button',
  'code',
  'dd',
  'div',
  'dl',
  'dt',
  'em',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'img',
  'input',
  'label',
  'li',
  'main',
  'nav',
  'ol',
  'option',
  'p',
  'pre',
  'section',
  'select',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'textarea',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
])

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities

  const workspaceRoots = [
    ...(params.workspaceFolders?.map((folder) => folder.uri) ?? []),
    ...(params.rootUri ? [params.rootUri] : []),
  ]
  componentDiscovery.setWorkspaceRoots(Array.from(new Set(workspaceRoots)))

  hasConfigurationCapability = !!capabilities.workspace?.configuration
  hasWorkspaceFolderCapability = !!capabilities.workspace?.workspaceFolders

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: ['<', ' '],
      },
      codeActionProvider: true,
      definitionProvider: true,
      hoverProvider: true,
    },
  }

  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    }
  }

  return result
})

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined)
  }

  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders(async () => {
      const workspaceFolders = await connection.workspace.getWorkspaceFolders()
      componentDiscovery.setWorkspaceRoots(workspaceFolders?.map((folder) => folder.uri) ?? [])
      componentDiscovery.scanWorkspace()
    })
  }

  componentDiscovery.scanWorkspace()
})

const documentSettings: Map<string, Thenable<LanguageServerSettings>> = new Map()

connection.onDidChangeConfiguration(() => {
  if (hasConfigurationCapability) {
    documentSettings.clear()
  }
  componentDiscovery.scanWorkspace()
})

function getDocumentSettings(resource: string): Thenable<LanguageServerSettings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve({})
  }

  let result = documentSettings.get(resource)
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: resource,
      section: 'gea',
    }) as Thenable<LanguageServerSettings>
    documentSettings.set(resource, result)
  }

  return result
}

documents.onDidClose((e) => {
  documentSettings.delete(e.document.uri)
})

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const settings = await getDocumentSettings(textDocument.uri)
  if (settings.languageServer?.enable === false) {
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] })
    return
  }

  const text = textDocument.getText()
  const components = getAllComponents(text, textDocument.uri)
  const diagnostics: Diagnostic[] = []

  for (const tag of findJSXTags(text)) {
    if (!shouldValidateTag(tag.name)) {
      continue
    }

    const component = findComponent(components, tag.name)
    if (!component) {
      diagnostics.push({
        code: UNKNOWN_COMPONENT_CODE,
        severity: DiagnosticSeverity.Warning,
        range: Range.create(textDocument.positionAt(tag.start), textDocument.positionAt(tag.end)),
        message: `Unknown component: ${tag.name}`,
        source: 'gea',
      })
    }
  }

  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics })
}

function getAllComponents(text: string, uri: string): ComponentInfo[] {
  const fileComponents = componentDiscovery.discoverComponentsInFile(text, uri)
  componentDiscovery.addComponents(fileComponents)

  const importedComponents = componentDiscovery.discoverImportedComponents(text, uri)
  componentDiscovery.addComponents(importedComponents)

  const unique = new Map<string, ComponentInfo>()
  for (const component of [
    ...BUILTIN_COMPONENTS,
    ...componentDiscovery.getAllComponents(),
    ...fileComponents,
    ...importedComponents,
  ]) {
    unique.set(component.name, component)
  }

  return Array.from(unique.values())
}

function shouldValidateTag(tagName: string): boolean {
  if (HTML_ELEMENTS.has(tagName.toLowerCase())) {
    return false
  }

  return /^[A-Z]/.test(tagName) || tagName.includes('-')
}

function findJSXTags(text: string): Array<{ name: string; start: number; end: number }> {
  const tags: Array<{ name: string; start: number; end: number }> = []
  const tagRegex = /<(?!\/)([A-Za-z][\w-]*)\b/g
  let match: RegExpExecArray | null

  while ((match = tagRegex.exec(text)) !== null) {
    tags.push({
      name: match[1],
      start: match.index + 1,
      end: match.index + 1 + match[1].length,
    })
  }

  return tags
}

function findComponent(components: ComponentInfo[], tagName: string): ComponentInfo | undefined {
  const lowerName = tagName.toLowerCase()
  return components.find(
    (component) =>
      component.name === tagName || component.name.toLowerCase() === lowerName || component.tagName === lowerName,
  )
}

function getOpenTagContext(text: string, offset: number): OpenTagContext | null {
  const tagStart = text.lastIndexOf('<', offset)
  if (tagStart === -1) {
    return null
  }

  const lastClose = text.lastIndexOf('>', offset)
  if (lastClose > tagStart) {
    return null
  }

  const tagEnd = findTagEnd(text, tagStart)
  if (tagEnd === -1 || offset > tagEnd) {
    return null
  }

  const source = text.slice(tagStart, tagEnd + 1)
  if (source.startsWith('</') || source.startsWith('<!')) {
    return null
  }

  const tagMatch = source.match(/^<([A-Za-z][\w-]*)/)
  if (!tagMatch) {
    return null
  }

  return {
    start: tagStart,
    end: tagEnd,
    source,
    sourceBeforeCursor: text.slice(tagStart, offset),
    tagName: tagMatch[1],
  }
}

function findTagEnd(text: string, start: number): number {
  let quote: '"' | "'" | '`' | null = null
  let braceDepth = 0

  for (let i = start; i < text.length; i++) {
    const char = text[i]
    const prev = text[i - 1]

    if (quote) {
      if (char === quote && prev !== '\\') {
        quote = null
      }
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }

    if (char === '{') {
      braceDepth++
      continue
    }

    if (char === '}') {
      braceDepth = Math.max(0, braceDepth - 1)
      continue
    }

    if (char === '>' && braceDepth === 0) {
      return i
    }
  }

  return -1
}

function isComponentNameCompletion(context: OpenTagContext): boolean {
  return /^<[A-Za-z][\w-]*$/.test(context.sourceBeforeCursor.trim())
}

function getAttributeQuery(context: OpenTagContext): string | null {
  const fragment = context.sourceBeforeCursor.replace(/^<[A-Za-z][\w-]*/, '')
  if (!fragment.trim()) {
    return ''
  }

  let quote: '"' | "'" | '`' | null = null
  let braceDepth = 0

  for (let i = 0; i < fragment.length; i++) {
    const char = fragment[i]
    const prev = fragment[i - 1]

    if (quote) {
      if (char === quote && prev !== '\\') {
        quote = null
      }
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }

    if (char === '{') braceDepth++
    if (char === '}') braceDepth = Math.max(0, braceDepth - 1)
  }

  if (quote || braceDepth > 0) {
    return null
  }

  const attrMatch = fragment.match(/(?:^|\s)([A-Za-z][\w-]*)?$/)
  return attrMatch ? (attrMatch[1] ?? '') : null
}

function buildComponentCompletion(component: ComponentInfo): CompletionItem[] {
  const labels = new Set<string>([component.name, component.tagName])
  const items: CompletionItem[] = []

  for (const label of labels) {
    items.push({
      label,
      kind: CompletionItemKind.Class,
      detail: component.description || `Gea component: ${component.name}`,
      documentation: buildComponentDocumentation(component),
    })
  }

  return items
}

function buildComponentDocumentation(component: ComponentInfo): string {
  const propLines = component.props?.length ? `\n\nProps: ${component.props.join(', ')}` : ''
  const description = component.description || 'Gea component'
  return `${description}${propLines}`
}

function buildPropCompletion(propName: string, component: ComponentInfo): CompletionItem {
  return {
    label: propName,
    kind: CompletionItemKind.Property,
    detail: `${component.name} prop`,
    documentation: `Prop from ${component.name}`,
  }
}

function buildEventCompletion(eventName: string): CompletionItem {
  return {
    label: eventName,
    kind: CompletionItemKind.Event,
    detail: 'Gea JSX event',
    documentation: `Attach a ${eventName} handler in Gea JSX`,
  }
}

function getDocumentFilePath(uri: string): string {
  let filePath = decodeURIComponent(uri)
  if (filePath.startsWith('file://')) {
    filePath = filePath.slice('file://'.length)
  }

  if (filePath.match(/^\/[A-Z]:/i)) {
    filePath = filePath.slice(1)
  }

  return filePath
}

function getComponentAtPosition(document: TextDocument, position: Position): ComponentMatchContext | null {
  const text = document.getText()
  const offset = document.offsetAt(position)
  const context = getOpenTagContext(text, offset)
  if (!context) {
    return null
  }

  const components = getAllComponents(text, document.uri)
  return {
    component: findComponent(components, context.tagName),
    context,
  }
}

function isCursorOnTagName(context: OpenTagContext, offset: number): boolean {
  const tagNameStart = context.start + 1
  const tagNameEnd = tagNameStart + context.tagName.length
  return offset >= tagNameStart && offset <= tagNameEnd
}

function createDefinitionLocation(document: TextDocument, component: ComponentInfo): Location | null {
  if (!component.filePath) {
    return null
  }

  const targetUri = pathToFileURL(component.filePath).toString()
  const offset = component.declarationOffset ?? 0
  const currentFilePath = getDocumentFilePath(document.uri)
  const position =
    component.filePath === currentFilePath
      ? document.positionAt(offset)
      : getPositionFromFile(component.filePath, offset)

  return Location.create(targetUri, Range.create(position, position))
}

function getPositionFromFile(filePath: string, offset: number): Position {
  try {
    const text = fs.readFileSync(filePath, 'utf8')
    const boundedOffset = Math.max(0, Math.min(offset, text.length))
    const prefix = text.slice(0, boundedOffset)
    const lines = prefix.split(/\r?\n/)
    return Position.create(lines.length - 1, lines[lines.length - 1]?.length ?? 0)
  } catch {
    return Position.create(0, 0)
  }
}

function extractUnknownComponentName(diagnostic: Diagnostic): string | null {
  if (diagnostic.code !== UNKNOWN_COMPONENT_CODE) {
    return null
  }

  const match = diagnostic.message.match(/^Unknown component: (.+)$/)
  return match ? match[1] : null
}

function hasImportForComponent(text: string, component: ComponentInfo): boolean {
  const importRegex = new RegExp(`import\\s+${component.name}\\b`)
  return importRegex.test(text)
}

function findImportInsertionOffset(text: string): number {
  const lines = text.split(/\r?\n/)
  let offset = 0
  let lastImportOffset = 0
  let lastLeadingOffset = 0
  let collectingImport = false

  for (const line of lines) {
    const lineLength = line.length + 1
    const trimmed = line.trim()

    if (!collectingImport) {
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        offset += lineLength
        lastLeadingOffset = offset
        continue
      }

      if (!trimmed.startsWith('import ')) {
        break
      }

      collectingImport = true
    }

    offset += lineLength

    if (trimmed.endsWith(';') || /from\s+['"][^'"]+['"]$/.test(trimmed) || /^import\s+['"][^'"]+['"]$/.test(trimmed)) {
      collectingImport = false
      lastImportOffset = offset
    }
  }

  return lastImportOffset || lastLeadingOffset
}

function buildImportText(document: TextDocument, component: ComponentInfo): string | null {
  if (!component.filePath) {
    return null
  }

  const currentFilePath = getDocumentFilePath(document.uri)
  const importPath = componentDiscovery.toRelativeImportPath(currentFilePath, component.filePath)
  return `import ${component.name} from '${importPath}'\n`
}

function buildUnknownComponentCodeAction(document: TextDocument, diagnostic: Diagnostic): CodeAction | null {
  const componentName = extractUnknownComponentName(diagnostic)
  if (!componentName) {
    return null
  }

  const text = document.getText()
  const currentFilePath = getDocumentFilePath(document.uri)
  const component = componentDiscovery.getBestComponentMatch(componentName, currentFilePath)
  if (!component || hasImportForComponent(text, component)) {
    return null
  }

  const importText = buildImportText(document, component)
  if (!importText) {
    return null
  }

  const insertionOffset = findImportInsertionOffset(text)
  const insertionPosition = document.positionAt(insertionOffset)
  const edit: WorkspaceEdit = {
    changes: {
      [document.uri]: [
        {
          newText: importText,
          range: Range.create(insertionPosition, insertionPosition),
        },
      ],
    },
  }

  return {
    diagnostics: [diagnostic],
    edit,
    kind: CodeActionKind.QuickFix,
    title: `Add import for ${component.name}`,
  }
}

connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
  const document = documents.get(params.textDocument.uri)
  if (!document) {
    return []
  }

  const text = document.getText()
  const offset = document.offsetAt(params.position)
  const context = getOpenTagContext(text, offset)
  if (!context) {
    return []
  }

  const components = getAllComponents(text, document.uri)
  if (isComponentNameCompletion(context)) {
    return components.flatMap(buildComponentCompletion)
  }

  const attrQuery = getAttributeQuery(context)
  if (attrQuery === null) {
    return []
  }

  const results: CompletionItem[] = []
  const component = findComponent(components, context.tagName)

  if (component) {
    const seenProps = new Set<string>()
    for (const propName of [...COMMON_COMPONENT_PROPS, ...(component.props ?? [])]) {
      if (!seenProps.has(propName) && propName.startsWith(attrQuery)) {
        seenProps.add(propName)
        results.push(buildPropCompletion(propName, component))
      }
    }
  }

  for (const eventName of EVENT_TYPES) {
    if (eventName.startsWith(attrQuery)) {
      results.push(buildEventCompletion(eventName))
    }
  }

  return results
})

connection.onDefinition((params: DefinitionParams): Definition | null => {
  const document = documents.get(params.textDocument.uri)
  if (!document) {
    return null
  }

  const componentContext = getComponentAtPosition(document, params.position)
  if (!componentContext) {
    return null
  }

  const offset = document.offsetAt(params.position)
  if (!isCursorOnTagName(componentContext.context, offset)) {
    return null
  }

  const currentFilePath = getDocumentFilePath(document.uri)
  const component =
    componentContext.component ??
    componentDiscovery.getBestComponentMatch(componentContext.context.tagName, currentFilePath)

  if (!component) {
    return null
  }

  return createDefinitionLocation(document, component)
})

connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
  const document = documents.get(params.textDocument.uri)
  if (!document) {
    return []
  }

  return params.context.diagnostics
    .map((diagnostic) => buildUnknownComponentCodeAction(document, diagnostic))
    .filter((action): action is CodeAction => action !== null)
})

connection.onRequest('textDocument/diagnostic', () => {
  return { items: [] }
})

connection.onHover((params: TextDocumentPositionParams): Hover | null => {
  const document = documents.get(params.textDocument.uri)
  if (!document) {
    return null
  }

  const text = document.getText()
  const offset = document.offsetAt(params.position)
  const context = getOpenTagContext(text, offset)
  if (!context) {
    return null
  }

  const components = getAllComponents(text, document.uri)
  const tagNameStart = context.start + 1
  const tagNameEnd = tagNameStart + context.tagName.length

  if (offset >= tagNameStart && offset <= tagNameEnd) {
    const component = findComponent(components, context.tagName)
    if (!component) {
      return null
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**${component.name}**\n\n${buildComponentDocumentation(component)}`,
      },
    }
  }

  const attrRegex = /([A-Za-z][\w-]*)\s*=/g
  let match: RegExpExecArray | null
  while ((match = attrRegex.exec(context.source)) !== null) {
    const attrName = match[1]
    const attrStart = context.start + match.index
    const attrEnd = attrStart + attrName.length

    if (offset < attrStart || offset > attrEnd) {
      continue
    }

    if (EVENT_TYPES.includes(attrName)) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `**${attrName}**\n\nGea JSX event handler.`,
        },
      }
    }

    const component = findComponent(components, context.tagName)
    if (component && (component.props?.includes(attrName) || COMMON_COMPONENT_PROPS.includes(attrName))) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `**${attrName}**\n\nProp on \`${component.name}\`.`,
        },
      }
    }
  }

  return null
})

documents.onDidChangeContent((change) => {
  validateTextDocument(change.document)
})

documents.onDidOpen((change) => {
  validateTextDocument(change.document)
})

documents.listen(connection)
connection.listen()
