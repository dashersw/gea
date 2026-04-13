const GEA_SYMBOL_KEY_MAP: Record<string, string> = {
  'gea.element': '0',
  'gea.dom.component': '1',
  'gea.component.createTemplate': '2',
  'gea.component.setProps': '3',
  'gea.proxy.raw': '4',
  'gea.store.rootProxy': '5',
  'gea.component.parentComponent': '6',
  'gea.itemKey': '7',
  'gea.proxy.isProxy': '8',
  'gea.onPropChange': '9',
  'gea.d.dirty': '10',
  'gea.d.dirtyProps': '11',
  'gea.domCompiledChildRoot': '12',
  'gea.store.rootProxyHandlerFactory': '13',
  'gea.ccs': '14',
  'gea.rendered': '15',
  'gea.maps': '16',
  'gea.isRouterOutlet': '17',
  'gea.router.depth': '18',
  'gea.router.ref': '19',
  'gea.compiled.child': '20',
  'gea.compiled': '21',
}

export function minifyGeaSymbolForKeys(code: string): string {
  let out = code
  for (const [from, to] of Object.entries(GEA_SYMBOL_KEY_MAP)) {
    out = out.replaceAll(`Symbol.for("${from}")`, `Symbol.for("${to}")`)
    out = out.replaceAll(`Symbol.for('${from}')`, `Symbol.for('${to}')`)
    out = out.replaceAll(`Symbol.for(\`${from}\`)`, `Symbol.for(\`${to}\`)`)
  }
  return out
}
