import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useDataSource } from "@/datasource/context";
import { useAppState } from "@/store/appState";
import type {
  Connection,
  ConnectionInput,
  TestConnectionResult,
} from "@/datasource/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "create" | "edit";

type FieldErrors = Partial<Record<keyof ConnectionInput, string>>;

interface ConnectionFormDialogProps {
  open: boolean;
  mode: Mode;
  initial?: Connection;
  onOpenChange: (open: boolean) => void;
  onSaved?: (conn: Connection) => void;
}

const DEFAULT_FORM: ConnectionInput = {
  name: "",
  host: "",
  port: 6041,
  user: "root",
  password: "",
};

function validate(
  form: ConnectionInput,
  existing: Connection[],
  selfId: string | undefined,
): FieldErrors {
  const errors: FieldErrors = {};
  const name = form.name.trim();
  if (name === "") {
    errors.name = "Name is required";
  } else if (
    existing.some((c) => c.id !== selfId && c.name === name)
  ) {
    errors.name = "Connection name already exists";
  }
  if (form.host.trim() === "") {
    errors.host = "Host is required";
  }
  if (
    !Number.isInteger(form.port) ||
    form.port < 1 ||
    form.port > 65535
  ) {
    errors.port = "Port must be 1-65535";
  }
  if (form.user.trim() === "") {
    errors.user = "User is required";
  }
  return errors;
}

export function ConnectionFormDialog({
  open,
  mode,
  initial,
  onOpenChange,
  onSaved,
}: ConnectionFormDialogProps) {
  const ds = useDataSource();
  const connections = useAppState((s) => s.connections);

  const [form, setForm] = useState<ConnectionInput>(DEFAULT_FORM);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(
    null,
  );
  const [busy, setBusy] = useState<"test" | "save" | null>(null);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      // Password is intentionally left empty; the field's placeholder hints
      // that empty means "keep current". The backend skips the vault write
      // when password is empty in update, so editing other fields never
      // accidentally wipes the stored credential.
      setForm({
        name: initial.name,
        host: initial.host,
        port: initial.port,
        user: initial.user,
        password: "",
        color: initial.color,
      });
    } else {
      setForm(DEFAULT_FORM);
    }
    setTestResult(null);
    setBusy(null);
  }, [open, mode, initial]);

  const errors = validate(form, connections, initial?.id);
  const hasErrors = Object.keys(errors).length > 0;

  function update<K extends keyof ConnectionInput>(
    key: K,
    value: ConnectionInput[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleTest() {
    setBusy("test");
    setTestResult(null);
    try {
      // In edit mode the password field is empty by design — fall back to
      // the existing connection's stored password for the test probe so the
      // user can verify "did the other fields break it" without re-typing.
      const effective: ConnectionInput =
        mode === "edit" && initial && form.password === ""
          ? { ...form, password: initial.password }
          : form;
      const result = await ds.testConnectionConfig(effective);
      setTestResult(result);
      if (result.ok) {
        toast.success("Connection OK");
      } else {
        toast.error(result.message ?? "Connection failed");
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleSave() {
    if (hasErrors) return;
    setBusy("save");
    try {
      const trimmed: ConnectionInput = { ...form, name: form.name.trim() };
      if (mode === "create") {
        const created = await ds.createConnection(trimmed);
        toast.success("Connection created");
        onSaved?.(created);
      } else if (initial) {
        await ds.updateConnection(initial.id, trimmed);
        toast.success("Connection updated");
        onSaved?.({ ...initial, ...trimmed });
      }
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-3 p-4 rounded-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            {mode === "create" ? "New Connection" : "Edit Connection"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-2.5 py-1">
          <Field label="Name" error={errors.name}>
            <Input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="my-connection"
              autoFocus
              className={inputClass}
            />
          </Field>
          <Field label="Host" error={errors.host}>
            <Input
              value={form.host}
              onChange={(e) => update("host", e.target.value)}
              placeholder="tdengine.example.com"
              className={inputClass}
            />
          </Field>
          <Field label="Port" error={errors.port}>
            <Input
              type="number"
              value={form.port}
              onChange={(e) =>
                update("port", Number.parseInt(e.target.value, 10) || 0)
              }
              className={inputClass}
            />
          </Field>
          <Field label="User" error={errors.user}>
            <Input
              value={form.user}
              onChange={(e) => update("user", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Password" error={errors.password}>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              placeholder={
                mode === "edit" ? "Leave empty to keep current" : ""
              }
              className={inputClass}
            />
          </Field>
        </div>

        {testResult && (
          <p
            className={cn(
              "text-xs",
              testResult.ok ? "text-emerald-500" : "text-destructive",
            )}
          >
            {testResult.ok
              ? "✓ Connection OK"
              : `✕ ${testResult.message ?? "Connection failed"}`}
          </p>
        )}

        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
            disabled={busy !== null}
            className={btnClass}
          >
            {busy === "test" ? "Testing…" : "Test"}
          </Button>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy === "save"}
              className={btnClass}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={hasErrors || busy !== null}
              className={btnClass}
            >
              {busy === "save" ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Compact form-control styling shared by every input + button in this dialog,
// matching the density of the right-click context menu elsewhere in the app.
const inputClass =
  "h-8 rounded px-2.5 text-xs md:text-xs focus-visible:ring-1 focus-visible:ring-offset-0";
const btnClass = "h-8 rounded px-3 text-xs";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
