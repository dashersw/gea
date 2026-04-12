import { effect } from '../signals/index.js';

export interface EffectScope {
  run(fn: () => void): () => void;
  dispose(): void;
}

export function createEffectScope(): EffectScope {
  const disposers: (() => void)[] = [];

  return {
    run(fn: () => void): () => void {
      const dispose = effect(fn);
      disposers.push(dispose);
      return dispose;
    },
    dispose(): void {
      for (const d of disposers) {
        d();
      }
      disposers.length = 0;
    },
  };
}
