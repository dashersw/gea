let counter = Math.floor(Math.random() * 2147483648)

/** Optional provider for context-scoped UID generation (injected by SSR). */
let uidProvider: (() => string | null) | null = null

/** Optional provider for context-scoped UID reset (injected by SSR). */
let resetProvider: ((seed: number) => boolean) | null = null

const getUid = (): string => {
  if (uidProvider) {
    const id = uidProvider()
    if (id !== null) return id
  }
  return (counter++).toString(36)
}

/** Reset the UID counter to a deterministic seed. Used by SSR to ensure
 *  server and client produce matching component IDs. */
export function resetUidCounter(seed: number = 0): void {
  if (resetProvider && resetProvider(seed)) return
  counter = seed
}

/** Register a context-scoped UID provider (called by SSR package).
 *  Provider returns next UID string, or null to fall back to global counter.
 *  Reset returns true if it handled the reset, false to fall through. */
export function setUidProvider(
  provider: () => string | null,
  reset: (seed: number) => boolean,
): void {
  uidProvider = provider
  resetProvider = reset
}

/** Clear the context-scoped UID provider. */
export function clearUidProvider(): void {
  uidProvider = null
  resetProvider = null
}

export default getUid
