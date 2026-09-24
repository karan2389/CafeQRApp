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
      .from("menu_items")
      .select("*, menu_categories(id, name, slug)")
      .order("display_order", { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({ items: data || [] });
  } catch (err: unknown) {
    console.error("[AdminMenuAPI] GET failed:", err);
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
      category_id?: string;
      description?: string | null;
      price?: number;
      image_url?: string | null;
      is_available?: boolean;
      requires_age_confirmation?: boolean;
      display_order?: number;
    };

    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const categoryId = body.category_id;
    if (!categoryId) {
      return NextResponse.json({ error: "Category is required" }, { status: 400 });
    }

    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: "Price must be a valid non-negative number" }, { status: 400 });
    }

    const db = getAdminClient();

    // Verify category exists
    const { data: category, error: catError } = await db
      .from("menu_categories")
      .select("id")
      .eq("id", categoryId)
      .maybeSingle();

    if (catError || !category) {
      return NextResponse.json({ error: "Selected category does not exist" }, { status: 400 });
    }

    const { data, error } = await db
      .from("menu_items")
      .insert({
        name,
        category_id: categoryId,
        description: body.description?.trim() || null,
        price,
        image_url: body.image_url?.trim() || null,
        is_available: body.is_available ?? true,
        requires_age_confirmation: body.requires_age_confirmation ?? false,
        display_order: Number(body.display_order) || 0,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, item: data }, { status: 201 });
  } catch (err: unknown) {
    console.error("[AdminMenuAPI] POST failed:", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
