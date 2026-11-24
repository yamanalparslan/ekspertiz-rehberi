"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getLeaveGuard } from "@/lib/client/leave-guard";

/**
 * İç bağlantı (next/link). Ücretli analiz sürerken ya da sonuç ekrandayken önce onay ister;
 * onaylanırsa: başka sayfaya gidilir, aynı sayfaya (logo -> ana sayfa) gidiliyorsa analiz
 * sıfırlanıp yükleme ekranı açılır. Koruma yoksa sıradan bir bağlantıdır.
 */
export function GuardedLink(props: { href: string; className?: string; children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <Link
      href={props.href}
      className={props.className}
      onClick={(e) => {
        const guard = getLeaveGuard();
        if (!guard || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (!window.confirm(guard.message)) {
          e.preventDefault();
          return;
        }
        if (props.href === pathname) {
          e.preventDefault();
          guard.onLeave();
        }
      }}
    >
      {props.children}
    </Link>
  );
}
