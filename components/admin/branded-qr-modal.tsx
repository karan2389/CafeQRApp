"use client";

import { useEffect, useState } from "react";
import { 
  Copy, 
  ExternalLink, 
  Check, 
  Download, 
  Printer, 
  Loader2, 
  ShieldCheck, 
  X 
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generateBrandedQrDataUrl } from "@/lib/qr/branded-qr";

interface BrandedQrModalProps {
  tableNumber: number;
  token: string;
  url: string;
  onClose: () => void;
}

export function BrandedQrModal({
  tableNumber,
  url,
  onClose,
}: BrandedQrModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;

    generateBrandedQrDataUrl(url, {
      size: 1024,
      errorCorrectionLevel: "H",
      logoRatio: 0.20,
      margin: 3,
      logoSrc: "/courista/logo.png",
      darkColor: "#000000",
      lightColor: "#FAF7F2",
      badgeBgColor: "#FAF7F2",
      badgeBorderColor: "#E7DDD2",
      badgeBorderWidth: 2,
    })
      .then((dataUrl) => {
        if (active) {
          setQrDataUrl(dataUrl);
        }
      })
      .catch((err) => {
        console.error("Failed to generate branded QR:", err);
        if (active) {
          toast.error("Failed to generate branded QR code");
        }
      });

    return () => {
      active = false;
    };
  }, [url]);

  const generating = !qrDataUrl;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Scan link copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const link = document.createElement("a");
    link.download = `courista-table-${tableNumber}-qr.png`;
    link.href = qrDataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Downloaded Table ${tableNumber} Branded QR (1024x1024 High-Res PNG)`);
  };

  const handlePrint = () => {
    if (!qrDataUrl) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Please allow popups to print table card");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Courista Table ${tableNumber} QR Card</title>
          <style>
            @page {
              size: auto;
              margin: 15mm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              background: #FAF7F2;
              color: #2D2421;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 90vh;
              margin: 0;
              padding: 20px;
            }
            .card {
              background: #FFFFFF;
              border: 2px solid #E6D7C3;
              border-radius: 24px;
              padding: 40px 32px;
              text-align: center;
              max-width: 380px;
              width: 100%;
              box-shadow: 0 10px 25px rgba(114, 36, 15, 0.08);
            }
            .header-badge {
              display: inline-block;
              font-size: 12px;
              letter-spacing: 0.15em;
              text-transform: uppercase;
              font-weight: 700;
              color: #72240F;
              background: #F4EBE1;
              padding: 6px 14px;
              border-radius: 999px;
              margin-bottom: 12px;
            }
            h1 {
              font-size: 28px;
              font-weight: 800;
              margin: 0 0 6px 0;
              color: #1F1612;
            }
            p.sub {
              font-size: 13px;
              color: #796E65;
              margin: 0 0 24px 0;
            }
            .qr-wrapper {
              background: #FAF7F2;
              border: 1px solid #EAE0D5;
              border-radius: 18px;
              padding: 16px;
              display: inline-block;
              margin-bottom: 24px;
            }
            .qr-img {
              width: 240px;
              height: 240px;
              display: block;
            }
            .instructions {
              font-size: 14px;
              font-weight: 600;
              color: #72240F;
              margin: 0 0 4px 0;
            }
            .footer-note {
              font-size: 11px;
              color: #9C8E82;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header-badge">Courista Cafe</div>
            <h1>Table ${tableNumber}</h1>
            <p class="sub">Eat • Play • Connect</p>
            <div class="qr-wrapper">
              <img src="${qrDataUrl}" class="qr-img" alt="Table ${tableNumber} QR Code" />
            </div>
            <div class="instructions">Scan to View Menu & Order</div>
            <div class="footer-note">Contactless Dining & Kitchen Service</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-stone-900 border border-stone-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-in zoom-in-95 relative max-h-[95vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-stone-400 hover:text-white p-1 rounded-full hover:bg-stone-800 transition"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto ring-8 ring-amber-500/5">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-bold text-white">
            Table {tableNumber} Branded QR
          </h2>
          <p className="text-stone-400 text-xs max-w-sm mx-auto">
            High-resolution Courista QR code with center logo branding & Level H cryptographic error-correction.
          </p>
        </div>

        {/* QR Code Presentation Box */}
        <div className="space-y-4 bg-stone-950 p-5 rounded-2xl border border-stone-800 text-center">
          <div className="flex justify-center items-center py-4 bg-[#FAF7F2] rounded-2xl border border-[#E7DDD2] shadow-inner min-h-[220px]">
            {generating ? (
              <div className="flex flex-col items-center gap-2 text-stone-500">
                <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
                <span className="text-xs font-medium">Generating branded QR...</span>
              </div>
            ) : qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt={`Courista Branded QR Code for Table ${tableNumber}`}
                className="w-52 h-52 object-contain rounded-xl shadow-sm"
              />
            ) : (
              <p className="text-xs text-red-500">Failed to render QR</p>
            )}
          </div>

          <div className="space-y-1 text-left">
            <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider block">
              Direct Scan URL
            </span>
            <p className="font-mono text-xs text-amber-400 break-all leading-relaxed bg-stone-900/90 p-2.5 rounded-xl border border-stone-800 select-all">
              {url}
            </p>
          </div>

          {/* Primary Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <Button
              onClick={handleDownload}
              disabled={generating || !qrDataUrl}
              className="bg-[#72240F] hover:bg-[#8B3A1C] text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-[#72240F]/20"
            >
              <Download className="w-3.5 h-3.5" />
              Download QR (PNG)
            </Button>

            <Button
              variant="outline"
              onClick={handlePrint}
              disabled={generating || !qrDataUrl}
              className="border-stone-700 bg-stone-900 hover:bg-stone-800 text-stone-200 text-xs flex items-center justify-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5 text-stone-300" />
              Print Table Card
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyToClipboard(url)}
              className="flex-1 border-stone-700 text-stone-300 hover:bg-stone-800 text-xs"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                  Link Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                  Copy Scan Link
                </>
              )}
            </Button>

            <Button
              asChild
              size="sm"
              variant="ghost"
              className="text-stone-400 hover:text-white hover:bg-stone-800 text-xs"
            >
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Test Scan
              </a>
            </Button>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={onClose}
            className="w-full border-stone-700 text-stone-300 hover:bg-stone-800"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
