"use client";

import { useEffect } from "react";

const DEFAULT_TITLE = "Maya Villa Checklists";

export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · Maya Villa` : DEFAULT_TITLE;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title]);
}
