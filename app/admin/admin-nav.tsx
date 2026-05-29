"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/prompts", label: "Prompts" },
];

// Header for every admin page. Reads the current path so the heading names
// the page you're on and the matching tab is highlighted rather than every
// tab sitting in the same grey — there was previously no way to tell Settings
// from Prompts at a glance.
export function AdminNav() {
  const pathname = usePathname();
  const active = TABS.find((t) => pathname.startsWith(t.href));

  return (
    <>
      <div className="flex items-center gap-6">
        <Link
          href="/dashboard"
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          ← App
        </Link>
        <h1 className="text-base font-medium tracking-tight">
          Numara · admin
          {active ? (
            <span className="text-neutral-400 dark:text-neutral-500">
              {" "}
              · {active.label}
            </span>
          ) : null}
        </h1>
      </div>
      <nav className="flex items-center gap-1 text-sm">
        {TABS.map((t) => {
          const isActive = pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={isActive ? "page" : undefined}
              className={
                "rounded-md px-3 py-1.5 transition-colors " +
                (isActive
                  ? "bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100"
                  : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900")
              }
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
