import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  _registerConfirmHandler,
  type ConfirmOptions,
} from "@/components/ui/confirm";

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions | null;
  resolve: ((v: boolean) => void) | null;
}

const INITIAL: ConfirmState = { open: false, options: null, resolve: null };

export function ConfirmRoot() {
  const { t } = useTranslation("common");
  const [state, setState] = useState<ConfirmState>(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    _registerConfirmHandler((opts) => {
      if (stateRef.current.resolve) {
        return Promise.resolve(false);
      }
      return new Promise<boolean>((resolve) => {
        setState({ open: true, options: opts, resolve });
      });
    });
    return () => _registerConfirmHandler(null);
  }, []);

  function close(result: boolean) {
    state.resolve?.(result);
    setState({ open: false, options: null, resolve: null });
  }

  const opts = state.options;

  return (
    <AlertDialog
      open={state.open}
      onOpenChange={(o) => {
        if (!o) close(false);
      }}
    >
      <AlertDialogContent className="max-w-sm gap-3 rounded-md p-4">
        {opts && (
          <>
            <AlertDialogHeader className="space-y-1.5">
              <AlertDialogTitle className="text-sm font-semibold">
                {opts.title}
              </AlertDialogTitle>
              {opts.description && (
                <AlertDialogDescription className="text-xs leading-relaxed">
                  {opts.description}
                </AlertDialogDescription>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-1.5 sm:gap-1.5">
              <AlertDialogCancel
                onClick={() => close(false)}
                className="mt-0 h-8 rounded px-3 text-xs"
              >
                {opts.cancelLabel ?? t("button.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => close(true)}
                className={cn(
                  "h-8 rounded px-3 text-xs",
                  opts.danger &&
                    "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                )}
              >
                {opts.confirmLabel ?? t("button.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
