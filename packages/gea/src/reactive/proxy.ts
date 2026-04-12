export const RAW = Symbol('gea.raw');

export function toRaw<T extends object>(proxy: T): T {
  return (proxy as any)[RAW] ?? proxy;
}
