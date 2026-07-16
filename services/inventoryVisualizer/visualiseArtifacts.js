import { clearAllCache, createCanvas, loadImage } from '@napi-rs/canvas';
import { RARITY } from './artifactMetadata.js';

const DEFAULT_ICON_BASE_URL = 'https://eggincassets.pages.dev';

const BACKGROUND_COLOR = '#333333';
const GRID_SQUARE_SIZE = 134;
const GRID_SQUARE_ROUNDED_CORNER = 42;
const GRID_SQUARE_GAP = 18;
const GRID_SQUARE_COLOR = '#404040';
const ICON_NATIVE_SIZE = 256;
const ICON_DISPLAY_SIZE = 128;
const COUNT_BOX_COLOR = '#5e5e5e';
const FONT_FAMILY = 'Arial';
const FONT_SIZE = 27;
const ICON_TIMEOUT_MS = 10_000;

function getIconUrl(iconFile, { iconBaseUrl = DEFAULT_ICON_BASE_URL, iconSize = 256 } = {}) {
  if (!iconFile) {
    return null;
  }

  const normalizedBase = String(iconBaseUrl).replace(/\/+$/, '');
  return `${normalizedBase}/${iconSize}/egginc/${iconFile}`;
}

async function fetchIconBuffer(url, timeoutMs = ICON_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`GET ${url}: HTTP ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function loadIcon(iconFile, options, warnings, iconCache) {
  const url = getIconUrl(iconFile, options);
  if (!url) {
    return null;
  }

  if (!iconCache.has(url)) {
    iconCache.set(url, (async () => {
      const buffer = await fetchIconBuffer(url, options.iconTimeoutMs);
      return loadImage(buffer);
    })());
  }

  try {
    return await iconCache.get(url);
  } catch (error) {
    iconCache.delete(url);
    warnings.push(`failed to load icon ${iconFile}: ${error?.message ?? String(error)}`);
    return null;
  }
}

function drawRoundedRect(ctx, {
  left: x,
  top: y,
  width: w,
  height: h,
  rx,
  ry,
  fill,
}) {
  const k = 1 - 0.5522847498;
  ctx.beginPath();
  ctx.moveTo(x + rx, y);
  ctx.lineTo(x + w - rx, y);
  ctx.bezierCurveTo(x + w - k * rx, y, x + w, y + k * ry, x + w, y + ry);
  ctx.lineTo(x + w, y + h - ry);
  ctx.bezierCurveTo(x + w, y + h - k * ry, x + w - k * rx, y + h, x + w - rx, y + h);
  ctx.lineTo(x + rx, y + h);
  ctx.bezierCurveTo(x + k * rx, y + h, x, y + h - k * ry, x, y + h - ry);
  ctx.lineTo(x, y + ry);
  ctx.bezierCurveTo(x, y + k * ry, x + k * rx, y, x + rx, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function getRarityFill(ctx, item, left, top, scale) {
  if (item.rarity === RARITY.COMMON) {
    return GRID_SQUARE_COLOR;
  }

  const gradient = ctx.createRadialGradient(
    left + (GRID_SQUARE_SIZE / 2) * scale,
    top + (GRID_SQUARE_SIZE / 2) * scale,
    0,
    left + (GRID_SQUARE_SIZE / 2) * scale,
    top + (GRID_SQUARE_SIZE / 2) * scale,
    (GRID_SQUARE_SIZE / 2) * 1.2 * scale,
  );

  let colors = ['#404040', '#404040', '#404040'];
  if (item.rarity === RARITY.RARE) {
    colors = ['#b3ffff', '#b3ffff', '#6ab6ff'];
  } else if (item.rarity === RARITY.EPIC) {
    colors = ['#ff40ff', '#ff40ff', '#c03fe2'];
  } else if (item.rarity === RARITY.LEGENDARY) {
    colors = ['#fffe41', '#fffe41', '#eeab42'];
  }

  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(0.5, colors[1]);
  gradient.addColorStop(1, colors[2]);
  return gradient;
}

function drawImageScaled(ctx, image, { left, top, scaleX, scaleY }) {
  if (!image) {
    return;
  }

  const width = image.naturalWidth ?? image.width ?? ICON_NATIVE_SIZE;
  const height = image.naturalHeight ?? image.height ?? ICON_NATIVE_SIZE;
  ctx.drawImage(image, left, top, width * scaleX, height * scaleY);
}

function drawPlaceholderIcon(ctx, item, { left, top, size, scale }) {
  const centerX = left + size / 2;
  const centerY = top + size / 2;
  const label = item?.tier ? `T${item.tier}` : '?';

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
  ctx.lineWidth = 3 * scale;
  ctx.beginPath();
  ctx.arc(centerX, centerY, size * 0.3, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
  ctx.font = `bold ${24 * scale}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, centerX, centerY);
  ctx.restore();
}

function drawCountBox(ctx, count, { right, bottom, scale }) {
  if (count <= 1) {
    return;
  }

  const countText = count.toLocaleString('en-US');
  ctx.font = `bold ${FONT_SIZE * scale}px ${FONT_FAMILY}`;
  const countTextWidth = ctx.measureText(countText).width;

  drawRoundedRect(ctx, {
    left: right + (GRID_SQUARE_GAP / 2 - 24) * scale - countTextWidth,
    top: bottom + (GRID_SQUARE_GAP / 2 - 34) * scale,
    width: 24 * scale + countTextWidth,
    height: 34 * scale,
    rx: 17 * scale,
    ry: 17 * scale,
    fill: COUNT_BOX_COLOR,
  });

  ctx.fillStyle = 'white';
  ctx.fillText(
    countText,
    right + (GRID_SQUARE_GAP / 2 - 11) * scale - countTextWidth,
    bottom + (GRID_SQUARE_GAP / 2 - 7) * scale,
  );
}

function drawEmptyState(ctx, width, height, message) {
  drawRoundedRect(ctx, {
    left: 0,
    top: 0,
    width,
    height,
    rx: 17,
    ry: 17,
    fill: BACKGROUND_COLOR,
  });

  ctx.fillStyle = 'white';
  ctx.font = `bold 28px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, width / 2, height / 2);
}

function releaseCanvas(canvas) {
  if (!canvas) {
    return;
  }

  // Resizing replaces the native pixel surface, releasing the potentially
  // large inventory-sized backing store while leaving the encoded PNG intact.
  canvas.width = 1;
  canvas.height = 1;
}

export async function visualiseArtifacts(grid, options = {}) {
  const {
    scale = 1,
    iconBaseUrl = DEFAULT_ICON_BASE_URL,
    iconSize = 256,
    iconTimeoutMs = ICON_TIMEOUT_MS,
    emptyMessage = 'No artifacts found',
  } = options;

  if (!Array.isArray(grid)) {
    throw new Error('visualiseArtifacts expected an artifact grid array.');
  }

  const warnings = [];
  const iconCache = new Map();
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const numItems = grid.length;
  let canvas;

  try {
    if (numItems === 0) {
      canvas = createCanvas(640 * safeScale, 240 * safeScale);
      const ctx = canvas.getContext('2d');
      drawEmptyState(ctx, canvas.width, canvas.height, emptyMessage);
      return {
        buffer: canvas.toBuffer('image/png'),
        width: canvas.width,
        height: canvas.height,
        mimeType: 'image/png',
        warnings,
      };
    }

    const numItemsPerRow = Math.ceil(Math.sqrt(numItems));
    const numItemsPerCol = Math.ceil(numItems / numItemsPerRow);
    const targetWidth = GRID_SQUARE_SIZE * numItemsPerRow + GRID_SQUARE_GAP * (numItemsPerRow + 1);
    const targetHeight = GRID_SQUARE_SIZE * numItemsPerCol + GRID_SQUARE_GAP * (numItemsPerCol + 1);
    canvas = createCanvas(targetWidth * safeScale, targetHeight * safeScale);
    const ctx = canvas.getContext('2d');

    drawRoundedRect(ctx, {
      left: 0,
      top: 0,
      width: canvas.width,
      height: canvas.height,
      rx: 17 * safeScale,
      ry: 17 * safeScale,
      fill: BACKGROUND_COLOR,
    });

    for (let index = 0; index < numItems; index += 1) {
      const gridItem = grid[index];
      const row = Math.floor(index / numItemsPerCol);
      const col = index % numItemsPerCol;
      const left = (row * GRID_SQUARE_SIZE + (row + 1) * GRID_SQUARE_GAP) * safeScale;
      const top = (col * GRID_SQUARE_SIZE + (col + 1) * GRID_SQUARE_GAP) * safeScale;
      const right = left + GRID_SQUARE_SIZE * safeScale;
      const bottom = top + GRID_SQUARE_SIZE * safeScale;

      drawRoundedRect(ctx, {
        left,
        top,
        width: GRID_SQUARE_SIZE * safeScale,
        height: GRID_SQUARE_SIZE * safeScale,
        rx: GRID_SQUARE_ROUNDED_CORNER * safeScale,
        ry: GRID_SQUARE_ROUNDED_CORNER * safeScale,
        fill: getRarityFill(ctx, gridItem, left, top, safeScale),
      });

      const icon = await loadIcon(
        gridItem.iconFile,
        { iconBaseUrl, iconSize, iconTimeoutMs },
        warnings,
        iconCache,
      );
      const iconLeft = left + ((GRID_SQUARE_SIZE - ICON_DISPLAY_SIZE) / 2) * safeScale;
      const iconTop = top + ((GRID_SQUARE_SIZE - ICON_DISPLAY_SIZE) / 2) * safeScale;
      if (icon) {
        drawImageScaled(ctx, icon, {
          left: iconLeft,
          top: iconTop,
          scaleX: (ICON_DISPLAY_SIZE / ICON_NATIVE_SIZE) * safeScale,
          scaleY: (ICON_DISPLAY_SIZE / ICON_NATIVE_SIZE) * safeScale,
        });
      } else {
        drawPlaceholderIcon(ctx, gridItem, {
          left: iconLeft,
          top: iconTop,
          size: ICON_DISPLAY_SIZE * safeScale,
          scale: safeScale,
        });
      }

      for (let stoneIndex = 0; stoneIndex < gridItem.stones.length; stoneIndex += 1) {
        const stone = gridItem.stones[stoneIndex];
        const stoneIcon = await loadIcon(
          stone.iconFile,
          { iconBaseUrl, iconSize, iconTimeoutMs },
          warnings,
          iconCache,
        );
        const stoneLeft = right - (16 + 26 + 22 * stoneIndex) * safeScale;
        const stoneTop = bottom - (16 + 26) * safeScale;
        if (stoneIcon) {
          drawImageScaled(ctx, stoneIcon, {
            left: stoneLeft,
            top: stoneTop,
            scaleX: (26 / ICON_NATIVE_SIZE) * safeScale,
            scaleY: (26 / ICON_NATIVE_SIZE) * safeScale,
          });
        } else {
          drawPlaceholderIcon(ctx, stone, {
            left: stoneLeft,
            top: stoneTop,
            size: 26 * safeScale,
            scale: safeScale * 0.35,
          });
        }
      }

      drawCountBox(ctx, gridItem.count, { right, bottom, scale: safeScale });
    }

    return {
      buffer: canvas.toBuffer('image/png'),
      width: targetWidth,
      height: targetHeight,
      mimeType: 'image/png',
      warnings,
    };
  } finally {
    iconCache.clear();
    releaseCanvas(canvas);
    clearAllCache();
  }
}
