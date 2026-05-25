import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

export const taoscopeEditorTheme = EditorView.theme(
  {
    "&": {
      color: "hsl(var(--foreground))",
      backgroundColor: "hsl(var(--card))",
      height: "100%",
    },
    ".cm-content": {
      fontFamily: "var(--font-mono, ui-monospace, monospace)",
      fontSize: "13px",
      padding: "8px 0",
      caretColor: "hsl(var(--primary))",
    },
    ".cm-gutters": {
      backgroundColor: "hsl(var(--card))",
      color: "hsl(var(--muted-foreground))",
      borderRight: "1px solid hsl(var(--border))",
      fontFamily: "var(--font-mono, ui-monospace, monospace)",
      fontSize: "13px",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      paddingLeft: "12px",
      paddingRight: "8px",
      minWidth: "2.5rem",
    },
    ".cm-activeLine": {
      backgroundColor: "hsl(var(--muted) / 0.4)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "hsl(var(--muted) / 0.6)",
      color: "hsl(var(--foreground))",
    },
    ".cm-selectionBackground, ::selection": {
      backgroundColor: "hsl(var(--primary) / 0.25) !important",
    },
    "&.cm-focused .cm-selectionBackground": {
      backgroundColor: "hsl(var(--primary) / 0.25)",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "hsl(var(--primary))",
      borderLeftWidth: "1.5px",
    },
    ".cm-matchingBracket": {
      backgroundColor: "hsl(var(--primary) / 0.2)",
      outline: "none",
    },
    ".cm-searchMatch": {
      backgroundColor: "hsl(var(--primary) / 0.25)",
      outline: "1px solid hsl(var(--primary) / 0.5)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "hsl(var(--primary) / 0.4)",
    },
    ".cm-tooltip": {
      backgroundColor: "hsl(var(--popover))",
      color: "hsl(var(--popover-foreground))",
      border: "1px solid hsl(var(--border))",
      borderRadius: "6px",
    },
    ".cm-tooltip-autocomplete": {
      backgroundColor: "hsl(var(--popover))",
      color: "hsl(var(--popover-foreground))",
      border: "1px solid hsl(var(--border))",
      borderRadius: "6px",
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "hsl(var(--muted))",
      color: "hsl(var(--foreground))",
    },
    ".cm-panels": {
      backgroundColor: "hsl(var(--card))",
      color: "hsl(var(--foreground))",
      fontFamily:
        "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: "12px",
    },
    ".cm-panels.cm-panels-top": {
      borderBottom: "1px solid hsl(var(--border))",
    },
    ".cm-panels.cm-panels-bottom": {
      borderTop: "1px solid hsl(var(--border))",
    },
    ".cm-panel": {
      padding: "8px 10px",
      backgroundColor: "transparent",
      color: "hsl(var(--foreground))",
    },
    ".cm-panel.cm-search": {
      position: "relative",
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: "6px",
      padding: "8px 32px 8px 10px",
    },
    ".cm-panel.cm-search label": {
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      color: "hsl(var(--muted-foreground))",
      fontSize: "11px",
      userSelect: "none",
      cursor: "pointer",
    },
    ".cm-panel.cm-search label input[type=checkbox]": {
      accentColor: "hsl(var(--primary))",
      margin: "0",
      cursor: "pointer",
    },
    ".cm-panel.cm-search br": {
      display: "none",
    },
    ".cm-textfield": {
      height: "26px",
      padding: "0 8px",
      borderRadius: "6px",
      border: "1px solid hsl(var(--input))",
      backgroundColor: "hsl(var(--background))",
      color: "hsl(var(--foreground))",
      fontSize: "12px",
      fontFamily: "inherit",
      outline: "none",
      transition: "border-color 120ms ease, box-shadow 120ms ease",
    },
    ".cm-textfield::placeholder": {
      color: "hsl(var(--muted-foreground) / 0.7)",
    },
    ".cm-textfield:focus": {
      borderColor: "hsl(var(--ring))",
      boxShadow: "0 0 0 2px hsl(var(--ring) / 0.25)",
    },
    ".cm-button": {
      height: "26px",
      padding: "0 10px",
      borderRadius: "6px",
      border: "1px solid hsl(var(--border))",
      backgroundColor: "hsl(var(--muted))",
      color: "hsl(var(--foreground))",
      fontSize: "11px",
      fontFamily: "inherit",
      fontWeight: "500",
      cursor: "pointer",
      backgroundImage: "none",
      textTransform: "none",
      transition: "background-color 120ms ease, color 120ms ease",
    },
    ".cm-button:hover": {
      backgroundColor: "hsl(var(--muted) / 0.7)",
      color: "hsl(var(--foreground))",
    },
    ".cm-button:active": {
      backgroundColor: "hsl(var(--muted) / 0.5)",
    },
    ".cm-button:focus-visible": {
      outline: "none",
      boxShadow: "0 0 0 2px hsl(var(--ring) / 0.4)",
    },
    ".cm-search [name=close], .cm-panel [name=close]": {
      position: "absolute",
      top: "4px",
      right: "6px",
      width: "20px",
      height: "20px",
      padding: "0",
      border: "none",
      borderRadius: "4px",
      backgroundColor: "transparent",
      color: "hsl(var(--muted-foreground))",
      fontSize: "16px",
      lineHeight: "1",
      cursor: "pointer",
    },
    ".cm-search [name=close]:hover, .cm-panel [name=close]:hover": {
      backgroundColor: "hsl(var(--muted))",
      color: "hsl(var(--foreground))",
    },
  },
  { dark: true },
);

export const taoscopeHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "hsl(var(--primary))" },
  { tag: tags.typeName, color: "hsl(var(--primary))" },
  { tag: tags.operator, color: "hsl(var(--muted-foreground))" },
  { tag: tags.string, color: "hsl(35 70% 60%)" },
  { tag: tags.comment, color: "hsl(var(--muted-foreground))", fontStyle: "italic" },
  { tag: tags.number, color: "hsl(210 80% 65%)" },
  { tag: tags.function(tags.variableName), color: "hsl(var(--foreground))", fontWeight: "bold" },
  { tag: tags.variableName, color: "hsl(var(--foreground))" },
  { tag: tags.bool, color: "hsl(210 80% 65%)" },
  { tag: tags.null, color: "hsl(210 80% 65%)" },
]);

export const taoscopeEditorExtensions: Extension[] = [
  taoscopeEditorTheme,
  syntaxHighlighting(taoscopeHighlightStyle, { fallback: true }),
];
