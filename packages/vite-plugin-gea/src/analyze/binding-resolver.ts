import { traverse, t } from '../utils/babel-interop.ts'
import type { NodePath } from '../utils/babel-interop.ts'
import { getTemplateParamBinding } from './template-param-utils.ts'
import type { EventHandler } from '../ir/types.ts'
import type { ChildComponent, ObserveDependency } from '../ir/types.ts'
import { buildObserveKey, resolvePath } from '../codegen/member-chain.ts'
import type { StateRefMeta } from '../parse/state-refs.ts'

export interface TemplateSetupContext {
  params: Array<t.Identifier | t.Pattern | t.RestElement>
  statements: t.Statement[]
  /**
   * If set, statements with index > this value are only valid after statements[0..barrier]
   * have run (includes the early-return `if` at this index). Used so `collectTemplateSetupStatements`
   * does not emit `const x = item.foo` without the preceding `if (!item) return ...`.
   */
  earlyReturnBarrierIndex?: number
}

const DOM_EVENT_RE = /^(click|input|change|submit|focus|blur|keydown|keyup|keypress|mousedown|mouseup|mouseover|mouseout|mouseenter|mouseleave|touchstart|touchend|touchmove|pointerdown|pointerup|pointermove|scroll|resize|drag|dragstart|dragend|dragover|drop|reset)$/

export function buildComponentPropsExpression(
  jsxElement: t.JSXElement,
  imports: Map<string, string>,
  componentInstances: Map<string, ChildComponent[]>,
  eventHandlers: EventHandler[] | undefined,
  stateRefs: Map<string, StateRefMeta> | undefined,
  templateSetupContext: TemplateSetupContext | undefined,
  transformExpression: (expr: t.Expression) => t.Expression,
  transformFragment: (frag: t.JSXFragment) => t.TemplateLiteral,
): { expression: t.ObjectExpression; dependencies: ObserveDependency[]; setupStatements: t.Statement[] } {
  const props: t.ObjectProperty[] = []
  const dependencies = new Map<string, ObserveDependency>()

  jsxElement.openingElement.attributes.forEach((attr) => {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name) || attr.name.name === 'key') return
    const propName = attr.name.name
    let propValue: t.Expression | null = null

    if (attr.value === null) propValue = t.booleanLiteral(true)
    else if (t.isStringLiteral(attr.value)) propValue = t.stringLiteral(attr.value.value)
    else if (t.isJSXExpressionContainer(attr.value) && !t.isJSXEmptyExpression(attr.value.expression)) {
      const expr = attr.value.expression as t.Expression
      propValue = transformExpression(expr)
      if (propValue && (/^on[A-Z]/.test(propName) || DOM_EVENT_RE.test(propName)) && t.isMemberExpression(propValue)) {
        const argsId = t.identifier('args')
        propValue = t.arrowFunctionExpression(
          [t.restElement(argsId)],
          t.callExpression(t.cloneNode(propValue, true), [t.spreadElement(argsId)]),
        )
      }
    }

    if (propValue) {
      const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propName) ? t.identifier(propName) : t.stringLiteral(propName)
      props.push(t.objectProperty(key, propValue))
    }
  })

  const meaningfulChildren = jsxElement.children.filter((c) => !(t.isJSXText(c) && c.value.trim() === ''))
  if (meaningfulChildren.length > 0) {
    const frag = t.jsxFragment(t.jsxOpeningFragment(), t.jsxClosingFragment(), meaningfulChildren)
    props.push(t.objectProperty(t.identifier('children'), transformFragment(frag)))
  }

  const expression = t.objectExpression(props)
  const setupStatements = collectTemplateSetupStatements(expression, templateSetupContext)
  collectExpressionDependenciesInto(expression, stateRefs, dependencies, setupStatements)

  return { expression, dependencies: Array.from(dependencies.values()), setupStatements }
}

export function collectExpressionDependencies(
  expr: t.Expression,
  stateRefs: Map<string, StateRefMeta> | undefined,
  setupStatements: t.Statement[] = [],
): ObserveDependency[] {
  const dependencies = new Map<string, ObserveDependency>()
  collectExpressionDependenciesInto(expr, stateRefs, dependencies, setupStatements)
  return Array.from(dependencies.values())
}

function collectExpressionDependenciesInto(
  expr: t.Expression,
  stateRefs: Map<string, StateRefMeta> | undefined,
  dependencies: Map<string, ObserveDependency>,
  setupStatements: t.Statement[] = [],
) {
  if (!stateRefs) return

  const add = (parts: string[], storeVar?: string) => {
    const key = buildObserveKey(parts, storeVar)
    if (!dependencies.has(key)) dependencies.set(key, { observeKey: key, pathParts: parts, storeVar })
  }

  /** If the store ref has getter deps for `prop`, add them all and return true. */
  const addGetterDeps = (ref: StateRefMeta | undefined, prop: string, storeVar: string): boolean => {
    const paths = ref?.getterDeps?.get(prop)
    if (!paths?.length) return false
    for (const dep of paths) add(dep, storeVar)
    return true
  }

  const referencedNames = collectReferencedIdentifiers(expr)
  for (const statement of setupStatements) {
    if (!t.isVariableDeclaration(statement)) continue
    for (const declaration of statement.declarations) {
      if (!t.isObjectPattern(declaration.id) || !declaration.init) continue
      const resolved = resolvePath(declaration.init as t.MemberExpression | t.Identifier | t.ThisExpression, stateRefs)
      if (!resolved?.parts) continue
      for (const property of declaration.id.properties) {
        if (!t.isObjectProperty(property)) continue
        const keyName = t.isIdentifier(property.key) ? property.key.name
          : t.isStringLiteral(property.key) ? property.key.value : null
        if (!keyName) continue
        if (!collectPatternIdentifiers(property.value as t.LVal).some((n) => referencedNames.has(n))) continue

        if (resolved.isImportedState && resolved.parts.length === 0 && t.isIdentifier(declaration.init)) {
          const storeRef = stateRefs.get((declaration.init as t.Identifier).name)
          if (!addGetterDeps(storeRef, keyName, resolved.storeVar!)) {
            add(storeRef?.reactiveFields?.has(keyName) ? [keyName] : [], resolved.storeVar!)
          }
        } else {
          add([...resolved.parts, keyName], resolved.isImportedState ? resolved.storeVar : undefined)
        }
      }
    }
  }

  const program = t.program([
    ...setupStatements.map((s) => t.cloneNode(s, true) as t.Statement),
    t.expressionStatement(t.cloneNode(expr, true)),
  ])
  traverse(program, {
    noScope: true,
    MemberExpression(path: NodePath<t.MemberExpression>) {
      const parent = path.parentPath
      if (parent && t.isMemberExpression(parent.node) && parent.node.object === path.node) return
      const resolved = resolvePath(path.node, stateRefs)
      if (!resolved?.parts?.length) return

      const isMethodCall = parent && t.isCallExpression(parent.node) && parent.node.callee === path.node
      if (isMethodCall && resolved.isImportedState && resolved.storeVar) {
        const ref = stateRefs?.get(resolved.storeVar)
        if (ref && !ref.reactiveFields) { add([], resolved.storeVar); return }
        const methodStripped = resolved.parts.slice(0, -1)
        const propName = methodStripped.length === 1 ? methodStripped[0] : undefined
        if (propName && addGetterDeps(ref, propName, resolved.storeVar)) return
        add(methodStripped.length > 0 ? methodStripped : [], resolved.storeVar)
        return
      }

      const parts = resolved.parts.length >= 2 && resolved.parts[resolved.parts.length - 1] === 'length'
        ? resolved.parts.slice(0, -1) : resolved.parts
      if (resolved.isImportedState && resolved.storeVar && parts.length >= 1) {
        if (addGetterDeps(stateRefs?.get(resolved.storeVar), parts[0], resolved.storeVar)) return
      }
      add(parts, resolved.isImportedState ? resolved.storeVar : undefined)
    },
  })
}

export function collectTemplateSetupStatements(
  expr: t.Node,
  templateSetupContext: TemplateSetupContext | undefined,
): t.Statement[] {
  if (!templateSetupContext) return []

  const bindingMap = new Map<string, { statement: t.Statement; index: number }>()
  const fp = templateSetupContext.params[0]
  const pb = fp && !t.isRestElement(fp) ? getTemplateParamBinding(fp) : undefined
  if (pb) {
    const stmt = t.variableDeclaration('const', [
      t.variableDeclarator(t.cloneNode(pb, true), t.memberExpression(t.thisExpression(), t.identifier('props'))),
    ])
    for (const name of collectPatternIdentifiers(pb as t.LVal)) bindingMap.set(name, { statement: stmt, index: -1 })
  }
  templateSetupContext.statements.forEach((s, i) => {
    for (const name of collectStatementBindingNames(s)) bindingMap.set(name, { statement: s, index: i })
  })

  const included = new Set<number>()
  const visiting = new Set<string>()
  const ordered: Array<{ index: number; statement: t.Statement }> = []
  const includedParamNames = new Set<string>()

  const includeName = (name: string) => {
    const binding = bindingMap.get(name)
    if (!binding || visiting.has(name)) return

    visiting.add(name)
    collectReferencedIdentifiers(binding.statement).forEach(includeName)
    visiting.delete(name)

    if (binding.index === -1) includedParamNames.add(name)

    if (!included.has(binding.index)) {
      included.add(binding.index)
      ordered.push({ index: binding.index, statement: t.cloneNode(binding.statement, true) as t.Statement })
    }
  }

  collectReferencedIdentifiers(expr).forEach(includeName)

  ordered.sort((a, b) => a.index - b.index)

  const barrier = templateSetupContext.earlyReturnBarrierIndex
  if (barrier !== undefined && ordered.length > 0) {
    const stmtIndices = ordered.filter((e) => e.index >= 0).map((e) => e.index)
    if (stmtIndices.length > 0 && (Math.max(...stmtIndices) > barrier || Math.min(...stmtIndices) <= barrier)) {
      // Ensure all statements up to the barrier are included (early-return guard + preceding setup)
      const have = new Set(ordered.map((e) => e.index))
      for (let bi = 0; bi <= barrier; bi++) {
        if (!have.has(bi))
          ordered.push({ index: bi, statement: t.cloneNode(templateSetupContext.statements[bi], true) as t.Statement })
      }
      ordered.sort((a, b) => a.index - b.index)
    }
  }

  // Prune unused properties from param destructuring statements (index === -1)
  for (const { index, statement } of ordered) {
    if (index !== -1 || !t.isVariableDeclaration(statement)) continue
    const decl = statement.declarations[0]
    if (!t.isObjectPattern(decl.id)) continue
    decl.id.properties = decl.id.properties.filter((p) => {
      if (!t.isObjectProperty(p)) return true
      const k = t.isIdentifier(p.key) ? p.key.name : t.isStringLiteral(p.key) ? p.key.value : null
      return !k || includedParamNames.has(k)
    })
  }

  return ordered.map((e) => e.statement)
}

function collectStatementBindingNames(statement: t.Statement): string[] {
  if (t.isVariableDeclaration(statement))
    return statement.declarations.flatMap((d) => collectPatternIdentifiers(d.id as t.LVal))
  if ((t.isFunctionDeclaration(statement) || t.isClassDeclaration(statement)) && statement.id)
    return [statement.id.name]
  return []
}

function collectPatternIdentifiers(pattern: t.LVal): string[] {
  if (t.isIdentifier(pattern)) return [pattern.name]
  if (t.isRestElement(pattern)) return collectPatternIdentifiers(pattern.argument)
  if (t.isAssignmentPattern(pattern)) return collectPatternIdentifiers(pattern.left)
  if (t.isObjectPattern(pattern))
    return pattern.properties.flatMap((p) => collectPatternIdentifiers((t.isRestElement(p) ? p.argument : p.value) as t.LVal))
  if (t.isArrayPattern(pattern))
    return pattern.elements.flatMap((el) => el ? collectPatternIdentifiers(el as t.LVal) : [])
  return []
}

function collectReferencedIdentifiers(node: t.Node): Set<string> {
  const names = new Set<string>()
  const cloned = t.cloneNode(node, true)
  const prog = t.program([t.isStatement(cloned) ? cloned : t.expressionStatement(cloned as t.Expression)])
  traverse(prog, {
    noScope: true,
    Identifier(path: NodePath<t.Identifier>) { if (path.isReferencedIdentifier()) names.add(path.node.name) },
  })
  return names
}
