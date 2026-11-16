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

export type SplitMode = 'none' | 'left-right' | 'top-bottom';

export interface RenderFrameOptions {
    rotation?: number;
    imageBoundingBox?: BoundingBox;
    hasCameraExif?: boolean;
    onLog?: (message: string) => void;
}

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

function isSideAPixel(
    x: number,
    y: number,
    midX: number,
    midY: number,
    splitMode: 'left-right' | 'top-bottom',
    rotation: number
): boolean {
    const rot = ((rotation % 360) + 360) % 360;
    if (rot === 90) {
        return splitMode === 'left-right' ? y < midY : x >= midX;
    }
    if (rot === 180) {
        return splitMode === 'left-right' ? x >= midX : y >= midY;
    }
    if (rot === 270) {
        return splitMode === 'left-right' ? y >= midY : x < midX;
    }
    return splitMode === 'left-right' ? x < midX : y < midY;
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

    const modeA = normalizeRenderMode(config.renderMode, 'auto');
    const modeB = normalizeRenderMode(config.splitRenderMode, 'photo');
    const splitMode: SplitMode =
        config.splitMode === 'left-right' || config.splitMode === 'top-bottom' ? config.splitMode : 'none';

    let detectedMode: 'vivid' | 'graphics' | null = null;
    const resolveMode = (mode: 'auto' | ResolvedSpectraMode): ResolvedSpectraMode => {
        if (mode !== 'auto') return mode;
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
        const resolved = resolveMode(modeA);
        return renderSpectra6Image(imageData, config, resolved);
    }

    const resolvedA = resolveMode(modeA);
    const resolvedB = resolveMode(modeB);
    const ditherA = config.ditherType || 'floydSteinberg';
    const ditherB = config.splitDitherType || ditherA;

    options.onLog?.(
        `Split rendering (${splitMode}): Side A=${resolvedA} (${ditherA}) vs Side B=${resolvedB} (${ditherB})`
    );

    const bufferA = cloneImageData(imageData);
    const bufferB = cloneImageData(imageData);

    renderSpectra6Image(bufferA, { ...config, ditherType: ditherA }, resolvedA);
    renderSpectra6Image(bufferB, { ...config, ditherType: ditherB }, resolvedB);

    const bounds = options.imageBoundingBox ?? {
        x: 0,
        y: 0,
        width: imageData.width,
        height: imageData.height,
    };
    const midX = bounds.x + bounds.width / 2;
    const midY = bounds.y + bounds.height / 2;
    const rotation = options.rotation ?? (parseInt(config.rotation, 10) || 0);

    const out = imageData.data;
    const dataA = bufferA.data;
    const dataB = bufferB.data;

    for (let y = 0; y < imageData.height; y++) {
        for (let x = 0; x < imageData.width; x++) {
            const idx = (y * imageData.width + x) * 4;
            const src = isSideAPixel(x, y, midX, midY, splitMode, rotation) ? dataA : dataB;
            out[idx] = src[idx];
            out[idx + 1] = src[idx + 1];
            out[idx + 2] = src[idx + 2];
            out[idx + 3] = src[idx + 3];
        }
    }

    return imageData;
}
