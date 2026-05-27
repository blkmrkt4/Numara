import Link from "next/link";
import { requireSystemAdmin } from "@/lib/admin";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Gate every admin route. Non-admins land on the 404 page, exactly as
  // PRD §14.1 requires ("we don't advertise its existence").
  await requireSystemAdmin();

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              ← App
            </Link>
            <h1 className="text-base font-medium tracking-tight">Numara · admin</h1>
          </div>
          <nav className="flex items-center gap-1 text-sm">
            <Link
              href="/admin/settings"
              className="rounded-md px-3 py-1.5 text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
            >
              Settings
            </Link>
            <Link
              href="/admin/prompts"
              className="rounded-md px-3 py-1.5 text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
            >
              Prompts
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
