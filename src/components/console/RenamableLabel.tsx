import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface RenamableLabelProps {
  value: string;
  /**
   * Persist the rename. Reject with an Error to indicate a name conflict;
   * the component then keeps the input open and shows a visual error cue.
   */
  onRename: (next: string) => Promise<void>;
  /** Optional className for the displayed label (not the input). */
  className?: string;
  /** Optional className for the input box (default size styles applied). */
  inputClassName?: string;
}

export function RenamableLabel({
  value,
  onRename,
  className,
  inputClassName,
}: RenamableLabelProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [hasError, setHasError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep draft in sync with external value while not editing.
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  // Focus and select on enter-edit.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  async function commit() {
    const next = draft.trim();
    if (!next || next === value) {
      setEditing(false);
      setDraft(value);
      setHasError(false);
      return;
    }
    try {
      await onRename(next);
      setEditing(false);
      setHasError(false);
    } catch {
      setHasError(true);
      // keep input open
    }
  }

  function cancel() {
    setEditing(false);
    setDraft(value);
    setHasError(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (hasError) setHasError(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        onBlur={() => {
          void commit();
        }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        className={cn(
          "border-border bg-background text-foreground focus:ring-primary/40 rounded-sm border px-1 text-xs outline-none focus:ring-2",
          hasError && "border-destructive ring-destructive/40 ring-2",
          inputClassName,
        )}
      />
    );
  }

  return (
    <span
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className={cn("truncate", className)}
      title={value}
    >
      {value}
    </span>
  );
}
