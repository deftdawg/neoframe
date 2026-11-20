import { test, expect } from 'bun:test';
import { getConfig } from './config';
import {
    SPECTRA6_PALETTE,
    detectContentMode,
    renderSpectra6Image,
    RgbTuple,
} from './algorithms';
import {
    renderFrameImageData,
    getSegmentIndex,
} from './image-processor';

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

test('auto split uses 2-way graphics vs legacy on UI graphics and 3-way vivid vs photo vs legacy on photos', () => {
    const graphicLogs: string[] = [];
    const graphic = makeWeatherLikeGraphic(240, 180);
    renderFrameImageData(
        graphic,
        getConfig({ renderMode: 'auto', splitMode: 'left-right', splitRenderMode: 'auto', contrast: '1.0' }),
        { onLog: (msg) => graphicLogs.push(msg) }
    );
    expect(graphicLogs.some((l) => l.includes('Split rendering (left-right): Side A=graphics') && l.includes('Side B=legacy') && !l.includes('Side C='))).toBe(true);

    const photoLogs: string[] = [];
    const photo = makeContinuousPhoto(240, 240);
    renderFrameImageData(
        photo,
        getConfig({ renderMode: 'auto', splitMode: 'left-right', splitRenderMode: 'auto', contrast: '1.0' }),
        { onLog: (msg) => photoLogs.push(msg) }
    );
    expect(photoLogs.some((l) =>
        l.includes('Split rendering (left-right): Side A=vivid') &&
        l.includes('Side B=photo') &&
        l.includes('Side C=legacy')
    )).toBe(true);

    // Confirm 3-way horizontal partition matches vivid / photo / legacy references in interior of each third.
    const refPhoto = makeContinuousPhoto(240, 240);
    const vividRef = makeContinuousPhoto(240, 240);
    const photoRef = makeContinuousPhoto(240, 240);
    const legacyRef = makeContinuousPhoto(240, 240);
    const cfg = getConfig({ renderMode: 'vivid', splitMode: 'left-right', splitRenderMode: 'photo', splitRenderModeC: 'legacy', contrast: '1.0', ditherType: 'none' });
    renderSpectra6Image(vividRef, cfg, 'vivid');
    renderSpectra6Image(photoRef, cfg, 'photo');
    renderSpectra6Image(legacyRef, cfg, 'legacy');
    renderFrameImageData(refPhoto, cfg);

    expect(getPixel(refPhoto, 40, 120)).toEqual(getPixel(vividRef, 40, 120));
    expect(getPixel(refPhoto, 120, 120)).toEqual(getPixel(photoRef, 120, 120));
    expect(getPixel(refPhoto, 200, 120)).toEqual(getPixel(legacyRef, 200, 120));
});

test('diagonal and diagonal-bl-tr split modes partition 2-way and 3-way segments across rotations', () => {
    expect(getSegmentIndex(0.1, 0.1, 2, 'diagonal')).toBe(0);
    expect(getSegmentIndex(0.9, 0.9, 2, 'diagonal')).toBe(1);
    expect(getSegmentIndex(0.1, 0.9, 2, 'diagonal-bl-tr')).toBe(0);
    expect(getSegmentIndex(0.9, 0.1, 2, 'diagonal-bl-tr')).toBe(1);

    expect(getSegmentIndex(0.1, 0.1, 3, 'diagonal')).toBe(0);
    expect(getSegmentIndex(0.5, 0.5, 3, 'diagonal')).toBe(1);
    expect(getSegmentIndex(0.9, 0.9, 3, 'diagonal')).toBe(2);

    // Rotation 90 diagonal-tl-br on 300x300 canvas: (u,v) = (ry, 1-rx)
    const img = makeContinuousPhoto(300, 300);
    const vividRef = makeContinuousPhoto(300, 300);
    const photoRef = makeContinuousPhoto(300, 300);
    const legacyRef = makeContinuousPhoto(300, 300);
    const cfg = getConfig({
        renderMode: 'vivid',
        splitMode: 'diagonal',
        splitRenderMode: 'photo',
        splitRenderModeC: 'legacy',
        contrast: '1.0',
        ditherType: 'none',
    });
    renderSpectra6Image(vividRef, cfg, 'vivid');
    renderSpectra6Image(photoRef, cfg, 'photo');
    renderSpectra6Image(legacyRef, cfg, 'legacy');
    renderFrameImageData(img, cfg, { rotation: 90 });

    // For rotation=90: u = (y+0.5)/300, v = 1 - (x+0.5)/300
    // (270, 30) -> u=0.1, v=0.1 => segment 0 (vivid)
    // (150, 150) -> u=0.5, v=0.5 => segment 1 (photo)
    // (30, 270) -> u=0.9, v=0.9 => segment 2 (legacy)
    expect(getPixel(img, 270, 30)).toEqual(getPixel(vividRef, 270, 30));
    expect(getPixel(img, 150, 150)).toEqual(getPixel(photoRef, 150, 150));
    expect(getPixel(img, 30, 270)).toEqual(getPixel(legacyRef, 30, 270));
});

test('split rendering draws black-and-white method labels along each segment longest edge', () => {
    // 300x400 portrait canvas, left-right 2-way split -> longest edges are left (400px) and right (400px)
    const img = makeImageData(300, 400, [150, 190, 230]);
    const cfg = getConfig({
        renderMode: 'graphics',
        splitMode: 'left-right',
        splitRenderMode: 'legacy',
        contrast: '1.0',
        ditherType: 'none',
    });
    renderFrameImageData(img, cfg, { rotation: 0 });

    // Pill along left edge centered vertically (y around 200), x in [0..19], must contain pure black & white border/text pixels
    let leftHasBlack = false;
    let leftHasWhite = false;
    for (let y = 140; y < 260; y++) {
        for (let x = 0; x < 20; x++) {
            const px = getPixel(img, x, y);
            expect(
                (px[0] === 0 && px[1] === 0 && px[2] === 0) ||
                (px[0] === 255 && px[1] === 255 && px[2] === 255) ||
                (px[0] === 0 && px[1] === 0 && px[2] === 255)
            ).toBe(true);
            if (px[0] === 0 && px[1] === 0 && px[2] === 0) leftHasBlack = true;
            if (px[0] === 255 && px[1] === 255 && px[2] === 255) leftHasWhite = true;
        }
    }
    expect(leftHasBlack).toBe(true);
    expect(leftHasWhite).toBe(true);

    // Top edge at (x=0, y=0) on left-right split stays untouched by label pill (pill centered at y=200)
    expect(getPixel(img, 0, 0)).toEqual([0, 0, 255]);

    // Pill border at right edge centered vertically (x=299, y=200) should be pure black border or white interior
    const rightEdgePx = getPixel(img, 299, 200);
    expect(
        (rightEdgePx[0] === 0 && rightEdgePx[1] === 0 && rightEdgePx[2] === 0) ||
        (rightEdgePx[0] === 255 && rightEdgePx[1] === 255 && rightEdgePx[2] === 255)
    ).toBe(true);

    // Wide 400x300 canvas with top-bottom split -> longest edges are top and bottom
    const wide = makeImageData(400, 300, [150, 190, 230]);
    renderFrameImageData(wide, { ...cfg, splitMode: 'top-bottom' }, { rotation: 0 });
    expect(getPixel(wide, 200, 0)).toEqual([0, 0, 0]); // top border of centered pill on top edge
    expect(getPixel(wide, 200, 299)).toEqual([0, 0, 0]); // bottom border of centered pill on bottom edge
});

function makeWordClockGraphic(bg: RgbTuple, alpha = 50, width = 120, height = 120): ImageData {
    const img = makeImageData(width, height, bg);
    const dim: RgbTuple = [
        Math.round(bg[0] * ((255 - alpha) / 255) + 255 * (alpha / 255)),
        Math.round(bg[1] * ((255 - alpha) / 255) + 255 * (alpha / 255)),
        Math.round(bg[2] * ((255 - alpha) / 255) + 255 * (alpha / 255)),
    ];
    for (let gy = 0; gy < 8; gy++) {
        for (let gx = 0; gx < 8; gx++) {
            const isActive = gy === 0 && gx < 2;
            const color: RgbTuple = isActive ? [255, 255, 255] : dim;
            const x0 = 6 + gx * 14;
            const y0 = 6 + gy * 14;
            for (let dy = 0; dy < 8; dy++) {
                for (let dx = 0; dx < 6; dx++) {
                    setPixel(img, x0 + dx, y0 + dy, color);
                }
            }
        }
    }
    return img;
}

test('graphics mode preserves dim neutral text on dark backgrounds instead of crushing it to black', () => {
    const img = makeImageData(64, 32, [0, 0, 0]);
    // Dim text block (50,50,50) simulating Word Clock inactive letters (alpha 50/255)
    for (let y = 8; y < 24; y++) {
        for (let x = 8; x < 56; x++) {
            setPixel(img, x, y, [50, 50, 50]);
        }
    }

    renderSpectra6Image(img, getConfig({ renderMode: 'graphics', contrast: '1.2' }), 'graphics');

    // Pure black background stays solid black
    for (let x = 0; x < 64; x++) {
        expect(getPixel(img, x, 0)).toEqual([0, 0, 0]);
    }

    // Dim text block must retain visible white dither dots (not erased to 0%)
    let whiteCount = 0;
    const totalDim = 16 * 48;
    for (let y = 8; y < 24; y++) {
        for (let x = 8; x < 56; x++) {
            const px = getPixel(img, x, y);
            if (px[0] === 255 && px[1] === 255 && px[2] === 255) whiteCount++;
        }
    }
    expect(whiteCount / totalDim).toBeGreaterThan(0.10);
});

test('graphics mode keeps faint letters legible on a coloured background (word clocks)', () => {
    const navy: RgbTuple = [40, 60, 120];
    const dim: RgbTuple = [81, 98, 146];
    const img = makeImageData(80, 40, navy);

    for (let y = 14; y < 26; y++) {
        for (let x = 20; x < 60; x++) {
            if (Math.floor(x / 5) % 2 === 0) {
                setPixel(img, x, y, dim);
            }
        }
    }

    renderSpectra6Image(img, getConfig({ renderMode: 'graphics', contrast: '1.0' }), 'graphics');

    const perceivedLuma = (px: RgbTuple): number => {
        const idx = SPECTRA6_PALETTE.display.findIndex(
            (c) => c[0] === px[0] && c[1] === px[1] && c[2] === px[2]
        );
        const m = SPECTRA6_PALETTE.measured[idx >= 0 ? idx : 0];
        const w = SPECTRA6_PALETTE.measured[1];
        const r = (m[0] / w[0]) * 255;
        const g = (m[1] / w[1]) * 255;
        const b = (m[2] / w[2]) * 255;
        return 0.299 * r + 0.587 * g + 0.114 * b;
    };

    let letterSum = 0;
    let letterCount = 0;
    let bgSum = 0;
    let bgCount = 0;
    for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 80; x++) {
            const l = perceivedLuma(getPixel(img, x, y));
            if (y < 8) {
                bgSum += l;
                bgCount++;
            } else if (y >= 14 && y < 26 && x >= 20 && x < 60 && Math.floor(x / 5) % 2 === 0) {
                letterSum += l;
                letterCount++;
            }
        }
    }

    expect(letterSum / letterCount - bgSum / bgCount).toBeGreaterThan(25);
});

test('detectContentMode classifies dark Word Clock graphics as graphics', () => {
    const blackWordClock = makeWordClockGraphic([0, 0, 0], 50);
    expect(detectContentMode(blackWordClock).mode).toBe('graphics');

    const navyWordClock = makeWordClockGraphic([40, 55, 90], 50);
    expect(detectContentMode(navyWordClock).mode).toBe('graphics');
});
