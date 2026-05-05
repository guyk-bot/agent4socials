const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const publicDir = path.join(__dirname, "..", "public");
/** Favicon + `logo-48/192` PNGs — keep in sync with `real website favicon.svg` (copied to `a4s-tab.svg`). */
const svgPath = path.join(publicDir, "a4s-tab.svg");

if (!fs.existsSync(svgPath)) {
  console.error("Missing public/a4s-tab.svg");
  process.exit(1);
}

const svg = fs.readFileSync(svgPath);

const whiteBg = { background: { r: 255, g: 255, b: 255 } };

/** Flatten transparency onto white so browser tabs and Google show a solid background. */
function rasterize(svgBuffer, size, outPath) {
  return sharp(svgBuffer)
    .resize(size, size)
    .flatten(whiteBg)
    .png()
    .toFile(outPath);
}

(async () => {
  const { default: pngToIco } = await import("png-to-ico");

  await Promise.all([
    rasterize(svg, 48, path.join(publicDir, "logo-48.png")),
    rasterize(svg, 192, path.join(publicDir, "logo-192.png")),
    rasterize(svg, 48, path.join(publicDir, "favicon-48.png")),
    rasterize(svg, 192, path.join(publicDir, "favicon-192.png")),
  ]);

  const faviconPng = await sharp(svg).resize(48, 48).flatten(whiteBg).png().toBuffer();
  const icoBuffer = await pngToIco(faviconPng);
  fs.writeFileSync(path.join(publicDir, "favicon.ico"), icoBuffer);

  console.log("Generated logo-48/192, favicon PNGs, and favicon.ico from a4s-tab.svg");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
