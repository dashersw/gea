type GuardResult = true | string | any
type GuardFn = () => GuardResult

export function runGuards(guards: GuardFn[]): GuardResult {
  for (const guard of guards) {
    const result = guard()
    if (result !== true) return result
  }
  return true
}
