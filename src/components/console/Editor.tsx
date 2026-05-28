import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { useExplainActiveConsole } from "./useExplainActiveConsole";
import { useRunActiveConsole } from "./useRunActiveConsole";
import { taoscopeEditorExtensions, taoscopeEditorTheme } from "./sqlEditorTheme";
import { createSqlCompletionSource } from "./sqlCompletionSource";
import { useEditorSchemaContext } from "./useEditorSchemaContext";

const SCRATCH_DEBOUNCE_MS = 400;

export function Editor() {
  const { t, i18n } = useTranslation("console");
  const { t: tCommon } = useTranslation("common");
  const ds = useDataSource();
  const activeConsoleId = useAppState((s) => s.activeConsoleId);
  const runtime = useAppState((s) =>
    activeConsoleId ? s.consoleRuntime[activeConsoleId] : undefined,
  );
  const hydrateConsoleRuntime = useAppState((s) => s.hydrateConsoleRuntime);
  const setScratch = useAppState((s) => s.setScratch);
  const pendingAppendAndRun = useAppState((s) => s.pendingAppendAndRun);
  const clearPendingAppendAndRun = useAppState(
    (s) => s.clearPendingAppendAndRun,
  );

  const { run } = useRunActiveConsole();
  const runRef = useRef<() => void>(() => {});
  useEffect(() => {
    runRef.current = run;
  }, [run]);

  const { explain } = useExplainActiveConsole();
  const explainRef = useRef<() => void>(() => {});
  useEffect(() => {
    explainRef.current = explain;
  }, [explain]);

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
  const [viewReady, setViewReady] = useState(false);
  const handleCreateEditor = (view: EditorView) => {
    viewRef.current = view;
    editorBridge.registerView(view);
    setViewReady(true);
  };

  useEffect(() => {
    return () => {
      editorBridge.unregisterView();
    };
  }, []);

  // Append-and-run handoff. Two-phase to keep CodeMirror's controlled `value`
  // prop authoritative:
  //   1. Once the target console is active and its scratch is hydrated, write
  //      the new scratch into the store. This is what the editor renders, so
  //      the appended SELECT is guaranteed to be visible — no race against
  //      CodeMirror's internal value-reconcile effect (which would otherwise
  //      reset a directly-dispatched doc whenever the store hadn't caught up
  //      yet, e.g. on the very first mount of a new console).
  //   2. Once CodeMirror has propagated the new value into the view's doc,
  //      select the appended statement (so the run hook picks it up via the
  //      live selection) and trigger run.
  const [pendingSelection, setPendingSelection] = useState<{
    consoleId: string;
    from: number;
    to: number;
    expectedScratch: string;
  } | null>(null);

  // Phase 1: write scratch.
  useEffect(() => {
    if (!pendingAppendAndRun) return;
    if (!activeConsoleId) return;
    if (pendingAppendAndRun.consoleId !== activeConsoleId) return;
    if (!runtime) return;
    if (pendingSelection?.consoleId === activeConsoleId) return;
    const oldScratch = runtime.scratch;
    const needsBlankLine =
      oldScratch.length > 0 && !/(?:^|\n)\s*$/.test(oldScratch);
    const prefix = oldScratch.length === 0 ? "" : needsBlankLine ? "\n\n" : "";
    const newScratch = `${oldScratch}${prefix}${pendingAppendAndRun.sql}`;
    setPendingSelection({
      consoleId: activeConsoleId,
      from: oldScratch.length + prefix.length,
      to: newScratch.length,
      expectedScratch: newScratch,
    });
    setScratch(activeConsoleId, newScratch);
    clearPendingAppendAndRun();
  }, [
    pendingAppendAndRun,
    activeConsoleId,
    runtime,
    pendingSelection,
    setScratch,
    clearPendingAppendAndRun,
  ]);

  // Phase 2: select + run, once the view's doc reflects the new scratch.
  useEffect(() => {
    if (!pendingSelection) return;
    if (!viewReady) return;
    if (pendingSelection.consoleId !== activeConsoleId) {
      setPendingSelection(null);
      return;
    }
    if (!runtime) return;
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() !== pendingSelection.expectedScratch) return;
    const { from, to } = pendingSelection;
    setPendingSelection(null);
    view.dispatch({
      selection: { anchor: from, head: to },
      scrollIntoView: true,
    });
    view.focus();
    runRef.current();
  }, [pendingSelection, viewReady, activeConsoleId, runtime]);

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
      placeholder(t("editor.placeholder")),
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
          {
            key: "Mod-Shift-Enter",
            preventDefault: true,
            run: () => {
              explainRef.current();
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
    // i18n.language is included so a locale switch rebuilds the CodeMirror
    // extension list, picking up the new placeholder string. The other deps
    // are stable across locale changes; their inclusion is the existing
    // behaviour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sqlSource, i18n.language]);

  if (!activeConsoleId) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-3">
        <p className="text-muted-foreground/60 text-xs">
          {t("editor.empty-state")}
        </p>
      </div>
    );
  }

  if (!runtime) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-3">
        <p className="text-muted-foreground/60 text-xs">
          {tCommon("status.loading")}
        </p>
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
