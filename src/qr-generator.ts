import { toCanvas } from 'qrcode';
import { Canvas, CanvasRenderingContext2D } from 'canvas';
import { Config } from './config';

export async function generateQrCode(content: string, canvas: Canvas) {
    try {
        // The 'margin' option for QR codes refers to the thickness of the quiet zone border around the code,
        // specified in QR modules. The QR code specification requires a quiet zone of at least 4 modules.
        // A value of 0 will produce a QR code with no border.
        await toCanvas(canvas, content, { margin: 0 });
    } catch (e) {
        console.error("Error generating QR code:", e);
    }
}

export function drawQrCodeOnCanvas(ctx: CanvasRenderingContext2D, qrCanvas: Canvas, config: Config) {
    const borderColor = config.qrBorderColor;
    const position = config.qrPosition;
    // qrMargin defines the distance between the QR code and the edge of the canvas.
    const qrMargin = parseInt(config.qrMargin, 10);
    // qrBorder is the thickness of the border drawn around the QR code itself.
    const qrBorder = parseInt(config.qrBorder, 10);

    const borderedCanvas = new Canvas(qrCanvas.width + qrBorder * 2, qrCanvas.height + qrBorder * 2);
    const borderedCtx = borderedCanvas.getContext('2d');
    borderedCtx.fillStyle = borderColor;
    borderedCtx.fillRect(0, 0, borderedCanvas.width, borderedCanvas.height);
    borderedCtx.drawImage(qrCanvas, qrBorder, qrBorder);

    let x = 0, y = 0;
    switch (position) {
        case 'bottom-right':
            x = ctx.canvas.width - borderedCanvas.width - qrMargin;
            y = ctx.canvas.height - borderedCanvas.height - qrMargin;
            break;
        case 'bottom-left':
            x = qrMargin;
            y = ctx.canvas.height - borderedCanvas.height - qrMargin;
            break;
        case 'top-right':
            x = ctx.canvas.width - borderedCanvas.width - qrMargin;
            y = qrMargin;
            break;
        case 'top-left':
            x = qrMargin;
            y = qrMargin;
            break;
    }

    ctx.drawImage(borderedCanvas, x, y);
}