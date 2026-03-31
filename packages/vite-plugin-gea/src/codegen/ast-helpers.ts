/**
 * Shared AST utilities for the Gea compiler codegen.
 *
 * This barrel re-exports every public helper so that existing imports
 * from `./ast-helpers` continue to work unchanged.
 */

export {
  getJSXTagName,
  isUpperCase,
  isComponentTag,
  camelToKebab,
  isAlwaysStringExpression,
  isWhitespaceFree,
  buildTrimmedClassValueExpression,
  buildTrimmedClassJoinedExpression,
  generateSelector,
  getDirectChildElements,
} from './jsx-utils.ts'

export {
  ensureImport,
  buildMemberChain,
  buildMemberChainFromParts,
  buildOptionalMemberChain,
  buildOptionalMemberChainFromParts,
  normalizePathParts,
  pathPartsToString,
  buildObserveKey,
  parseObserveKey,
  getObserveMethodName,
  resolvePath,
} from './member-chain.ts'

export {
  extractHandlerBody,
  replacePropRefsInStatements,
  replacePropRefsInExpression,
  replaceThisPropsRootWithValueParam,
  derivedExprGuardsValueWhenNullish,
  expressionAccessesValueProperties,
  pruneDeadParamDestructuring,
  pruneUnusedSetupDestructuring,
} from './prop-ref-utils.ts'

export {
  earlyReturnFalsyBindingName,
  optionalizeMemberChainsFromBindingRoot,
  optionalizeBindingRootInStatements,
  optionalizeMemberChainsAfterComputedItemKey,
  optionalizeComputedItemKeyInStatements,
} from './optionalize-utils.ts'

export {
  cacheThisIdInMethod,
  wrapEventsGetterWithCache,
  collectValueSubpaths,
  wrapSubpathCacheGuards,
  loggingCatchClause,
} from './postprocess-helpers.ts'
