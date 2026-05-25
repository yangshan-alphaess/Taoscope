import { useEffect, useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView, keymap, lineNumbers, highlightActiveLine, placeholder } from "@codemirror/view";
import { sql } from "@codemirror/lang-sql";
import { TDengineDialect } from "./tdengineDialect";
import {
  copyLineDown,
  defaultKeymap,
  history,
  historyKeymap,
  toggleLineComment,
} from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { bracketMatching, indentOnInput } from "@codemirror/language";
import { Prec } from "@codemirror/state";
import { useDataSource } from "@/datasource/context";
import { useAppState } from "@/store/appState";
import * as editorBridge from "./editorBridge";
import { useRunActiveConsole } from "./useRunActiveConsole";
import { taoscopeEditorExtensions, taoscopeEditorTheme } from "./sqlEditorTheme";
import { createSqlCompletionSource } from "./sqlCompletionSource";
import { useEditorSchemaContext } from "./useEditorSchemaContext";

const SCRATCH_DEBOUNCE_MS = 400;

export function Editor() {
  const ds = useDataSource();
  const activeConsoleId = useAppState((s) => s.activeConsoleId);
  const runtime = useAppState((s) =>
    activeConsoleId ? s.consoleRuntime[activeConsoleId] : undefined,
  );
  const hydrateConsoleRuntime = useAppState((s) => s.hydrateConsoleRuntime);
  const setScratch = useAppState((s) => s.setScratch);

  const { run } = useRunActiveConsole();
  const runRef = useRef<() => void>(() => {});
  useEffect(() => {
    runRef.current = run;
  }, [run]);

  const schemaCtx = useEditorSchemaContext();
  const editorCtxRef = useRef<{ connectionId: string | null; db: string | null }>(
    { connectionId: schemaCtx.connectionId, db: schemaCtx.db },
  );
  useEffect(() => {
    editorCtxRef.current = {
      connectionId: schemaCtx.connectionId,
      db: schemaCtx.db,
    };
  }, [schemaCtx.connectionId, schemaCtx.db]);

  const sqlSource = useMemo(
    () =>
      createSqlCompletionSource({
        ds,
        getContext: () => editorCtxRef.current,
      }),
    [ds],
  );

  const viewRef = useRef<EditorView | null>(null);
  const handleCreateEditor = (view: EditorView) => {
    viewRef.current = view;
    editorBridge.registerView(view);
  };

  useEffect(() => {
    return () => {
      editorBridge.unregisterView();
    };
  }, []);

  // Track which console ids have been hydration-started this session to
  // avoid double-fetching during re-renders.
  const hydratingRef = useRef<Set<string>>(new Set());

  // Hydrate runtime on first activation of a console.
  useEffect(() => {
    if (!activeConsoleId) return;
    if (runtime) return;
    if (hydratingRef.current.has(activeConsoleId)) return;
    hydratingRef.current.add(activeConsoleId);
    let cancelled = false;
    Promise.all([
      ds.loadScratch(activeConsoleId),
      ds.loadResult(activeConsoleId),
      ds.loadHistory(activeConsoleId),
    ]).then(([scratch, lastResult, history]) => {
      if (cancelled) return;
      hydrateConsoleRuntime(activeConsoleId, {
        scratch,
        lastResult,
        execStatus: "idle",
        execError: null,
        history,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [ds, activeConsoleId, runtime, hydrateConsoleRuntime]);

  // Debounced scratch persistence.
  useEffect(() => {
    if (!activeConsoleId) return;
    if (!runtime) return;
    const id = activeConsoleId;
    const value = runtime.scratch;
    const handle = window.setTimeout(() => {
      void ds.saveScratch(id, value);
    }, SCRATCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [ds, activeConsoleId, runtime]);

  const extensions = useMemo(() => {
    const sqlExt = sql({ dialect: TDengineDialect });
    return [
      sqlExt,
      sqlExt.language.data.of({ autocomplete: sqlSource }),
      history(),
      bracketMatching(),
      indentOnInput(),
      autocompletion(),
      highlightActiveLine(),
      lineNumbers(),
      placeholder("-- write your SQL here"),
      EditorView.contentAttributes.of({ spellcheck: "false" }),
      // Mod-Enter has to outrank the default Enter handler (which inserts a
      // newline) and the autocompletion Enter handler (which accepts a
      // suggestion). Prec.high + explicit preventDefault makes this
      // unambiguous regardless of how the other extensions register theirs.
      Prec.high(
        keymap.of([
          {
            key: "Mod-Enter",
            preventDefault: true,
            run: () => {
              runRef.current();
              return true;
            },
          },
        ]),
      ),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        ...completionKeymap,
        { key: "Mod-/", run: toggleLineComment },
        { key: "Mod-d", run: copyLineDown, preventDefault: true },
      ]),
      ...taoscopeEditorExtensions,
    ];
  }, [sqlSource]);

  if (!activeConsoleId) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-3">
        <p className="text-muted-foreground/60 text-xs">
          Open or create a console to start writing SQL.
        </p>
      </div>
    );
  }

  if (!runtime) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-3">
        <p className="text-muted-foreground/60 text-xs">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 p-2">
      <CodeMirror
        value={runtime.scratch}
        onChange={(v) => setScratch(activeConsoleId, v)}
        onCreateEditor={handleCreateEditor}
        height="100%"
        theme={taoscopeEditorTheme}
        extensions={extensions}
        basicSetup={false}
        className="border-border h-full w-full overflow-hidden rounded-md border"
      />
    </div>
  );
}
