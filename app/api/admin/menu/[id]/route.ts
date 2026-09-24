import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { getAdminClient } from "@/lib/supabase/admin";
import { deleteR2Image, extractR2Key } from "@/lib/r2/upload";
import type { Database } from "@/types/database";

type MenuItemUpdate = Database["public"]["Tables"]["menu_items"]["Update"];

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
      return NextResponse.json({ error: "Item ID is required" }, { status: 400 });
    }

    const db = getAdminClient();

    // Check existing item
    const { data: existingItem, error: findError } = await db
      .from("menu_items")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (findError || !existingItem) {
      return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
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

    const updates: MenuItemUpdate = {
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
      updates.name = name;
    }

    if (body.category_id !== undefined) {
      const { data: category } = await db
        .from("menu_categories")
        .select("id")
        .eq("id", body.category_id)
        .maybeSingle();
      if (!category) return NextResponse.json({ error: "Category not found" }, { status: 400 });
      updates.category_id = body.category_id;
    }

    if (body.price !== undefined) {
      const price = Number(body.price);
      if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json({ error: "Price must be a valid non-negative number" }, { status: 400 });
      }
      updates.price = price;
    }

    if (body.description !== undefined) {
      updates.description = body.description?.trim() || null;
    }

    if (body.is_available !== undefined) {
      updates.is_available = Boolean(body.is_available);
    }

    if (body.requires_age_confirmation !== undefined) {
      updates.requires_age_confirmation = Boolean(body.requires_age_confirmation);
    }

    if (body.display_order !== undefined) {
      updates.display_order = Number(body.display_order) || 0;
    }

    // Image replacement handling
    let oldImageToCleanup: string | null = null;
    if (body.image_url !== undefined) {
      const newImageUrl = body.image_url?.trim() || null;
      updates.image_url = newImageUrl;

      if (existingItem.image_url && existingItem.image_url !== newImageUrl) {
        oldImageToCleanup = existingItem.image_url;
      }
    }

    const { data: updatedItem, error: updateError } = await db
      .from("menu_items")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // If image was replaced and old image is an R2 object, check if any other item still references it
    if (oldImageToCleanup && extractR2Key(oldImageToCleanup)) {
      const { count } = await db
        .from("menu_items")
        .select("id", { count: "exact", head: true })
        .eq("image_url", oldImageToCleanup)
        .neq("id", id);

      if (!count || count === 0) {
        // Safe to delete old R2 object
        void deleteR2Image(oldImageToCleanup);
      }
    }

    return NextResponse.json({ success: true, item: updatedItem });
  } catch (err: unknown) {
    console.error("[AdminMenuAPI] PATCH failed:", err);
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
      return NextResponse.json({ error: "Item ID is required" }, { status: 400 });
    }

    const db = getAdminClient();

    // Fetch item first to obtain image_url for cleanup
    const { data: itemToDelete, error: findError } = await db
      .from("menu_items")
      .select("id, name, image_url")
      .eq("id", id)
      .maybeSingle();

    if (findError || !itemToDelete) {
      return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
    }

    // Permanent deletion from database
    const { error: deleteError } = await db
      .from("menu_items")
      .delete()
      .eq("id", id);

    if (deleteError) {
      throw deleteError;
    }

    // Cleanup R2 image if present and not referenced elsewhere
    const imageUrl = itemToDelete.image_url;
    if (imageUrl && extractR2Key(imageUrl)) {
      const { count } = await db
        .from("menu_items")
        .select("id", { count: "exact", head: true })
        .eq("image_url", imageUrl);

      if (!count || count === 0) {
        void deleteR2Image(imageUrl);
      }
    }

    return NextResponse.json({ success: true, message: `Deleted ${itemToDelete.name}` });
  } catch (err: unknown) {
    console.error("[AdminMenuAPI] DELETE failed:", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
