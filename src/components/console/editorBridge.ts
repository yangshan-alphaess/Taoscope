type InsertFn = (text: string) => void;

let _fn: InsertFn | null = null;

export function register(fn: InsertFn): void {
  _fn = fn;
}

export function unregister(): void {
  _fn = null;
}

export function insert(text: string): void {
  if (_fn) _fn(text);
}
