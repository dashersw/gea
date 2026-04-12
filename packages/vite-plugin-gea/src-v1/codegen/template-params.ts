/**
 * Template parameter analysis helpers.
 *
 * Shared utilities for inspecting the `template(props)` method signature
 * to extract prop names, the whole-param identifier, and per-prop variable names.
 */
import { t } from '../utils/babel-interop.ts'
import { getTemplateParamBinding } from '../analyze/template-param-utils.ts'

export function getTemplatePropNames(classBody: t.ClassBody): Set<string> {
  const names = new Set<string>()
  const templateMethod = classBody.body.find(
    (m): m is t.ClassMethod => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === 'template',
  )
  const binding = templateMethod ? getTemplateParamBinding(templateMethod.params[0]) : undefined
  if (binding && t.isObjectPattern(binding)) {
    binding.properties.forEach((p) => {
      if (t.isObjectProperty(p) && t.isIdentifier(p.key)) names.add(p.key.name)
    })
  }
  return names
}

export function getTemplateParamIdentifier(classBody: t.ClassBody): string | undefined {
  const templateMethod = classBody.body.find(
    (m): m is t.ClassMethod => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === 'template',
  )
  const binding = templateMethod ? getTemplateParamBinding(templateMethod.params[0]) : undefined
  return t.isIdentifier(binding) ? binding.name : undefined
}

/** Get the variable name in scope for a prop (handles { options } vs { options: n }) */
export function getTemplatePropVarName(templateMethod: t.ClassMethod, propName: string): string {
  const pattern = getTemplateParamBinding(templateMethod.params[0])
  if (!pattern || !t.isObjectPattern(pattern)) return propName
  for (const p of pattern.properties) {
    if (!t.isObjectProperty(p)) continue
    const key = t.isIdentifier(p.key) ? p.key.name : t.isStringLiteral(p.key) ? p.key.value : null
    if (key !== propName) continue
    const value = p.value
    if (t.isIdentifier(value)) return value.name
    return propName
  }
  return propName
}
