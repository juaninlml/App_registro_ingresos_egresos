import { Suspense, type ReactNode } from "react";
import { DataProvider } from "@/components/DataProvider";
import { Shell } from "@/components/Shell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Cargando…</p>}>
      <DataProvider>
        <Shell>{children}</Shell>
      </DataProvider>
    </Suspense>
  );
}
