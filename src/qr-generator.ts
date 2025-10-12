import { readFileSync } from 'fs';
import { Canvas, CanvasRenderingContext2D } from 'canvas';

// A simple DOM shim
const createQrCode = () => {
    // This is a hack to get the qrcode.js library to work in a non-browser environment
    const script = readFileSync('scripts/qrcode.js', 'utf-8');
    const self = {
        // Mock self for the UMD wrapper
    };
    const window = {
        // Mock window for the UMD wrapper
    };
    const module: { exports?: any } = {};
    const define = (deps: any, factory: any) => {
        module.exports = factory();
    };
    (define as any).amd = true;
    const fn = new Function('self', 'window', 'module', 'define', script);
    fn(self, window, module, define);
    return module.exports;
};

const qrcode = createQrCode();

export function generateQrCode(content: string, options: any): any {
    try {
        const qr = qrcode(0, 'L');
        qr.addData(content);
        qr.make();
        return qr;
    } catch (e) {
        console.error("Error generating QR code:", e);
        return null;
    }
}

export function drawQrCodeOnCanvas(ctx: CanvasRenderingContext2D, qr: any, config: any) {
    const qrColor = config.qrColor;
    const borderColor = config.qrBorderColor;
    const position = config.qrPosition;
    const margin = parseInt(config.qrMargin, 10);

    const moduleCount = qr.getModuleCount();
    const moduleSize = 4;
    const qrSize = moduleCount * moduleSize;
    const borderSize = moduleSize;

    const qrCanvas = new Canvas(qrSize, qrSize);
    const qrCtx = qrCanvas.getContext('2d');

    for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
            if (qr.isDark(row, col)) {
                qrCtx.fillStyle = qrColor;
                qrCtx.fillRect(col * moduleSize, row * moduleSize, moduleSize, moduleSize);
            }
        }
    }

    const borderedCanvas = new Canvas(qrSize + borderSize * 2, qrSize + borderSize * 2);
    const borderedCtx = borderedCanvas.getContext('2d');
    borderedCtx.fillStyle = borderColor;
    borderedCtx.fillRect(0, 0, borderedCanvas.width, borderedCanvas.height);
    borderedCtx.drawImage(qrCanvas, borderSize, borderSize);

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

    ctx.drawImage(borderedCanvas, x, y);
}