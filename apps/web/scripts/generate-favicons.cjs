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
/** Squircle corner radius (fraction of side, LinkedIn-style). */
const RX = Math.round(CANVAS * 0.22);
/** Logo uses this fraction of the canvas (higher = larger mark, less padding). 0.92 is near the practical max before circular SERP crops clip corners. */
const LOGO = Math.round(CANVAS * 0.92);
const PAD = (CANVAS - LOGO) / 2;

function buildTabSvg(pngBuffer) {
  const b64 = pngBuffer.toString("base64");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <defs>
    <clipPath id="tab-squircle"><rect width="${CANVAS}" height="${CANVAS}" rx="${RX}" ry="${RX}"/></clipPath>
  </defs>
  <g clip-path="url(#tab-squircle)">
    <rect width="${CANVAS}" height="${CANVAS}" fill="#ffffff"/>
    <image x="${PAD}" y="${PAD}" width="${LOGO}" height="${LOGO}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${b64}" xlink:href="data:image/png;base64,${b64}"/>
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

  const svgBuf = Buffer.from(buildTabSvg(markPng));
  fs.writeFileSync(svgOutTab, svgBuf);
  fs.writeFileSync(svgOutLegacy, svgBuf);

  await Promise.all([
    rasterize(svgBuf, 48, path.join(publicDir, "logo-48.png")),
    rasterize(svgBuf, 192, path.join(publicDir, "logo-192.png")),
    rasterize(svgBuf, 48, path.join(publicDir, "favicon-48.png")),
    rasterize(svgBuf, 96, path.join(publicDir, "favicon-96.png")),
    rasterize(svgBuf, 128, path.join(publicDir, "favicon-128.png")),
    rasterize(svgBuf, 192, path.join(publicDir, "favicon-192.png")),
  ]);

  const png16 = await sharp(svgBuf).resize(16, 16).flatten(whiteBg).png().toBuffer();
  const png32 = await sharp(svgBuf).resize(32, 32).flatten(whiteBg).png().toBuffer();
  const png48 = await sharp(svgBuf).resize(48, 48).flatten(whiteBg).png().toBuffer();
  const png64 = await sharp(svgBuf).resize(64, 64).flatten(whiteBg).png().toBuffer();
  const icoBuffer = await pngToIco([png16, png32, png48, png64]);
  fs.writeFileSync(path.join(publicDir, "favicon.ico"), icoBuffer);

  console.log(
    fs.existsSync(markSourcePngPath)
      ? "Wrote favicons from public/favicon-source-mark.png (squircle + inset) → a4s-tab.svg, favicon.svg, PNGs, ICO, brand-tab-mark.png"
      : "Wrote favicons from public/logo.svg (squircle + inset) → … (add favicon-source-mark.png to prefer the official raster mark)",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
