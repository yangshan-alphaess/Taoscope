/**
 * i18next initialization with lazy-loaded namespaces.
 *
 * Why a custom resource loader instead of i18next-http-backend: locale JSON
 * files live in source and get bundled. Vite's dynamic import gives us code
 * splitting per (locale, namespace) for free, and we never need an HTTP
 * round-trip at runtime.
 *
 * The `common` namespace is preloaded in both languages so the first render
 * never sees raw key strings; everything else loads on demand and suspends
 * via React.Suspense at the call site.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const NAMESPACES = [
  "common",
  "connection",
  "console",
  "result",
  "updater",
  "errors",
] as const;

export type Namespace = (typeof NAMESPACES)[number];
export type AppLocale = "en" | "zh-CN";

const LOCALE_KEY = "taoscope.locale";

function resolveInitialLocale(): AppLocale {
  try {
    const stored = localStorage.getItem(LOCALE_KEY);
    if (stored === "en" || stored === "zh-CN") return stored;
  } catch {
    // localStorage unavailable; fall through to navigator detection.
  }
  const nav = typeof navigator !== "undefined" ? navigator.language : "";
  if (nav.toLowerCase().startsWith("zh")) return "zh-CN";
  if (nav.toLowerCase().startsWith("en")) return "en";
  return "zh-CN";
}

async function loadNamespace(
  locale: AppLocale,
  ns: Namespace,
): Promise<Record<string, unknown>> {
  switch (`${locale}:${ns}`) {
    case "en:common":
      return (await import("../locales/en/common.json")).default;
    case "en:connection":
      return (await import("../locales/en/connection.json")).default;
    case "en:console":
      return (await import("../locales/en/console.json")).default;
    case "en:result":
      return (await import("../locales/en/result.json")).default;
    case "en:updater":
      return (await import("../locales/en/updater.json")).default;
    case "en:errors":
      return (await import("../locales/en/errors.json")).default;
    case "zh-CN:common":
      return (await import("../locales/zh-CN/common.json")).default;
    case "zh-CN:connection":
      return (await import("../locales/zh-CN/connection.json")).default;
    case "zh-CN:console":
      return (await import("../locales/zh-CN/console.json")).default;
    case "zh-CN:result":
      return (await import("../locales/zh-CN/result.json")).default;
    case "zh-CN:updater":
      return (await import("../locales/zh-CN/updater.json")).default;
    case "zh-CN:errors":
      return (await import("../locales/zh-CN/errors.json")).default;
    default:
      return {};
  }
}

let initPromise: Promise<typeof i18n> | null = null;

export function initI18n(): Promise<typeof i18n> {
  if (initPromise) return initPromise;
  const lng = resolveInitialLocale();
  initPromise = i18n
    .use(initReactI18next)
    .init({
      lng,
      fallbackLng: "en",
      supportedLngs: ["en", "zh-CN"],
      defaultNS: "common",
      ns: NAMESPACES as unknown as string[],
      partialBundledLanguages: true,
      resources: {},
      interpolation: { escapeValue: false },
      react: { useSuspense: true },
    })
    .then(async () => {
      // Preload `common` for both languages so the first render never shows
      // raw key strings (Toolbar, StatusBar, ConfirmDialog all use it).
      await Promise.all([
        loadAndAdd("en", "common"),
        loadAndAdd("zh-CN", "common"),
      ]);
      if (typeof document !== "undefined") {
        document.documentElement.lang = lng;
      }
      // Register a backend-like loader for the remaining namespaces. i18next
      // calls this when a missing (lng, ns) pair is requested.
      i18n.services.backendConnector.backend = {
        type: "backend",
        init() {
          /* noop */
        },
        read: (
          language: string,
          namespace: string,
          callback: (err: unknown, data?: Record<string, unknown>) => void,
        ) => {
          if (!isAppLocale(language) || !isNamespace(namespace)) {
            callback(null, {});
            return;
          }
          loadNamespace(language, namespace)
            .then((data) => callback(null, data))
            .catch((err) => callback(err));
        },
      };
      return i18n;
    });
  return initPromise;
}

async function loadAndAdd(locale: AppLocale, ns: Namespace): Promise<void> {
  const data = await loadNamespace(locale, ns);
  i18n.addResourceBundle(locale, ns, data, true, true);
}

function isAppLocale(s: string): s is AppLocale {
  return s === "en" || s === "zh-CN";
}

function isNamespace(s: string): s is Namespace {
  return (NAMESPACES as readonly string[]).includes(s);
}

export async function changeLocale(locale: AppLocale): Promise<void> {
  await i18n.changeLanguage(locale);
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // ignore; runtime change still applies even if persistence fails.
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
}

export { i18n };
