import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();

    return NextResponse.json({ success: true, message: "Logged out successfully" });
  } catch (err: unknown) {
    console.error("[StaffAuth] Logout failed:", err);
    return NextResponse.json(
      { error: "Logout failed" },
      { status: 500 }
    );
  }
}
