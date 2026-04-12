export interface DepSet {
  delete(fn: () => void): boolean;
  add(fn: () => void): void;
}

export interface EffectNode {
  fn: () => void;
  deps: DepSet[];
  children: EffectNode[];
  parent: EffectNode | null;
  disposed: boolean;
  _parentIdx: number; // Index in parent.children for O(1) removal
}

const effectStack: EffectNode[] = [];
let activeEffect: EffectNode | undefined = undefined;

export function pushEffect(node: EffectNode): void {
  effectStack.push(activeEffect = node);
}

export function popEffect(): void {
  effectStack.pop();
  activeEffect = effectStack[effectStack.length - 1];
}

export function getActiveEffect(): EffectNode | undefined {
  return activeEffect;
}

// Disposal scope: flat array of disposable objects.
// When set, computations register here instead of parent-child tree.
export interface Disposable { dispose(): void; }

let disposalScope: Disposable[] | null = null;

export function setDisposalScope(scope: Disposable[] | null): void {
  disposalScope = scope;
}

export function getDisposalScope(): Disposable[] | null {
  return disposalScope;
}

// Reset all global state — for testing only
export function resetState(): void {
  effectStack.length = 0;
  activeEffect = undefined;
  disposalScope = null;
}
