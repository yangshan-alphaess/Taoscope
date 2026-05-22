import { TabBar } from "@/components/console/TabBar";
import { Toolbar } from "@/components/console/Toolbar";
import { Editor } from "@/components/console/Editor";

/**
 * MainArea hosts the upper-right SQL workspace: TabBar / Toolbar / Editor.
 * The result table lives in the lower row's ResultPanel (see App.tsx),
 * and the consoles list in the lower row's ConsolesPanel.
 */
export function MainArea() {
  return (
    <main className="bg-background flex flex-1 flex-col overflow-hidden">
      <TabBar />
      <Toolbar />
      <Editor />
    </main>
  );
}
