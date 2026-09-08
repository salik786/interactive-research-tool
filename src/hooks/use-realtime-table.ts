"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to Postgres changes on `table` filtered to one project, and
 * calls `onChange` whenever another team member's edit lands — so two people
 * viewing the same project see updates without a manual refresh.
 */
export function useRealtimeTable(
  table: "project_sources" | "theme_synthesis" | "search_tests",
  projectId: string,
  onChange: () => void
) {
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  });

  React.useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`${table}-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `project_id=eq.${projectId}` },
        () => onChangeRef.current()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, projectId]);
}
