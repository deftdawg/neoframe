import { Config } from './config';

export function applyScaling(
    sourceImage: Canvas | HTMLCanvasElement,
    offscreenCtx: CanvasRenderingContext2D,
    settings: Config,
    frameWidth: number,
    frameHeight: number
): { imageBoundingBox: { x: number; y: number; width: number; height: number }; scale: number } {
    const scalingMode = settings.scaling;

    let scale: number;
    const imageBoundingBox = { x: 0, y: 0, width: 0, height: 0 };
    let targetWidth = frameWidth;
    let targetHeight = frameHeight;
    let offsetX = 0;
    let offsetY = 0;

    if (scalingMode.includes('8x10')) {
        const rodalmTargetWidth = 1130;
        const rodalmTargetHeight = 1420;
        targetWidth = rodalmTargetWidth;
        targetHeight = rodalmTargetHeight;
        offsetX = (frameWidth - targetWidth) / 2;
        offsetY = (frameHeight - targetHeight) / 2;
    }

    switch (scalingMode) {
        case 'fit':
        case 'fit_8x10':
            scale = Math.min(targetWidth / sourceImage.width, targetHeight / sourceImage.height);
            imageBoundingBox.width = sourceImage.width * scale;
            imageBoundingBox.height = sourceImage.height * scale;
            imageBoundingBox.x = (targetWidth - imageBoundingBox.width) / 2 + offsetX;
            imageBoundingBox.y = (targetHeight - imageBoundingBox.height) / 2 + offsetY;
            offscreenCtx.drawImage(sourceImage, imageBoundingBox.x, imageBoundingBox.y, imageBoundingBox.width, imageBoundingBox.height);
            break;
        case 'original':
        case 'original_8x10':
            scale = 1.0;
            imageBoundingBox.width = sourceImage.width * scale;
            imageBoundingBox.height = sourceImage.height * scale;
            imageBoundingBox.x = (targetWidth - imageBoundingBox.width) / 2 + offsetX;
            imageBoundingBox.y = (targetHeight - imageBoundingBox.height) / 2 + offsetY;
            offscreenCtx.drawImage(sourceImage, imageBoundingBox.x, imageBoundingBox.y, imageBoundingBox.width, imageBoundingBox.height);
            break;
        case 'custom':
        case 'custom_8x10':
            const customScaleValue = parseInt(settings.customScale, 10);
            scale = customScaleValue / 100;
            imageBoundingBox.width = sourceImage.width * scale;
            imageBoundingBox.height = sourceImage.height * scale;
            imageBoundingBox.x = (targetWidth - imageBoundingBox.width) / 2 + offsetX;
            imageBoundingBox.y = (targetHeight - imageBoundingBox.height) / 2 + offsetY;
            offscreenCtx.drawImage(sourceImage, imageBoundingBox.x, imageBoundingBox.y, imageBoundingBox.width, imageBoundingBox.height);
            break;
        case 'fill':
        case 'fill_8x10':
        default:
            scale = Math.max(targetWidth / sourceImage.width, targetHeight / sourceImage.height);
            const cropWidth = targetWidth / scale;
            const cropHeight = targetHeight / scale;
            const cropX = (sourceImage.width - cropWidth) / 2;
            const cropY = (sourceImage.height - cropHeight) / 2;
            offscreenCtx.drawImage(
                sourceImage,
                cropX, cropY,
                cropWidth, cropHeight,
                offsetX, offsetY,
                targetWidth, targetHeight
            );
            imageBoundingBox.x = offsetX;
            imageBoundingBox.y = offsetY;
            imageBoundingBox.width = targetWidth;
            imageBoundingBox.height = targetHeight;
            break;
    }

    return { imageBoundingBox, scale };
}
