"use client";

import { type ReactNode } from "react";

/**
 * Wraps a <Table> so it scrolls horizontally on small screens
 * instead of overflowing or shrinking columns.
 */
export function ResponsiveTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      {children}
    </div>
  );
}
