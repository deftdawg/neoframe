import { toCanvas } from 'qrcode';
import { Canvas, CanvasRenderingContext2D } from 'canvas';

export async function generateQrCode(content: string, canvas: Canvas) {
    try {
        await toCanvas(canvas, content);
    } catch (e) {
        console.error("Error generating QR code:", e);
    }
}

export function drawQrCodeOnCanvas(ctx: CanvasRenderingContext2D, qrCanvas: Canvas, config: any, imageBoundingBox: { x: number, y: number, width: number, height: number }) {
    const borderColor = config.qrBorderColor;
    const position = config.qrPosition;
    const margin = parseInt(config.qrMargin, 10);
    const borderSize = margin;

    const borderedCanvas = new Canvas(qrCanvas.width + borderSize * 2, qrCanvas.height + borderSize * 2);
    const borderedCtx = borderedCanvas.getContext('2d');
    borderedCtx.fillStyle = borderColor;
    borderedCtx.fillRect(0, 0, borderedCanvas.width, borderedCanvas.height);
    borderedCtx.drawImage(qrCanvas, borderSize, borderSize);

    let x = 0, y = 0;
    switch (position) {
        case 'bottom-right':
            x = imageBoundingBox.x + imageBoundingBox.width - borderedCanvas.width;
            y = imageBoundingBox.y + imageBoundingBox.height - borderedCanvas.height;
            break;
        case 'bottom-left':
            x = imageBoundingBox.x;
            y = imageBoundingBox.y + imageBoundingBox.height - borderedCanvas.height;
            break;
        case 'top-right':
            x = imageBoundingBox.x + imageBoundingBox.width - borderedCanvas.width;
            y = imageBoundingBox.y;
            break;
        case 'top-left':
            x = imageBoundingBox.x;
            y = imageBoundingBox.y;
            break;
    }

    ctx.drawImage(borderedCanvas, x, y);
}