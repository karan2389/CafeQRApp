import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { uploadMenuImage } from "@/lib/r2/upload";
import { hasR2Configured } from "@/lib/r2/client";

export async function POST(request: NextRequest) {
  try {
    // 1. Verify caller is an authenticated admin
    const auth = await requireAdminApi();
    if (!auth.authorized) {
      return auth.response;
    }

    // 2. Parse file from multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // 3. Check file constraints
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File size exceeds 5MB limit" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 4. Upload to R2 if configured
    if (!hasR2Configured()) {
      return NextResponse.json(
        {
          error:
            "Cloudflare R2 is not configured in the server environment (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME)",
        },
        { status: 503 }
      );
    }

    const uploadResult = await uploadMenuImage(buffer, file.type);

    return NextResponse.json(uploadResult);
  } catch (err: unknown) {
    console.error("[UploadAPI] Upload failed:", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    const status = message.includes("Invalid image type") || message.includes("exceeds maximum") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
