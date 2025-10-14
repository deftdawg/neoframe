import { getConfig, Config } from './config';
import { adjustContrast, ditherImage, processImageData } from './algorithms';
import { drawQrCodeOnCanvas } from './qr-generator';

declare global {
    interface Window {
        updateImage: () => void;
        handleFileUpload: (event: any) => void;
        downloadImage: () => void;
        sendToESP32: () => void;
        downloadDataArray: () => void;
        switchToRealTime: () => void;
        switchToSlideShow: () => void;
        originalImage: any;
        qrcode: any;
        EXIF: any;
    }
}

let originalImage: HTMLImageElement | null = null;
window.originalImage = null;

const rgbPalette = [
    { name: "Yellow", r: 255, g: 255, b: 0, value: 0xe2 },
    { name: "Green", r: 41, g: 204, b: 20, value: 0x96 },
    { name: "Blue", r: 0, g: 0, b: 255, value: 0x1d },
    { name: "Red", r: 255, g: 0, b: 0, value: 0x4c },
    { name: "Black", r: 0, g: 0, b: 0, value: 0x00 },
    { name: "White", r: 255, g: 255, b: 255, value: 0xff }
];

function getSettings(): Config {
    return {
        esp32Ip: (document.getElementById('esp32-ip') as HTMLInputElement).value,
        ditherMode: (document.getElementById('ditherMode') as HTMLSelectElement).value,
        ditherType: (document.getElementById('ditherType') as HTMLSelectElement).value,
        rotation: (document.getElementById('rotation') as HTMLSelectElement).value,
        scaling: (document.getElementById('scaling') as HTMLSelectElement).value,
        customScale: (document.getElementById('customScale') as HTMLInputElement).value,
        ditherStrength: (document.getElementById('ditherStrength') as HTMLInputElement).value,
        contrast: (document.getElementById('contrast') as HTMLInputElement).value,
        qrCodeEnabled: (document.getElementById('qr-code-toggle') as HTMLInputElement).checked,
        qrContentType: (document.getElementById('qr-content-type') as HTMLSelectElement).value,
        qrCustomText: (document.getElementById('qr-custom-text') as HTMLTextAreaElement).value,
        qrPosition: (document.getElementById('qr-position') as HTMLSelectElement).value,
        qrMargin: (document.getElementById('qr-margin') as HTMLInputElement).value,
        qrColor: (document.getElementById('qr-color') as HTMLSelectElement).value,
        qrBorderColor: (document.getElementById('qr-border-color') as HTMLSelectElement).value,
        autosave: (document.getElementById('autosave-settings') as HTMLInputElement).checked
    };
}

function applySettings(settings: Config) {
    (document.getElementById('esp32-ip') as HTMLInputElement).value = settings.esp32Ip;
    (document.getElementById('ditherMode') as HTMLSelectElement).value = settings.ditherMode;
    (document.getElementById('ditherType') as HTMLSelectElement).value = settings.ditherType;
    (document.getElementById('rotation') as HTMLSelectElement).value = settings.rotation;
    (document.getElementById('scaling') as HTMLSelectElement).value = settings.scaling;
    (document.getElementById('customScale') as HTMLInputElement).value = settings.customScale;
    (document.getElementById('ditherStrength') as HTMLInputElement).value = settings.ditherStrength;
    (document.getElementById('contrast') as HTMLInputElement).value = settings.contrast;
    (document.getElementById('qr-code-toggle') as HTMLInputElement).checked = settings.qrCodeEnabled;
    (document.getElementById('qr-content-type') as HTMLSelectElement).value = settings.qrContentType;
    (document.getElementById('qr-custom-text') as HTMLTextAreaElement).value = settings.qrCustomText;
    (document.getElementById('qr-position') as HTMLSelectElement).value = settings.qrPosition;
    (document.getElementById('qr-margin') as HTMLInputElement).value = settings.qrMargin;
    (document.getElementById('qr-color') as HTMLSelectElement).value = settings.qrColor;
    (document.getElementById('qr-border-color') as HTMLSelectElement).value = settings.qrBorderColor;
    (document.getElementById('autosave-settings') as HTMLInputElement).checked = settings.autosave;
    updateImage();
}

async function updateImage() {
    if (!originalImage) return;

    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const settings = getSettings();
    const rotation = parseInt(settings.rotation, 10);
    const scalingMode = settings.scaling;

    const rotatedCanvas = document.createElement('canvas');
    const rotatedCtx = rotatedCanvas.getContext('2d')!;

    if (rotation === 90 || rotation === 270) {
        rotatedCanvas.width = originalImage.height;
        rotatedCanvas.height = originalImage.width;
    } else {
        rotatedCanvas.width = originalImage.width;
        rotatedCanvas.height = originalImage.height;
    }

    rotatedCtx.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
    rotatedCtx.rotate(rotation * Math.PI / 180);
    rotatedCtx.drawImage(originalImage, -originalImage.width / 2, -originalImage.height / 2);

    const sourceImage = rotatedCanvas;

    const frameWidth = 1200;
    const frameHeight = 1600;

    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = frameWidth;
    offscreenCanvas.height = frameHeight;
    const offscreenCtx = offscreenCanvas.getContext('2d')!;

    offscreenCtx.fillStyle = 'white';
    offscreenCtx.fillRect(0, 0, frameWidth, frameHeight);

    let scale;
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

    const imageData = offscreenCtx.getImageData(0, 0, frameWidth, frameHeight);
    adjustContrast(imageData, parseFloat(settings.contrast));
    ditherImage(imageData, settings as Config);
    offscreenCtx.putImageData(imageData, 0, 0);

    canvas.width = frameWidth;
    canvas.height = frameHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(offscreenCanvas, 0, 0);

    if (settings.qrCodeEnabled) {
        let qrContent = '';
        switch (settings.qrContentType) {
            case 'url':
                qrContent = window.location.href;
                break;
            case 'wifi':
                qrContent = `WIFI:T:WPA;S:NeoFrame;P:123456789;H:false;`;
                break;
            case 'custom':
                qrContent = settings.qrCustomText;
                break;
            case 'exif':
                window.EXIF.getData(originalImage as any, function(this: any) {
                    const allMetaData = window.EXIF.getAllTags(this);
                    let exifString = '';
                    for (let tag in allMetaData) {
                        if (allMetaData.hasOwnProperty(tag)) {
                            exifString += `${tag}: ${allMetaData[tag]}\n`;
                        }
                    }
                    qrContent = exifString || "No EXIF data found.";
                    const qr = window.qrcode(0, 'L');
                    qr.addData(qrContent);
                    qr.make();
                    const qrCanvas = document.createElement('canvas');
                    qr.renderTo2dContext(qrCanvas.getContext('2d'), 4);
                    drawQrCodeOnCanvas(ctx, qrCanvas, settings, imageBoundingBox);
                });
                return;
        }

        const qr = window.qrcode(0, 'L');
        qr.addData(qrContent);
        qr.make();
        const qrCanvas = document.createElement('canvas');
        const qrCtx = qrCanvas.getContext('2d')!;

        const moduleCount = qr.getModuleCount();
        const moduleSize = 4;
        qrCanvas.width = moduleCount * moduleSize;
        qrCanvas.height = moduleCount * moduleSize;

        for (let row = 0; row < moduleCount; row++) {
            for (let col = 0; col < moduleCount; col++) {
                if (qr.isDark(row, col)) {
                    qrCtx.fillStyle = settings.qrColor;
                    qrCtx.fillRect(col * moduleSize, row * moduleSize, moduleSize, moduleSize);
                }
            }
        }

        drawQrCodeOnCanvas(ctx, qrCanvas, settings, imageBoundingBox);
    }
}


function handleFileUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files![0];
    (event.target as HTMLInputElement).value = '';
    const reader = new FileReader();

    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            originalImage = img;
            window.originalImage = img;
            updateImage();

            (document.getElementById('sendToESP32') as HTMLButtonElement).style.display = 'inline';
        };
        img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
}

async function sendToESP32() {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const settings = getSettings();
    const processedData = processImageData(imageData, settings as Config);
    const esp32IP = settings.esp32Ip;
    const blob = new Blob([processedData], { type: 'application/octet-stream' });
    const formData = new FormData();
    formData.append('data', blob, 'image_data.bin');

    const uploadStatusContainer = document.getElementById('upload-status-container')!;
    const uploadStatusMessage = document.getElementById('upload-status-message')!;
    const progressBarInner = document.getElementById('upload-progress-bar-inner')!;

    uploadStatusContainer.style.display = 'block';
    uploadStatusMessage.textContent = 'Uploading to frame...';
    (progressBarInner as HTMLElement).style.transition = 'none';
    (progressBarInner as HTMLElement).style.width = '0%';

    try {
        const response = await fetch(`http://${esp32IP}/upload`, {
            method: 'POST',
            body: formData,
            mode: 'cors'
        });
        if (!response.ok) {
            throw new Error(`Error: ${response.statusText}`);
        }
        const responseText = await response.text();
        console.log(`Server response: ${responseText}`);
        if (responseText.includes("上传成功")) {
            uploadStatusMessage.textContent = 'Refreshing...';
            (progressBarInner as HTMLElement).offsetHeight;
            (progressBarInner as HTMLElement).style.transition = 'width 35s linear';
            (progressBarInner as HTMLElement).style.width = '100%';
            setTimeout(() => {
                uploadStatusContainer.style.display = 'none';
            }, 35000);
        }
    } catch (error) {
        console.error('Failed to send data:', error);
        alert('Unable to send data to ESP32 via Wi-Fi');
        uploadStatusContainer.style.display = 'none';
    }
}

function downloadImage() {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    const dataURL = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = 'dithered_image.png';
    link.click();
}

function downloadDataArray() {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const processedData = processImageData(imageData, getSettings());
    let dataString = 'const unsigned char gImage[] = {\n';
    for (let i = 0; i < processedData.length; i++) {
        dataString += `0x${processedData[i].toString(16).padStart(2, '0')}`;
        if (i !== processedData.length - 1) dataString += ', ';
        if ((i + 1) % 16 === 0) dataString += '\n';
    }
    dataString += '\n};';
    const blob = new Blob([dataString], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'image_data_array.c';
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
}

async function switchToRealTime() {
    const esp32IP = (document.getElementById('esp32-ip') as HTMLInputElement).value;
    try {
        const response = await fetch(`http://${esp32IP}/switchToRealTime`, {
            method: 'POST',
            mode: 'cors'
        });
        if (!response.ok) {
            throw new Error(`Error: ${response.statusText}`);
        }
        const responseText = await response.text();
        console.log(`Server response: ${responseText}`);
        alert('Successfully switched to real-time mode');
    } catch (error) {
        console.error('Failed to switch to real-time mode:', error);
        alert('Failed to switch to real-time mode');
    }
}

async function switchToSlideShow() {
    const esp32IP = (document.getElementById('esp32-ip') as HTMLInputElement).value;
    try {
        const response = await fetch(`http://${esp32IP}/switchToSlideShow`, {
            method: 'POST',
            mode: 'cors'
        });
        if (!response.ok) {
            throw new Error(`Error: ${response.statusText}`);
        }
        const responseText = await response.text();
        console.log(`Server response: ${responseText}`);
        alert('Successfully switched to slideshow mode');
    } catch (error) {
        console.error('Failed to switch to slideshow mode:', error);
        alert('Failed to switch to slideshow mode');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const qrColorSelect = document.getElementById('qr-color') as HTMLSelectElement;
    const qrBorderColorSelect = document.getElementById('qr-border-color') as HTMLSelectElement;
    rgbPalette.forEach(color => {
        const option = new Option(color.name, `rgb(${color.r}, ${color.g}, ${color.b})`);
        qrColorSelect.add(option.cloneNode(true) as HTMLOptionElement);
        qrBorderColorSelect.add(option as HTMLOptionElement);
    });
    qrColorSelect.value = 'rgb(0, 0, 0)';
    qrBorderColorSelect.value = 'rgb(255, 255, 255)';

    document.getElementById('upload')!.addEventListener('change', handleFileUpload);
    document.getElementById('sendToESP32')!.addEventListener('click', sendToESP32);
    document.getElementById('download')!.addEventListener('click', downloadImage);
    document.getElementById('downloadArray')!.addEventListener('click', downloadDataArray);
    document.getElementById('switchToRealTime')!.addEventListener('click', switchToRealTime);
    document.getElementById('switchToSlideShow')!.addEventListener('click', switchToSlideShow);

    const controlsToMonitor = [
        'ditherMode', 'ditherType', 'rotation', 'scaling', 'customScale',
        'ditherStrength', 'contrast', 'qr-code-toggle', 'qr-content-type',
        'qr-custom-text', 'qr-position', 'qr-margin', 'qr-color', 'qr-border-color'
    ];

    controlsToMonitor.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            const eventType = (element.tagName === 'INPUT' && (element.getAttribute('type') === 'range' || element.getAttribute('type') === 'number' || element.getAttribute('type') === 'text')) ? 'input' : 'change';
            element.addEventListener(eventType, () => {
                updateSettingsTextarea();
                updateImage();
            });
        }
    });

    const qrCodeToggle = document.getElementById('qr-code-toggle') as HTMLInputElement;
    const qrCodeOptions = document.getElementById('qr-code-options') as HTMLDivElement;
    qrCodeToggle.addEventListener('change', () => {
        qrCodeOptions.style.display = qrCodeToggle.checked ? 'block' : 'none';
        updateImage();
    });

    const qrContentType = document.getElementById('qr-content-type') as HTMLSelectElement;
    const qrCustomTextContainer = document.getElementById('qr-custom-text-container') as HTMLDivElement;
    qrContentType.addEventListener('change', () => {
        qrCustomTextContainer.style.display = qrContentType.value === 'custom' ? 'block' : 'none';
        updateImage();
    });

    let lastQrColor = qrColorSelect.value;
    let lastQrBorderColor = qrBorderColorSelect.value;
    qrColorSelect.addEventListener('change', () => {
        if (qrColorSelect.value === qrBorderColorSelect.value) {
            qrBorderColorSelect.value = lastQrColor;
        }
        lastQrColor = qrColorSelect.value;
        lastQrBorderColor = qrBorderColorSelect.value;
        updateImage();
    });
    qrBorderColorSelect.addEventListener('change', () => {
        if (qrBorderColorSelect.value === qrColorSelect.value) {
            qrColorSelect.value = lastQrBorderColor;
        }
        lastQrColor = qrColorSelect.value;
        lastQrBorderColor = qrBorderColorSelect.value;
        updateImage();
    });

    const settingsKey = 'neoframeSettings';
    function saveSettingsToLocalStorage() {
        const settings = getSettings();
        localStorage.setItem(settingsKey, JSON.stringify(settings));
    }
    function updateSettingsTextarea() {
        const settings = getSettings();
        (document.getElementById('settings-json') as HTMLTextAreaElement).value = JSON.stringify(settings, null, 2);
    }
    document.getElementById('save-settings-button')!.addEventListener('click', () => {
        try {
            const settingsText = (document.getElementById('settings-json') as HTMLTextAreaElement).value;
            const settings = JSON.parse(settingsText);
            localStorage.setItem(settingsKey, JSON.stringify(settings));
            alert('Settings saved successfully! The page will now reload to apply them.');
            location.reload();
        } catch (e: any) {
            alert('Error parsing settings JSON. Please ensure it is valid.\n\n' + e.message);
        }
    });
    document.getElementById('clear-settings-button')!.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all saved settings and reload the page?')) {
            localStorage.removeItem(settingsKey);
            alert('Settings cleared. The page will now reload to defaults.');
            location.reload();
        }
    });
    document.getElementById('autosave-settings')!.addEventListener('change', () => {
        if ((document.getElementById('autosave-settings') as HTMLInputElement).checked) {
            saveSettingsToLocalStorage();
        }
    });

    const copyMinifiedButton = document.createElement('button');
    copyMinifiedButton.textContent = 'Copy Minified';
    copyMinifiedButton.addEventListener('click', () => {
        const settings = getSettings();
        navigator.clipboard.writeText(JSON.stringify(settings));
        alert('Minified settings copied to clipboard.');
    });
    document.getElementById('settings-controls')!.appendChild(copyMinifiedButton);

    const savedSettings = localStorage.getItem(settingsKey);
    if (savedSettings) {
        try {
            const settings = JSON.parse(savedSettings);
            applySettings(settings);
        } catch (e: any) {
            alert('Error parsing saved settings. Defaults will be loaded.\n\n' + e.message);
            localStorage.removeItem(settingsKey);
        }
    } else {
        updateSettingsTextarea();
    }
});

window.updateImage = updateImage;
window.handleFileUpload = handleFileUpload;
window.sendToESP32 = sendToESP32;
window.downloadImage = downloadImage;
window.downloadDataArray = downloadDataArray;
window.switchToRealTime = switchToRealTime;
window.switchToSlideShow = switchToSlideShow;