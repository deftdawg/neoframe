import { toCanvas } from 'qrcode';
import { Canvas, CanvasRenderingContext2D } from 'canvas';

type AnyCanvas = Canvas | HTMLCanvasElement;

export async function generateQrCode(
    createCanvas: (width: number, height: number) => AnyCanvas,
    content: string,
    width: number
): Promise<AnyCanvas> {
    const canvas = createCanvas(width, width); // QR codes are square
    try {
        await toCanvas(canvas as HTMLCanvasElement, content, {
            width: width,
            margin: 1 // Use a small margin to ensure a minimal border
        });
    } catch (e) {
        console.error("Error generating QR code:", e);
    }
    return canvas;
}

export function drawQrCodeOnCanvas(
    ctx: CanvasRenderingContext2D,
    qrCanvas: AnyCanvas,
    config: any,
    imageBoundingBox: { x: number, y: number, width: number, height: number }
) {
    const position = config.qrPosition;
    const margin = parseInt(config.qrMargin, 10);

    let x = 0, y = 0;
    switch (position) {
        case 'bottom-right':
            x = imageBoundingBox.x + imageBoundingBox.width - qrCanvas.width - margin;
            y = imageBoundingBox.y + imageBoundingBox.height - qrCanvas.height - margin;
            break;
        case 'bottom-left':
            x = imageBoundingBox.x + margin;
            y = imageBoundingBox.y + imageBoundingBox.height - qrCanvas.height - margin;
            break;
        case 'top-right':
            x = imageBoundingBox.x + imageBoundingBox.width - qrCanvas.width - margin;
            y = imageBoundingBox.y + margin;
            break;
        case 'top-left':
            x = imageBoundingBox.x + margin;
            y = imageBoundingBox.y + margin;
            break;
    }

    ctx.drawImage(qrCanvas as any, x, y);
}