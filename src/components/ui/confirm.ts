export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type Handler = (opts: ConfirmOptions) => Promise<boolean>;

let _handler: Handler | null = null;

export function confirm(options: ConfirmOptions): Promise<boolean> {
  if (!_handler) return Promise.resolve(false);
  return _handler(options);
}

export function _registerConfirmHandler(fn: Handler | null): void {
  _handler = fn;
}
