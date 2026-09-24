import Link from "next/link";
import { AlertCircle, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function TableInvalidPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;

  let title = "Table QR Inactive or Expired";
  let description =
    "This table QR code is currently inactive or has expired. Please contact a member of our cafe staff for assistance.";

  if (reason === "missing_token") {
    title = "Invalid QR Link";
    description = "No QR authentication token was provided in the link. Please scan the QR code located on your table.";
  } else if (reason === "table_inactive") {
    title = "Table Currently Inactive";
    description = "This table is not currently open for ordering. Please speak with cafe staff to be seated.";
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-900 px-4 py-12 text-stone-100">
      <div className="max-w-md w-full text-center space-y-6 bg-stone-800/80 p-8 rounded-2xl border border-stone-700 shadow-xl backdrop-blur">
        <div className="w-16 h-16 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mx-auto ring-8 ring-amber-500/10">
          <AlertCircle className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
          <p className="text-stone-400 text-sm leading-relaxed">{description}</p>
        </div>

        <div className="pt-4 border-t border-stone-700/60 flex flex-col gap-3">
          <Button asChild variant="outline" className="w-full border-stone-600 hover:bg-stone-700 text-stone-200">
            <Link href="/">
              <HelpCircle className="w-4 h-4 mr-2" />
              Return to Home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
