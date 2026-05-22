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
      setForm({
        name: initial.name,
        host: initial.host,
        port: initial.port,
        user: initial.user,
        password: initial.password,
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
      const result = await ds.testConnectionConfig(form);
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New Connection" : "Edit Connection"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <Field label="Name" error={errors.name}>
            <Input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="my-connection"
              autoFocus
            />
          </Field>
          <Field label="Host" error={errors.host}>
            <Input
              value={form.host}
              onChange={(e) => update("host", e.target.value)}
              placeholder="tdengine.example.com"
            />
          </Field>
          <Field label="Port" error={errors.port}>
            <Input
              type="number"
              value={form.port}
              onChange={(e) =>
                update("port", Number.parseInt(e.target.value, 10) || 0)
              }
            />
          </Field>
          <Field label="User" error={errors.user}>
            <Input
              value={form.user}
              onChange={(e) => update("user", e.target.value)}
            />
          </Field>
          <Field label="Password" error={errors.password}>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
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
          >
            {busy === "test" ? "Testing…" : "Test"}
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy === "save"}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={hasErrors || busy !== null}
            >
              {busy === "save" ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>

        <p className="text-muted-foreground/70 mt-2 text-xs">
          ⚠ Phase 1: password stored locally as plaintext; queries return
          mock data regardless of host.
        </p>
      </DialogContent>
    </Dialog>
  );
}

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
