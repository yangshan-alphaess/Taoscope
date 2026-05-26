import { useTranslation } from "react-i18next";
import { changeLocale, type AppLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LocaleToggle() {
  const { i18n, t } = useTranslation("common");
  const current = (i18n.language as AppLocale) === "zh-CN" ? "zh-CN" : "en";
  const next: AppLocale = current === "en" ? "zh-CN" : "en";
  // Glyph stays canonical regardless of active locale (per design decision 6).
  const label = next === "zh-CN" ? "中" : "EN";
  const tooltip =
    next === "zh-CN"
      ? t("locale-toggle.tooltip-to-zh")
      : t("locale-toggle.tooltip-to-en");

  return (
    <button
      type="button"
      onClick={() => void changeLocale(next)}
      title={tooltip}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5",
        "hover:bg-muted/50 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
