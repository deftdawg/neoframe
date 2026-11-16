import { test, expect } from 'bun:test';
import { getConfig } from './config';
import {
    SPECTRA6_PALETTE,
    detectContentMode,
    renderSpectra6Image,
    RgbTuple,
} from './algorithms';
import { renderFrameImageData } from './image-processor';

function makeImageData(width: number, height: number, fill: RgbTuple = [255, 255, 255]): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = fill[0];
        data[i + 1] = fill[1];
        data[i + 2] = fill[2];
        data[i + 3] = 255;
    }
    return { width, height, data, colorSpace: 'srgb' } as ImageData;
}

function setPixel(imageData: ImageData, x: number, y: number, rgb: RgbTuple) {
    const idx = (y * imageData.width + x) * 4;
    imageData.data[idx] = rgb[0];
    imageData.data[idx + 1] = rgb[1];
    imageData.data[idx + 2] = rgb[2];
    imageData.data[idx + 3] = 255;
}

function getPixel(imageData: ImageData, x: number, y: number): RgbTuple {
    const idx = (y * imageData.width + x) * 4;
    return [imageData.data[idx], imageData.data[idx + 1], imageData.data[idx + 2]];
}

function makeWeatherLikeGraphic(width = 64, height = 48): ImageData {
    const img = makeImageData(width, height, [255, 255, 255]);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (y < 12) {
                setPixel(img, x, y, [150, 190, 230]); // pastel blue
            } else if (y < 24) {
                setPixel(img, x, y, [250, 190, 120]); // pastel orange
            } else if (y < 30) {
                setPixel(img, x, y, [0, 0, 0]); // solid black text block
            } else if (y < 32) {
                setPixel(img, x, y, [128, 128, 128]); // anti-aliasing edge
            }
        }
    }
    return img;
}

function makeContinuousPhoto(width = 80, height = 80): ImageData {
    const img = makeImageData(width, height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // Smooth multi-channel gradients + subtle micro-variation like natural sensor tones
            const jitter = ((x * 17 + y * 31) % 9) - 4;
            const r = Math.max(0, Math.min(255, Math.round(40 + (x / width) * 160 + jitter)));
            const g = Math.max(0, Math.min(255, Math.round(60 + (y / height) * 140 - jitter)));
            const b = Math.max(0, Math.min(255, Math.round(90 + ((x + y) / (width + height)) * 120 + jitter)));
            setPixel(img, x, y, [r, g, b]);
        }
    }
    return img;
}

test('detectContentMode classifies UI graphic as graphics and smooth photo as vivid', () => {
    const graphic = makeWeatherLikeGraphic(120, 96);
    const graphicResult = detectContentMode(graphic);
    expect(graphicResult.mode).toBe('graphics');
    expect(graphicResult.metrics.flatRatio).toBeGreaterThan(0.55);

    const photo = makeContinuousPhoto(120, 120);
    const photoResult = detectContentMode(photo);
    expect(photoResult.mode).toBe('vivid');
    expect(photoResult.metrics.smoothGradientRatio).toBeGreaterThan(0.2);
});

test('graphics mode uses only valid Spectra 6 colors, solid text/paper, and boosted pastel blue', () => {
    const img = makeWeatherLikeGraphic(64, 48);
    const cfg = getConfig({ renderMode: 'graphics', contrast: '1.0' });
    renderSpectra6Image(img, cfg, 'graphics');

    const validColors = new Set(SPECTRA6_PALETTE.display.map((c) => c.join(',')));
    let blueCount = 0;
    const blueTotal = 64 * 12;

    for (let y = 0; y < 48; y++) {
        for (let x = 0; x < 64; x++) {
            const px = getPixel(img, x, y);
            expect(validColors.has(px.join(','))).toBe(true);
            if (y < 12 && px[0] === 0 && px[1] === 0 && px[2] === 255) {
                blueCount++;
            }
            if (y >= 24 && y < 30) {
                expect(px).toEqual([0, 0, 0]);
            }
            if (y >= 40) {
                expect(px).toEqual([255, 255, 255]);
            }
        }
    }

    expect(blueCount / blueTotal).toBeGreaterThan(0.25);
});

test('graphics mode renders neutral greys strictly with black and white', () => {
    const img = makeImageData(64, 32);
    for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 64; x++) {
            const v = Math.round((x / 63) * 255);
            setPixel(img, x, y, [v, v, v]);
        }
    }

    renderSpectra6Image(img, getConfig({ renderMode: 'graphics', contrast: '1.0' }), 'graphics');
    for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 64; x++) {
            const px = getPixel(img, x, y);
            const isBlackOrWhite =
                (px[0] === 0 && px[1] === 0 && px[2] === 0) ||
                (px[0] === 255 && px[1] === 255 && px[2] === 255);
            expect(isBlackOrWhite).toBe(true);
        }
    }
});

test('graphics mode sharpens anti-aliased neutral thin strokes', () => {
    const img = makeImageData(40, 20, [255, 255, 255]);
    for (let x = 4; x < 36; x++) {
        setPixel(img, x, 8, [120, 120, 120]);  // dark stroke -> black
        setPixel(img, x, 12, [205, 205, 205]); // faint fringe -> white
    }

    renderSpectra6Image(img, getConfig({ renderMode: 'graphics', contrast: '1.0' }), 'graphics');
    for (let x = 4; x < 36; x++) {
        expect(getPixel(img, x, 8)).toEqual([0, 0, 0]);
        expect(getPixel(img, x, 12)).toEqual([255, 255, 255]);
    }
});

test('vivid mode uses more green ink than softer photo mode on muted green', () => {
    const mutedGreen: RgbTuple = [120, 140, 100];
    const vividImg = makeImageData(40, 40, mutedGreen);
    const photoImg = makeImageData(40, 40, mutedGreen);

    renderSpectra6Image(vividImg, getConfig({ renderMode: 'vivid', contrast: '1.0' }), 'vivid');
    renderSpectra6Image(photoImg, getConfig({ renderMode: 'photo', contrast: '1.0' }), 'photo');

    const countGreen = (img: ImageData) => {
        let count = 0;
        for (let y = 0; y < img.height; y++) {
            for (let x = 0; x < img.width; x++) {
                const px = getPixel(img, x, y);
                if (px[0] === 41 && px[1] === 204 && px[2] === 20) count++;
            }
        }
        return count;
    };

    expect(countGreen(vividImg)).toBeGreaterThan(countGreen(photoImg));
});

test('renderFrameImageData auto mode selects vivid for photos and graphics for UI', () => {
    const logs: string[] = [];
    const graphic = makeWeatherLikeGraphic(64, 48);
    renderFrameImageData(graphic, getConfig({ renderMode: 'auto', contrast: '1.0' }), {
        onLog: (msg) => logs.push(msg),
    });
    expect(logs.some((l) => l.includes('Auto render mode selected: graphics'))).toBe(true);

    logs.length = 0;
    const photo = makeContinuousPhoto(64, 64);
    renderFrameImageData(photo, getConfig({ renderMode: 'auto', contrast: '1.0' }), {
        onLog: (msg) => logs.push(msg),
    });
    expect(logs.some((l) => l.includes('Auto render mode selected: vivid'))).toBe(true);
});

test('renderFrameImageData performs seamless orientation-aware A/B split within bounding box', () => {
    // Use muted green where vivid vs photo produce distinctly different green dot densities,
    // or pastel blue where graphics vs legacy differ sharply across the entire block.
    const makePastelBlueBlock = (w: number, h: number) => makeImageData(w, h, [150, 190, 230]);

    const bounds = { x: 10, y: 10, width: 40, height: 40 }; // midX = 30, midY = 30
    const cfg = getConfig({
        renderMode: 'graphics',
        splitRenderMode: 'legacy',
        splitMode: 'left-right',
        contrast: '1.0',
        ditherType: 'none',
    });

    // Reference outputs for full canvas
    const refA = makePastelBlueBlock(60, 60);
    renderSpectra6Image(refA, cfg, 'graphics');
    const refB = makePastelBlueBlock(60, 60);
    renderSpectra6Image(refB, cfg, 'legacy');

    // Rotation 0, left-right: x < 30 is Side A (graphics), x >= 30 is Side B (legacy)
    const split0 = makePastelBlueBlock(60, 60);
    renderFrameImageData(split0, cfg, { rotation: 0, imageBoundingBox: bounds });
    expect(getPixel(split0, 29, 25)).toEqual(getPixel(refA, 29, 25));
    expect(getPixel(split0, 30, 25)).toEqual(getPixel(refB, 30, 25));

    // Rotation 90, left-right: y < 30 is Side A, y >= 30 is Side B
    const split90LR = makePastelBlueBlock(60, 60);
    renderFrameImageData(split90LR, cfg, { rotation: 90, imageBoundingBox: bounds });
    expect(getPixel(split90LR, 25, 29)).toEqual(getPixel(refA, 25, 29));
    expect(getPixel(split90LR, 25, 30)).toEqual(getPixel(refB, 25, 30));

    // Rotation 90, top-bottom: x >= 30 is Side A, x < 30 is Side B
    const cfgTB = { ...cfg, splitMode: 'top-bottom' };
    const split90TB = makePastelBlueBlock(60, 60);
    renderFrameImageData(split90TB, cfgTB, { rotation: 90, imageBoundingBox: bounds });
    expect(getPixel(split90TB, 30, 25)).toEqual(getPixel(refA, 30, 25));
    expect(getPixel(split90TB, 29, 25)).toEqual(getPixel(refB, 29, 25));

    // Rotation 180, top-bottom: y >= 30 is Side A, y < 30 is Side B
    const split180TB = makePastelBlueBlock(60, 60);
    renderFrameImageData(split180TB, cfgTB, { rotation: 180, imageBoundingBox: bounds });
    expect(getPixel(split180TB, 25, 30)).toEqual(getPixel(refA, 25, 30));
    expect(getPixel(split180TB, 25, 29)).toEqual(getPixel(refB, 25, 29));

    // Rotation 270, left-right: y >= 30 is Side A, y < 30 is Side B
    const split270LR = makePastelBlueBlock(60, 60);
    renderFrameImageData(split270LR, cfg, { rotation: 270, imageBoundingBox: bounds });
    expect(getPixel(split270LR, 25, 30)).toEqual(getPixel(refA, 25, 30));
    expect(getPixel(split270LR, 25, 29)).toEqual(getPixel(refB, 25, 29));
});
