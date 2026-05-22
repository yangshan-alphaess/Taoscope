export function StatusBar() {
  return (
    <footer className="bg-background border-border text-muted-foreground flex h-6 shrink-0 items-center justify-between border-t px-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="bg-primary inline-block h-1.5 w-1.5 rounded-full" />
        <span>ready</span>
      </div>
      <div className="font-mono">— rows</div>
      <div className="font-mono">— ms</div>
    </footer>
  );
}
