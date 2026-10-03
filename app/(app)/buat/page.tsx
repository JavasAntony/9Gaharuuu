import type { Metadata } from "next";
import { buatPost } from "@/app/actions/posts";
import { BuatForm } from "./BuatForm";

export const metadata: Metadata = { title: "Buat" };

export default function BuatPage() {
  return (
    <main className="px-4 py-6">
      <h1 className="text-lg font-semibold">Buat posting</h1>
      <BuatForm action={buatPost} />
    </main>
  );
}
