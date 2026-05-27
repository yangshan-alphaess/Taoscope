import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  t: TFunction,
): FieldErrors {
  const errors: FieldErrors = {};
  const name = form.name.trim();
  if (name === "") {
    errors.name = t("form.validation.name-required");
  } else if (
    existing.some((c) => c.id !== selfId && c.name === name)
  ) {
    errors.name = t("form.validation.name-exists");
  }
  if (form.host.trim() === "") {
    errors.host = t("form.validation.host-required");
  }
  if (
    !Number.isInteger(form.port) ||
    form.port < 1 ||
    form.port > 65535
  ) {
    errors.port = t("form.validation.port-range");
  }
  if (form.user.trim() === "") {
    errors.user = t("form.validation.user-required");
  }
  if (form.authMode === "token") {
    const tokenEmpty = (form.token ?? "").length === 0;
    const switchedIntoToken =
      mode === "create" || initial?.authMode !== "token";
    if (tokenEmpty && switchedIntoToken) {
      errors.token = t("form.validation.token-required");
    }
  }
  if (form.timeoutMs !== undefined) {
    const sec = form.timeoutMs / 1000;
    if (!Number.isInteger(sec) || sec < 1 || sec > 600) {
      errors.timeoutMs = t("form.validation.timeout-range");
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
  const { t } = useTranslation("connection");
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

  const errors = validate(form, connections, initial?.id, mode, initial, t);
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
        toast.success(t("toast.test-ok"));
      } else {
        toast.error(result.message ?? t("toast.test-fail"));
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
        toast.success(t("toast.created"));
        onSaved?.(created);
      } else if (initial) {
        await ds.updateConnection(initial.id, trimmed);
        toast.success(t("toast.updated"));
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
            {mode === "create"
              ? t("form.title-create")
              : t("form.title-edit")}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-2.5 py-1">
          <Field label={t("form.field.name")} error={errors.name}>
            <Input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder={t("form.placeholder.name")}
              autoFocus
              className={inputClass}
            />
          </Field>
          <Field label={t("form.field.host")} error={errors.host}>
            <div className="flex gap-1.5">
              <Select
                value={schemeLabel(form.protocol, form.transport)}
                onValueChange={(value) =>
                  setForm((prev) => {
                    const scheme = value as "http" | "https" | "ws" | "wss";
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
              >
                <SelectTrigger className="w-24 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">http://</SelectItem>
                  <SelectItem value="https">https://</SelectItem>
                  <SelectItem value="ws">ws://</SelectItem>
                  <SelectItem value="wss">wss://</SelectItem>
                </SelectContent>
              </Select>
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
                placeholder={t("form.placeholder.host")}
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
                <Checkbox
                  checked={form.allowInvalidCerts ?? false}
                  onCheckedChange={(v) =>
                    update("allowInvalidCerts", v === true)
                  }
                />
                <span>
                  {t("form.https.allow-invalid")}{" "}
                  <span className="text-destructive">
                    {t("form.https.allow-invalid-warning")}
                  </span>
                </span>
              </label>
            </div>
          )}
          <Field label={t("form.field.port")} error={errors.port}>
            <Input
              type="number"
              value={form.port}
              onChange={(e) =>
                update("port", Number.parseInt(e.target.value, 10) || 0)
              }
              className={inputClass}
            />
          </Field>
          <Field label={t("form.field.user")} error={errors.user}>
            <Input
              value={form.user}
              onChange={(e) => update("user", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("form.field.auth")}>
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
                {t("form.auth-mode.basic")}
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
                {t("form.auth-mode.token")}
              </button>
            </div>
          </Field>
          {form.authMode === "basic" ? (
            <Field label={t("form.field.password")} error={errors.password}>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                placeholder={
                  mode === "edit" ? t("form.placeholder.password-keep") : ""
                }
                className={inputClass}
              />
            </Field>
          ) : (
            <Field label={t("form.field.token")} error={errors.token}>
              <Input
                type="password"
                value={form.token ?? ""}
                onChange={(e) => update("token", e.target.value)}
                placeholder={
                  mode === "edit"
                    ? t("form.placeholder.token-keep")
                    : t("form.placeholder.token-new")
                }
                className={inputClass}
              />
            </Field>
          )}
          <Field label={t("form.field.timeout")} error={errors.timeoutMs}>
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
              ? t("form.test-result.ok")
              : `${t("form.test-result.fail-prefix")} ${
                  testResult.message ?? t("toast.test-fail")
                }`}
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
            {busy === "test" ? t("form.actions.testing") : t("form.actions.test")}
          </Button>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy === "save"}
              className={btnClass}
            >
              {t("form.actions.cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={hasErrors || busy !== null}
              className={btnClass}
            >
              {busy === "save" ? t("form.actions.saving") : t("form.actions.save")}
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
