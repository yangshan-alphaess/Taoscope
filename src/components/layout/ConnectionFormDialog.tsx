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

const DEFAULT_TIMEOUT_SEC = 30;

const DEFAULT_FORM: ConnectionInput = {
  name: "",
  host: "",
  port: 6041,
  user: "root",
  password: "",
  authMode: "basic",
  token: "",
  protocol: "http",
  allowInvalidCerts: false,
  transport: "http",
};

/** Encode protocol + transport into one of four user-visible scheme labels. */
function schemeLabel(
  protocol: "http" | "https",
  transport: "http" | "ws",
): "http" | "https" | "ws" | "wss" {
  if (transport === "ws") {
    return protocol === "https" ? "wss" : "ws";
  }
  return protocol;
}

function schemeToFields(scheme: "http" | "https" | "ws" | "wss"): {
  protocol: "http" | "https";
  transport: "http" | "ws";
} {
  switch (scheme) {
    case "wss":
      return { protocol: "https", transport: "ws" };
    case "ws":
      return { protocol: "http", transport: "ws" };
    case "https":
      return { protocol: "https", transport: "http" };
    case "http":
    default:
      return { protocol: "http", transport: "http" };
  }
}

function validate(
  form: ConnectionInput,
  existing: Connection[],
  selfId: string | undefined,
  mode: Mode,
  initial: Connection | undefined,
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
  if (form.authMode === "token") {
    const tokenEmpty = (form.token ?? "").length === 0;
    const switchedIntoToken =
      mode === "create" || initial?.authMode !== "token";
    if (tokenEmpty && switchedIntoToken) {
      errors.token = "Token is required";
    }
  }
  if (form.timeoutMs !== undefined) {
    const sec = form.timeoutMs / 1000;
    if (!Number.isInteger(sec) || sec < 1 || sec > 600) {
      errors.timeoutMs = "Timeout must be 1–600 seconds";
    }
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
      // Password / token are intentionally left empty; the placeholder hints
      // that empty means "keep current". The backend skips writing the secret
      // when the field is empty in update, so editing other fields never
      // accidentally wipes the stored credential.
      setForm({
        name: initial.name,
        host: initial.host,
        port: initial.port,
        user: initial.user,
        password: "",
        color: initial.color,
        authMode: initial.authMode ?? "basic",
        token: "",
        protocol: initial.protocol ?? "http",
        allowInvalidCerts: initial.allowInvalidCerts ?? false,
        transport: initial.transport ?? "http",
        timeoutMs: initial.timeoutMs,
      });
    } else {
      setForm(DEFAULT_FORM);
    }
    setTestResult(null);
    setBusy(null);
  }, [open, mode, initial]);

  const errors = validate(form, connections, initial?.id, mode, initial);
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
      // In edit mode the password / token fields are empty by design —
      // fall back to the existing connection's stored secret for the test
      // probe so the user can verify "did the other fields break it"
      // without re-typing.
      let effective: ConnectionInput = form;
      if (mode === "edit" && initial) {
        if (effective.password === "") {
          effective = { ...effective, password: initial.password };
        }
        if ((effective.token ?? "") === "" && initial.token) {
          effective = { ...effective, token: initial.token };
        }
      }
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
            <div className="flex gap-1.5">
              <select
                value={schemeLabel(form.protocol, form.transport)}
                onChange={(e) =>
                  setForm((prev) => {
                    const scheme = e.target.value as
                      | "http"
                      | "https"
                      | "ws"
                      | "wss";
                    const next = schemeToFields(scheme);
                    return {
                      ...prev,
                      protocol: next.protocol,
                      transport: next.transport,
                      // Reset cert-bypass when switching away from https.
                      allowInvalidCerts:
                        next.protocol === "https"
                          ? prev.allowInvalidCerts
                          : false,
                    };
                  })
                }
                className={cn(
                  "h-8 rounded border border-input bg-background px-2 text-xs",
                  "focus-visible:outline-none focus-visible:ring-1",
                )}
              >
                <option value="http">http://</option>
                <option value="https">https://</option>
                <option value="ws">ws://</option>
                <option value="wss">wss://</option>
              </select>
              <Input
                value={form.host}
                onChange={(e) => {
                  const raw = e.target.value;
                  // If a user pastes a full URL, split scheme + host:port.
                  const match = /^(wss?|https?):\/\/([^/:]+)(?::(\d+))?/i.exec(
                    raw,
                  );
                  if (match && match[1] && match[2]) {
                    const scheme = match[1].toLowerCase() as
                      | "http"
                      | "https"
                      | "ws"
                      | "wss";
                    const host = match[2];
                    const portStr = match[3];
                    const next = schemeToFields(scheme);
                    setForm((prev) => ({
                      ...prev,
                      protocol: next.protocol,
                      transport: next.transport,
                      host,
                      port: portStr ? Number.parseInt(portStr, 10) : prev.port,
                    }));
                  } else {
                    update("host", raw);
                  }
                }}
                placeholder="tdengine.example.com"
                className={cn(inputClass, "flex-1")}
              />
            </div>
          </Field>
          <p className="text-[10px] text-muted-foreground -mt-1">
            {form.transport === "ws"
              ? `${schemeLabel(form.protocol, form.transport)}://${form.host || "<host>"}:${form.port}/rest/ws`
              : `${schemeLabel(form.protocol, form.transport)}://${form.host || "<host>"}:${form.port}/rest/sql`}
          </p>
          {form.protocol === "https" && (
            <div className="grid gap-1 -mt-1">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.allowInvalidCerts ?? false}
                  onChange={(e) =>
                    update("allowInvalidCerts", e.target.checked)
                  }
                  className="h-3.5 w-3.5"
                />
                <span>
                  Allow invalid certificates{" "}
                  <span className="text-destructive">
                    (self-signed dev only)
                  </span>
                </span>
              </label>
            </div>
          )}
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
          <Field label="Auth">
            <div className="inline-flex h-8 rounded border border-input bg-background p-0.5 text-xs">
              <button
                type="button"
                onClick={() => update("authMode", "basic")}
                className={cn(
                  "px-3 rounded-sm transition",
                  form.authMode === "basic"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Basic
              </button>
              <button
                type="button"
                onClick={() => update("authMode", "token")}
                className={cn(
                  "px-3 rounded-sm transition",
                  form.authMode === "token"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Token
              </button>
            </div>
          </Field>
          {form.authMode === "basic" ? (
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
          ) : (
            <Field label="Token" error={errors.token}>
              <Input
                type="password"
                value={form.token ?? ""}
                onChange={(e) => update("token", e.target.value)}
                placeholder={
                  mode === "edit"
                    ? "Leave empty to keep current"
                    : "Paste TDengine Cloud token"
                }
                className={inputClass}
              />
            </Field>
          )}
          <Field label="Timeout (seconds)" error={errors.timeoutMs}>
            <Input
              type="number"
              min={1}
              max={600}
              value={
                form.timeoutMs === undefined ? "" : Math.round(form.timeoutMs / 1000)
              }
              onChange={(e) => {
                const raw = e.target.value.trim();
                if (raw === "") {
                  update("timeoutMs", undefined);
                  return;
                }
                const sec = Number.parseInt(raw, 10);
                if (Number.isFinite(sec)) {
                  update("timeoutMs", sec * 1000);
                }
              }}
              placeholder={String(DEFAULT_TIMEOUT_SEC)}
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
