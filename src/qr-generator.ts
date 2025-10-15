import { toCanvas } from 'qrcode';
import { Canvas, CanvasRenderingContext2D } from 'canvas';

export async function generateQrCode(content: string, canvas: Canvas) {
    try {
        await toCanvas(canvas, content);
    } catch (e) {
        console.error("Error generating QR code:", e);
    }
}

export function drawQrCodeOnCanvas(
    ctx: CanvasRenderingContext2D,
    qrCanvas: Canvas | HTMLCanvasElement,
    config: any,
    rotation: number,
    imageBoundingBox?: { x: number; y: number; width: number; height: number }
) {
    const borderColor = config.qrBorderColor;
    const position = config.qrPosition;
    const margin = parseInt(config.qrMargin, 10);
    const borderSize = 4; // module size

    const borderedCanvas =
        qrCanvas instanceof HTMLCanvasElement
            ? document.createElement('canvas')
            : new Canvas(qrCanvas.width + borderSize * 2, qrCanvas.height + borderSize * 2);
    const borderedCtx = borderedCanvas.getContext('2d')!;
    borderedCanvas.width = qrCanvas.width + borderSize * 2;
    borderedCanvas.height = qrCanvas.height + borderSize * 2;
    borderedCtx.fillStyle = borderColor;
    borderedCtx.fillRect(0, 0, borderedCanvas.width, borderedCanvas.height);
    borderedCtx.drawImage(qrCanvas as any, borderSize, borderSize);

    let transformedPosition = position;
    if (rotation === 90) {
        if (position === 'top-left') transformedPosition = 'top-right';
        else if (position === 'top-right') transformedPosition = 'bottom-right';
        else if (position === 'bottom-right') transformedPosition = 'bottom-left';
        else if (position === 'bottom-left') transformedPosition = 'top-left';
    } else if (rotation === 180) {
        if (position === 'top-left') transformedPosition = 'bottom-right';
        else if (position === 'top-right') transformedPosition = 'bottom-left';
        else if (position === 'bottom-right') transformedPosition = 'top-left';
        else if (position === 'bottom-left') transformedPosition = 'top-right';
    } else if (rotation === 270) {
        if (position === 'top-left') transformedPosition = 'bottom-left';
        else if (position === 'top-right') transformedPosition = 'top-left';
        else if (position === 'bottom-right') transformedPosition = 'top-right';
        else if (position === 'bottom-left') transformedPosition = 'bottom-right';
    }

    let x = 0, y = 0;
    const targetWidth = imageBoundingBox ? imageBoundingBox.width : ctx.canvas.width;
    const targetHeight = imageBoundingBox ? imageBoundingBox.height : ctx.canvas.height;
    const offsetX = imageBoundingBox ? imageBoundingBox.x : 0;
    const offsetY = imageBoundingBox ? imageBoundingBox.y : 0;

    switch (transformedPosition) {
        case 'bottom-right':
            x = offsetX + targetWidth - borderedCanvas.width - margin;
            y = offsetY + targetHeight - borderedCanvas.height - margin;
            break;
        case 'bottom-left':
            x = offsetX + margin;
            y = offsetY + targetHeight - borderedCanvas.height - margin;
            break;
        case 'top-right':
            x = offsetX + targetWidth - borderedCanvas.width - margin;
            y = offsetY + margin;
            break;
        case 'top-left':
            x = offsetX + margin;
            y = offsetY + margin;
            break;
    }

    ctx.drawImage(borderedCanvas as any, x, y);
}