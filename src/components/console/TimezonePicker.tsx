import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDisplayPrefs, type TzPref } from "@/state/displayPrefs";
import {
  TZ_PRESETS,
  formatOffsetMinutes,
  offsetMinutesForIana,
  offsetMinutesForSystem,
  parseOffsetInput,
} from "@/lib/timezone";

function tzId(tz: TzPref): string {
  switch (tz.kind) {
    case "system":
      return "system";
    case "utc":
      return "utc";
    case "iana":
      return `iana:${tz.name}`;
    case "offset":
      return `offset:${tz.minutes}`;
  }
}

function useTriggerLabel(tz: TzPref): string {
  const { t } = useTranslation("console");
  return useMemo(() => {
    switch (tz.kind) {
      case "system":
        return t("toolbar.timezone.trigger-label-system");
      case "utc":
        return t("toolbar.timezone.trigger-label-utc");
      case "iana":
        return formatOffsetMinutes(offsetMinutesForIana(tz.name));
      case "offset":
        return formatOffsetMinutes(tz.minutes);
    }
  }, [tz, t]);
}

export function TimezonePicker() {
  const { t } = useTranslation("console");
  const tz = useDisplayPrefs((s) => s.tz);
  const setTz = useDisplayPrefs((s) => s.setTz);

  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const customInputRef = useRef<HTMLInputElement | null>(null);

  const triggerLabel = useTriggerLabel(tz);
  const currentId = tzId(tz);

  useEffect(() => {
    if (!open) {
      setCustomOpen(false);
      setCustomInput("");
      setCustomError(null);
    }
  }, [open]);

  useEffect(() => {
    if (customOpen) {
      // Focus the input after Radix's open transition.
      const id = requestAnimationFrame(() => {
        customInputRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [customOpen]);

  function pickPreset(next: TzPref) {
    setTz(next);
    setOpen(false);
  }

  function submitCustom() {
    const parsed = parseOffsetInput(customInput);
    if (parsed === null) {
      setCustomError(t("toolbar.timezone.custom.invalid"));
      return;
    }
    setCustomError(null);
    setTz({ kind: "offset", minutes: parsed });
    setOpen(false);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={t("toolbar.timezone.title")}
          aria-label={t("toolbar.timezone.label")}
          className={cn(
            "flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted",
          )}
        >
          <Clock className="h-3.5 w-3.5" />
          <span className="font-mono">{triggerLabel}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("toolbar.timezone.label")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {TZ_PRESETS.map((preset) => {
          const selected = tzId(preset.tz) === currentId;
          const isSystem = preset.id === "system";
          return (
            <DropdownMenuItem
              key={preset.id}
              onSelect={() => pickPreset(preset.tz)}
            >
              <Check
                className={cn(
                  "h-3.5 w-3.5",
                  selected ? "opacity-100" : "opacity-0",
                )}
              />
              <span className="flex-1">
                {t(`toolbar.timezone.preset.${preset.i18nKey}`)}
              </span>
              {isSystem && (
                <span className="text-xs text-muted-foreground">
                  {t("toolbar.timezone.preset.system-suffix")}
                </span>
              )}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        {!customOpen ? (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              const seed =
                tz.kind === "offset"
                  ? formatOffsetMinutes(tz.minutes)
                  : tz.kind === "iana"
                    ? formatOffsetMinutes(offsetMinutesForIana(tz.name))
                    : tz.kind === "system"
                      ? formatOffsetMinutes(offsetMinutesForSystem())
                      : "";
              setCustomInput(seed);
              setCustomError(null);
              setCustomOpen(true);
            }}
          >
            <Check
              className={cn(
                "h-3.5 w-3.5",
                tz.kind === "offset" ? "opacity-100" : "opacity-0",
              )}
            />
            <span className="flex-1">{t("toolbar.timezone.custom.open")}</span>
            {tz.kind === "offset" && (
              <span className="font-mono text-xs text-muted-foreground">
                {formatOffsetMinutes(tz.minutes)}
              </span>
            )}
          </DropdownMenuItem>
        ) : (
          <div className="flex flex-col gap-1 px-2 py-1.5">
            <div className="flex items-center gap-1.5">
              <input
                ref={customInputRef}
                type="text"
                value={customInput}
                onChange={(e) => {
                  setCustomInput(e.target.value);
                  if (customError) setCustomError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitCustom();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setCustomOpen(false);
                  }
                }}
                placeholder={t("toolbar.timezone.custom.placeholder")}
                className="flex-1 rounded-sm border border-border bg-background px-2 py-1 text-xs font-mono outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={submitCustom}
                className="rounded-sm bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                {t("toolbar.timezone.custom.apply")}
              </button>
            </div>
            {customError && (
              <div className="text-xs text-destructive">{customError}</div>
            )}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
