import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface RenamableLabelProps {
  value: string;
  onRename: (next: string) => Promise<void>;
  /** When true, force the input into editing mode (e.g., from a Rename menu item). */
  startEditing?: boolean;
  /** Notify parent when editing state transitions, so it can clear its trigger. */
  onEditingChange?: (editing: boolean) => void;
  className?: string;
  inputClassName?: string;
}

export function RenamableLabel({
  value,
  onRename,
  startEditing,
  onEditingChange,
  className,
  inputClassName,
}: RenamableLabelProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [hasError, setHasError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (startEditing && !editing) {
      setEditing(true);
      setDraft(value);
    }
  }, [startEditing, editing, value]);

  useEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);

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
