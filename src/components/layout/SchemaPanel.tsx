export function SchemaPanel() {
  return (
    <section className="bg-background border-border flex w-64 shrink-0 flex-col border-r">
      <div className="border-border flex h-9 shrink-0 items-center border-b px-3">
        <h2 className="text-xs font-semibold tracking-wide uppercase">
          Schema
        </h2>
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-muted-foreground text-center text-xs">
          Select a connection to browse schema.
        </p>
      </div>
    </section>
  );
}
