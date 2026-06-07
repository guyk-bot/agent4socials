const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const publicDir = path.join(__dirname, "..", "public");
/** Finished square app icon (purple bg + mark). Preferred when present. */
const squareIconSourcePath = path.join(publicDir, "brand-app-icon-source.png");
/** Tab / browser favicon (squircle). Legacy transparent mark extraction. */
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
/** Tab favicons use a transparent canvas so only the mark shows in the browser tab. */
const tabFlattenBg = null;

const MARK_RASTER_MAX = 480;
/** In-app header / loader logo (transparent background). */
const UI_LOGO_MAX = 512;
const logoMarkPngPath = path.join(publicDir, "logo-mark.png");
const logoMarkDarkSourcePath = path.join(publicDir, "logo-mark-dark-source.png");
const logoMarkDarkPngPath = path.join(publicDir, "logo-mark-dark.png");
const logoSvgOutPath = path.join(publicDir, "logo.svg");
const logoWhiteSvgOutPath = path.join(publicDir, "logo-white.svg");

const CANVAS = 512;
const CENTER = CANVAS / 2;
const RX = Math.round(CANVAS * 0.22);
const CLIP_R = CENTER;
/** Tab squircle: fill most of the canvas so the mark stays legible at 16–32px. */
const TAB_LOGO_FRAC = 1.18;
/** Circle (Google): slightly smaller so padded artwork stays inside the inscribed circle. */
const GOOGLE_LOGO_FRAC = 0.92;
/** Tight-crop mark fills this fraction of the raster square before compositing. */
const TAB_MARK_FILL = 1.0;

function imageAttrs(b64, logoFrac, preserveAR) {
  const L = Math.round(CANVAS * logoFrac);
  const P = (CANVAS - L) / 2;
  return `<image x="${P}" y="${P}" width="${L}" height="${L}" preserveAspectRatio="${preserveAR}" href="data:image/png;base64,${b64}" xlink:href="data:image/png;base64,${b64}"/>`;
}

function buildTransparentTabSvg(pngBuffer) {
  const b64 = pngBuffer.toString("base64");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  ${imageAttrs(b64, TAB_LOGO_FRAC, "xMidYMid meet")}
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
  let pipeline = sharp(svgBuffer).resize(size, size);
  if (flattenBg) pipeline = pipeline.flatten(flattenBg);
  return pipeline.png().toFile(outPath);
}

async function rasterizePngBuffer(pngBuffer, size, outPath) {
  return sharp(pngBuffer).resize(size, size).png().toFile(outPath);
}

async function rasterizeSourceToMarkBuffer(filePath, fillFrac = TAB_MARK_FILL) {
  const { data, info } = await sharp(filePath)
    .resize(MARK_RASTER_MAX, MARK_RASTER_MAX, {
      fit: "inside",
      withoutEnlargement: true,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  prepareSourcePixels(data);
  let trimmed = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .trim({ threshold: 12 })
    .toBuffer();
  const trimmedMeta = await sharp(trimmed).metadata();
  const maxDim = Math.max(trimmedMeta.width || 1, trimmedMeta.height || 1);
  const targetSize = Math.round(MARK_RASTER_MAX * fillFrac);
  const scale = targetSize / maxDim;
  const newW = Math.max(1, Math.round((trimmedMeta.width || 1) * scale));
  const newH = Math.max(1, Math.round((trimmedMeta.height || 1) * scale));
  const padLeft = Math.floor((MARK_RASTER_MAX - newW) / 2);
  const padRight = MARK_RASTER_MAX - newW - padLeft;
  const padTop = Math.floor((MARK_RASTER_MAX - newH) / 2);
  const padBottom = MARK_RASTER_MAX - newH - padTop;
  return sharp(trimmed)
    .resize(newW, newH, { fit: "fill" })
    .extend({
      top: padTop,
      bottom: padBottom,
      left: padLeft,
      right: padRight,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function loadTrimmedMarkBuffer(filePath, fillFrac = TAB_MARK_FILL) {
  const trimmed = await sharp(filePath).ensureAlpha().png().trim({ threshold: 10 }).toBuffer();
  const meta = await sharp(trimmed).metadata();
  const maxDim = Math.max(meta.width || 1, meta.height || 1);
  const targetSize = Math.round(MARK_RASTER_MAX * fillFrac);
  const scale = targetSize / maxDim;
  const newW = Math.max(1, Math.round((meta.width || 1) * scale));
  const newH = Math.max(1, Math.round((meta.height || 1) * scale));
  const padLeft = Math.floor((MARK_RASTER_MAX - newW) / 2);
  const padRight = MARK_RASTER_MAX - newW - padLeft;
  const padTop = Math.floor((MARK_RASTER_MAX - newH) / 2);
  const padBottom = MARK_RASTER_MAX - newH - padTop;
  return sharp(trimmed)
    .resize(newW, newH, { fit: "fill" })
    .extend({
      top: padTop,
      bottom: padBottom,
      left: padLeft,
      right: padRight,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function loadSquareIconBuffer(filePath, size = MARK_RASTER_MAX) {
  return sharp(filePath)
    .resize(size, size, { fit: "cover", position: "center" })
    .png()
    .toBuffer();
}

async function knockOutWhiteBackgroundPng(pngBuffer) {
  const { data, info } = await sharp(pngBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  knockOutNearWhite(data);
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

async function loadTabMarkPngBuffer() {
  let mark;
  if (fs.existsSync(squareIconSourcePath)) {
    mark = await loadTrimmedMarkBuffer(squareIconSourcePath, TAB_MARK_FILL);
  } else if (fs.existsSync(markSourcePngPath)) {
    mark = await rasterizeSourceToMarkBuffer(markSourcePngPath, TAB_MARK_FILL);
  } else if (!fs.existsSync(logoSvgPath)) {
    throw new Error("Add public/favicon-source-mark.png or public/logo.svg to build tab favicons.");
  } else {
    mark = await sharp(logoSvgPath, { density: 240 })
      .resize(MARK_RASTER_MAX, MARK_RASTER_MAX, {
        fit: "inside",
        withoutEnlargement: true,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  }
  return knockOutWhiteBackgroundPng(mark);
}

async function loadGoogleLogoPngBuffer() {
  if (fs.existsSync(squareIconSourcePath)) {
    return loadTrimmedMarkBuffer(squareIconSourcePath, 0.92);
  }
  if (fs.existsSync(googleSearchLogoPath)) {
    return rasterizeSourceToMarkBuffer(googleSearchLogoPath, 0.9);
  }
  return loadTabMarkPngBuffer();
}

function knockOutNearWhite(data, threshold = 248) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const min = Math.min(r, g, b);
    if (min >= threshold) {
      data[i + 3] = 0;
    } else if (min >= threshold - 24) {
      const t = (min - (threshold - 24)) / 24;
      data[i + 3] = Math.round(data[i + 3] * (1 - t));
    }
  }
}

function knockOutNearBlack(data, threshold = 16) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    if (max <= threshold) {
      data[i + 3] = 0;
    } else if (max <= threshold + 28) {
      const t = (max - threshold) / 28;
      data[i + 3] = Math.round(data[i + 3] * t);
    }
  }
}

function prepareSourcePixels(data) {
  knockOutNearWhite(data);
}

async function buildUiLogoMarkPngBuffer(filePath) {
  const { data, info } = await sharp(filePath)
    .resize(MARK_RASTER_MAX, MARK_RASTER_MAX, {
      fit: "inside",
      withoutEnlargement: true,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  knockOutNearWhite(data);
  let trimmed = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .trim({ threshold: 12 })
    .toBuffer();
  const trimmedMeta = await sharp(trimmed).metadata();
  const maxDim = Math.max(trimmedMeta.width || 1, trimmedMeta.height || 1);
  const targetSize = Math.round(MARK_RASTER_MAX * 0.94);
  const scale = targetSize / maxDim;
  const newW = Math.max(1, Math.round((trimmedMeta.width || 1) * scale));
  const newH = Math.max(1, Math.round((trimmedMeta.height || 1) * scale));
  const padLeft = Math.floor((MARK_RASTER_MAX - newW) / 2);
  const padRight = MARK_RASTER_MAX - newW - padLeft;
  const padTop = Math.floor((MARK_RASTER_MAX - newH) / 2);
  const padBottom = MARK_RASTER_MAX - newH - padTop;
  const buf = await sharp(trimmed)
    .resize(newW, newH, { fit: "fill" })
    .extend({
      top: padTop,
      bottom: padBottom,
      left: padLeft,
      right: padRight,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const meta = await sharp(buf).metadata();
  if ((meta.width || 0) <= UI_LOGO_MAX && (meta.height || 0) <= UI_LOGO_MAX) return buf;
  return sharp(buf)
    .resize(UI_LOGO_MAX, UI_LOGO_MAX, {
      fit: "inside",
      withoutEnlargement: true,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function buildUiLogoMarkDarkPngBuffer(filePath) {
  const { data, info } = await sharp(filePath)
    .resize(MARK_RASTER_MAX, MARK_RASTER_MAX, {
      fit: "inside",
      withoutEnlargement: true,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  knockOutNearBlack(data);
  let trimmed = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .trim({ threshold: 12 })
    .toBuffer();
  const trimmedMeta = await sharp(trimmed).metadata();
  const maxDim = Math.max(trimmedMeta.width || 1, trimmedMeta.height || 1);
  const targetSize = Math.round(MARK_RASTER_MAX * 0.94);
  const scale = targetSize / maxDim;
  const newW = Math.max(1, Math.round((trimmedMeta.width || 1) * scale));
  const newH = Math.max(1, Math.round((trimmedMeta.height || 1) * scale));
  const padLeft = Math.floor((MARK_RASTER_MAX - newW) / 2);
  const padRight = MARK_RASTER_MAX - newW - padLeft;
  const padTop = Math.floor((MARK_RASTER_MAX - newH) / 2);
  const padBottom = MARK_RASTER_MAX - newH - padTop;
  const buf = await sharp(trimmed)
    .resize(newW, newH, { fit: "fill" })
    .extend({
      top: padTop,
      bottom: padBottom,
      left: padLeft,
      right: padRight,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const meta = await sharp(buf).metadata();
  if ((meta.width || 0) <= UI_LOGO_MAX && (meta.height || 0) <= UI_LOGO_MAX) return buf;
  return sharp(buf)
    .resize(UI_LOGO_MAX, UI_LOGO_MAX, {
      fit: "inside",
      withoutEnlargement: true,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

function buildFlatLogoSvg(pngBuffer, width, height) {
  const b64 = pngBuffer.toString("base64");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <image width="${width}" height="${height}" href="data:image/png;base64,${b64}" xlink:href="data:image/png;base64,${b64}"/>
</svg>`;
}

(async () => {
  const { default: pngToIco } = await import("png-to-ico");

  const tabMarkPng = await loadTabMarkPngBuffer();
  const googleMarkPng = await loadGoogleLogoPngBuffer();
  const uiLogoSourcePath = fs.existsSync(squareIconSourcePath)
    ? squareIconSourcePath
    : fs.existsSync(markSourcePngPath)
      ? markSourcePngPath
      : fs.existsSync(googleSearchLogoPath)
        ? googleSearchLogoPath
        : null;
  if (!uiLogoSourcePath) {
    throw new Error("Add public/brand-app-icon-source.png or public/favicon-source-mark.png to build UI logo assets.");
  }
  const uiLogoMarkPng = await buildUiLogoMarkPngBuffer(uiLogoSourcePath);
  const uiMeta = await sharp(uiLogoMarkPng).metadata();
  const uiLogoSvg = buildFlatLogoSvg(uiLogoMarkPng, uiMeta.width, uiMeta.height);

  fs.writeFileSync(logoMarkPngPath, uiLogoMarkPng);
  fs.writeFileSync(logoSvgOutPath, uiLogoSvg);
  if (fs.existsSync(logoMarkDarkSourcePath)) {
    const uiLogoMarkDarkPng = await buildUiLogoMarkDarkPngBuffer(logoMarkDarkSourcePath);
    const darkMeta = await sharp(uiLogoMarkDarkPng).metadata();
    fs.writeFileSync(logoMarkDarkPngPath, uiLogoMarkDarkPng);
    fs.writeFileSync(
      logoWhiteSvgOutPath,
      buildFlatLogoSvg(uiLogoMarkDarkPng, darkMeta.width, darkMeta.height)
    );
  } else {
    fs.writeFileSync(logoWhiteSvgOutPath, uiLogoSvg);
  }
  fs.writeFileSync(markCachePath, tabMarkPng);

  const svgTab = Buffer.from(buildTransparentTabSvg(tabMarkPng));
  const svgCircle = Buffer.from(buildCircleSvg(googleMarkPng));

  fs.writeFileSync(svgOutTab, svgTab);
  fs.writeFileSync(svgOutLegacy, svgTab);

  await Promise.all([
    rasterize(svgCircle, 48, path.join(publicDir, "logo-48.png"), whiteBg),
    rasterize(svgCircle, 192, path.join(publicDir, "logo-192.png"), whiteBg),
    rasterizePngBuffer(tabMarkPng, 48, path.join(publicDir, "favicon-48.png")),
    rasterizePngBuffer(tabMarkPng, 96, path.join(publicDir, "favicon-96.png")),
    rasterizePngBuffer(tabMarkPng, 128, path.join(publicDir, "favicon-128.png")),
    rasterizePngBuffer(tabMarkPng, 192, path.join(publicDir, "favicon-192.png")),
  ]);

  const png16 = await sharp(tabMarkPng).resize(16, 16).png().toBuffer();
  const png32 = await sharp(tabMarkPng).resize(32, 32).png().toBuffer();
  const png48 = await sharp(tabMarkPng).resize(48, 48).png().toBuffer();
  const png64 = await sharp(tabMarkPng).resize(64, 64).png().toBuffer();
  const icoBuffer = await pngToIco([png16, png32, png48, png64]);
  fs.writeFileSync(path.join(publicDir, "favicon.ico"), icoBuffer);

  const g = fs.existsSync(squareIconSourcePath)
    ? "brand-app-icon-source.png"
    : fs.existsSync(googleSearchLogoPath)
      ? "google-search-logo-source.png"
      : "favicon mark (fallback)";
  const t = fs.existsSync(squareIconSourcePath)
    ? "brand-app-icon-source.png"
    : fs.existsSync(markSourcePngPath)
      ? "favicon-source-mark.png"
      : "logo.svg";
  console.log(
    `Wrote tab favicons from ${t}; logo-48/192 (circle) from ${g}; logo-mark.png + logo.svg from ${uiLogoSourcePath}`,
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
