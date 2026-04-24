const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const publicDir = path.join(__dirname, "..", "public");
const svgPath = path.join(publicDir, "a4s-tab.svg");

if (!fs.existsSync(svgPath)) {
  console.error("Missing public/a4s-tab.svg (brand mark for icons)");
  process.exit(1);
}

const svg = fs.readFileSync(svgPath);

Promise.all([
  sharp(svg).resize(48, 48).png().toFile(path.join(publicDir, "logo-48.png")),
  sharp(svg).resize(192, 192).png().toFile(path.join(publicDir, "logo-192.png")),
  sharp(svg).resize(48, 48).png().toFile(path.join(publicDir, "favicon-48.png")),
  sharp(svg).resize(192, 192).png().toFile(path.join(publicDir, "favicon-192.png")),
])
  .then(() => console.log("Generated logo-48/192 and favicon PNGs from a4s-tab.svg"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
