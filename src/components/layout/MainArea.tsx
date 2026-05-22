export function MainArea() {
  return (
    <main className="bg-background flex flex-1 flex-col">
      {/* TabBar */}
      <div className="border-border flex h-9 shrink-0 items-end border-b">
        <div className="border-border bg-card flex h-full items-center gap-2 border-r px-3 text-xs">
          <span className="bg-primary h-2 w-2 rounded-full" aria-hidden />
          <span>Console #1</span>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground text-sm">
            Console placeholder
          </p>
          <p className="text-muted-foreground/60 mt-1 text-xs">
            SQL editor and result grid will live here.
          </p>
        </div>
      </div>
    </main>
  );
}
