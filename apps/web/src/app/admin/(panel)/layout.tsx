"use client";

import type { ReactNode } from "react";
import { Shell } from "@/components/admin/Shell";
import { Loading } from "@/components/admin/ui";
import { AdminAuth } from "@/lib/admin/auth";

export default function PanelLayout({ children }: { children: ReactNode }) {
  return (
    <AdminAuth fallback={<div className="px-8"><Loading /></div>}>
      <Shell>{children}</Shell>
    </AdminAuth>
  );
}
