import QRCode from "qrcode";

export interface BrandedQrOptions {
  /** Canvas width/height in pixels. Default is 1024 for print-ready resolution */
  size?: number;
  /** Error correction level. Default is 'H' (High ~30% recovery) */
  errorCorrectionLevel?: "L" | "M" | "Q" | "H";
  /** QR quiet zone margin in modules. Default is 3 */
  margin?: number;
  /** Center logo asset path. Default is '/courista/courista-qr-logo.png' */
  logoSrc?: string;
  /** Logo badge size as a fraction of QR total size. Target: 0.20 - 0.22. Default: 0.21 */
  logoRatio?: number;
  /** Zoom factor to crop excess outer whitespace and enlarge the Courista artwork inside the badge. Default: 1.35 */
  artworkZoom?: number;
  /** Dark module color. Default is #000000 */
  darkColor?: string;
  /** Light background color. Default is #FAF7F2 (Courista Cream) */
  lightColor?: string;
  /** Protective badge background color. Default is #FAF7F2 */
  badgeBgColor?: string;
  /** Badge border color. Default is #EAE0D5 */
  badgeBorderColor?: string;
  /** Badge border width. Default is 2 */
  badgeBorderWidth?: number;
  /** Badge corner radius. Default is proportional to size (~26px at 1024) */
  badgeRadius?: number;
}

/**
 * Helper to draw a rounded rectangle on a 2D canvas context
 */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Generates a high-resolution Branded Courista QR Code with the enlarged Courista logo
 * embedded in the center, resting on a clean protective backing with Error Correction Level H.
 */
export async function generateBrandedQrDataUrl(
  text: string,
  options: BrandedQrOptions = {}
): Promise<string> {
  const {
    size = 1024,
    errorCorrectionLevel = "H",
    margin = 3,
    logoSrc = "/courista/courista-qr-logo.png",
    logoRatio = 0.21,
    artworkZoom = 1.35,
    darkColor = "#000000",
    lightColor = "#FAF7F2",
    badgeBgColor = "#FAF7F2",
    badgeBorderColor = "#E7DDD2",
    badgeBorderWidth = 2,
    badgeRadius = Math.round(size * 0.026),
  } = options;

  if (typeof window === "undefined") {
    // Fallback if called outside browser
    return await QRCode.toDataURL(text, {
      width: size,
      margin,
      errorCorrectionLevel,
      color: { dark: darkColor, light: lightColor },
    });
  }

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Could not acquire 2D canvas context");
  }

  // 1. Render base QR code onto canvas (Level H error correction, preserving quiet zone)
  await QRCode.toCanvas(canvas, text, {
    width: size,
    margin,
    errorCorrectionLevel,
    color: {
      dark: darkColor,
      light: lightColor,
    },
  });

  // 2. Load center Courista logo
  try {
    const logoImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = logoSrc;
    });

    // 3. Compute dimensions for protective badge & center placement
    const badgeSize = Math.round(size * logoRatio);
    const badgeX = Math.round((size - badgeSize) / 2);
    const badgeY = Math.round((size - badgeSize) / 2);

    ctx.save();

    // 4. Draw Protective Backing (Clean cream/white background with smooth corners & subtle border)
    ctx.fillStyle = badgeBgColor;
    drawRoundedRect(ctx, badgeX, badgeY, badgeSize, badgeSize, badgeRadius);
    ctx.fill();

    if (badgeBorderWidth > 0 && badgeBorderColor) {
      ctx.lineWidth = badgeBorderWidth;
      ctx.strokeStyle = badgeBorderColor;
      ctx.stroke();
    }

    // 5. Calculate Zoom/Crop on source image to eliminate excess outer whitespace
    // Crop center portion of source image according to artworkZoom
    const srcW = logoImg.naturalWidth || logoImg.width;
    const srcH = logoImg.naturalHeight || logoImg.height;

    // The cropped area centered on the logo
    const cropW = srcW / artworkZoom;
    const cropH = srcH / artworkZoom;
    const cropX = (srcW - cropW) / 2;
    const cropY = (srcH - cropH) / 2;

    // 6. Scale and draw the zoomed Courista artwork inside the badge
    const padding = Math.round(badgeSize * 0.06); // 6% padding inside badge
    const maxInnerW = badgeSize - padding * 2;
    const maxInnerH = badgeSize - padding * 2;

    const cropAspect = cropW / cropH;
    let drawW = maxInnerW;
    let drawH = maxInnerH;

    if (cropAspect > 1) {
      // Landscape crop (wider than tall)
      drawW = maxInnerW;
      drawH = Math.round(maxInnerW / cropAspect);
    } else {
      // Portrait or square crop
      drawH = maxInnerH;
      drawW = Math.round(maxInnerH * cropAspect);
    }

    const drawX = Math.round(badgeX + (badgeSize - drawW) / 2);
    const drawY = Math.round(badgeY + (badgeSize - drawH) / 2);

    // Clip to rounded badge area to ensure no artwork overflows the protective backing
    ctx.beginPath();
    drawRoundedRect(ctx, badgeX, badgeY, badgeSize, badgeSize, badgeRadius);
    ctx.clip();

    ctx.drawImage(
      logoImg,
      cropX,
      cropY,
      cropW,
      cropH,
      drawX,
      drawY,
      drawW,
      drawH
    );

    ctx.restore();
  } catch (err) {
    console.warn("[BrandedQR] Could not load logo image for QR overlay, using base QR:", err);
  }

  return canvas.toDataURL("image/png");
}
