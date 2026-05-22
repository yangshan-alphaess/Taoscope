import { useEffect, useMemo } from "react";
import { DataSourceProvider } from "@/datasource/context";
import { MockDataSource } from "@/datasource/mock";
import { useAppState } from "@/store/appState";
import { TitleBar } from "@/components/layout/TitleBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { SchemaPanel } from "@/components/layout/SchemaPanel";
import { MainArea } from "@/components/layout/MainArea";
import { StatusBar } from "@/components/layout/StatusBar";
import { ConsolesPanel } from "@/components/console/ConsolesPanel";
import { ResultPanel } from "@/components/console/ResultPanel";

function App() {
  // Single mock instance, lifetime = app lifetime.
  const dataSource = useMemo(() => new MockDataSource(), []);
  const setConsoles = useAppState((s) => s.setConsoles);

  // Hydrate consoles list from persistence on startup.
  useEffect(() => {
    let cancelled = false;
    dataSource.listConsoles().then((list) => {
      if (cancelled) return;
      setConsoles(list);
    });
    return () => {
      cancelled = true;
    };
  }, [dataSource, setConsoles]);

  return (
    <DataSourceProvider value={dataSource}>
      <div className="flex h-screen w-screen flex-col overflow-hidden">
        <TitleBar />
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Upper row: Connections | Schema | SQL workspace */}
          <div className="flex min-h-0 flex-1">
            <Sidebar />
            <SchemaPanel />
            <MainArea />
          </div>
          {/* Lower row: Consoles | Result */}
          <div className="border-border flex min-h-0 flex-1 border-t">
            <ConsolesPanel />
            <ResultPanel />
          </div>
        </div>
        <StatusBar />
      </div>
    </DataSourceProvider>
  );
}

export default App;
