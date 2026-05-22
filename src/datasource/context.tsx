import { createContext, useContext, type ReactNode } from "react";
import type { DataSource } from "@/datasource/types";

const DataSourceContext = createContext<DataSource | null>(null);

interface DataSourceProviderProps {
  value: DataSource;
  children: ReactNode;
}

export function DataSourceProvider({
  value,
  children,
}: DataSourceProviderProps) {
  return (
    <DataSourceContext.Provider value={value}>
      {children}
    </DataSourceContext.Provider>
  );
}

export function useDataSource(): DataSource {
  const ctx = useContext(DataSourceContext);
  if (ctx === null) {
    throw new Error("useDataSource must be used within DataSourceProvider");
  }
  return ctx;
}
