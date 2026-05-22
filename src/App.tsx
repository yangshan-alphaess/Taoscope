import { TitleBar } from "@/components/layout/TitleBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { SchemaPanel } from "@/components/layout/SchemaPanel";
import { MainArea } from "@/components/layout/MainArea";
import { StatusBar } from "@/components/layout/StatusBar";

function App() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <SchemaPanel />
        <MainArea />
      </div>
      <StatusBar />
    </div>
  );
}

export default App;
