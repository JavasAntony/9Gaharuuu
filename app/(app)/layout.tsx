import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "KelasKita",
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();

  return (
    <div className="mx-auto flex min-h-full w-full max-w-xl flex-col">
      <div className="flex-1 pb-24">{children}</div>
      <BottomNav />
    </div>
  );
}
