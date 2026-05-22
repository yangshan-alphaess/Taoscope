import { useMemo } from "react";
import { DataSourceProvider } from "@/datasource/context";
import { MockDataSource } from "@/datasource/mock";
import { TitleBar } from "@/components/layout/TitleBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { SchemaPanel } from "@/components/layout/SchemaPanel";
import { MainArea } from "@/components/layout/MainArea";
import { StatusBar } from "@/components/layout/StatusBar";

function App() {
  // Single mock instance, lifetime = app lifetime.
  const dataSource = useMemo(() => new MockDataSource(), []);

  return (
    <DataSourceProvider value={dataSource}>
      <div className="flex h-screen w-screen flex-col overflow-hidden">
        <TitleBar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <SchemaPanel />
          <MainArea />
        </div>
        <StatusBar />
      </div>
    </DataSourceProvider>
  );
}

export default App;
