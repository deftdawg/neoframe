import { toCanvas } from 'qrcode';
import { Canvas, CanvasRenderingContext2D } from 'canvas';

type AnyCanvas = Canvas | HTMLCanvasElement;

export async function generateQrCode(content: string, canvas: AnyCanvas) {
    try {
        await toCanvas(canvas as HTMLCanvasElement, content);
    } catch (e) {
        console.error("Error generating QR code:", e);
    }
}

export function drawQrCodeOnCanvas(
    ctx: CanvasRenderingContext2D,
    qrCanvas: AnyCanvas,
    config: any,
    createCanvas: (width: number, height: number) => AnyCanvas
) {
    const borderColor = config.qrBorderColor;
    const position = config.qrPosition;
    const margin = parseInt(config.qrMargin, 10);
    const borderSize = 4; // module size

    const borderedCanvas = createCanvas(qrCanvas.width + borderSize * 2, qrCanvas.height + borderSize * 2);
    const borderedCtx = borderedCanvas.getContext('2d') as CanvasRenderingContext2D;
    borderedCtx.fillStyle = borderColor;
    borderedCtx.fillRect(0, 0, borderedCanvas.width, borderedCanvas.height);
    borderedCtx.drawImage(qrCanvas as any, borderSize, borderSize);

    let x = 0, y = 0;
    switch (position) {
        case 'bottom-right':
            x = ctx.canvas.width - borderedCanvas.width - margin;
            y = ctx.canvas.height - borderedCanvas.height - margin;
            break;
        case 'bottom-left':
            x = margin;
            y = ctx.canvas.height - borderedCanvas.height - margin;
            break;
        case 'top-right':
            x = ctx.canvas.width - borderedCanvas.width - margin;
            y = margin;
            break;
        case 'top-left':
            x = margin;
            y = margin;
            break;
    }

    ctx.drawImage(borderedCanvas as any, x, y);
}