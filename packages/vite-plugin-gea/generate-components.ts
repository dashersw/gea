import * as t from '@babel/types'
import { appendToBody, id, js, jsMethod } from 'eszter'
import type { NodePath } from '@babel/traverse'
import type { ChildComponent } from './ir.ts'
import { pruneUnusedSetupDestructuring } from './utils.ts'

export function childHasNoProps(child: ChildComponent): boolean {
  return t.isObjectExpression(child.propsExpression) && child.propsExpression.properties.length === 0
}
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const traverse = require('@babel/traverse').default

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
  componentInstances: Map<string, ChildComponent[]>,
  directForwardingChildren?: Set<string>,
): void {
  if (componentInstances.size === 0) return

  const childComponents = Array.from(componentInstances.values()).flat()
  const constructionOrder = [...childComponents].sort((a, b) => (b.dfsIndex ?? 0) - (a.dfsIndex ?? 0))
  const instanceStatements = buildInstanceStatements(constructionOrder)

  let injected = false
  traverse(ast, {
    ClassMethod(path: NodePath<t.ClassMethod>) {
      if (!t.isIdentifier(path.node.key) || path.node.key.name !== 'constructor') return
      const body = path.node.body.body
      body.push(...instanceStatements)
      injected = true
    },
  })

  if (!injected) {
    traverse(ast, {
      ClassDeclaration(path: NodePath<t.ClassDeclaration>) {
        if (!t.isIdentifier(path.node.superClass)) return
        const ctor = appendToBody(
          jsMethod`constructor(...args) {}`,
          t.expressionStatement(t.callExpression(t.super(), [t.spreadElement(t.identifier('args'))])),
          ...instanceStatements,
        )
        path.node.body.body.unshift(ctor)
      },
    })
  }

  traverse(ast, {
    ClassDeclaration(path: NodePath<t.ClassDeclaration>) {
      if (!t.isIdentifier(path.node.superClass)) return

      childComponents.forEach((child) => {
        const isDirect = directForwardingChildren?.has(child.instanceVar)
        const noProps = childHasNoProps(child)
        const hasPropsBuilder = !isDirect && !noProps
        if (hasPropsBuilder) {
          path.node.body.body.push(buildPropsBuilderMethod(child))
          path.node.body.body.push(buildRefreshMethod(child))
        }
        path.node.body.body.push(buildEnsureMethod(child, hasPropsBuilder))
      })
      ensureDisposeMethod(path.node.body, childComponents)
    },
  })
}

export function injectComponentRegistrations(ast: t.File, componentInstances: Map<string, string>): void {
  traverse(ast, {
    ClassMethod(path: NodePath<t.ClassMethod>) {
      if (!t.isIdentifier(path.node.key) || path.node.key.name !== 'template') return
      const registrations = Array.from(componentInstances.keys()).map((tagName) =>
        t.expressionStatement(
          t.callExpression(t.memberExpression(t.identifier('Component'), t.identifier('_register')), [
            t.identifier(tagName),
          ]),
        ),
      )
      path.node.body.body.splice(0, 0, ...registrations)
    },
  })
}

function buildInstanceStatements(instances: ChildComponent[]): t.ExpressionStatement[] {
  const stmts: t.ExpressionStatement[] = []
  instances.forEach((child) => {
    stmts.push(js`this.${id(child.instanceVar)} = null;` as t.ExpressionStatement)
  })
  return stmts
}

function getPropsBuilderMethodName(child: ChildComponent): string {
  return `__buildProps_${child.instanceVar.replace(/^_/, '')}`
}

function getEnsureChildMethodName(child: ChildComponent): string {
  return `__ensureChild_${child.instanceVar.replace(/^_/, '')}`
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

  return appendToBody(jsMethod`${id(getPropsBuilderMethodName(child))}() {}`, ...prunedSetup, returnStmt)
}

function buildEnsureMethod(child: ChildComponent, hasPropsBuilder: boolean = true): t.ClassMethod {
  let propsArg: t.Expression
  if (hasPropsBuilder && !childHasNoProps(child)) {
    propsArg = t.callExpression(
      t.memberExpression(t.thisExpression(), t.identifier(getPropsBuilderMethodName(child))),
      [],
    )
  } else if (child.directMappings && child.directMappings.length > 0) {
    propsArg = t.objectExpression(
      child.directMappings.map((m) =>
        t.objectProperty(
          t.identifier(m.childPropName),
          t.memberExpression(
            t.memberExpression(t.thisExpression(), t.identifier('props')),
            t.identifier(m.parentPropName),
          ),
        ),
      ),
    )
  } else {
    propsArg = t.objectExpression([])
  }

  const refreshPropsStmt =
    hasPropsBuilder && !childHasNoProps(child)
      ? t.expressionStatement(
          t.callExpression(
            t.memberExpression(
              t.memberExpression(t.thisExpression(), t.identifier(child.instanceVar)),
              t.identifier('__geaUpdateProps'),
            ),
            [
              t.callExpression(
                t.memberExpression(t.thisExpression(), t.identifier(getPropsBuilderMethodName(child))),
                [],
              ),
            ],
          ),
        )
      : null

  return appendToBody(
    jsMethod`${id(getEnsureChildMethodName(child))}() {}`,
    t.ifStatement(
      t.unaryExpression('!', t.memberExpression(t.thisExpression(), t.identifier(child.instanceVar))),
      t.blockStatement([
        t.expressionStatement(
          t.assignmentExpression(
            '=',
            t.memberExpression(t.thisExpression(), t.identifier(child.instanceVar)),
            t.newExpression(t.identifier(child.tagName), [propsArg]),
          ),
        ),
        js`this.${id(child.instanceVar)}.parentComponent = this;` as t.ExpressionStatement,
        js`this.${id(child.instanceVar)}.__geaCompiledChild = true;` as t.ExpressionStatement,
      ]),
      refreshPropsStmt ? t.blockStatement([refreshPropsStmt]) : undefined,
    ),
    t.returnStatement(t.memberExpression(t.thisExpression(), t.identifier(child.instanceVar))),
  )
}

function buildRefreshMethod(child: ChildComponent): t.ClassMethod {
  const method = jsMethod`${id(`__refreshChildProps_${child.instanceVar.replace(/^_/, '')}`)}() {}`
  method.body.body.push(js`const child = this.${id(child.instanceVar)};` as t.VariableDeclaration)

  if (child.lazy) {
    method.body.body.push(
      t.ifStatement(t.unaryExpression('!', t.identifier('child')), t.blockStatement([t.returnStatement()])),
    )
  } else {
    method.body.body.push(
      t.ifStatement(t.unaryExpression('!', t.identifier('child')), t.blockStatement([t.returnStatement()])),
    )
  }

  method.body.body.push(
    js`child.__geaUpdateProps(this.${id(getPropsBuilderMethodName(child))}());` as t.ExpressionStatement,
  )

  return method
}

function ensureDisposeMethod(classBody: t.ClassBody, children: ChildComponent[]): void {
  const disposeCalls = children.map((child) => js`this.${id(child.instanceVar)}?.dispose?.();` as t.ExpressionStatement)

  const existingDispose = classBody.body.find(
    (member) => t.isClassMethod(member) && t.isIdentifier(member.key) && member.key.name === 'dispose',
  ) as t.ClassMethod | undefined

  if (existingDispose) {
    existingDispose.body.body.unshift(...disposeCalls)
    return
  }

  classBody.body.push(
    appendToBody(jsMethod`${id('dispose')}() {}`, ...disposeCalls, js`super.dispose();` as t.ExpressionStatement),
  )
}
