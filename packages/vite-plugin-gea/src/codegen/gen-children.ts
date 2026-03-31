import { traverse, t } from '../utils/babel-interop.ts'
import type { NodePath } from '../utils/babel-interop.ts'
import { appendToBody, id, js, jsExpr, jsMethod } from 'eszter'
import type { ChildComponent } from '../ir/types.ts'
import { pruneUnusedSetupDestructuring, loggingCatchClause } from './ast-helpers.ts'
import { pascalToKebab } from '../utils/html.ts'

export function childHasNoProps(child: ChildComponent): boolean {
  return t.isObjectExpression(child.propsExpression) && child.propsExpression.properties.length === 0
}

export interface DirectPropMapping {
  parentPropName: string
  childPropName: string
}

export function getDirectPropMappings(
  child: ChildComponent,
  templatePropNames: Set<string>,
): DirectPropMapping[] | null {
  if (!child.propsExpression || !t.isObjectExpression(child.propsExpression)) return null
  const mappings: DirectPropMapping[] = []
  for (const prop of child.propsExpression.properties) {
    if (!t.isObjectProperty(prop)) return null
    const childPropName = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null
    if (!childPropName) return null
    const value = prop.value
    if (!t.isIdentifier(value) || !templatePropNames.has(value.name)) return null
    mappings.push({ parentPropName: value.name, childPropName })
  }
  return mappings.length > 0 ? mappings : null
}

export function injectChildComponents(
  ast: t.File,
  className: string,
  children: Map<string, ChildComponent[]>,
  imports: Map<string, string>,
  storeImports: Map<string, string>,
  knownComponentImports: Set<string>,
  directForwardingChildren?: Set<string>,
): void {
  if (children.size === 0) return

  const childComponents = Array.from(children.values()).flat()
  const constructionOrder = [...childComponents].sort((a, b) => (b.dfsIndex ?? 0) - (a.dfsIndex ?? 0))
  const instanceStatements = buildInstanceStatements(constructionOrder, directForwardingChildren)
  const lazyChildren = constructionOrder.filter((child) => child.lazy)

  let injected = false
  traverse(ast, {
    ClassDeclaration(path: NodePath<t.ClassDeclaration>) {
      if (!t.isIdentifier(path.node.superClass)) return
      if (!t.isIdentifier(path.node.id) || path.node.id.name !== className) return

      const existingCtor = path.node.body.body.find(
        (m): m is t.ClassMethod => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === 'constructor',
      )
      if (existingCtor) {
        existingCtor.body.body.push(...instanceStatements)
        injected = true
      } else if (!injected) {
        const ctor = appendToBody(
          jsMethod`constructor(...args) {}`,
          js`super(...args);`,
          ...instanceStatements,
        )
        path.node.body.body.unshift(ctor)
        injected = true
      }

      for (const child of lazyChildren) {
        const isDirect = directForwardingChildren?.has(child.instanceVar)
        const noProps = childHasNoProps(child)
        const hasPropsBuilder = !isDirect && !noProps
        const backingField = `__lazy${child.instanceVar}`

        let propsArg: t.Expression
        if (hasPropsBuilder) {
          propsArg = jsExpr`this.${id(getPropsBuilderMethodName(child))}()`
        } else if (child.directMappings && child.directMappings.length > 0) {
          propsArg = t.objectExpression(
            child.directMappings.map((m) =>
              t.objectProperty(
                id(m.childPropName),
                jsExpr`this.props.${id(m.parentPropName)}`,
              ),
            ),
          )
        } else {
          propsArg = t.objectExpression([])
        }

        const getter = t.classMethod(
          'get',
          id(child.instanceVar),
          [],
          t.blockStatement([
            js`if (!this.${id(backingField)}) { this.${id(backingField)} = this.__child(${id(child.tagName)}, ${propsArg}); }`,
            js`return this.${id(backingField)};`,
          ]),
        )
        path.node.body.body.push(getter)
      }

      childComponents.forEach((child) => {
        const isDirect = directForwardingChildren?.has(child.instanceVar)
        const noProps = childHasNoProps(child)
        const hasPropsBuilder = !isDirect && !noProps
        if (hasPropsBuilder) {
          path.node.body.body.push(buildPropsBuilderMethod(child))
        }
      })
    },
  })
}

export function injectComponentRegistrations(
  ast: t.File,
  className: string,
  children: Map<string, string>,
  knownComponentImports: Set<string>,
): void {
  traverse(ast, {
    ClassMethod(path: NodePath<t.ClassMethod>) {
      if (!t.isIdentifier(path.node.key) || path.node.key.name !== 'template') return
      const ownerClass = path.findParent((p) => t.isClassDeclaration(p.node)) as NodePath<t.ClassDeclaration> | null
      if (ownerClass && t.isIdentifier(ownerClass.node.id) && ownerClass.node.id.name !== className) return
      const registrations = Array.from(children.keys()).map((tagName) =>
        t.expressionStatement(
          t.callExpression(t.memberExpression(id('Component'), id('_register')), [
            id(tagName),
            t.stringLiteral(pascalToKebab(tagName)),
          ]),
        ),
      )
      path.node.body.body.splice(0, 0, ...registrations)
    },
  })
}

// ─── Internal helpers ──────────────────────────────────────────────────────

function buildInstanceStatements(
  instances: ChildComponent[],
  directForwardingChildren?: Set<string>,
): t.ExpressionStatement[] {
  const stmts: t.ExpressionStatement[] = []
  instances.forEach((child) => {
    if (child.lazy) return
    let propsArg: t.Expression
    const isDirect = directForwardingChildren?.has(child.instanceVar)
    const noProps = childHasNoProps(child)
    const hasPropsBuilder = !isDirect && !noProps

    if (hasPropsBuilder) {
      propsArg = jsExpr`this.${id(getPropsBuilderMethodName(child))}()`
    } else if (child.directMappings && child.directMappings.length > 0) {
      propsArg = t.objectExpression(
        child.directMappings.map((m) =>
          t.objectProperty(
            id(m.childPropName),
            jsExpr`this.props.${id(m.parentPropName)}`,
          ),
        ),
      )
    } else {
      propsArg = t.objectExpression([])
    }

    stmts.push(
      js`this.${id(child.instanceVar)} = this.__child(${id(child.tagName)}, ${propsArg});` as t.ExpressionStatement,
    )
  })
  return stmts
}

function getPropsBuilderMethodName(child: ChildComponent): string {
  return `__buildProps_${child.instanceVar.replace(/^_/, '')}`
}

function collectBindingNames(stmt: t.Statement): string[] {
  if (t.isVariableDeclaration(stmt)) {
    const names: string[] = []
    const collect = (node: t.LVal) => {
      if (t.isIdentifier(node)) names.push(node.name)
      else if (t.isObjectPattern(node))
        node.properties.forEach((p) =>
          collect(t.isRestElement(p) ? p.argument : ((p as t.ObjectProperty).value as t.LVal)),
        )
      else if (t.isArrayPattern(node)) node.elements.forEach((e) => e && collect(e))
    }
    stmt.declarations.forEach((d) => collect(d.id as t.LVal))
    return names
  }
  return []
}

function collectTestIdentifiers(node: t.Node): Set<string> {
  const names = new Set<string>()
  const visit = (n: t.Node) => {
    if (t.isIdentifier(n)) names.add(n.name)
    for (const key of t.VISITOR_KEYS[n.type] || []) {
      const child = (n as any)[key]
      if (Array.isArray(child)) child.forEach((c: any) => c?.type && visit(c))
      else if (child?.type) visit(child)
    }
  }
  visit(node)
  return names
}

function buildPropsBuilderMethod(child: ChildComponent): t.ClassMethod {
  const propsStmtClones = (child.setupStatements || []).map((statement) => t.cloneNode(statement, true) as t.Statement)
  const returnStmt = t.returnStatement(t.cloneNode(child.propsExpression, true))

  const propsIdentifiers = collectTestIdentifiers(returnStmt)
  for (const stmt of propsStmtClones) {
    for (const name of collectTestIdentifiers(stmt)) propsIdentifiers.add(name)
  }

  const relevantGuards = (child.earlyReturnGuards || []).filter((guard) => {
    const testRefs = collectTestIdentifiers(guard.test)
    return [...testRefs].some((name) => propsIdentifiers.has(name))
  })

  const existingBindings = new Set(propsStmtClones.flatMap(collectBindingNames))
  const guardStmtClones =
    relevantGuards.length > 0
      ? (child.guardSetupStatements || [])
          .filter((s) => !collectBindingNames(s).every((n) => existingBindings.has(n)))
          .map((s) => t.cloneNode(s, true) as t.Statement)
      : []
  const setupStmts = [...guardStmtClones, ...propsStmtClones]

  const guardNodes: t.Node[] = relevantGuards.map((g) => g.test)
  const prunedSetup = pruneUnusedSetupDestructuring(setupStmts, [returnStmt, ...guardNodes])

  for (const guard of relevantGuards) {
    const guardStmt = t.ifStatement(t.cloneNode(guard.test, true), t.returnStatement(t.objectExpression([])))
    const testRefs = collectTestIdentifiers(guard.test)
    let insertIndex = 0
    for (let i = 0; i < prunedSetup.length; i++) {
      if (collectBindingNames(prunedSetup[i]).some((name) => testRefs.has(name))) {
        insertIndex = i + 1
      }
    }
    prunedSetup.splice(insertIndex, 0, guardStmt)
  }

  const hasPropsDestructure = prunedSetup.some(
    (stmt) =>
      t.isVariableDeclaration(stmt) &&
      stmt.declarations.some(
        (d) =>
          t.isObjectPattern(d.id) &&
          t.isMemberExpression(d.init) &&
          t.isThisExpression(d.init.object) &&
          t.isIdentifier(d.init.property) &&
          d.init.property.name === 'props',
      ),
  )

  if (hasPropsDestructure) {
    const tryBlock = t.blockStatement([...prunedSetup, returnStmt])
    const tryCatch = t.tryStatement(tryBlock, loggingCatchClause([t.returnStatement(t.objectExpression([]))]))
    return appendToBody(jsMethod`${id(getPropsBuilderMethodName(child))}() {}`, tryCatch)
  }

  return appendToBody(jsMethod`${id(getPropsBuilderMethodName(child))}() {}`, ...prunedSetup, returnStmt)
}
