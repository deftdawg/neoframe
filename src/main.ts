import { getConfig, Config } from './config';
import { adjustContrast, ditherImage, processImageData } from './algorithms';
import { generateQrCode, drawQrCodeOnCanvas } from './qr-generator';
import { applyScaling } from './scaling';
import { Canvas } from 'canvas';

declare global {
    interface Window {
        updateImage: () => void;
        handleFileUpload: (event: any) => void;
        downloadImage: () => void;
        sendToESP32: () => void;
        downloadDataArray: () => void;
        switchToRealTime: () => void;
        switchToSlideShow: () => void;
        checkHealth: () => void;
        originalImage: any;
        qrcode: any;
        EXIF: any;
    }
}

let originalImage: HTMLImageElement | null = null;
let originalImageFile: File | null = null;
window.originalImage = null;

function debounce(func: Function, delay: number) {
    let timeoutId: number;
    return (...args: any[]) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(null, args), delay);
    };
}

const debouncedUpdateImage = debounce(updateImage, 2000);

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
        qrBackgroundColor: (document.getElementById('qr-background-color') as HTMLSelectElement).value,
        qrBorderSize: (document.getElementById('qr-border-size') as HTMLInputElement).value,
        autosave: (document.getElementById('autosave-settings') as HTMLInputElement).checked,
        qrExifLabels: (document.getElementById('qr-exif-labels') as HTMLInputElement).checked,
        qrExifGps: (document.getElementById('qr-exif-gps') as HTMLInputElement).checked,
        qrExifMaps: (document.getElementById('qr-exif-maps') as HTMLInputElement).checked
    };
}

function updateScalingUI() {
    const scalingSelect = document.getElementById('scaling') as HTMLSelectElement;
    const customScalingContainer = document.getElementById('custom-scaling-container') as HTMLDivElement;
    const scalePercentageSpan = document.getElementById('scale-percentage') as HTMLSpanElement;
    const customScaleInput = document.getElementById('customScale') as HTMLInputElement;
    const customScaleNumberInput = document.getElementById('customScaleNumber') as HTMLInputElement;

    const scalingValue = scalingSelect.value;
    if (scalingValue === 'custom' || scalingValue === 'custom_8x10') {
        customScalingContainer.style.display = 'flex';
        scalePercentageSpan.textContent = `(${customScaleInput.value}%)`;
    } else {
        customScalingContainer.style.display = 'none';
        scalePercentageSpan.textContent = '';
    }

    // Sync the number input with the range
    customScaleNumberInput.value = customScaleInput.value;
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
    (document.getElementById('qr-background-color') as HTMLSelectElement).value = settings.qrBackgroundColor;
    (document.getElementById('qr-border-size') as HTMLInputElement).value = settings.qrBorderSize;
    (document.getElementById('autosave-settings') as HTMLInputElement).checked = settings.autosave;
    (document.getElementById('qr-exif-labels') as HTMLInputElement).checked = settings.qrExifLabels;
    (document.getElementById('qr-exif-gps') as HTMLInputElement).checked = settings.qrExifGps;
    (document.getElementById('qr-exif-maps') as HTMLInputElement).checked = settings.qrExifMaps;

    // Update UI visibility manually
    const qrCodeOptions = document.getElementById('qr-code-options') as HTMLDivElement;
    qrCodeOptions.style.display = settings.qrCodeEnabled ? 'block' : 'none';
    const qrCustomTextContainer = document.getElementById('qr-custom-text-container') as HTMLDivElement;
    qrCustomTextContainer.style.display = settings.qrContentType === 'custom' ? 'block' : 'none';
    const qrExifContainer = document.getElementById('qr-exif-container') as HTMLDivElement;
    qrExifContainer.style.display = settings.qrContentType === 'exif' ? 'block' : 'none';

    updateScalingUI();
    updateImage();
}

function getCurrentMode(): NeoFrameMode {
    const cliCheckbox = document.getElementById('proxy-cli-checkbox') as HTMLInputElement;

    // Mode detection based on browser URL, not ESP32 IP
    if (window.location.protocol === 'file:') {
        return 'direct';
    } else if (cliCheckbox && cliCheckbox.checked) {
        return 'proxy-cli';
    } else {
        return 'proxy';
    }
}

async function updateModeIndicator(modeStatus: ModeStatus) {
    const statusIndicator = document.getElementById('online-status-indicator');
    const modeTextElement = document.getElementById('mode-text');

    if (!statusIndicator || !modeTextElement) {
        console.warn('Mode indicator elements not found in DOM');
        return;
    }

    statusIndicator.classList.remove('online', 'offline', 'grey');
    statusIndicator.style.backgroundColor = ''; // Reset custom colors
    modeTextElement.textContent = modeStatus.text;

    switch (modeStatus.color) {
        case 'green':
            statusIndicator.classList.add('online');
            break;
        case 'red':
            statusIndicator.classList.add('offline');
            break;
        case 'amber':
            statusIndicator.style.backgroundColor = '#ffc107'; // Amber/yellow
            break;
        case 'grey':
            statusIndicator.classList.add('grey');
            break;
    }
}

async function checkHealth() {
    const esp32IP = (document.getElementById('esp32-ip') as HTMLInputElement).value;
    const lastOnlineTimeElem = document.getElementById('last-online-time');
    const lastCheckedTimeElem = document.getElementById('last-checked-time');
    const cliCheckboxContainer = document.getElementById('proxy-cli-container');

    if (!lastOnlineTimeElem || !lastCheckedTimeElem) {
        console.warn('Status elements not found in DOM');
        return;
    }

    lastCheckedTimeElem.textContent = new Date().toLocaleTimeString();

    const mode = getCurrentMode();
    let modeStatus: ModeStatus;

    try {
        if (mode === 'direct') {
            // Direct mode - check ESP32 directly using ESP32 IP
            try {
                await fetch(`http://${esp32IP}/health`, {
                    method: 'GET',
                    mode: 'no-cors',
                    signal: AbortSignal.timeout(4000), // 4 second timeout
                });
                modeStatus = { mode: 'direct', color: 'green', text: 'DIRECT' };
                lastOnlineTimeElem.textContent = new Date().toLocaleTimeString();
            } catch (directError) {
                // ESP32 not available - this is expected during development
                console.log('Direct mode: ESP32 not reachable (this is normal)');
                modeStatus = { mode: 'direct', color: 'grey', text: 'DIRECT' };
            }
            if (cliCheckboxContainer) cliCheckboxContainer.style.display = 'none';
        } else {
            // Proxy mode - check proxy server (current browser location)
            try {
                const proxyUrl = new URL(`${window.location.origin}/health`);
                proxyUrl.searchParams.set('esp32_ip', esp32IP);
                const response = await fetch(proxyUrl.toString(), {
                    method: 'GET',
                    mode: 'cors',
                    signal: AbortSignal.timeout(6000), // 6 second timeout (longer than server)
                });

                if (cliCheckboxContainer) cliCheckboxContainer.style.display = 'block';

                if (response.status === 200) {
                    modeStatus = { mode: mode, color: 'green', text: mode === 'proxy-cli' ? 'PROXY-CLI' : 'PROXY' };
                    lastOnlineTimeElem.textContent = new Date().toLocaleTimeString();
                } else if (response.status === 504) {
                    modeStatus = { mode: mode, color: 'amber', text: mode === 'proxy-cli' ? 'PROXY-CLI' : 'PROXY' };
                } else {
                    modeStatus = { mode: mode, color: 'red', text: mode === 'proxy-cli' ? 'PROXY-CLI' : 'PROXY' };
                }
            } catch (proxyError) {
                // Proxy server not running - this is expected during development
                console.log('Proxy mode: Server not reachable (run `bun run server.ts`)');
                modeStatus = { mode: mode, color: 'grey', text: mode === 'proxy-cli' ? 'PROXY-CLI' : 'PROXY' };
                if (cliCheckboxContainer) cliCheckboxContainer.style.display = 'block';
            }
        }

    } catch (error) {
        // This should rarely happen now with the nested try-catch blocks above
        console.error('Unexpected health check error:', error);
        modeStatus = { mode: mode, color: 'red', text: mode === 'proxy-cli' ? 'PROXY-CLI' : 'PROXY' };
        if (cliCheckboxContainer) {
            cliCheckboxContainer.style.display = mode === 'direct' ? 'none' : 'block';
        }
    }

    updateModeIndicator(modeStatus);
}

async function updateImage() {
    if (!originalImage) return;

    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const settings = getSettings();
    const rotation = parseInt(settings.rotation, 10);
    const scalingMode = settings.scaling;
    const customScaleInput = document.getElementById('customScale') as HTMLInputElement;
    const customScaleNumberInput = document.getElementById('customScaleNumber') as HTMLInputElement;

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

    const { imageBoundingBox, scale } = applyScaling(sourceImage, offscreenCtx, settings, frameWidth, frameHeight);

    if (scalingMode === 'fit' || scalingMode === 'fit_8x10' || scalingMode === 'original' || scalingMode === 'original_8x10') {
        const customScaleInput = document.getElementById('customScale') as HTMLInputElement;
        const customScaleNumberInput = document.getElementById('customScaleNumber') as HTMLInputElement;
        const displayScale = Math.round(scale * 100);
        customScaleInput.value = displayScale.toString();
        customScaleNumberInput.value = displayScale.toString();
        updateScalingUI();
    }

    const imageData = offscreenCtx.getImageData(0, 0, frameWidth, frameHeight);
    adjustContrast(imageData, parseFloat(settings.contrast));
    ditherImage(imageData, settings as Config);
    offscreenCtx.putImageData(imageData, 0, 0);

    if (settings.qrCodeEnabled) {
        const drawQrAndFinalize = async (qrContent: string) => {
            const qrCanvas = await generateQrCode(qrContent, settings);
            drawQrCodeOnCanvas(offscreenCtx, qrCanvas, settings, rotation, imageBoundingBox);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(offscreenCanvas, 0, 0);
        };

        let qrContent: string | null = null;
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
                    // console.log('EXIF Data:', JSON.stringify(allMetaData, null, 2));

                    const hasExif = !!(allMetaData.Make || allMetaData.Model || allMetaData.LensModel || allMetaData.LensInfo || allMetaData.FocalLength || allMetaData.FocalLengthIn35mmFilm || allMetaData.ExposureTime || allMetaData.FNumber || allMetaData.ISOSpeedRatings || allMetaData.GPSLatitude);
                    if (!hasExif) {
                        const qrExifText = document.getElementById('qr-exif-text') as HTMLTextAreaElement;
                        if (qrExifText) qrExifText.value = "No EXIF data found";
                        (document.getElementById('qr-exif-labels') as HTMLInputElement).disabled = true;
                        (document.getElementById('qr-exif-gps') as HTMLInputElement).disabled = true;
                        (document.getElementById('qr-exif-maps') as HTMLInputElement).disabled = true;
                        // Re-render the preview without QR
                        const canvas = document.getElementById('canvas') as HTMLCanvasElement;
                        const ctx = canvas.getContext('2d')!;
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        ctx.drawImage(offscreenCanvas, 0, 0);
                        return;
                    }

                    const make = allMetaData.Make || 'Unknown';
                    const model = allMetaData.Model || 'Unknown';
                    let lens = allMetaData.LensModel || allMetaData.LensInfo || 'Unknown';
                    const focalLength = allMetaData.FocalLength ? parseFloat(allMetaData.FocalLength) : null;
                    const focalLength35 = allMetaData.FocalLengthIn35mmFilm ? parseInt(allMetaData.FocalLengthIn35mmFilm) : null;

                    function getiPhoneLensCategory(focalLength35: number): string {
                        console.log('iPhone Focal Length 35mm:', focalLength35);
                        if (focalLength35 <= 20) return 'Ultra Wide';
                        if (focalLength35 < 52) return 'Main';
                        return 'Telephoto';
                    }
                    function getLensCategory(focalLength35: number): string {
                        if (focalLength35 < 10) return 'Fisheye';
                        if (focalLength35 <= 24) return 'Ultra Wide';
                        if (focalLength35 <= 35) return 'Wide';
                        if (focalLength35 <= 70) return 'Standard';
                        if (focalLength35 <= 200) return 'Telephoto';
                        return 'Super Tele';
                    }

                    if (lens === 'Unknown' && focalLength35) {
                        lens = (make == "Apple") ? getiPhoneLensCategory(focalLength35): getLensCategory(focalLength35);
                    }
                    const exposureTime = allMetaData.ExposureTime ? `1/${Math.round(1 / parseFloat(allMetaData.ExposureTime))}` : null;
                    const fNumber = allMetaData.FNumber ? parseFloat(allMetaData.FNumber) : null;
                    const iso = allMetaData.ISOSpeedRatings || null;

                    const settings = getSettings();
                    let exifString = `${settings.qrExifLabels ? 'Camera: ' : ''}${make} ${model}\n`;
                    exifString += `${settings.qrExifLabels ? 'Lens: ' : ''}${lens}`;
                    exifString += '\n';
                    if (focalLength) {
                        exifString += `${settings.qrExifLabels ? 'Focal Length: ' : ''}${focalLength}mm`;
                        if (focalLength35) exifString += ` (${focalLength35}mm equiv.)`;
                        exifString += '\n';
                    }
                    if (exposureTime && fNumber && iso) {
                        exifString += `${settings.qrExifLabels ? 'Settings: ' : ''}${exposureTime}s at f/${fNumber}, ISO ${iso}\n`;
                    }

                    if (settings.qrExifGps) {
                        const lat = allMetaData.GPSLatitude;
                        const latRef = allMetaData.GPSLatitudeRef;
                        const lon = allMetaData.GPSLongitude;
                        const lonRef = allMetaData.GPSLongitudeRef;
                        const alt = allMetaData.GPSAltitude;
                        const altRef = allMetaData.GPSAltitudeRef;
                        const heading = allMetaData.GPSImgDirection;
                        const headingRef = allMetaData.GPSImgDirectionRef;

                        if (lat && lon) {
                            const latDeg = lat[0] + lat[1]/60 + lat[2]/3600;
                            const latSign = latRef === 'S' ? -1 : 1;
                            const lonDeg = lon[0] + lon[1]/60 + lon[2]/3600;
                            const lonSign = lonRef === 'W' ? -1 : 1;
                            // Round to nearest 10 feet (~0.000027 degrees, so 5 decimal places)
                            const roundedLat = Math.round((latSign * latDeg) * 100000) / 100000;
                            const roundedLon = Math.round((lonSign * lonDeg) * 100000) / 100000;
                            if (settings.qrExifLabels) exifString += 'GPS: ';
                            exifString += `${roundedLat}, ${roundedLon}`;
                            if (alt) {
                                const altVal = parseFloat(alt);
                                const altSign = altRef === 'Below sea level' ? -1 : 1;
                                exifString += `, `;
                                if (settings.qrExifLabels) exifString += 'Alt: ';
                                exifString += `${altSign * Math.round(altVal * 10) / 10}m`;
                            }
                            if (heading) {
                                const headingVal = parseFloat(heading);
                                const roundedHeading = Math.round(headingVal * 10) / 10; // 1 decimal
                                exifString += `, `;
                                if (settings.qrExifLabels) exifString += 'Hdg: ';
                                exifString += `${roundedHeading}° ${headingRef || ''}`;
                            }
                            exifString += '\n';
                        }
                    }

                    if (settings.qrExifMaps) {
                        const lat = allMetaData.GPSLatitude;
                        const latRef = allMetaData.GPSLatitudeRef;
                        const lon = allMetaData.GPSLongitude;
                        const lonRef = allMetaData.GPSLongitudeRef;
                        if (lat && lon) {
                            const latDeg = lat[0] + lat[1]/60 + lat[2]/3600;
                            const latSign = latRef === 'S' ? -1 : 1;
                            const lonDeg = lon[0] + lon[1]/60 + lon[2]/3600;
                            const lonSign = lonRef === 'W' ? -1 : 1;
                            const roundedLat = Math.round((latSign * latDeg) * 100000) / 100000;
                            const roundedLon = Math.round((lonSign * lonDeg) * 100000) / 100000;
                            if (settings.qrExifLabels) exifString += 'gMaps: ';
                            exifString += `https://google.com/maps?q=${roundedLat},${roundedLon}\n`; 
                        }
                    }

                    const qrExifText = document.getElementById('qr-exif-text') as HTMLTextAreaElement;
                    if (qrExifText) qrExifText.value = exifString.trim();

                    drawQrAndFinalize(exifString.trim() || "No EXIF data found.");
                });
                break;
        }
        if (qrContent !== null) {
            drawQrAndFinalize(qrContent);
        }
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(offscreenCanvas, 0, 0);
    }
}

function handleFileUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files![0];
    (event.target as HTMLInputElement).value = '';
    originalImageFile = file;
    const reader = new FileReader();

    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            originalImage = img;
            window.originalImage = img;
            (document.getElementById('qr-exif-labels') as HTMLInputElement).disabled = false;
            (document.getElementById('qr-exif-gps') as HTMLInputElement).disabled = false;
            (document.getElementById('qr-exif-maps') as HTMLInputElement).disabled = false;
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
    const mode = getCurrentMode();

    const uploadStatusContainer = document.getElementById('upload-status-container')!;
    const uploadStatusMessage = document.getElementById('upload-status-message')!;
    const progressBarInner = document.getElementById('upload-progress-bar-inner')!;

    function showRefreshProgress() {
        uploadStatusMessage.textContent = 'Refreshing...';
        (progressBarInner as HTMLElement).offsetHeight;
        (progressBarInner as HTMLElement).style.transition = 'width 35s linear';
        (progressBarInner as HTMLElement).style.width = '100%';
        setTimeout(() => {
            uploadStatusContainer.style.display = 'none';
        }, 35000);
    }

    uploadStatusContainer.style.display = 'block';
    uploadStatusMessage.textContent = 'Uploading to frame...';
    (progressBarInner as HTMLElement).style.transition = 'none';
    (progressBarInner as HTMLElement).style.width = '0%';

    let responseText: string;
    try {
        if (mode === 'proxy-cli') {
            // Send raw image to proxy /cli endpoint
            if (!originalImageFile) {
                alert('No image file available for CLI processing');
                return;
            }
            const formData = new FormData();
            formData.append('image', originalImageFile);

            const settingsJson = JSON.stringify(settings);
            const url = new URL(`${window.location.origin}/cli`);
            url.searchParams.set('settings', settingsJson);

            const response = await fetch(url.toString(), {
                method: 'POST',
                body: formData,
                mode: 'cors'
            });

            if (!response.ok) {
                throw new Error(`Error: ${response.statusText}`);
            }

            responseText = await response.text();
            console.log(`CLI Server response: ${responseText}`);

        } else {
        // Direct or Proxy mode - send processed data
    const blob = new Blob([processedData], { type: 'application/octet-stream' });
const formData = new FormData();
formData.append('data', blob, 'image_data.bin');

let uploadUrl: string;
if (mode === 'direct') {
uploadUrl = `http://${esp32IP}/upload`;
} else {
// Proxy mode - send to proxy server
const proxyUrl = new URL(`${window.location.origin}/upload`);
    proxyUrl.searchParams.set('esp32_ip', esp32IP);
                uploadUrl = proxyUrl.toString();
            }

const response = await fetch(uploadUrl, {
method: 'POST',
body: formData,
mode: 'cors'
});

if (!response.ok) {
throw new Error(`Error: ${response.statusText}`);
}

responseText = await response.text();
console.log(`Server response: ${responseText}`);
}

        // Check for upload success in both modes
        if (responseText && responseText.includes("上传成功")) {
            showRefreshProgress();
            return;
        }

uploadStatusContainer.style.display = 'none';

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
    const qrBackgroundColorSelect = document.getElementById('qr-background-color') as HTMLSelectElement;
    rgbPalette.forEach(color => {
        const option = new Option(color.name, `rgb(${color.r}, ${color.g}, ${color.b})`);
        qrColorSelect.add(option.cloneNode(true) as HTMLOptionElement);
        qrBackgroundColorSelect.add(option as HTMLOptionElement);
    });
    qrColorSelect.value = 'rgb(0, 0, 0)';
    qrBackgroundColorSelect.value = 'rgb(255, 255, 255)';

    document.getElementById('upload')!.addEventListener('change', handleFileUpload);
    document.getElementById('sendToESP32')!.addEventListener('click', sendToESP32);
    document.getElementById('download')!.addEventListener('click', downloadImage);
    document.getElementById('downloadArray')!.addEventListener('click', downloadDataArray);
    document.getElementById('switchToRealTime')!.addEventListener('click', switchToRealTime);
    document.getElementById('switchToSlideShow')!.addEventListener('click', switchToSlideShow);

    checkHealth();
    setInterval(checkHealth, 10000);

    // CLI checkbox change handler
    const cliCheckbox = document.getElementById('proxy-cli-checkbox') as HTMLInputElement;
    if (cliCheckbox) {
        cliCheckbox.addEventListener('change', checkHealth);
    }

    const controlsToMonitor = [
        'ditherMode', 'ditherType', 'rotation', 'scaling',
        'ditherStrength', 'contrast', 'qr-code-toggle', 'qr-content-type',
        'qr-custom-text', 'qr-position', 'qr-margin', 'qr-color', 'qr-background-color', 'qr-border-size',
        'qr-exif-labels', 'qr-exif-gps', 'qr-exif-maps'
    ];

    controlsToMonitor.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            const eventType = (element.tagName === 'INPUT' && (element.getAttribute('type') === 'range' || element.getAttribute('type') === 'number' || element.getAttribute('type') === 'text')) || element.tagName === 'TEXTAREA' ? 'input' : 'change';
            element.addEventListener(eventType, () => {
                updateSettingsTextarea();
                if (eventType === 'input') {
                    debouncedUpdateImage();
                } else {
                    updateImage();
                }
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
    const qrExifContainer = document.getElementById('qr-exif-container') as HTMLDivElement;
    qrContentType.addEventListener('change', () => {
        qrCustomTextContainer.style.display = qrContentType.value === 'custom' ? 'block' : 'none';
        qrExifContainer.style.display = qrContentType.value === 'exif' ? 'block' : 'none';
        updateImage();
    });

    let lastQrColor = qrColorSelect.value;
    let lastQrBackgroundColor = qrBackgroundColorSelect.value;
    qrColorSelect.addEventListener('change', () => {
        if (qrColorSelect.value === qrBackgroundColorSelect.value) {
            qrBackgroundColorSelect.value = lastQrColor;
        }
        lastQrColor = qrColorSelect.value;
        lastQrBackgroundColor = qrBackgroundColorSelect.value;
        updateImage();
    });
    qrBackgroundColorSelect.addEventListener('change', () => {
        if (qrBackgroundColorSelect.value === qrColorSelect.value) {
            qrColorSelect.value = lastQrBackgroundColor;
        }
        lastQrColor = qrColorSelect.value;
        lastQrBackgroundColor = qrBackgroundColorSelect.value;
        updateImage();
    });

    // Scaling UI logic
    const scalingSelect = document.getElementById('scaling') as HTMLSelectElement;
    const customScaleInput = document.getElementById('customScale') as HTMLInputElement;
    const customScaleNumberInput = document.getElementById('customScaleNumber') as HTMLInputElement;

    scalingSelect.addEventListener('change', updateScalingUI);

    customScaleInput.addEventListener('input', () => {
        customScaleNumberInput.value = customScaleInput.value;
        updateScalingUI();
        updateSettingsTextarea();
        debouncedUpdateImage();
    });

    customScaleNumberInput.addEventListener('input', () => {
        customScaleInput.value = customScaleNumberInput.value;
        updateScalingUI();
        updateSettingsTextarea();
        debouncedUpdateImage();
    });

    // Quick scale buttons
    document.querySelectorAll('.quick-scale').forEach(button => {
        button.addEventListener('click', (e) => {
            const scale = (e.target as HTMLElement).getAttribute('data-scale')!;
            customScaleInput.value = scale;
            customScaleNumberInput.value = scale;
            updateScalingUI();
            updateSettingsTextarea();
            updateImage();
        });
    });

    // Initial UI update
    updateScalingUI();

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
            // Force a clean reload by adding a cache-busting query parameter
            location.href = location.href.split('?')[0] + '?t=' + Date.now();
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