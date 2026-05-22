export function Sidebar() {
  return (
    <aside className="bg-background border-border flex w-56 shrink-0 flex-col border-r">
      <div className="border-border flex h-9 shrink-0 items-center border-b px-3">
        <h2 className="text-xs font-semibold tracking-wide uppercase">
          Connections
        </h2>
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-muted-foreground text-center text-xs">
          No connections yet.
        </p>
      </div>
    </aside>
  );
}
