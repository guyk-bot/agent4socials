const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const publicDir = path.join(__dirname, "..", "public");
/** Tab / browser favicon (squircle). */
const markSourcePngPath = path.join(publicDir, "favicon-source-mark.png");
/** Structured data + SERP logo only (circle export). Optional; falls back to tab mark. */
const googleSearchLogoPath = path.join(publicDir, "google-search-logo-source.png");
/** Fallback vector if favicon-source-mark.png is removed. */
const logoSvgPath = path.join(publicDir, "logo.svg");
const svgOutTab = path.join(publicDir, "a4s-tab.svg");
const svgOutLegacy = path.join(publicDir, "favicon.svg");
/** Debug copy of tab raster. */
const markCachePath = path.join(publicDir, "brand-tab-mark.png");

/** Google / JSON-LD circle exports: keep white outside the clip for predictable SERP cropping. */
const whiteBg = { background: { r: 255, g: 255, b: 255 } };
/** Tab squircle: match the mark background so letterboxing and flatten() never produce a halo on browser chrome. */
const tabBgHex = "#ffffff";
const tabFlattenBg = { background: { r: 255, g: 255, b: 255 } };

const MARK_RASTER_MAX = 480;

const CANVAS = 512;
const CENTER = CANVAS / 2;
const RX = Math.round(CANVAS * 0.22);
const CLIP_R = CENTER;
/** Tab squircle: large mark (full width when source is square). */
const TAB_LOGO_FRAC = 1;
/** Circle (Google): slightly smaller so padded artwork stays inside the inscribed circle. */
const GOOGLE_LOGO_FRAC = 0.78;

function imageAttrs(b64, logoFrac, preserveAR) {
  const L = Math.round(CANVAS * logoFrac);
  const P = (CANVAS - L) / 2;
  return `<image x="${P}" y="${P}" width="${L}" height="${L}" preserveAspectRatio="${preserveAR}" href="data:image/png;base64,${b64}" xlink:href="data:image/png;base64,${b64}"/>`;
}

function buildSquircleSvg(pngBuffer) {
  const b64 = pngBuffer.toString("base64");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <defs>
    <clipPath id="tab-squircle"><rect width="${CANVAS}" height="${CANVAS}" rx="${RX}" ry="${RX}"/></clipPath>
  </defs>
  <rect width="${CANVAS}" height="${CANVAS}" fill="${tabBgHex}"/>
  <g clip-path="url(#tab-squircle)">
    <rect width="${CANVAS}" height="${CANVAS}" fill="${tabBgHex}"/>
    ${imageAttrs(b64, TAB_LOGO_FRAC, "xMidYMin meet")}
  </g>
</svg>`;
}

function buildCircleSvg(pngBuffer) {
  const b64 = pngBuffer.toString("base64");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <defs>
    <clipPath id="google-circle"><circle cx="${CENTER}" cy="${CENTER}" r="${CLIP_R}"/></clipPath>
  </defs>
  <g clip-path="url(#google-circle)">
    <rect width="${CANVAS}" height="${CANVAS}" fill="#ffffff"/>
    ${imageAttrs(b64, GOOGLE_LOGO_FRAC, "xMidYMid meet")}
  </g>
</svg>`;
}

function rasterize(svgBuffer, size, outPath, flattenBg) {
  return sharp(svgBuffer).resize(size, size).flatten(flattenBg).png().toFile(outPath);
}

async function rasterizeSourceToMarkBuffer(filePath) {
  return sharp(filePath)
    .resize(MARK_RASTER_MAX, MARK_RASTER_MAX, {
      fit: "inside",
      withoutEnlargement: true,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function loadTabMarkPngBuffer() {
  if (fs.existsSync(markSourcePngPath)) {
    return rasterizeSourceToMarkBuffer(markSourcePngPath);
  }
  if (!fs.existsSync(logoSvgPath)) {
    throw new Error("Add public/favicon-source-mark.png or public/logo.svg to build tab favicons.");
  }
  return sharp(logoSvgPath, { density: 240 })
    .resize(MARK_RASTER_MAX, MARK_RASTER_MAX, {
      fit: "inside",
      withoutEnlargement: true,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function loadGoogleLogoPngBuffer() {
  if (fs.existsSync(googleSearchLogoPath)) {
    return rasterizeSourceToMarkBuffer(googleSearchLogoPath);
  }
  return loadTabMarkPngBuffer();
}

(async () => {
  const { default: pngToIco } = await import("png-to-ico");

  const tabMarkPng = await loadTabMarkPngBuffer();
  const googleMarkPng = await loadGoogleLogoPngBuffer();

  fs.writeFileSync(markCachePath, tabMarkPng);

  const svgSquircle = Buffer.from(buildSquircleSvg(tabMarkPng));
  const svgCircle = Buffer.from(buildCircleSvg(googleMarkPng));

  fs.writeFileSync(svgOutTab, svgSquircle);
  fs.writeFileSync(svgOutLegacy, svgSquircle);

  await Promise.all([
    rasterize(svgCircle, 48, path.join(publicDir, "logo-48.png"), whiteBg),
    rasterize(svgCircle, 192, path.join(publicDir, "logo-192.png"), whiteBg),
    rasterize(svgSquircle, 48, path.join(publicDir, "favicon-48.png"), tabFlattenBg),
    rasterize(svgSquircle, 96, path.join(publicDir, "favicon-96.png"), tabFlattenBg),
    rasterize(svgSquircle, 128, path.join(publicDir, "favicon-128.png"), tabFlattenBg),
    rasterize(svgSquircle, 192, path.join(publicDir, "favicon-192.png"), tabFlattenBg),
  ]);

  const png16 = await sharp(svgSquircle).resize(16, 16).flatten(tabFlattenBg).png().toBuffer();
  const png32 = await sharp(svgSquircle).resize(32, 32).flatten(tabFlattenBg).png().toBuffer();
  const png48 = await sharp(svgSquircle).resize(48, 48).flatten(tabFlattenBg).png().toBuffer();
  const png64 = await sharp(svgSquircle).resize(64, 64).flatten(tabFlattenBg).png().toBuffer();
  const icoBuffer = await pngToIco([png16, png32, png48, png64]);
  fs.writeFileSync(path.join(publicDir, "favicon.ico"), icoBuffer);

  const g = fs.existsSync(googleSearchLogoPath) ? "google-search-logo-source.png" : "favicon mark (fallback)";
  const t = fs.existsSync(markSourcePngPath) ? "favicon-source-mark.png" : "logo.svg";
  console.log(`Wrote tab favicons (squircle) from ${t}; logo-48/192 (circle) from ${g}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
