import { toCanvas, create } from 'qrcode';
import { Canvas, CanvasRenderingContext2D } from 'canvas';

type AnyCanvas = Canvas | HTMLCanvasElement;

export async function generateQrCode(
    createCanvas: (width: number, height: number) => AnyCanvas,
    content: string
): Promise<AnyCanvas> {
    const qr = create(content);
    const moduleCount = qr.modules.size;
    const canvasSize = moduleCount * 4; // 4 pixels per module
    const canvas = createCanvas(canvasSize, canvasSize);
    try {
        await toCanvas(canvas as HTMLCanvasElement, content, {
            width: canvasSize,
            margin: 1
        });
    } catch (e) {
        console.error("Error generating QR code:", e);
    }
    return canvas;
}

export function drawQrCodeOnCanvas(
    ctx: CanvasRenderingContext2D,
    qrCanvas: AnyCanvas,
    config: any
) {
    const position = config.qrPosition;
    const margin = parseInt(config.qrMargin, 10);

    let x = 0, y = 0;
    switch (position) {
        case 'bottom-right':
            x = ctx.canvas.width - qrCanvas.width - margin;
            y = ctx.canvas.height - qrCanvas.height - margin;
            break;
        case 'bottom-left':
            x = margin;
            y = ctx.canvas.height - qrCanvas.height - margin;
            break;
        case 'top-right':
            x = ctx.canvas.width - qrCanvas.width - margin;
            y = margin;
            break;
        case 'top-left':
            x = margin;
            y = margin;
            break;
    }

    ctx.drawImage(qrCanvas as any, x, y);
}