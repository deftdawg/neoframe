import { Config } from './config';
import {
    adjustContrast as adjustContrastAlgo,
    ditherImage as ditherImageAlgo,
    processImageData as processImageDataAlgo,
    detectContentMode,
    renderSpectra6Image,
    BoundingBox,
    ResolvedSpectraMode,
} from './algorithms';

export type SplitMode = 'none' | 'left-right' | 'top-bottom' | 'diagonal' | 'diagonal-tl-br' | 'diagonal-bl-tr';

export interface RenderFrameOptions {
    rotation?: number;
    imageBoundingBox?: BoundingBox;
    hasCameraExif?: boolean;
    onLog?: (message: string) => void;
}

interface SplitSegment {
    mode: ResolvedSpectraMode;
    ditherType: string;
}

type EdgeName = 'top' | 'bottom' | 'left' | 'right';

const PIXEL_FONT_5X7: Record<string, readonly number[]> = {
    A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
    C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
    D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
    E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
    G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
    H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
    I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
    L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
    O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
    P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
    R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
    S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
    T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
    V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
    Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
};

export function adjustContrast(imageData: ImageData, factor: number) {
    return adjustContrastAlgo(imageData, factor);
}

export function ditherImage(imageData: ImageData, config: Config) {
    return ditherImageAlgo(imageData, config);
}

export function processImageData(imageData: ImageData, config: Config) {
    return processImageDataAlgo(imageData, config);
}

function cloneImageData(imageData: ImageData): ImageData {
    const copied = new Uint8ClampedArray(imageData.data);
    if (typeof ImageData !== 'undefined') {
        return new ImageData(copied, imageData.width, imageData.height);
    }
    return {
        width: imageData.width,
        height: imageData.height,
        data: copied,
        colorSpace: 'srgb',
    } as ImageData;
}

function normalizeRenderMode(mode: string | undefined, fallback: 'auto' | ResolvedSpectraMode): 'auto' | ResolvedSpectraMode {
    if (mode === 'auto' || mode === 'vivid' || mode === 'photo' || mode === 'graphics' || mode === 'legacy') {
        return mode;
    }
    return fallback;
}

function normalizeSplitMode(mode: string | undefined): SplitMode {
    if (
        mode === 'left-right' ||
        mode === 'top-bottom' ||
        mode === 'diagonal' ||
        mode === 'diagonal-tl-br' ||
        mode === 'diagonal-bl-tr'
    ) {
        return mode;
    }
    return 'none';
}

function normalizeSplitModeC(mode: string | undefined): 'auto' | 'none' | ResolvedSpectraMode {
    if (mode === 'none' || mode === 'vivid' || mode === 'photo' || mode === 'graphics' || mode === 'legacy') {
        return mode;
    }
    return 'auto';
}

function isExplicitSpectraMode(mode: string): mode is ResolvedSpectraMode {
    return mode === 'vivid' || mode === 'photo' || mode === 'graphics' || mode === 'legacy';
}

function resolveSplitSegments(
    config: Config,
    resolveDetected: () => 'vivid' | 'graphics'
): SplitSegment[] {
    const rawA = normalizeRenderMode(config.renderMode, 'auto');
    const rawB = normalizeRenderMode(config.splitRenderMode, 'auto');
    const rawC = normalizeSplitModeC(config.splitRenderModeC);

    const ditherA = config.ditherType || 'floydSteinberg';
    const ditherB = config.splitDitherType || ditherA;
    const ditherC = config.splitDitherTypeC || ditherA;

    if (rawB === 'auto' && rawC === 'auto') {
        const effectiveA = rawA === 'auto' ? resolveDetected() : rawA;
        if (effectiveA === 'graphics') {
            return [
                { mode: 'graphics', ditherType: ditherA },
                { mode: 'legacy', ditherType: ditherB },
            ];
        }
        if (effectiveA === 'vivid' || effectiveA === 'photo') {
            return [
                { mode: 'vivid', ditherType: ditherA },
                { mode: 'photo', ditherType: ditherB },
                { mode: 'legacy', ditherType: ditherC },
            ];
        }
        // rawA === 'legacy' with auto secondary modes: compare legacy against detected presets
        const detected = resolveDetected();
        if (detected === 'graphics') {
            return [
                { mode: 'legacy', ditherType: ditherA },
                { mode: 'graphics', ditherType: ditherB },
            ];
        }
        return [
            { mode: 'legacy', ditherType: ditherA },
            { mode: 'vivid', ditherType: ditherB },
            { mode: 'photo', ditherType: ditherC },
        ];
    }

    const modeA = rawA === 'auto' ? resolveDetected() : rawA;
    const modeB = rawB === 'auto' ? resolveDetected() : rawB;
    const segments: SplitSegment[] = [
        { mode: modeA, ditherType: ditherA },
        { mode: modeB, ditherType: ditherB },
    ];

    if (isExplicitSpectraMode(rawC)) {
        segments.push({ mode: rawC, ditherType: ditherC });
    }

    return segments;
}

function toOrientedUv(rx: number, ry: number, rotation: number): [number, number] {
    const rot = ((rotation % 360) + 360) % 360;
    if (rot === 90) return [ry, 1 - rx];
    if (rot === 180) return [1 - rx, 1 - ry];
    if (rot === 270) return [1 - ry, rx];
    return [rx, ry];
}

function fromOrientedPixel(
    ox: number,
    oy: number,
    bx: number,
    by: number,
    bw: number,
    bh: number,
    rotation: number
): [number, number] {
    const rot = ((rotation % 360) + 360) % 360;
    if (rot === 90) return [bx + bw - 1 - oy, by + ox];
    if (rot === 180) return [bx + bw - 1 - ox, by + bh - 1 - oy];
    if (rot === 270) return [bx + oy, by + bh - 1 - ox];
    return [bx + ox, by + oy];
}

export function getSegmentIndex(
    u: number,
    v: number,
    numSegments: number,
    splitMode: Exclude<SplitMode, 'none'>
): number {
    let t: number;
    switch (splitMode) {
        case 'left-right':
            t = u;
            break;
        case 'top-bottom':
            t = v;
            break;
        case 'diagonal':
        case 'diagonal-tl-br':
            t = (u + v) / 2;
            break;
        case 'diagonal-bl-tr':
            t = (u + (1 - v)) / 2;
            break;
    }

    if (numSegments <= 2) {
        return t < 0.5 ? 0 : 1;
    }
    if (t < 1 / 3) return 0;
    if (t < 2 / 3) return 1;
    return 2;
}

function setCanvasPixel(imageData: ImageData, x: number, y: number, r: number, g: number, b: number) {
    if (x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) return;
    const idx = (y * imageData.width + x) * 4;
    imageData.data[idx] = r;
    imageData.data[idx + 1] = g;
    imageData.data[idx + 2] = b;
    imageData.data[idx + 3] = 255;
}

function drawSplitSegmentLabels(
    imageData: ImageData,
    segments: SplitSegment[],
    splitMode: Exclude<SplitMode, 'none'>,
    bx: number,
    by: number,
    bw: number,
    bh: number,
    rotation: number
) {
    const rot = ((rotation % 360) + 360) % 360;
    const orientedW = rot === 90 || rot === 270 ? bh : bw;
    const orientedH = rot === 90 || rot === 270 ? bw : bh;

    const edges: ReadonlyArray<{
        name: EdgeName;
        length: number;
        uvAt: (i: number) => [number, number];
    }> = [
        { name: 'top', length: orientedW, uvAt: (i) => [(i + 0.5) / orientedW, 0.5 / orientedH] },
        { name: 'bottom', length: orientedW, uvAt: (i) => [(i + 0.5) / orientedW, (orientedH - 0.5) / orientedH] },
        { name: 'left', length: orientedH, uvAt: (i) => [0.5 / orientedW, (i + 0.5) / orientedH] },
        { name: 'right', length: orientedH, uvAt: (i) => [(orientedW - 0.5) / orientedW, (i + 0.5) / orientedH] },
    ];

    const usedEdges = new Set<EdgeName>();

    for (let segIdx = 0; segIdx < segments.length; segIdx++) {
        let bestEdge: { name: EdgeName; length: number; start: number; end: number; spanLen: number } | null = null;

        for (const edge of edges) {
            let start = -1;
            let end = -1;
            for (let i = 0; i < edge.length; i++) {
                const [u, v] = edge.uvAt(i);
                if (getSegmentIndex(u, v, segments.length, splitMode) === segIdx) {
                    if (start === -1) start = i;
                    end = i + 1;
                }
            }
            if (start === -1) continue;
            const spanLen = end - start;

            if (
                !bestEdge ||
                spanLen > bestEdge.spanLen ||
                (spanLen === bestEdge.spanLen && usedEdges.has(bestEdge.name) && !usedEdges.has(edge.name))
            ) {
                bestEdge = { name: edge.name, length: edge.length, start, end, spanLen };
            }
        }

        if (!bestEdge) continue;
        usedEdges.add(bestEdge.name);

        const label = segments[segIdx].mode.toUpperCase();
        const measurePill = (s: number) => ({
            scale: s,
            glyphW: 5 * s,
            glyphH: 7 * s,
            glyphGap: s,
            pad: s === 1 ? 2 : 3,
            textW: label.length * 5 * s + Math.max(0, label.length - 1) * s,
        });

        let metrics = measurePill(2);
        if (metrics.textW + metrics.pad * 2 > bestEdge.spanLen) {
            metrics = measurePill(1);
        }

        const pillLen = metrics.textW + metrics.pad * 2;
        const pillThick = metrics.glyphH + metrics.pad * 2;
        const centerAlongEdge = Math.floor((bestEdge.start + bestEdge.end) / 2);
        const rawPos = centerAlongEdge - Math.floor(pillLen / 2);
        const startAlongEdge = Math.max(0, Math.min(bestEdge.length - pillLen, rawPos));

        const isHorizontalEdge = bestEdge.name === 'top' || bestEdge.name === 'bottom';
        const oxOrigin = bestEdge.name === 'right' ? orientedW - pillThick : isHorizontalEdge ? startAlongEdge : 0;
        const oyOrigin = bestEdge.name === 'bottom' ? orientedH - pillThick : isHorizontalEdge ? 0 : startAlongEdge;

        for (let ly = 0; ly < pillThick; ly++) {
            for (let lx = 0; lx < pillLen; lx++) {
                const isBorder = lx === 0 || lx === pillLen - 1 || ly === 0 || ly === pillThick - 1;
                let isText = false;

                if (!isBorder) {
                    const tx = lx - metrics.pad;
                    const ty = ly - metrics.pad;
                    if (tx >= 0 && tx < metrics.textW && ty >= 0 && ty < metrics.glyphH) {
                        const charStride = metrics.glyphW + metrics.glyphGap;
                        const charIndex = Math.floor(tx / charStride);
                        const withinCharX = tx % charStride;
                        if (charIndex < label.length && withinCharX < metrics.glyphW) {
                            const glyph = PIXEL_FONT_5X7[label[charIndex]];
                            if (glyph) {
                                const gx = Math.floor(withinCharX / metrics.scale);
                                const gy = Math.floor(ty / metrics.scale);
                                isText = ((glyph[gy] >> (4 - gx)) & 1) === 1;
                            }
                        }
                    }
                }

                const color = isBorder || isText ? 0 : 255;
                // Side edges rotate text 90 degrees CW so it flows vertically top-to-bottom.
                const ox = isHorizontalEdge ? oxOrigin + lx : oxOrigin + (pillThick - 1 - ly);
                const oy = isHorizontalEdge ? oyOrigin + ly : oyOrigin + lx;
                if (ox < 0 || ox >= orientedW || oy < 0 || oy >= orientedH) continue;

                const [cx, cy] = fromOrientedPixel(ox, oy, bx, by, bw, bh, rot);
                setCanvasPixel(imageData, cx, cy, color, color, color);
            }
        }
    }
}

export function renderFrameImageData(
    imageData: ImageData,
    config: Config,
    options: RenderFrameOptions = {}
): ImageData {
    if (config.ditherMode !== 'sixColor') {
        const contrast = parseFloat(config.contrast ?? '1.0');
        if (Number.isFinite(contrast) && contrast !== 1) {
            adjustContrastAlgo(imageData, contrast);
        }
        return ditherImageAlgo(imageData, config);
    }

    const splitMode = normalizeSplitMode(config.splitMode);

    let detectedMode: 'vivid' | 'graphics' | null = null;
    const resolveDetected = (): 'vivid' | 'graphics' => {
        if (!detectedMode) {
            const detection = detectContentMode(imageData, options.imageBoundingBox, {
                hasCameraExif: options.hasCameraExif,
            });
            detectedMode = detection.mode;
            options.onLog?.(
                `Auto render mode selected: ${detection.mode} ` +
                `(flatRatio=${detection.metrics.flatRatio.toFixed(2)}, ` +
                `uniqueColors=${detection.metrics.uniqueColors}, ` +
                `top10Share=${detection.metrics.top10Share.toFixed(2)}, ` +
                `smoothGrad=${detection.metrics.smoothGradientRatio.toFixed(2)})`
            );
        }
        return detectedMode;
    };

    if (splitMode === 'none') {
        const rawMode = normalizeRenderMode(config.renderMode, 'auto');
        const resolved = rawMode === 'auto' ? resolveDetected() : rawMode;
        return renderSpectra6Image(imageData, config, resolved);
    }

    const segments = resolveSplitSegments(config, resolveDetected);
    const labelSummary = segments
        .map((seg, i) => `Side ${String.fromCharCode(65 + i)}=${seg.mode} (${seg.ditherType})`)
        .join(' vs ');
    options.onLog?.(`Split rendering (${splitMode}): ${labelSummary}`);

    const buffers = segments.map((seg) => {
        const copy = cloneImageData(imageData);
        renderSpectra6Image(copy, { ...config, ditherType: seg.ditherType }, seg.mode);
        return copy.data;
    });

    const bounds = options.imageBoundingBox ?? {
        x: 0,
        y: 0,
        width: imageData.width,
        height: imageData.height,
    };
    const bx = Math.max(0, Math.round(bounds.x));
    const by = Math.max(0, Math.round(bounds.y));
    const bxEnd = Math.min(imageData.width, Math.round(bounds.x + bounds.width));
    const byEnd = Math.min(imageData.height, Math.round(bounds.y + bounds.height));
    const bw = Math.max(1, bxEnd - bx);
    const bh = Math.max(1, byEnd - by);
    const rotation = options.rotation ?? (parseInt(config.rotation, 10) || 0);

    const out = imageData.data;
    for (let y = 0; y < imageData.height; y++) {
        const ry = (y + 0.5 - by) / bh;
        for (let x = 0; x < imageData.width; x++) {
            const rx = (x + 0.5 - bx) / bw;
            const [u, v] = toOrientedUv(rx, ry, rotation);
            const segIdx = getSegmentIndex(u, v, segments.length, splitMode);
            const src = buffers[segIdx];
            const idx = (y * imageData.width + x) * 4;
            out[idx] = src[idx];
            out[idx + 1] = src[idx + 1];
            out[idx + 2] = src[idx + 2];
            out[idx + 3] = src[idx + 3];
        }
    }

    drawSplitSegmentLabels(imageData, segments, splitMode, bx, by, bw, bh, rotation);

    return imageData;
}
