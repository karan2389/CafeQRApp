import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { getAdminClient, hasAdminClientConfigured } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const auth = await requireAdminApi();
    if (!auth.authorized) {
      return auth.response;
    }

    const db = hasAdminClientConfigured() ? getAdminClient() : auth.supabase;
    const { data, error } = await db
      .from("menu_categories")
      .select("*")
      .order("display_order", { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json(data || []);
  } catch (err: unknown) {
    console.error("[AdminCategoriesAPI] GET failed:", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminApi();
    if (!auth.authorized) {
      return auth.response;
    }

    const body = (await request.json()) as {
      name?: string;
      slug?: string;
      display_order?: number;
      is_active?: boolean;
      branch_id?: string;
    };

    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "Category name is required" }, { status: 400 });
    }

    let slug = body.slug?.trim().toLowerCase();
    if (!slug) {
      slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    }

    const db = getAdminClient();

    // Resolve branch ID
    let branchId = body.branch_id;
    if (!branchId) {
      const { data: branch } = await db
        .from("branches")
        .select("id")
        .limit(1)
        .maybeSingle();

      if (!branch) {
        return NextResponse.json({ error: "Branch not found" }, { status: 400 });
      }
      branchId = branch.id;
    }

    const { data, error } = await db
      .from("menu_categories")
      .insert({
        branch_id: branchId,
        name,
        slug,
        display_order: Number(body.display_order) || 0,
        is_active: body.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, category: data }, { status: 201 });
  } catch (err: unknown) {
    console.error("[AdminCategoriesAPI] POST failed:", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
