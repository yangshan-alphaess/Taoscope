import { useTranslation } from "react-i18next";
import { Check, Languages } from "lucide-react";
import { changeLocale, type AppLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Language names are shown in their own script regardless of the active
// locale, so they live as plain literals (rendered via {expression}, which the
// jsx-text-only lint gate does not flag) rather than translatable copy.
const LOCALES: { value: AppLocale; label: string }[] = [
  { value: "zh-CN", label: "中文" },
  { value: "en", label: "English" },
];

export function LocaleToggle() {
  const { i18n, t } = useTranslation("common");
  const current: AppLocale =
    (i18n.language as AppLocale) === "zh-CN" ? "zh-CN" : "en";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={t("locale-toggle.label")}
          aria-label={t("locale-toggle.label")}
          className="text-primary hover:bg-muted/50 focus-visible:ring-ring inline-flex items-center justify-center rounded-sm p-1 outline-none focus-visible:ring-1"
        >
          <Languages className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-28">
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l.value}
            onSelect={() => void changeLocale(l.value)}
          >
            <Check
              className={cn(
                "h-3.5 w-3.5",
                current === l.value ? "opacity-100" : "opacity-0",
              )}
            />
            {l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
