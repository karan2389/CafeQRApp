import { HeadBucketCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getAppConfig } from "../lib/config/env";
import { getR2Client, hasR2Configured } from "../lib/r2/client";

async function verifyR2Configuration() {
  console.log("==================================================================");
  console.log("Cloudflare R2 Storage Configuration Verification");
  console.log("==================================================================\n");

  const config = getAppConfig();
  const r2 = config.r2;

  const status = {
    accountId: r2?.accountId ? "PRESENT" : "MISSING",
    bucketName: r2?.bucketName ? "PRESENT" : "MISSING",
    accessKeyId: r2?.accessKeyId ? "PRESENT" : "MISSING",
    secretAccessKey: r2?.secretAccessKey ? "PRESENT (hidden)" : "MISSING",
    publicUrl: r2?.publicUrl ? "PRESENT" : "MISSING (optional fallback will be used)",
  };

  console.log("Configuration Checklist:");
  console.log(`  - Account ID (R2_ACCOUNT_ID):        ${status.accountId}`);
  console.log(`  - Bucket Name (R2_BUCKET_NAME):      ${status.bucketName}`);
  console.log(`  - Access Key ID (R2_ACCESS_KEY_ID):  ${status.accessKeyId}`);
  console.log(`  - Secret Key (R2_SECRET_ACCESS_KEY): ${status.secretAccessKey}`);
  console.log(`  - Public Base URL (R2_PUBLIC_URL):   ${status.publicUrl}\n`);

  if (!hasR2Configured()) {
    console.log("❌ R2 is NOT fully configured in the current environment.");
    console.log("Please ensure R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME are set in your .env file.");
    process.exit(1);
  }

  console.log("Testing Cloudflare R2 Connectivity & Bucket Access...");
  try {
    const client = getR2Client();
    const bucketName = r2!.bucketName!;

    // 1. Verify bucket existence & access
    await client.send(new HeadBucketCommand({ Bucket: bucketName }));
    console.log(`  ✓ Bucket '${bucketName}' is accessible.`);

    // 2. Perform test upload (put and delete a temporary probe)
    const probeKey = `test-probe-${Date.now()}.txt`;
    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: probeKey,
        Body: "probe",
        ContentType: "text/plain",
      })
    );
    console.log(`  ✓ Upload probe succeeded (${probeKey}).`);

    await client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: probeKey,
      })
    );
    console.log(`  ✓ Deletion probe succeeded.`);

    // 3. Check public URL format
    const publicBase = r2?.publicUrl?.replace(/\/+$/, "") || `https://${bucketName}.${r2?.accountId}.r2.cloudflarestorage.com`;
    const sampleUrl = `${publicBase}/menu/sample-item.jpg`;
    console.log(`  ✓ Public image URL pattern: ${sampleUrl}\n`);

    console.log("==================================================================");
    console.log("Result: Cloudflare R2 is fully operational!");
    console.log("==================================================================");
  } catch (err: unknown) {
    console.error("❌ Cloudflare R2 connectivity test failed:");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

void verifyR2Configuration();
