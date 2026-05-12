const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const publicDir = path.join(__dirname, "..", "public");
/** Canonical raster for tab + Google icons (square mark on transparent). Prefer over logo.svg when present. */
const markSourcePngPath = path.join(publicDir, "favicon-source-mark.png");
/** Fallback vector if favicon-source-mark.png is removed. */
const logoSvgPath = path.join(publicDir, "logo.svg");
const svgOutTab = path.join(publicDir, "a4s-tab.svg");
const svgOutLegacy = path.join(publicDir, "favicon.svg");
/** Copy of embedded mark for debugging; overwritten each run. */
const markCachePath = path.join(publicDir, "brand-tab-mark.png");

const whiteBg = { background: { r: 255, g: 255, b: 255 } };

/** Max width/height of embedded PNG inside the tab SVG (keeps file size reasonable). */
const MARK_RASTER_MAX = 480;

/** Canvas for tab favicon SVG (rasterized to 48 / 192). */
const CANVAS = 512;
const CENTER = CANVAS / 2;
/** Squircle corner radius (fraction of side): browser tab favicon = rounded square, not a full disk. */
const RX = Math.round(CANVAS * 0.22);
/** Inscribed circle clip: used only for logo-192 / logo-48 (JSON-LD + Google SERP circular mask). */
const CLIP_R = CENTER;
/** Logo uses this fraction of the canvas (higher = larger mark, less padding). */
const LOGO = Math.round(CANVAS * 0.92);
const PAD = (CANVAS - LOGO) / 2;

const imageAttrs = (b64) =>
  `<image x="${PAD}" y="${PAD}" width="${LOGO}" height="${LOGO}" preserveAspectRatio="xMidYMin meet" href="data:image/png;base64,${b64}" xlink:href="data:image/png;base64,${b64}"/>`;

/** Rounded square (LinkedIn-style): tabs, manifest, favicon.ico, a4s-tab.svg */
function buildSquircleSvg(pngBuffer) {
  const b64 = pngBuffer.toString("base64");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <defs>
    <clipPath id="tab-squircle"><rect width="${CANVAS}" height="${CANVAS}" rx="${RX}" ry="${RX}"/></clipPath>
  </defs>
  <g clip-path="url(#tab-squircle)">
    <rect width="${CANVAS}" height="${CANVAS}" fill="#ffffff"/>
    ${imageAttrs(b64)}
  </g>
</svg>`;
}

/** Full circle: matches Google search circular crop on logo-192 (Organization / OG). */
function buildCircleSvg(pngBuffer) {
  const b64 = pngBuffer.toString("base64");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <defs>
    <clipPath id="google-circle"><circle cx="${CENTER}" cy="${CENTER}" r="${CLIP_R}"/></clipPath>
  </defs>
  <g clip-path="url(#google-circle)">
    <rect width="${CANVAS}" height="${CANVAS}" fill="#ffffff"/>
    ${imageAttrs(b64)}
  </g>
</svg>`;
}

/** Flatten transparency onto white so browser tabs and Google show a solid background. */
function rasterize(svgBuffer, size, outPath) {
  return sharp(svgBuffer).resize(size, size).flatten(whiteBg).png().toFile(outPath);
}

async function loadMarkPngBuffer() {
  if (fs.existsSync(markSourcePngPath)) {
    return sharp(markSourcePngPath)
      .resize(MARK_RASTER_MAX, MARK_RASTER_MAX, {
        fit: "inside",
        withoutEnlargement: true,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  }
  if (!fs.existsSync(logoSvgPath)) {
    throw new Error("Add public/favicon-source-mark.png or public/logo.svg to build favicons.");
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

(async () => {
  const { default: pngToIco } = await import("png-to-ico");

  const markPng = await loadMarkPngBuffer();
  fs.writeFileSync(markCachePath, markPng);

  const svgSquircle = Buffer.from(buildSquircleSvg(markPng));
  const svgCircle = Buffer.from(buildCircleSvg(markPng));

  fs.writeFileSync(svgOutTab, svgSquircle);
  fs.writeFileSync(svgOutLegacy, svgSquircle);

  await Promise.all([
    rasterize(svgCircle, 48, path.join(publicDir, "logo-48.png")),
    rasterize(svgCircle, 192, path.join(publicDir, "logo-192.png")),
    rasterize(svgSquircle, 48, path.join(publicDir, "favicon-48.png")),
    rasterize(svgSquircle, 96, path.join(publicDir, "favicon-96.png")),
    rasterize(svgSquircle, 128, path.join(publicDir, "favicon-128.png")),
    rasterize(svgSquircle, 192, path.join(publicDir, "favicon-192.png")),
  ]);

  const png16 = await sharp(svgSquircle).resize(16, 16).flatten(whiteBg).png().toBuffer();
  const png32 = await sharp(svgSquircle).resize(32, 32).flatten(whiteBg).png().toBuffer();
  const png48 = await sharp(svgSquircle).resize(48, 48).flatten(whiteBg).png().toBuffer();
  const png64 = await sharp(svgSquircle).resize(64, 64).flatten(whiteBg).png().toBuffer();
  const icoBuffer = await pngToIco([png16, png32, png48, png64]);
  fs.writeFileSync(path.join(publicDir, "favicon.ico"), icoBuffer);

  console.log(
    fs.existsSync(markSourcePngPath)
      ? "Wrote tab favicons (squircle) + logo-48/192 (circle for Google) from public/favicon-source-mark.png"
      : "Wrote tab favicons (squircle) + logo-48/192 (circle) from public/logo.svg … add favicon-source-mark.png for the official raster mark",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
