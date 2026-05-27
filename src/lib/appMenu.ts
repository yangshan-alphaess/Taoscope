/**
 * Localized native application menu (macOS only).
 *
 * Windows / Linux run as frameless windows (decorations: false) with no menu
 * bar, so the native menu only matters on macOS. We build the menu from the
 * frontend — rather than in Rust — because the active locale lives in the
 * browser (localStorage / i18next), and building here lets the menu rebuild
 * instantly when the user flips the LocaleToggle.
 *
 * Predefined items keep their native OS behaviour and accelerators (Cmd+Q,
 * Cmd+C, …); we only override their visible text so the labels follow our
 * in-app locale instead of the system language.
 */
import { isTauriRuntime } from "@/datasource/factory";
import { i18n } from "@/lib/i18n";

function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/i.test(navigator.userAgent);
}

let applying = false;

export async function applyAppMenu(): Promise<void> {
  // Native menu only exists under Tauri, and only macOS shows a menu bar in
  // this app (Windows/Linux are frameless).
  if (!isTauriRuntime() || !isMac()) return;
  if (applying) return;
  applying = true;
  try {
    await i18n.loadNamespaces("menu");
    const t = i18n.getFixedT(i18n.language, "menu");

    const { Menu, Submenu, PredefinedMenuItem } = await import(
      "@tauri-apps/api/menu"
    );

    const appMenu = await Submenu.new({
      text: "Taoscope",
      items: [
        await PredefinedMenuItem.new({
          item: { About: { name: "Taoscope" } },
          text: t("app.about"),
        }),
        await PredefinedMenuItem.new({ item: "Separator" }),
        await PredefinedMenuItem.new({
          item: "Services",
          text: t("app.services"),
        }),
        await PredefinedMenuItem.new({ item: "Separator" }),
        await PredefinedMenuItem.new({ item: "Hide", text: t("app.hide") }),
        await PredefinedMenuItem.new({
          item: "HideOthers",
          text: t("app.hide-others"),
        }),
        await PredefinedMenuItem.new({
          item: "ShowAll",
          text: t("app.show-all"),
        }),
        await PredefinedMenuItem.new({ item: "Separator" }),
        await PredefinedMenuItem.new({ item: "Quit", text: t("app.quit") }),
      ],
    });

    const editMenu = await Submenu.new({
      text: t("edit.title"),
      items: [
        await PredefinedMenuItem.new({ item: "Undo", text: t("edit.undo") }),
        await PredefinedMenuItem.new({ item: "Redo", text: t("edit.redo") }),
        await PredefinedMenuItem.new({ item: "Separator" }),
        await PredefinedMenuItem.new({ item: "Cut", text: t("edit.cut") }),
        await PredefinedMenuItem.new({ item: "Copy", text: t("edit.copy") }),
        await PredefinedMenuItem.new({ item: "Paste", text: t("edit.paste") }),
        await PredefinedMenuItem.new({
          item: "SelectAll",
          text: t("edit.select-all"),
        }),
      ],
    });

    const viewMenu = await Submenu.new({
      text: t("view.title"),
      items: [
        await PredefinedMenuItem.new({
          item: "Fullscreen",
          text: t("view.fullscreen"),
        }),
      ],
    });

    const windowMenu = await Submenu.new({
      text: t("window.title"),
      items: [
        await PredefinedMenuItem.new({
          item: "Minimize",
          text: t("window.minimize"),
        }),
        await PredefinedMenuItem.new({
          item: "Maximize",
          text: t("window.zoom"),
        }),
        await PredefinedMenuItem.new({ item: "Separator" }),
        await PredefinedMenuItem.new({
          item: "CloseWindow",
          text: t("window.close"),
        }),
      ],
    });

    const menu = await Menu.new({
      items: [appMenu, editMenu, viewMenu, windowMenu],
    });
    await menu.setAsAppMenu();
  } catch {
    // A menu failure must never block app startup. Worst case the user keeps
    // the previous (or default) menu.
  } finally {
    applying = false;
  }
}
