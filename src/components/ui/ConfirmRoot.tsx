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
      <AlertDialogContent>
        {opts && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{opts.title}</AlertDialogTitle>
              {opts.description && (
                <AlertDialogDescription>
                  {opts.description}
                </AlertDialogDescription>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => close(false)}>
                {opts.cancelLabel ?? t("button.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => close(true)}
                className={cn(
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
