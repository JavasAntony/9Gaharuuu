import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { buatGuestPost, buatPost } from "@/app/actions/posts";
import { PageHeader } from "@/components/PageHeader";
import { BuatForm, GuestForm } from "./BuatForm";

export const metadata: Metadata = { title: "Buat" };

export default async function BuatPage() {
  const user = await getCurrentUser();

  return (
    <main>
      <PageHeader title="Buat posting" />

      <div className="px-4">
        {user ? (
          <BuatForm action={buatPost} />
        ) : (
          <GuestForm action={buatGuestPost} />
        )}
      </div>
    </main>
  );
}