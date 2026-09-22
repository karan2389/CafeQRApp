import { getSupabaseClient } from "@/lib/supabase/client";
import type { DbBranch, DbTable } from "@/types/database";

export interface BranchWithTables {
  branch: DbBranch;
  tables: DbTable[];
}

/**
 * Fetches the active branch and associated tables from Supabase.
 * Read-only inquiry for validation and dashboard overview.
 */
export async function fetchBranchWithTables(slug: string = "ember-and-oak"): Promise<BranchWithTables | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (branchError || !branch) {
      return null;
    }

    const { data: tables, error: tablesError } = await supabase
      .from("tables")
      .select("*")
      .eq("branch_id", branch.id)
      .order("table_number", { ascending: true });

    if (tablesError || !tables) {
      return null;
    }

    return {
      branch,
      tables,
    };
  } catch {
    return null;
  }
}
