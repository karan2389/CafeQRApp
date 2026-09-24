import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { getAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type CategoryUpdate = Database["public"]["Tables"]["menu_categories"]["Update"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminApi();
    if (!auth.authorized) {
      return auth.response;
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Category ID is required" }, { status: 400 });
    }

    const db = getAdminClient();

    // Check existing category
    const { data: existingCat, error: findError } = await db
      .from("menu_categories")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (findError || !existingCat) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const body = (await request.json()) as {
      name?: string;
      slug?: string;
      display_order?: number;
      is_active?: boolean;
    };

    const updates: CategoryUpdate = {};

    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
      updates.name = name;
    }

    if (body.slug !== undefined) {
      const slug = body.slug.trim().toLowerCase();
      if (!slug) return NextResponse.json({ error: "Slug cannot be empty" }, { status: 400 });
      updates.slug = slug;
    }

    if (body.display_order !== undefined) {
      updates.display_order = Number(body.display_order) || 0;
    }

    if (body.is_active !== undefined) {
      updates.is_active = Boolean(body.is_active);
    }

    const { data: updatedCat, error: updateError } = await db
      .from("menu_categories")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ success: true, category: updatedCat });
  } catch (err: unknown) {
    console.error("[AdminCategoriesAPI] PATCH failed:", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminApi();
    if (!auth.authorized) {
      return auth.response;
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Category ID is required" }, { status: 400 });
    }

    const db = getAdminClient();

    // 1. Fetch category to verify existence
    const { data: category, error: findError } = await db
      .from("menu_categories")
      .select("id, name")
      .eq("id", id)
      .maybeSingle();

    if (findError || !category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    // 2. Foreign-key check: verify whether menu items depend on this category
    const { count, error: countError } = await db
      .from("menu_items")
      .select("id", { count: "exact", head: true })
      .eq("category_id", id);

    if (countError) {
      throw countError;
    }

    if (count && count > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete category "${category.name}" because ${count} menu item(s) are assigned to it. Move or delete those menu items before deleting this category.`,
          itemCount: count,
        },
        { status: 400 }
      );
    }

    // 3. Delete category
    const { error: deleteError } = await db
      .from("menu_categories")
      .delete()
      .eq("id", id);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({ success: true, message: `Deleted category "${category.name}"` });
  } catch (err: unknown) {
    console.error("[AdminCategoriesAPI] DELETE failed:", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
