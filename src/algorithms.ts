export function adjustContrast(imageData: ImageData, factor: number) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, Math.max(0, (data[i] - 128) * factor + 128));
        data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * factor + 128));
        data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * factor + 128));
    }
    return imageData;
}

const rgbPalette = [
    { name: "Yellow", r: 255, g: 255, b: 0, value: 0xe2 },
    { name: "Green", r: 41, g: 204, b: 20, value: 0x96 },
    { name: "Blue", r: 0, g: 0, b: 255, value: 0x1d },
    { name: "Red", r: 255, g: 0, b: 0, value: 0x4c },
    { name: "Black", r: 0, g: 0, b: 0, value: 0x00 },
    { name: "White", r: 255, g: 255, b: 255, value: 0xff }
];

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

function labDistance(lab1: { l: number, a: number, b: number }, lab2: { l: number, a: number, b: number }) {
    const dl = lab1.l - lab2.l;
    const da = lab1.a - lab2.a;
    const db = lab1.b - lab2.b;
    return Math.sqrt(0.2 * dl * dl + 3 * da * da + 3 * db * db);
}

function findClosestColor(r: number, g: number, b: number) {
    if (r < 50 && g < 150 && b > 100) {
        return rgbPalette[2];
    }

    const inputLab = rgbToLab(r, g, b);
    let minDistance = Infinity;
    let closestColor = rgbPalette[0];

    for (const color of rgbPalette) {
        const colorLab = rgbToLab(color.r, color.g, color.b);
        const distance = labDistance(inputLab, colorLab);
        if (distance < minDistance) {
            minDistance = distance;
            closestColor = color;
        }
    }

    return closestColor;
}

function floydSteinbergDither(imageData: ImageData, strength: number) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const tempData = new Uint8ClampedArray(data);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const r = tempData[idx];
            const g = tempData[idx + 1];
            const b = tempData[idx + 2];

            const closest = findClosestColor(r, g, b);

            const errR = (r - closest.r) * strength;
            const errG = (g - closest.g) * strength;
            const errB = (b - closest.b) * strength;

            if (x + 1 < width) {
                const idxRight = idx + 4;
                tempData[idxRight] = Math.min(255, Math.max(0, tempData[idxRight] + errR * 7 / 16));
                tempData[idxRight + 1] = Math.min(255, Math.max(0, tempData[idxRight + 1] + errG * 7 / 16));
                tempData[idxRight + 2] = Math.min(255, Math.max(0, tempData[idxRight + 2] + errB * 7 / 16));
            }
            if (y + 1 < height) {
                if (x > 0) {
                    const idxDownLeft = idx + width * 4 - 4;
                    tempData[idxDownLeft] = Math.min(255, Math.max(0, tempData[idxDownLeft] + errR * 3 / 16));
                    tempData[idxDownLeft + 1] = Math.min(255, Math.max(0, tempData[idxDownLeft + 1] + errG * 3 / 16));
                    tempData[idxDownLeft + 2] = Math.min(255, Math.max(0, tempData[idxDownLeft + 2] + errB * 3 / 16));
                }
                const idxDown = idx + width * 4;
                tempData[idxDown] = Math.min(255, Math.max(0, tempData[idxDown] + errR * 5 / 16));
                tempData[idxDown + 1] = Math.min(255, Math.max(0, tempData[idxDown + 1] + errG * 5 / 16));
                tempData[idxDown + 2] = Math.min(255, Math.max(0, tempData[idxDown + 2] + errB * 5 / 16));
                if (x + 1 < width) {
                    const idxDownRight = idx + width * 4 + 4;
                    tempData[idxDownRight] = Math.min(255, Math.max(0, tempData[idxDownRight] + errR * 1 / 16));
                    tempData[idxDownRight + 1] = Math.min(255, Math.max(0, tempData[idxDownRight + 1] + errG * 1 / 16));
                    tempData[idxDownRight + 2] = Math.min(255, Math.max(0, tempData[idxDownRight + 2] + errB * 1 / 16));
                }
            }
        }
    }

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const r = tempData[idx];
            const g = tempData[idx + 1];
            const b = tempData[idx + 2];

            const closest = findClosestColor(r, g, b);
            data[idx] = closest.r;
            data[idx + 1] = closest.g;
            data[idx + 2] = closest.b;
        }
    }

    return imageData;
}

function atkinsonDither(imageData: ImageData, strength: number) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const tempData = new Uint8ClampedArray(data);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const r = tempData[idx];
            const g = tempData[idx + 1];
            const b = tempData[idx + 2];

            const closest = findClosestColor(r, g, b);
            data[idx] = closest.r;
            data[idx + 1] = closest.g;
            data[idx + 2] = closest.b;

            const errR = (r - closest.r) * strength;
            const errG = (g - closest.g) * strength;
            const errB = (b - closest.b) * strength;

            const fraction = 1 / 8;

            if (x + 1 < width) {
                const idxRight = idx + 4;
                tempData[idxRight] = Math.min(255, Math.max(0, tempData[idxRight] + errR * fraction));
                tempData[idxRight + 1] = Math.min(255, Math.max(0, tempData[idxRight + 1] + errG * fraction));
                tempData[idxRight + 2] = Math.min(255, Math.max(0, tempData[idxRight + 2] + errB * fraction));
            }
            if (x + 2 < width) {
                const idxRight2 = idx + 8;
                tempData[idxRight2] = Math.min(255, Math.max(0, tempData[idxRight2] + errR * fraction));
                tempData[idxRight2 + 1] = Math.min(255, Math.max(0, tempData[idxRight2 + 1] + errG * fraction));
                tempData[idxRight2 + 2] = Math.min(255, Math.max(0, tempData[idxRight2 + 2] + errB * fraction));
            }
            if (y + 1 < height) {
                if (x > 0) {
                    const idxDownLeft = idx + width * 4 - 4;
                    tempData[idxDownLeft] = Math.min(255, Math.max(0, tempData[idxDownLeft] + errR * fraction));
                    tempData[idxDownLeft + 1] = Math.min(255, Math.max(0, tempData[idxDownLeft + 1] + errG * fraction));
                    tempData[idxDownLeft + 2] = Math.min(255, Math.max(0, tempData[idxDownLeft + 2] + errB * fraction));
                }
                const idxDown = idx + width * 4;
                tempData[idxDown] = Math.min(255, Math.max(0, tempData[idxDown] + errR * fraction));
                tempData[idxDown + 1] = Math.min(255, Math.max(0, tempData[idxDown + 1] + errG * fraction));
                tempData[idxDown + 2] = Math.min(255, Math.max(0, tempData[idxDown + 2] + errB * fraction));
                if (x + 1 < width) {
                    const idxDownRight = idx + width * 4 + 4;
                    tempData[idxDownRight] = Math.min(255, Math.max(0, tempData[idxDownRight] + errR * fraction));
                    tempData[idxDownRight + 1] = Math.min(255, Math.max(0, tempData[idxDownRight + 1] + errG * fraction));
                    tempData[idxDownRight + 2] = Math.min(255, Math.max(0, tempData[idxDownRight + 2] + errB * fraction));
                }
            }
            if (y + 2 < height) {
                const idxDown2 = idx + width * 8;
                tempData[idxDown2] = Math.min(255, Math.max(0, tempData[idxDown2] + errR * fraction));
                tempData[idxDown2 + 1] = Math.min(255, Math.max(0, tempData[idxDown2 + 1] + errG * fraction));
                tempData[idxDown2 + 2] = Math.min(255, Math.max(0, tempData[idxDown2 + 2] + errB * fraction));
            }
        }
    }

    return imageData;
}

function stuckiDither(imageData: ImageData, strength: number) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const tempData = new Uint8ClampedArray(data);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const r = tempData[idx];
            const g = tempData[idx + 1];
            const b = tempData[idx + 2];

            const closest = findClosestColor(r, g, b);

            const errR = (r - closest.r) * strength;
            const errG = (g - closest.g) * strength;
            const errB = (b - closest.b) * strength;

            const divisor = 42;

            if (x + 1 < width) {
                const idxRight = idx + 4;
                tempData[idxRight] = Math.min(255, Math.max(0, tempData[idxRight] + errR * 8 / divisor));
                tempData[idxRight + 1] = Math.min(255, Math.max(0, tempData[idxRight + 1] + errG * 8 / divisor));
                tempData[idxRight + 2] = Math.min(255, Math.max(0, tempData[idxRight + 2] + errB * 8 / divisor));
            }
            if (x + 2 < width) {
                const idxRight2 = idx + 8;
                tempData[idxRight2] = Math.min(255, Math.max(0, tempData[idxRight2] + errR * 4 / divisor));
                tempData[idxRight2 + 1] = Math.min(255, Math.max(0, tempData[idxRight2 + 1] + errG * 4 / divisor));
                tempData[idxRight2 + 2] = Math.min(255, Math.max(0, tempData[idxRight2 + 2] + errB * 4 / divisor));
            }
            if (y + 1 < height) {
                if (x > 1) {
                    const idxDownLeft2 = idx + width * 4 - 8;
                    tempData[idxDownLeft2] = Math.min(255, Math.max(0, tempData[idxDownLeft2] + errR * 2 / divisor));
                    tempData[idxDownLeft2 + 1] = Math.min(255, Math.max(0, tempData[idxDownLeft2 + 1] + errG * 2 / divisor));
                    tempData[idxDownLeft2 + 2] = Math.min(255, Math.max(0, tempData[idxDownLeft2 + 2] + errB * 2 / divisor));
                }
                if (x > 0) {
                    const idxDownLeft = idx + width * 4 - 4;
                    tempData[idxDownLeft] = Math.min(255, Math.max(0, tempData[idxDownLeft] + errR * 4 / divisor));
                    tempData[idxDownLeft + 1] = Math.min(255, Math.max(0, tempData[idxDownLeft + 1] + errG * 4 / divisor));
                    tempData[idxDownLeft + 2] = Math.min(255, Math.max(0, tempData[idxDownLeft + 2] + errB * 4 / divisor));
                }
                const idxDown = idx + width * 4;
                tempData[idxDown] = Math.min(255, Math.max(0, tempData[idxDown] + errR * 8 / divisor));
                tempData[idxDown + 1] = Math.min(255, Math.max(0, tempData[idxDown + 1] + errG * 8 / divisor));
                tempData[idxDown + 2] = Math.min(255, Math.max(0, tempData[idxDown + 2] + errB * 8 / divisor));
                if (x + 1 < width) {
                    const idxDownRight = idx + width * 4 + 4;
                    tempData[idxDownRight] = Math.min(255, Math.max(0, tempData[idxDownRight] + errR * 4 / divisor));
                    tempData[idxDownRight + 1] = Math.min(255, Math.max(0, tempData[idxDownRight + 1] + errG * 4 / divisor));
                    tempData[idxDownRight + 2] = Math.min(255, Math.max(0, tempData[idxDownRight + 2] + errB * 4 / divisor));
                }
                if (x + 2 < width) {
                    const idxDownRight2 = idx + width * 4 + 8;
                    tempData[idxDownRight2] = Math.min(255, Math.max(0, tempData[idxDownRight2] + errR * 2 / divisor));
                    tempData[idxDownRight2 + 1] = Math.min(255, Math.max(0, tempData[idxDownRight2 + 1] + errG * 2 / divisor));
                    tempData[idxDownRight2 + 2] = Math.min(255, Math.max(0, tempData[idxDownRight2 + 2] + errB * 2 / divisor));
                }
            }
            if (y + 2 < height) {
                if (x > 1) {
                    const idxDown2Left2 = idx + width * 8 - 8;
                    tempData[idxDown2Left2] = Math.min(255, Math.max(0, tempData[idxDown2Left2] + errR * 1 / divisor));
                    tempData[idxDown2Left2 + 1] = Math.min(255, Math.max(0, tempData[idxDown2Left2 + 1] + errG * 1 / divisor));
                    tempData[idxDown2Left2 + 2] = Math.min(255, Math.max(0, tempData[idxDown2Left2 + 2] + errB * 1 / divisor));
                }
                if (x > 0) {
                    const idxDown2Left = idx + width * 8 - 4;
                    tempData[idxDown2Left] = Math.min(255, Math.max(0, tempData[idxDown2Left] + errR * 2 / divisor));
                    tempData[idxDown2Left + 1] = Math.min(255, Math.max(0, tempData[idxDown2Left + 1] + errG * 2 / divisor));
                    tempData[idxDown2Left + 2] = Math.min(255, Math.max(0, tempData[idxDown2Left + 2] + errB * 2 / divisor));
                }
                const idxDown2 = idx + width * 8;
                tempData[idxDown2] = Math.min(255, Math.max(0, tempData[idxDown2] + errR * 4 / divisor));
                tempData[idxDown2 + 1] = Math.min(255, Math.max(0, tempData[idxDown2 + 1] + errG * 4 / divisor));
                tempData[idxDown2 + 2] = Math.min(255, Math.max(0, tempData[idxDown2 + 2] + errB * 4 / divisor));
                if (x + 1 < width) {
                    const idxDown2Right = idx + width * 8 + 4;
                    tempData[idxDown2Right] = Math.min(255, Math.max(0, tempData[idxDown2Right] + errR * 2 / divisor));
                    tempData[idxDown2Right + 1] = Math.min(255, Math.max(0, tempData[idxDown2Right + 1] + errG * 2 / divisor));
                    tempData[idxDown2Right + 2] = Math.min(255, Math.max(0, tempData[idxDown2Right + 2] + errB * 2 / divisor));
                }
                if (x + 2 < width) {
                    const idxDown2Right2 = idx + width * 8 + 8;
                    tempData[idxDown2Right2] = Math.min(255, Math.max(0, tempData[idxDown2Right2] + errR * 1 / divisor));
                    tempData[idxDown2Right2 + 1] = Math.min(255, Math.max(0, tempData[idxDown2Right2 + 1] + errG * 1 / divisor));
                    tempData[idxDown2Right2 + 2] = Math.min(255, Math.max(0, tempData[idxDown2Right2 + 2] + errB * 1 / divisor));
                }
            }
        }
    }

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const r = tempData[idx];
            const g = tempData[idx + 1];
            const b = tempData[idx + 2];

            const closest = findClosestColor(r, g, b);
            data[idx] = closest.r;
            data[idx + 1] = closest.g;
            data[idx + 2] = closest.b;
        }
    }

    return imageData;
}

function jarvisDither(imageData: ImageData, strength: number) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const tempData = new Uint8ClampedArray(data);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const r = tempData[idx];
            const g = tempData[idx + 1];
            const b = tempData[idx + 2];

            const closest = findClosestColor(r, g, b);

            const errR = (r - closest.r) * strength;
            const errG = (g - closest.g) * strength;
            const errB = (b - closest.b) * strength;

            const divisor = 48;

            if (x + 1 < width) {
                const idxRight = idx + 4;
                tempData[idxRight] = Math.min(255, Math.max(0, tempData[idxRight] + errR * 7 / divisor));
                tempData[idxRight + 1] = Math.min(255, Math.max(0, tempData[idxRight + 1] + errG * 7 / divisor));
                tempData[idxRight + 2] = Math.min(255, Math.max(0, tempData[idxRight + 2] + errB * 7 / divisor));
            }
            if (x + 2 < width) {
                const idxRight2 = idx + 8;
                tempData[idxRight2] = Math.min(255, Math.max(0, tempData[idxRight2] + errR * 5 / divisor));
                tempData[idxRight2 + 1] = Math.min(255, Math.max(0, tempData[idxRight2 + 1] + errG * 5 / divisor));
                tempData[idxRight2 + 2] = Math.min(255, Math.max(0, tempData[idxRight2 + 2] + errB * 5 / divisor));
            }
            if (y + 1 < height) {
                if (x > 1) {
                    const idxDownLeft2 = idx + width * 4 - 8;
                    tempData[idxDownLeft2] = Math.min(255, Math.max(0, tempData[idxDownLeft2] + errR * 3 / divisor));
                    tempData[idxDownLeft2 + 1] = Math.min(255, Math.max(0, tempData[idxDownLeft2 + 1] + errG * 3 / divisor));
                    tempData[idxDownLeft2 + 2] = Math.min(255, Math.max(0, tempData[idxDownLeft2 + 2] + errB * 3 / divisor));
                }
                if (x > 0) {
                    const idxDownLeft = idx + width * 4 - 4;
                    tempData[idxDownLeft] = Math.min(255, Math.max(0, tempData[idxDownLeft] + errR * 5 / divisor));
                    tempData[idxDownLeft + 1] = Math.min(255, Math.max(0, tempData[idxDownLeft + 1] + errG * 5 / divisor));
                    tempData[idxDownLeft + 2] = Math.min(255, Math.max(0, tempData[idxDownLeft + 2] + errB * 5 / divisor));
                }
                const idxDown = idx + width * 4;
                tempData[idxDown] = Math.min(255, Math.max(0, tempData[idxDown] + errR * 7 / divisor));
                tempData[idxDown + 1] = Math.min(255, Math.max(0, tempData[idxDown + 1] + errG * 7 / divisor));
                tempData[idxDown + 2] = Math.min(255, Math.max(0, tempData[idxDown + 2] + errB * 7 / divisor));
                if (x + 1 < width) {
                    const idxDownRight = idx + width * 4 + 4;
                    tempData[idxDownRight] = Math.min(255, Math.max(0, tempData[idxDownRight] + errR * 5 / divisor));
                    tempData[idxDownRight + 1] = Math.min(255, Math.max(0, tempData[idxDownRight + 1] + errG * 5 / divisor));
                    tempData[idxDownRight + 2] = Math.min(255, Math.max(0, tempData[idxDownRight + 2] + errB * 5 / divisor));
                }
                if (x + 2 < width) {
                    const idxDownRight2 = idx + width * 4 + 8;
                    tempData[idxDownRight2] = Math.min(255, Math.max(0, tempData[idxDownRight2] + errR * 3 / divisor));
                    tempData[idxDownRight2 + 1] = Math.min(255, Math.max(0, tempData[idxDownRight2 + 1] + errG * 3 / divisor));
                    tempData[idxDownRight2 + 2] = Math.min(255, Math.max(0, tempData[idxDownRight2 + 2] + errB * 3 / divisor));
                }
            }
            if (y + 2 < height) {
                if (x > 1) {
                    const idxDown2Left2 = idx + width * 8 - 8;
                    tempData[idxDown2Left2] = Math.min(255, Math.max(0, tempData[idxDown2Left2] + errR * 1 / divisor));
                    tempData[idxDown2Left2 + 1] = Math.min(255, Math.max(0, tempData[idxDown2Left2 + 1] + errG * 1 / divisor));
                    tempData[idxDown2Left2 + 2] = Math.min(255, Math.max(0, tempData[idxDown2Left2 + 2] + errB * 1 / divisor));
                }
                if (x > 0) {
                    const idxDown2Left = idx + width * 8 - 4;
                    tempData[idxDown2Left] = Math.min(255, Math.max(0, tempData[idxDown2Left] + errR * 3 / divisor));
                    tempData[idxDown2Left + 1] = Math.min(255, Math.max(0, tempData[idxDown2Left + 1] + errG * 3 / divisor));
                    tempData[idxDown2Left + 2] = Math.min(255, Math.max(0, tempData[idxDown2Left + 2] + errB * 3 / divisor));
                }
                const idxDown2 = idx + width * 8;
                tempData[idxDown2] = Math.min(255, Math.max(0, tempData[idxDown2] + errR * 5 / divisor));
                tempData[idxDown2 + 1] = Math.min(255, Math.max(0, tempData[idxDown2 + 1] + errG * 5 / divisor));
                tempData[idxDown2 + 2] = Math.min(255, Math.max(0, tempData[idxDown2 + 2] + errB * 5 / divisor));
                if (x + 1 < width) {
                    const idxDown2Right = idx + width * 8 + 4;
                    tempData[idxDown2Right] = Math.min(255, Math.max(0, tempData[idxDown2Right] + errR * 3 / divisor));
                    tempData[idxDown2Right + 1] = Math.min(255, Math.max(0, tempData[idxDown2Right + 1] + errG * 3 / divisor));
                    tempData[idxDown2Right + 2] = Math.min(255, Math.max(0, tempData[idxDown2Right + 2] + errB * 3 / divisor));
                }
                if (x + 2 < width) {
                    const idxDown2Right2 = idx + width * 8 + 8;
                    tempData[idxDown2Right2] = Math.min(255, Math.max(0, tempData[idxDown2Right2] + errR * 1 / divisor));
                    tempData[idxDown2Right2 + 1] = Math.min(255, Math.max(0, tempData[idxDown2Right2 + 1] + errG * 1 / divisor));
                    tempData[idxDown2Right2 + 2] = Math.min(255, Math.max(0, tempData[idxDown2Right2 + 2] + errB * 1 / divisor));
                }
            }
        }
    }

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const r = tempData[idx];
            const g = tempData[idx + 1];
            const b = tempData[idx + 2];

            const closest = findClosestColor(r, g, b);
            data[idx] = closest.r;
            data[idx + 1] = closest.g;
            data[idx + 2] = closest.b;
        }
    }

    return imageData;
}
export function ditherImage(imageData: ImageData, config: any) {
    const ditherType = config.ditherType;
    const ditherStrength = parseFloat(config.ditherStrength);

    switch (ditherType) {
        case 'floydSteinberg':
            return floydSteinbergDither(imageData, ditherStrength);
        case 'atkinson':
            return atkinsonDither(imageData, ditherStrength);
        case 'stucki':
            return stuckiDither(imageData, ditherStrength);
        case 'jarvis':
            return jarvisDither(imageData, ditherStrength);
        default:
            return imageData;
    }
}

export function processImageData(imageData: ImageData, config: any) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    let processedData;
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
    } else if (mode === 'blackWhiteColor') {
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