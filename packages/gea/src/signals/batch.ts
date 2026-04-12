// Wrap batchDepth in an object: ES module `export let` uses live binding
// getter/setter semantics in V8, while object property access is a plain read.
export const _batch = { depth: 0 };

// Two queues: computeds run before effects so derived state is settled
// before side effects (DOM updates) execute.
// Ping-pong buffers to avoid allocating new arrays/sets per flush wave.
let computedQueueA: (() => void)[] = [];
let computedQueueB: (() => void)[] = [];
let computedQueue = computedQueueA;
let computedQueueSet = new Set<() => void>();
let queueA: (() => void)[] = [];
let queueB: (() => void)[] = [];
let queue = queueA;
let queueSet = new Set<() => void>();

export function batch<T>(fn: () => T): T;
export function batch<T, A>(fn: (arg: A) => T, arg: A): T;
export function batch<T>(fn: (arg?: any) => T, arg?: any): T {
  _batch.depth++;
  try {
    return fn(arg);
  } finally {
    _batch.depth--;
    if (_batch.depth === 0) {
      flush();
    }
  }
}

export function queueEffect(fn: () => void): void {
  if ((fn as any).__computed) {
    if (!computedQueueSet.has(fn)) {
      computedQueueSet.add(fn);
      computedQueue.push(fn);
    }
  } else {
    if (!queueSet.has(fn)) {
      queueSet.add(fn);
      queue.push(fn);
    }
  }
}

// Reset for testing
export function resetBatch(): void {
  _batch.depth = 0;
  computedQueueA.length = 0;
  computedQueueB.length = 0;
  computedQueue = computedQueueA;
  computedQueueSet.clear();
  queueA.length = 0;
  queueB.length = 0;
  queue = queueA;
  queueSet.clear();
}

function flush(): void {
  let iterations = 0;
  while (computedQueue.length > 0 || queue.length > 0) {
    if (++iterations > 100) {
      console.warn('gea: flush loop exceeded 100 iterations, breaking');
      computedQueue.length = 0;
      computedQueueSet.clear();
      queue.length = 0;
      queueSet.clear();
      break;
    }
    // Phase 1: process all computeds until settled
    while (computedQueue.length > 0) {
      const fns = computedQueue;
      // Swap to alternate buffer so new enqueues go to fresh buffer
      computedQueue = (fns === computedQueueA) ? computedQueueB : computedQueueA;
      computedQueue.length = 0;
      computedQueueSet.clear();
      _batch.depth++;
      try {
        for (let i = 0; i < fns.length; i++) {
          fns[i]();
        }
      } finally {
        _batch.depth--;
      }
      fns.length = 0;
    }
    // Phase 2: process one wave of effects
    if (queue.length > 0) {
      const fns = queue;
      // Swap to alternate buffer
      queue = (fns === queueA) ? queueB : queueA;
      queue.length = 0;
      queueSet.clear();
      _batch.depth++;
      try {
        for (let i = 0; i < fns.length; i++) {
          fns[i]();
        }
      } finally {
        _batch.depth--;
      }
      fns.length = 0;
    }
  }
}
