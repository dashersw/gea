export class Store {
  /**
   * Observe a compiled signal property by name. The callback fires whenever
   * the underlying signal changes. Returns a dispose function that removes
   * the subscription.
   *
   * Works with compiled stores where field `foo` is transformed to
   * `[Symbol.for('gea.field.foo')]` (a Signal instance) by the Gea compiler.
   */
  observe(propertyName: string, callback: () => void): () => void {
    const sig = (this as any)[Symbol.for(`gea.field.${propertyName}`)]
    if (sig && typeof sig.subscribe === 'function') {
      return sig.subscribe(callback)
    }
    // Fallback: no-op dispose if the property is not a compiled signal
    return () => {}
  }
}
