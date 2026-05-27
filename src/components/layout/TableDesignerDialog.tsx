import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { useDataSource } from "@/datasource/context";
import type { Column, TdDataType } from "@/datasource/types";
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
import {
  buildCreateChild,
  buildCreateDatabase,
  buildCreateStable,
  buildCreateTable,
  buildSetChildTags,
  diffAlter,
  isVarType,
  type ColumnDraft,
  type TagValue,
} from "@/components/console/ddlBuilder";

export type DesignerMode =
  | "create-database"
  | "create-stable"
  | "create-table"
  | "create-child"
  | "alter-stable"
  | "alter-table"
  | "alter-child-tags";

export interface TableDesignerDialogProps {
  open: boolean;
  mode: DesignerMode | null;
  connId: string;
  db: string;
  /** Table/super-table being altered (alter modes, child target). */
  targetName?: string;
  /** Parent super table for create-child. */
  stableName?: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const TYPE_OPTIONS: TdDataType[] = [
  "TIMESTAMP",
  "INT",
  "BIGINT",
  "SMALLINT",
  "TINYINT",
  "INT UNSIGNED",
  "BIGINT UNSIGNED",
  "SMALLINT UNSIGNED",
  "TINYINT UNSIGNED",
  "FLOAT",
  "DOUBLE",
  "BINARY",
  "NCHAR",
  "VARCHAR",
  "JSON",
  "BOOL",
];

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const inputClass =
  "h-8 rounded px-2.5 text-xs md:text-xs focus-visible:ring-1 focus-visible:ring-offset-0";
const btnClass = "h-8 rounded px-3 text-xs";

const isCreate = (m: DesignerMode) => m.startsWith("create");
const usesTags = (m: DesignerMode) =>
  m === "create-stable" || m === "alter-stable";
const usesColumns = (m: DesignerMode) =>
  m === "create-stable" ||
  m === "create-table" ||
  m === "alter-stable" ||
  m === "alter-table";
const usesTagValues = (m: DesignerMode) =>
  m === "create-child" || m === "alter-child-tags";

function primaryRow(): ColumnDraft {
  return { name: "ts", type: "TIMESTAMP", isTag: false, primaryTs: true };
}

export function TableDesignerDialog({
  open,
  mode,
  connId,
  db,
  targetName,
  stableName,
  onOpenChange,
  onSaved,
}: TableDesignerDialogProps) {
  const { t } = useTranslation("designer");
  const ds = useDataSource();

  const [name, setName] = useState("");
  const [columns, setColumns] = useState<ColumnDraft[]>([]);
  const [tagValues, setTagValues] = useState<TagValue[]>([]);
  const [existing, setExisting] = useState<Column[]>([]);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);

  // (Re)initialize the form whenever the dialog opens for a new target.
  useEffect(() => {
    if (!open || !mode) return;
    let cancelled = false;

    setName(isCreate(mode) ? "" : (targetName ?? ""));
    setExisting([]);
    setTagValues([]);

    if (mode === "create-stable" || mode === "create-table") {
      setColumns([primaryRow()]);
      return;
    }
    if (mode === "create-database") {
      setColumns([]);
      return;
    }

    // Modes that need the current schema from the server.
    setLoading(true);
    const schemaSource =
      mode === "create-child" ? (stableName ?? "") : (targetName ?? "");
    void ds
      .describeTable(connId, db, schemaSource)
      .then((cols) => {
        if (cancelled) return;
        if (mode === "alter-stable" || mode === "alter-table") {
          setExisting(cols);
          setColumns(
            cols.map((c) => ({
              name: c.name,
              type: c.type,
              length: c.length,
              isTag: c.isTag ?? false,
              primaryTs: c.isPrimaryTs ?? false,
            })),
          );
        } else {
          // create-child / alter-child-tags: edit tag values only.
          setTagValues(
            cols
              .filter((c) => c.isTag)
              .map((c) => ({ name: c.name, type: c.type, value: "" })),
          );
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, mode, connId, db, targetName, stableName, ds]);

  const colErrors = useMemo(() => {
    if (!mode || !usesColumns(mode)) return new Map<number, string>();
    const errs = new Map<number, string>();
    const seen = new Set<string>();
    columns.forEach((c, i) => {
      const n = c.name.trim();
      if (!n) errs.set(i, t("error.name-required"));
      else if (!IDENT_RE.test(n)) errs.set(i, t("error.name-invalid"));
      else if (seen.has(n.toLowerCase()))
        errs.set(i, t("error.name-duplicate"));
      else if (isVarType(c.type) && !c.length)
        errs.set(i, t("error.length-required", { type: c.type }));
      seen.add(n.toLowerCase());
    });
    return errs;
  }, [columns, mode, t]);

  const editableColumns = columns.filter((c) => !c.isTag);
  const tagColumns = columns.filter((c) => c.isTag);

  const sql = useMemo<string[]>(() => {
    if (!mode) return [];
    try {
      switch (mode) {
        case "create-database":
          return name.trim() ? [buildCreateDatabase(name.trim())] : [];
        case "create-stable":
          return [
            buildCreateStable(db, name.trim(), editableColumns, tagColumns),
          ];
        case "create-table":
          return [buildCreateTable(db, name.trim(), editableColumns)];
        case "create-child":
          return [
            buildCreateChild(db, name.trim(), stableName ?? "", tagValues),
          ];
        case "alter-stable":
        case "alter-table":
          return diffAlter(
            { db, name: targetName ?? "", isStable: mode === "alter-stable" },
            existing,
            columns,
          );
        case "alter-child-tags":
          return buildSetChildTags(
            db,
            targetName ?? "",
            tagValues.filter((tv) => tv.value.trim() !== ""),
          );
      }
    } catch {
      return [];
    }
  }, [
    mode,
    name,
    db,
    targetName,
    stableName,
    editableColumns,
    tagColumns,
    columns,
    existing,
    tagValues,
  ]);

  const nameValid =
    !mode ||
    (isCreate(mode)
      ? IDENT_RE.test(name.trim())
      : true /* alter targets already exist */);

  const valid =
    !!mode &&
    !loading &&
    nameValid &&
    colErrors.size === 0 &&
    sql.length > 0;

  function updateColumn(index: number, patch: Partial<ColumnDraft>) {
    setColumns((prev) =>
      prev.map((c, i) => {
        if (i !== index) return c;
        const next = { ...c, ...patch };
        if (patch.type && !isVarType(next.type)) next.length = undefined;
        return next;
      }),
    );
  }

  function addColumn(isTag: boolean) {
    setColumns((prev) => [
      ...prev,
      { name: "", type: isTag ? "INT" : "FLOAT", isTag },
    ]);
  }

  function removeColumn(index: number) {
    setColumns((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleExecute() {
    if (!mode || !valid) return;
    setExecuting(true);
    try {
      for (let i = 0; i < sql.length; i++) {
        try {
          await ds.runSql(connId, db, sql[i]!);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          toast.error(
            t("toast.alter-partial", { done: i, total: sql.length, sql: sql[i], err: msg }),
          );
          onSaved();
          onOpenChange(false);
          return;
        }
      }
      toast.success(isCreate(mode) ? t("toast.created") : t("toast.altered"));
      onSaved();
      onOpenChange(false);
    } finally {
      setExecuting(false);
    }
  }

  if (!mode) return null;

  const titleKey = `title.${mode}` as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-3 rounded-md p-4">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            {t(titleKey, { db, name: targetName })}
          </DialogTitle>
        </DialogHeader>

        {/* Name field (not for alter-* where the name is fixed) */}
        {isCreate(mode) && (
          <div className="grid gap-1">
            <Label className="text-xs">
              {mode === "create-database"
                ? t("field.db-name")
                : mode === "create-stable"
                  ? t("field.stable-name")
                  : mode === "create-child"
                    ? t("field.child-name")
                    : t("field.table-name")}
            </Label>
            <Input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            {mode === "create-child" && (
              <p className="text-muted-foreground text-[11px]">
                {t("field.using-stable")}: {stableName}
              </p>
            )}
          </div>
        )}

        {loading ? (
          <p className="text-muted-foreground py-4 text-center text-xs">
            {t("loading")}
          </p>
        ) : (
          <>
            {usesColumns(mode) && (
              <ColumnEditor
                rows={columns}
                showTagToggle={usesTags(mode)}
                errors={colErrors}
                onUpdate={updateColumn}
                onRemove={removeColumn}
                onAdd={() => addColumn(false)}
                onAddTag={usesTags(mode) ? () => addColumn(true) : undefined}
              />
            )}

            {usesTagValues(mode) && (
              <TagValueEditor
                rows={tagValues}
                onChange={(i, value) =>
                  setTagValues((prev) =>
                    prev.map((tv, j) => (j === i ? { ...tv, value } : tv)),
                  )
                }
              />
            )}
          </>
        )}

        {/* Live SQL preview */}
        <div className="grid gap-1">
          <Label className="text-muted-foreground text-[11px]">
            {t("preview.label")}
          </Label>
          <pre className="bg-muted/40 border-border max-h-40 overflow-auto rounded border px-2.5 py-2 font-mono text-[11px] whitespace-pre-wrap">
            {valid && sql.length > 0
              ? sql.map((s) => `${s};`).join("\n")
              : t("preview.placeholder")}
          </pre>
        </div>

        <DialogFooter className="gap-1.5 sm:gap-1.5">
          <Button
            variant="outline"
            className={btnClass}
            onClick={() => onOpenChange(false)}
          >
            {t("button.cancel")}
          </Button>
          <Button
            className={btnClass}
            disabled={!valid || executing}
            onClick={() => void handleExecute()}
          >
            {t("button.execute")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ColumnEditorProps {
  rows: ColumnDraft[];
  showTagToggle: boolean;
  errors: Map<number, string>;
  onUpdate: (index: number, patch: Partial<ColumnDraft>) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  onAddTag?: () => void;
}

function ColumnEditor({
  rows,
  showTagToggle,
  errors,
  onUpdate,
  onRemove,
  onAdd,
  onAddTag,
}: ColumnEditorProps) {
  const { t } = useTranslation("designer");
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <Label className="text-xs">{t("columns.heading")}</Label>
        <div className="ml-auto flex gap-1.5">
          <button
            type="button"
            onClick={onAdd}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[11px]"
          >
            <Plus className="h-3 w-3" />
            {t("columns.add-column")}
          </button>
          {onAddTag && (
            <button
              type="button"
              onClick={onAddTag}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[11px]"
            >
              <Plus className="h-3 w-3" />
              {t("columns.add-tag")}
            </button>
          )}
        </div>
      </div>
      <div className="grid gap-1">
        {rows.map((c, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input
              className={cn(
                inputClass,
                "flex-1",
                errors.has(i) && "border-destructive",
              )}
              value={c.name}
              disabled={c.primaryTs}
              placeholder={t("columns.col-name")}
              onChange={(e) => onUpdate(i, { name: e.target.value })}
              title={errors.get(i)}
            />
            <Select
              value={c.type}
              disabled={c.primaryTs}
              onValueChange={(v) => onUpdate(i, { type: v as TdDataType })}
            >
              <SelectTrigger className="w-28 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((ty) => (
                  <SelectItem key={ty} value={ty}>
                    {ty}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className={cn(inputClass, "w-16")}
              type="number"
              value={c.length ?? ""}
              disabled={!isVarType(c.type)}
              placeholder={t("columns.col-length")}
              onChange={(e) =>
                onUpdate(i, {
                  length: e.target.value
                    ? Number.parseInt(e.target.value, 10)
                    : undefined,
                })
              }
            />
            {showTagToggle && (
              <label className="text-muted-foreground flex w-10 shrink-0 items-center justify-center gap-1 text-[11px]">
                <Checkbox
                  checked={c.isTag}
                  disabled={c.primaryTs}
                  onCheckedChange={(v) => onUpdate(i, { isTag: v === true })}
                />
                {t("columns.col-tag")}
              </label>
            )}
            <button
              type="button"
              onClick={() => onRemove(i)}
              disabled={c.primaryTs}
              className="text-muted-foreground/70 hover:text-destructive shrink-0 p-1 disabled:opacity-30"
              aria-label={t("columns.remove")}
              title={c.primaryTs ? t("columns.primary-locked") : t("columns.remove")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TagValueEditor({
  rows,
  onChange,
}: {
  rows: TagValue[];
  onChange: (index: number, value: string) => void;
}) {
  const { t } = useTranslation("designer");
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{t("tagvalues.heading")}</Label>
      <div className="grid gap-1">
        {rows.map((tv, i) => (
          <div key={tv.name} className="flex items-center gap-1.5">
            <span className="w-28 shrink-0 truncate font-mono text-[11px]" title={tv.name}>
              {tv.name}
            </span>
            <span className="text-muted-foreground w-20 shrink-0 text-[11px]">
              {tv.type}
            </span>
            <Input
              className={cn(inputClass, "flex-1")}
              value={tv.value}
              placeholder={t("tagvalues.value")}
              onChange={(e) => onChange(i, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
