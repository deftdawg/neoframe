export type RgbTuple = [number, number, number];
export type ResolvedSpectraMode = 'vivid' | 'photo' | 'graphics' | 'legacy';
export type RenderMode = 'auto' | ResolvedSpectraMode;

export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ContentDetectionMetrics {
    flatRatio: number;
    uniqueColors: number;
    top10Share: number;
    smoothGradientRatio: number;
}

export interface ContentDetectionResult {
    mode: 'vivid' | 'graphics';
    metrics: ContentDetectionMetrics;
}

export function adjustContrast(imageData: ImageData, factor: number) {
    if (factor === 1) return imageData;
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, Math.max(0, (data[i] - 128) * factor + 128));
        data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * factor + 128));
        data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * factor + 128));
    }
    return imageData;
}

export const rgbPalette = [
    { name: "Yellow", r: 255, g: 255, b: 0, value: 0xe2 },
    { name: "Green", r: 41, g: 204, b: 20, value: 0x96 },
    { name: "Blue", r: 0, g: 0, b: 255, value: 0x1d },
    { name: "Red", r: 255, g: 0, b: 0, value: 0x4c },
    { name: "Black", r: 0, g: 0, b: 0, value: 0x00 },
    { name: "White", r: 255, g: 255, b: 255, value: 0xff }
];

// Indices 0 (Black) and 1 (White) are neutral inks; 2..5 are chromatic inks.
export const SPECTRA6_PALETTE = {
    display: [
        [0, 0, 0],
        [255, 255, 255],
        [255, 255, 0],
        [255, 0, 0],
        [0, 0, 255],
        [41, 204, 20]
    ] as RgbTuple[],
    pure: [
        [0, 0, 0],
        [255, 255, 255],
        [255, 255, 0],
        [255, 0, 0],
        [0, 0, 255],
        [0, 255, 0]
    ] as RgbTuple[],
    measured: [
        [0, 0, 0],
        [161, 164, 165],
        [208, 190, 71],
        [156, 72, 75],
        [61, 59, 94],
        [58, 91, 70]
    ] as RgbTuple[],
};

const WHITE_INDEX = 1;
const NEUTRAL_INDICES = new Set([0, 1]);

function clampByte(v: number): number {
    return v < 0 ? 0 : v > 255 ? 255 : v;
}

export function getBlendedPalette(inkSaturation: number): RgbTuple[] {
    const s = Number.isFinite(inkSaturation) ? Math.min(1, Math.max(0, inkSaturation)) : 0.5;
    return SPECTRA6_PALETTE.pure.map((pure, i) => {
        const meas = SPECTRA6_PALETTE.measured[i];
        return [
            meas[0] * s + pure[0] * (1 - s),
            meas[1] * s + pure[1] * (1 - s),
            meas[2] * s + pure[2] * (1 - s),
        ];
    });
}

export function getPerceivedPalette(): RgbTuple[] {
    const white = SPECTRA6_PALETTE.measured[WHITE_INDEX];
    const wR = Math.max(1, white[0]);
    const wG = Math.max(1, white[1]);
    const wB = Math.max(1, white[2]);
    return SPECTRA6_PALETTE.measured.map(([r, g, b]) => [
        clampByte((r / wR) * 255),
        clampByte((g / wG) * 255),
        clampByte((b / wB) * 255),
    ]);
}

function rgbToLab(r: number, g: number, b: number) {
    r = r / 255;
    g = g / 255;
    b = b / 255;

    r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

    r *= 100;
    g *= 100;
    b *= 100;

    let x = r * 0.4124 + g * 0.3576 + b * 0.1805;
    let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    let z = r * 0.0193 + g * 0.1192 + b * 0.9505;

    x /= 95.047;
    y /= 100.0;
    z /= 108.883;

    x = x > 0.008856 ? Math.pow(x, 1 / 3) : (7.787 * x) + (16 / 116);
    y = y > 0.008856 ? Math.pow(y, 1 / 3) : (7.787 * y) + (16 / 116);
    z = z > 0.008856 ? Math.pow(z, 1 / 3) : (7.787 * z) + (16 / 116);

    const l = (116 * y) - 16;
    const a = 500 * (x - y);
    const bLab = 200 * (y - z);

    return { l, a, b: bLab };
}

function labDistance(lab1: { l: number; a: number; b: number }, lab2: { l: number; a: number; b: number }) {
    const dl = lab1.l - lab2.l;
    const da = lab1.a - lab2.a;
    const db = lab1.b - lab2.b;
    return Math.sqrt(0.2 * dl * dl + 3 * da * da + 3 * db * db);
}

const rgbPaletteWithLab = rgbPalette.map((color) => ({
    ...color,
    lab: rgbToLab(color.r, color.g, color.b),
}));

function findClosestLegacyColor(r: number, g: number, b: number) {
    if (r < 50 && g < 150 && b > 100) {
        return rgbPaletteWithLab[2];
    }

    const inputLab = rgbToLab(r, g, b);
    let minDistance = Infinity;
    let closestColor = rgbPaletteWithLab[0];

    for (const color of rgbPaletteWithLab) {
        const distance = labDistance(inputLab, color.lab);
        if (distance < minDistance) {
            minDistance = distance;
            closestColor = color;
        }
    }

    return closestColor;
}

export interface ColorMatchResult {
    quantR: number;
    quantG: number;
    quantB: number;
    displayR: number;
    displayG: number;
    displayB: number;
}

type ColorMatcher = (r: number, g: number, b: number) => ColorMatchResult;

function createRgbPaletteMatcher(quantPalette: RgbTuple[], displayPalette: RgbTuple[]): ColorMatcher {
    return (r: number, g: number, b: number) => {
        let minDistSq = Infinity;
        let bestIdx = 0;
        for (let i = 0; i < quantPalette.length; i++) {
            const dr = r - quantPalette[i][0];
            const dg = g - quantPalette[i][1];
            const db = b - quantPalette[i][2];
            const distSq = dr * dr + dg * dg + db * db;
            if (distSq < minDistSq) {
                minDistSq = distSq;
                bestIdx = i;
            }
        }
        const quant = quantPalette[bestIdx];
        const disp = displayPalette[bestIdx];
        return {
            quantR: quant[0],
            quantG: quant[1],
            quantB: quant[2],
            displayR: disp[0],
            displayG: disp[1],
            displayB: disp[2],
        };
    };
}

const legacyColorMatcher: ColorMatcher = (r, g, b) => {
    const closest = findClosestLegacyColor(r, g, b);
    return {
        quantR: closest.r,
        quantG: closest.g,
        quantB: closest.b,
        displayR: closest.r,
        displayG: closest.g,
        displayB: closest.b,
    };
};

interface DitherKernel {
    divisor: number;
    offsets: ReadonlyArray<readonly [dx: number, dy: number, weight: number]>;
}

const DITHER_KERNELS: Record<string, DitherKernel> = {
    floydSteinberg: {
        divisor: 16,
        offsets: [
            [1, 0, 7],
            [-1, 1, 3],
            [0, 1, 5],
            [1, 1, 1],
        ],
    },
    atkinson: {
        divisor: 8,
        offsets: [
            [1, 0, 1],
            [2, 0, 1],
            [-1, 1, 1],
            [0, 1, 1],
            [1, 1, 1],
            [0, 2, 1],
        ],
    },
    stucki: {
        divisor: 42,
        offsets: [
            [1, 0, 8], [2, 0, 4],
            [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2],
            [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1],
        ],
    },
    jarvis: {
        divisor: 48,
        offsets: [
            [1, 0, 7], [2, 0, 5],
            [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3],
            [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1],
        ],
    },
};

const BAYER8 = [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21],
].map((row) => row.map((v) => (v + 0.5) / 64.0 - 0.5));

function errorDiffusionDither(
    imageData: ImageData,
    strength: number,
    ditherType: string,
    colorMatcher: ColorMatcher,
    orderedFallback?: { quantPalette: RgbTuple[]; displayPalette: RgbTuple[] }
): ImageData {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;

    if (ditherType === 'ordered') {
        const quantPalette = orderedFallback?.quantPalette ?? SPECTRA6_PALETTE.display;
        const displayPalette = orderedFallback?.displayPalette ?? SPECTRA6_PALETTE.display;
        const rgb = new Float32Array(width * height * 3);
        for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
            rgb[j] = data[i];
            rgb[j + 1] = data[i + 1];
            rgb[j + 2] = data[i + 2];
        }
        const indices = orderedBayerDither(rgb, width, height, quantPalette, 96.0, 0);
        for (let i = 0, p = 0; p < indices.length; i += 4, p++) {
            const disp = displayPalette[indices[p]];
            data[i] = disp[0];
            data[i + 1] = disp[1];
            data[i + 2] = disp[2];
        }
        return imageData;
    }

    const kernel = ditherType === 'none' ? null : (DITHER_KERNELS[ditherType] ?? null);
    if (!kernel && ditherType !== 'none') {
        return imageData;
    }

    const effectiveStrength = ditherType === 'none' ? 0 : (Number.isFinite(strength) ? strength : 1.0);
    const tempData = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
        tempData[i] = data[i];
    }

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const r = clampByte(tempData[idx]);
            const g = clampByte(tempData[idx + 1]);
            const b = clampByte(tempData[idx + 2]);

            const match = colorMatcher(r, g, b);
            data[idx] = match.displayR;
            data[idx + 1] = match.displayG;
            data[idx + 2] = match.displayB;

            if (!kernel || effectiveStrength === 0) continue;

            const errR = (r - match.quantR) * effectiveStrength;
            const errG = (g - match.quantG) * effectiveStrength;
            const errB = (b - match.quantB) * effectiveStrength;

            for (const [dx, dy, weight] of kernel.offsets) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < width && ny < height) {
                    const nIdx = (ny * width + nx) * 4;
                    const factor = weight / kernel.divisor;
                    tempData[nIdx] = clampByte(tempData[nIdx] + errR * factor);
                    tempData[nIdx + 1] = clampByte(tempData[nIdx + 1] + errG * factor);
                    tempData[nIdx + 2] = clampByte(tempData[nIdx + 2] + errB * factor);
                }
            }
        }
    }

    return imageData;
}

export function applyGammaAndSaturation(imageData: ImageData, gamma = 0.75, saturation = 1.15): ImageData {
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
        lut[i] = Math.round(255 * Math.pow(i / 255, gamma));
    }

    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        const r = lut[data[i]];
        const g = lut[data[i + 1]];
        const b = lut[data[i + 2]];

        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        data[i] = clampByte(Math.round(luma + (r - luma) * saturation));
        data[i + 1] = clampByte(Math.round(luma + (g - luma) * saturation));
        data[i + 2] = clampByte(Math.round(luma + (b - luma) * saturation));
    }
    return imageData;
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;

    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    if (d !== 0) {
        if (max === rn) {
            h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
        } else if (max === gn) {
            h = ((bn - rn) / d + 2) / 6;
        } else {
            h = ((rn - gn) / d + 4) / 6;
        }
    }
    return [h, s, v];
}

function hsvToRgb(h: number, s: number, v: number): RgbTuple {
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    let r = 0, g = 0, b = 0;
    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }
    return [
        Math.round(clampByte(r * 255)),
        Math.round(clampByte(g * 255)),
        Math.round(clampByte(b * 255)),
    ];
}

const CHROMATIC_MEASURED_INKS = (() => {
    const white = SPECTRA6_PALETTE.measured[WHITE_INDEX];
    const whiteLuma = (0.299 * white[0] + 0.587 * white[1] + 0.114 * white[2]) || 255;
    const inks: Array<{ hueDeg: number; darkness: number }> = [];

    for (const [r, g, b] of SPECTRA6_PALETTE.measured) {
        const [h, s] = rgbToHsv(r, g, b);
        if (s < 0.15) continue;
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        inks.push({
            hueDeg: h * 360,
            darkness: Math.max(0, 1 - luma / whiteLuma),
        });
    }
    return inks;
})();

export function adaptColours(
    r: number,
    g: number,
    b: number,
    strength = 0.4,
    boost = 1.7,
    minChroma = 24
): RgbTuple {
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (chroma <= minChroma || CHROMATIC_MEASURED_INKS.length === 0) {
        return [r, g, b];
    }

    const weight = Math.min(1, (chroma - minChroma) / 40.0);
    const [h, s, v] = rgbToHsv(r, g, b);
    const hueDeg = h * 360.0;

    let weightedDarkness = 0;
    let totalInv = 0;
    for (const ink of CHROMATIC_MEASURED_INKS) {
        const diff = (((hueDeg - ink.hueDeg + 180) % 360) + 360) % 360 - 180;
        const dist = Math.abs(diff);
        const inv = 1 / ((dist + 1) * (dist + 1));
        weightedDarkness += inv * ink.darkness;
        totalInv += inv;
    }
    const darkness = totalInv > 0 ? weightedDarkness / totalInv : 0;

    const newS = Math.min(1, s * (1 + (boost - 1) * weight));
    const newV = Math.max(0, Math.min(1, v * (1 - strength * darkness * weight * 1.6)));
    return hsvToRgb(h, newS, newV);
}

export function snapToPalette(
    r: number,
    g: number,
    b: number,
    quantPalette: RgbTuple[],
    threshold = 48
): RgbTuple {
    const thresholdSq = threshold * threshold;
    let minDistSq = Infinity;
    let nearest = quantPalette[0];

    for (let i = 0; i < quantPalette.length; i++) {
        const p = quantPalette[i];
        const dr = r - p[0];
        const dg = g - p[1];
        const db = b - p[2];
        const distSq = dr * dr + dg * dg + db * db;
        if (distSq < minDistSq) {
            minDistSq = distSq;
            nearest = p;
        }
    }

    return minDistSq <= thresholdSq ? [nearest[0], nearest[1], nearest[2]] : [r, g, b];
}

export function orderedBayerDither(
    snappedRgb: Float32Array,
    width: number,
    height: number,
    quantPalette: RgbTuple[],
    spread = 96.0,
    neutralChroma = 24
): Uint8Array {
    const indices = new Uint8Array(width * height);

    for (let y = 0; y < height; y++) {
        const bayerRow = BAYER8[y & 7];
        for (let x = 0; x < width; x++) {
            const p = y * width + x;
            const j = p * 3;
            const r = snappedRgb[j];
            const g = snappedRgb[j + 1];
            const b = snappedRgb[j + 2];

            const chroma = Math.max(r, g, b) - Math.min(r, g, b);
            const isNeutral = neutralChroma > 0 && chroma < neutralChroma;
            const offset = bayerRow[x & 7] * spread;

            const sr = r + offset;
            const sg = g + offset;
            const sb = b + offset;

            let minDistSq = Infinity;
            let bestIdx = 0;
            for (let i = 0; i < quantPalette.length; i++) {
                if (isNeutral && !NEUTRAL_INDICES.has(i)) continue;
                const dr = sr - quantPalette[i][0];
                const dg = sg - quantPalette[i][1];
                const db = sb - quantPalette[i][2];
                const distSq = dr * dr + dg * dg + db * db;
                if (distSq < minDistSq) {
                    minDistSq = distSq;
                    bestIdx = i;
                }
            }
            indices[p] = bestIdx;
        }
    }

    return indices;
}

export function sharpenEdges(
    indices: Uint8Array,
    origData: Uint8ClampedArray,
    snappedRgb: Float32Array,
    width: number,
    height: number,
    edgeRange = 64,
    textThreshold = 170,
    neutralChroma = 24
): Uint8Array {
    const pixelCount = width * height;
    const luma = new Int16Array(pixelCount);

    for (let p = 0, i = 0; p < pixelCount; p++, i += 4) {
        luma[p] = Math.round(0.299 * origData[i] + 0.587 * origData[i + 1] + 0.114 * origData[i + 2]);
    }

    for (let y = 0; y < height; y++) {
        const y0 = y > 0 ? y - 1 : 0;
        const y1 = y < height - 1 ? y + 1 : height - 1;
        for (let x = 0; x < width; x++) {
            const p = y * width + x;
            const j = p * 3;
            const sr = snappedRgb[j];
            const sg = snappedRgb[j + 1];
            const sb = snappedRgb[j + 2];

            if (Math.max(sr, sg, sb) - Math.min(sr, sg, sb) >= neutralChroma) {
                continue;
            }

            const x0 = x > 0 ? x - 1 : 0;
            const x1 = x < width - 1 ? x + 1 : width - 1;
            let minL = 255;
            let maxL = 0;
            for (let ny = y0; ny <= y1; ny++) {
                const rowOffset = ny * width;
                for (let nx = x0; nx <= x1; nx++) {
                    const lv = luma[rowOffset + nx];
                    if (lv < minL) minL = lv;
                    if (lv > maxL) maxL = lv;
                }
            }

            if (maxL - minL > edgeRange) {
                indices[p] = luma[p] < textThreshold ? 0 : 1;
            }
        }
    }

    return indices;
}

function renderGraphicsMode(imageData: ImageData, inkSaturation: number): ImageData {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const origCopy = new Uint8ClampedArray(data);
    const quantPalette = getBlendedPalette(inkSaturation);
    const snappedRgb = new Float32Array(width * height * 3);

    // Cache colour adaptation + palette snap per unique 24-bit RGB colour.
    const cache = new Map<number, RgbTuple>();

    for (let p = 0, i = 0, j = 0; p < width * height; p++, i += 4, j += 3) {
        const r = origCopy[i];
        const g = origCopy[i + 1];
        const b = origCopy[i + 2];
        const key = (r << 16) | (g << 8) | b;

        let snapped = cache.get(key);
        if (!snapped) {
            const [ar, ag, ab] = adaptColours(r, g, b);
            snapped = snapToPalette(ar, ag, ab, quantPalette);
            cache.set(key, snapped);
        }

        snappedRgb[j] = snapped[0];
        snappedRgb[j + 1] = snapped[1];
        snappedRgb[j + 2] = snapped[2];
    }

    const indices = orderedBayerDither(snappedRgb, width, height, quantPalette);
    sharpenEdges(indices, origCopy, snappedRgb, width, height);

    for (let p = 0, i = 0; p < indices.length; p++, i += 4) {
        const disp = SPECTRA6_PALETTE.display[indices[p]];
        data[i] = disp[0];
        data[i + 1] = disp[1];
        data[i + 2] = disp[2];
    }

    return imageData;
}

export function detectContentMode(
    imageData: ImageData,
    bounds?: BoundingBox,
    options?: { hasCameraExif?: boolean }
): ContentDetectionResult {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;

    const bx = bounds ? Math.max(0, Math.floor(bounds.x)) : 0;
    const by = bounds ? Math.max(0, Math.floor(bounds.y)) : 0;
    const bw = bounds ? Math.min(width - bx, Math.max(1, Math.floor(bounds.width))) : width;
    const bh = bounds ? Math.min(height - by, Math.max(1, Math.floor(bounds.height))) : height;

    const stepX = Math.max(1, Math.floor(bw / 300));
    const stepY = Math.max(1, Math.floor(bh / 400));

    const hist = new Uint32Array(32768);
    let sampleCount = 0;
    let flatCount = 0;
    let smoothGradCount = 0;
    let neighborPairs = 0;

    const maxX = bx + bw;
    const maxY = by + bh;

    for (let y = by; y < maxY; y += stepY) {
        for (let x = bx; x < maxX; x += stepX) {
            const idx = (y * width + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            const bucket = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
            hist[bucket]++;
            sampleCount++;

            if (x + 1 < maxX && y + 1 < maxY) {
                const idxR = idx + 4;
                const idxD = idx + width * 4;
                const dRight = Math.abs(r - data[idxR]) + Math.abs(g - data[idxR + 1]) + Math.abs(b - data[idxR + 2]);
                const dDown = Math.abs(r - data[idxD]) + Math.abs(g - data[idxD + 1]) + Math.abs(b - data[idxD + 2]);
                const maxDelta = Math.max(dRight, dDown);

                neighborPairs++;
                if (dRight <= 3 && dDown <= 3) {
                    flatCount++;
                } else if (maxDelta > 3 && maxDelta < 24) {
                    smoothGradCount++;
                }
            }
        }
    }

    let uniqueColors = 0;
    const top10: number[] = [];
    for (let i = 0; i < hist.length; i++) {
        const count = hist[i];
        if (count > 0) {
            uniqueColors++;
            if (top10.length < 10) {
                top10.push(count);
                if (top10.length === 10) top10.sort((a, b) => b - a);
            } else if (count > top10[9]) {
                top10[9] = count;
                top10.sort((a, b) => b - a);
            }
        }
    }

    const top10Sum = top10.reduce((sum, v) => sum + v, 0);
    const flatRatio = neighborPairs > 0 ? flatCount / neighborPairs : 0;
    const smoothGradientRatio = neighborPairs > 0 ? smoothGradCount / neighborPairs : 0;
    const top10Share = sampleCount > 0 ? top10Sum / sampleCount : 0;

    const isFlat = flatRatio > 0.55;
    const isLowDiversity = uniqueColors < 1200 || top10Share > 0.65;
    const isBimodalEdges = smoothGradientRatio < 0.20;

    const score = (isFlat ? 1 : 0) + (isLowDiversity ? 1 : 0) + (isBimodalEdges ? 1 : 0);
    const requiredScore = options?.hasCameraExif ? 3 : 2;
    const mode = score >= requiredScore ? 'graphics' : 'vivid';

    return {
        mode,
        metrics: {
            flatRatio,
            uniqueColors,
            top10Share,
            smoothGradientRatio,
        },
    };
}

export function renderSpectra6Image(
    imageData: ImageData,
    config: any,
    resolvedMode?: ResolvedSpectraMode
): ImageData {
    const mode: ResolvedSpectraMode =
        resolvedMode ??
        (config.renderMode === 'vivid' ||
        config.renderMode === 'photo' ||
        config.renderMode === 'graphics' ||
        config.renderMode === 'legacy'
            ? config.renderMode
            : detectContentMode(imageData).mode);

    const contrast = parseFloat(config.contrast ?? '1.0');
    if (Number.isFinite(contrast) && contrast !== 1) {
        adjustContrast(imageData, contrast);
    }

    const ditherType = config.ditherType || 'floydSteinberg';
    const ditherStrength = parseFloat(config.ditherStrength ?? '1.0');
    const inkSaturation = parseFloat(config.inkSaturation ?? '0.5');

    switch (mode) {
        case 'graphics':
            return renderGraphicsMode(imageData, inkSaturation);
        case 'vivid': {
            applyGammaAndSaturation(imageData, 0.75, 1.15);
            const quantPalette = getPerceivedPalette();
            const matcher = createRgbPaletteMatcher(quantPalette, SPECTRA6_PALETTE.display);
            return errorDiffusionDither(imageData, ditherStrength, ditherType, matcher, {
                quantPalette,
                displayPalette: SPECTRA6_PALETTE.display,
            });
        }
        case 'photo': {
            const quantPalette = getBlendedPalette(inkSaturation);
            const matcher = createRgbPaletteMatcher(quantPalette, SPECTRA6_PALETTE.display);
            return errorDiffusionDither(imageData, ditherStrength, ditherType, matcher, {
                quantPalette,
                displayPalette: SPECTRA6_PALETTE.display,
            });
        }
        case 'legacy':
        default: {
            const legacyRgb = rgbPalette.map((c) => [c.r, c.g, c.b] as RgbTuple);
            return errorDiffusionDither(imageData, ditherStrength, ditherType, legacyColorMatcher, {
                quantPalette: legacyRgb,
                displayPalette: legacyRgb,
            });
        }
    }
}

export function ditherImage(imageData: ImageData, config: any) {
    const ditherType = config.ditherType;
    const ditherStrength = parseFloat(config.ditherStrength);
    const legacyRgb = rgbPalette.map((c) => [c.r, c.g, c.b] as RgbTuple);

    return errorDiffusionDither(imageData, ditherStrength, ditherType, legacyColorMatcher, {
        quantPalette: legacyRgb,
        displayPalette: legacyRgb,
    });
}

export function processImageData(imageData: ImageData, config: any) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const mode = config.ditherMode;

    if (mode === 'sixColor') {
        const processedData = new Uint8Array(Math.ceil((width * height) / 2));
        function rgbToSixColor(r: number, g: number, b: number) {
            if (r < 128 && g < 128 && b < 128) return 0x00;
            if (r > 128 && g > 128 && b > 128) return 0x01;
            if (r > 128 && g < 128 && b < 128) return 0x03;
            if (r > 128 && g > 128 && b < 128) return 0x02;
            if (r < 128 && g > 128 && b < 128) return 0x06;
            if (r < 128 && g < 128 && b > 128) return 0x05;
            return 0x01;
        }

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x += 2) {
                const index1 = (y * width + x) * 4;
                const index2 = (y * width + x + 1) * 4;
                const r1 = data[index1];
                const g1 = data[index1 + 1];
                const b1 = data[index1 + 2];
                const r2 = data[index2];
                const g2 = data[index2 + 1];
                const b2 = data[index2 + 2];
                const colorValue1 = rgbToSixColor(r1, g1, b1);
                const colorValue2 = rgbToSixColor(r2, g2, b2);
                const combinedValue = (colorValue1 << 4) | colorValue2;
                const newIndex = (y * (width / 2)) + (x / 2);
                processedData[newIndex] = combinedValue;
            }
        }
        return processedData;
    } else if (mode === 'fourColor') {
        const processedData = new Uint8Array(Math.ceil((width * height) / 4));
        function rgbToGray(r: number, g: number, b: number) {
            const grayscale = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            if (grayscale < 64) return 0x03;
            if (grayscale < 128) return 0x02;
            if (grayscale < 140) return 0x00;
            if (grayscale < 255) return 0x01;
            return 0x01;
        }

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = (y * width + x) * 4;
                const r = data[index];
                const g = data[index + 1];
                const b = data[index + 2];
                const grayValue = rgbToGray(r, g, b);
                const newIndex = (y * width + x) / 4 | 0;
                const shift = 6 - ((x % 4) * 2);
                processedData[newIndex] |= (grayValue << shift);
            }
        }
        return processedData;
    } else if (mode === 'blackWhiteColor' || mode === 'bw') {
        const byteWidth = Math.ceil(width / 8);
        const processedData = new Uint8Array(byteWidth * height);
        const threshold = 140;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = (y * width + x) * 4;
                const r = data[index];
                const g = data[index + 1];
                const b = data[index + 2];
                const grayscale = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
                const bit = grayscale >= threshold ? 1 : 0;
                const byteIndex = y * byteWidth + Math.floor(x / 8);
                const bitIndex = 7 - (x % 8);
                processedData[byteIndex] |= (bit << bitIndex);
            }
        }
        return processedData;
    } else if (mode === 'threeColor') {
        const byteWidth = Math.ceil(width / 8);
        const blackWhiteThreshold = 140;
        const redThreshold = 160;

        const blackWhiteData = new Uint8Array(height * byteWidth);
        const redWhiteData = new Uint8Array(height * byteWidth);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = (y * width + x) * 4;
                const r = data[index];
                const g = data[index + 1];
                const b = data[index + 2];
                const grayscale = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

                const blackWhiteBit = grayscale >= blackWhiteThreshold ? 1 : 0;
                const blackWhiteByteIndex = y * byteWidth + Math.floor(x / 8);
                const blackWhiteBitIndex = 7 - (x % 8);
                if (blackWhiteBit) {
                    blackWhiteData[blackWhiteByteIndex] |= (0x01 << blackWhiteBitIndex);
                } else {
                    blackWhiteData[blackWhiteByteIndex] &= ~(0x01 << blackWhiteBitIndex);
                }

                const redWhiteBit = (r > redThreshold && r > g && r > b) ? 0 : 1;
                const redWhiteByteIndex = y * byteWidth + Math.floor(x / 8);
                const redWhiteBitIndex = 7 - (x % 8);
                if (redWhiteBit) {
                    redWhiteData[redWhiteByteIndex] |= (0x01 << redWhiteBitIndex);
                } else {
                    redWhiteData[redWhiteByteIndex] &= ~(0x01 << redWhiteBitIndex);
                }
            }
        }

        const processedData = new Uint8Array(blackWhiteData.length + redWhiteData.length);
        processedData.set(blackWhiteData, 0);
        processedData.set(redWhiteData, blackWhiteData.length);
        return processedData;
    }
    return new Uint8Array();
}
