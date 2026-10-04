import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

/** Routes that only make sense with a session. Everything else lives in (publik). */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();

  return <AppShell>{children}</AppShell>;
}