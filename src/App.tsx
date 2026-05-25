import { useEffect, useMemo } from "react";
import { DataSourceProvider } from "@/datasource/context";
import { MockDataSource } from "@/datasource/mock";
import { useAppState } from "@/store/appState";
import { TitleBar } from "@/components/layout/TitleBar";
import { ResourcesPanel } from "@/components/layout/ResourcesPanel";
import { StatusBar } from "@/components/layout/StatusBar";
import { ConsolesPanel } from "@/components/console/ConsolesPanel";
import { Editor } from "@/components/console/Editor";
import { ResultPanel } from "@/components/console/ResultPanel";
import { Toolbar } from "@/components/console/Toolbar";
import { ConfirmRoot } from "@/components/ui/ConfirmRoot";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Toaster } from "@/components/ui/sonner";

function App() {
  const dataSource = useMemo(() => new MockDataSource(), []);
  const setConsoles = useAppState((s) => s.setConsoles);

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
        <div className="flex min-h-0 flex-1">
          <ResizablePanelGroup
            direction="horizontal"
            autoSaveId="resources-main"
          >
            <ResizablePanel
              defaultSize={20}
              minSize={12}
              maxSize={40}
            >
              <ResourcesPanel />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={80}>
              <ResizablePanelGroup
                direction="vertical"
                autoSaveId="right-vertical"
              >
                <ResizablePanel defaultSize={55} minSize={20}>
                  <ResizablePanelGroup
                    direction="horizontal"
                    autoSaveId="editor-consoles"
                  >
                    <ResizablePanel defaultSize={75} minSize={40}>
                      <div className="flex h-full min-h-0 flex-col">
                        <Toolbar />
                        <Editor />
                      </div>
                    </ResizablePanel>
                    <ResizableHandle />
                    <ResizablePanel
                      defaultSize={25}
                      minSize={12}
                      maxSize={45}
                    >
                      <ConsolesPanel />
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel defaultSize={45} minSize={15}>
                  <ResultPanel />
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
        <StatusBar />
        <Toaster richColors position="bottom-right" />
        <ConfirmRoot />
      </div>
    </DataSourceProvider>
  );
}

export default App;
