const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const publicDir = path.join(__dirname, "..", "public");
/** Raster source: PNG mark (no padding). SVG template adds white squircle + inset so Google circle crop fits. */
const markPath = path.join(publicDir, "brand-tab-mark.png");
const svgOutTab = path.join(publicDir, "a4s-tab.svg");
const svgOutLegacy = path.join(publicDir, "favicon.svg");

if (!fs.existsSync(markPath)) {
  console.error("Missing public/brand-tab-mark.png (extract once from legacy a4s-tab or add manually).");
  process.exit(1);
}

const whiteBg = { background: { r: 255, g: 255, b: 255 } };

/** Canvas for tab favicon SVG (rasterized to 48 / 192). */
const CANVAS = 512;
/** Squircle corner radius as fraction of side (LinkedIn-style rounded square, not a circle). */
const RX = Math.round(CANVAS * 0.22);
/** Logo fits inside ~52% of canvas so it stays well inside Google's circular mask with generous padding. */
const LOGO = Math.round(CANVAS * 0.52);
const PAD = (CANVAS - LOGO) / 2;

function buildTabSvg(pngBuffer) {
  const b64 = pngBuffer.toString("base64");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <defs>
    <clipPath id="tab-squircle"><rect width="${CANVAS}" height="${CANVAS}" rx="${RX}" ry="${RX}"/></clipPath>
  </defs>
  <g clip-path="url(#tab-squircle)">
    <rect width="${CANVAS}" height="${CANVAS}" fill="#ffffff"/>
    <image x="${PAD}" y="${PAD}" width="${LOGO}" height="${LOGO}" preserveAspectRatio="xMidYMid meet" xlink:href="data:image/png;base64,${b64}"/>
  </g>
</svg>`;
}

/** Flatten transparency onto white so browser tabs and Google show a solid background. */
function rasterize(svgBuffer, size, outPath) {
  return sharp(svgBuffer).resize(size, size).flatten(whiteBg).png().toFile(outPath);
}

(async () => {
  const { default: pngToIco } = await import("png-to-ico");

  const markPng = await sharp(markPath).flatten(whiteBg).png().toBuffer();
  const svgBuf = Buffer.from(buildTabSvg(markPng));
  fs.writeFileSync(svgOutTab, svgBuf);
  fs.writeFileSync(svgOutLegacy, svgBuf);

  await Promise.all([
    rasterize(svgBuf, 48, path.join(publicDir, "logo-48.png")),
    rasterize(svgBuf, 192, path.join(publicDir, "logo-192.png")),
    rasterize(svgBuf, 48, path.join(publicDir, "favicon-48.png")),
    rasterize(svgBuf, 192, path.join(publicDir, "favicon-192.png")),
  ]);

  const faviconPng = await sharp(svgBuf).resize(48, 48).flatten(whiteBg).png().toBuffer();
  const icoBuffer = await pngToIco(faviconPng);
  fs.writeFileSync(path.join(publicDir, "favicon.ico"), icoBuffer);

  console.log("Wrote a4s-tab.svg, favicon.svg, logo-48/192, favicon PNGs, favicon.ico from brand-tab-mark.png");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
