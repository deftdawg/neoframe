#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'fs';
import { loadImage, createCanvas, Image } from 'canvas';
import { getConfig, Config } from './src/config';
import { adjustContrast, ditherImage, processImageData } from './src/image-processor';
import { generateQrCode, drawQrCodeOnCanvas } from './src/qr-generator';
import { applyScaling } from './src/scaling';
import { getExifData } from './src/exif-reader';

async function waitForDevice(ip: string, timeout: number) {
    console.log(`Waiting for device at ${ip} to come online...`);
    const end = Date.now() + timeout * 1000;
    while (Date.now() < end) {
        try {
            const response = await fetch(`http://${ip}/`, { method: 'GET', signal: AbortSignal.timeout(1000) });
            if (response.status === 500) {
                console.log('Device is online.');
                return true;
            }
        } catch (error) {
            // Ignore errors until timeout
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.error(`Device at ${ip} did not come online within ${timeout} seconds.`);
    return false;
}

async function main() {
    const args = process.argv.slice(2);
    const imagePathOrUrlIndex = args.findIndex(arg => !arg.startsWith('--'));
    const imagePathOrUrl = args[imagePathOrUrlIndex];
    const configStrOrPathIndex = args.findIndex(arg => arg.endsWith('.json') || arg.startsWith('{'));
    const configStrOrPath = args[configStrOrPathIndex];

    const waitForOnlineIndex = args.indexOf('--wait-for-online');
    let waitForOnlineTimeout = 0;
    if (waitForOnlineIndex !== -1 && args[waitForOnlineIndex + 1]) {
        waitForOnlineTimeout = parseInt(args[waitForOnlineIndex + 1], 10);
    }

    if (!imagePathOrUrl || !configStrOrPath) {
        console.error('Usage: ./dist/cli.js <path_to_image_or_url> <json_config_string_or_path_to_json> [--wait-for-online <seconds>]');
        process.exit(1);
    }

    let config: Partial<Config>;
    try {
        config = JSON.parse(configStrOrPath);
    } catch (e) {
        try {
            config = JSON.parse(readFileSync(configStrOrPath, 'utf-8'));
        } catch (fileError) {
            console.error('Error: Invalid configuration. Please provide a valid JSON string or a path to a valid JSON file.');
            process.exit(1);
        }
    }

    const settings = getConfig(config);

    try {
        console.log('Loading image...');
        const image = await loadImage(imagePathOrUrl);

        const frameWidth = 1200;
        const frameHeight = 1600;
        const canvas = createCanvas(frameWidth, frameHeight);
        const ctx = canvas.getContext('2d');

        console.log('Processing image...');

        const rotatedCanvas = createCanvas(image.width, image.height);
        const rotatedCtx = rotatedCanvas.getContext('2d');

        const rotation = parseInt(settings.rotation, 10);
        if (rotation === 90 || rotation === 270) {
            rotatedCanvas.width = image.height;
            rotatedCanvas.height = image.width;
        }

        rotatedCtx.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
        rotatedCtx.rotate(rotation * Math.PI / 180);
        rotatedCtx.drawImage(image, -image.width / 2, -image.height / 2);

        const sourceImage = rotatedCanvas;

        const scalingMode = settings.scaling;

        const offscreenCanvas = createCanvas(frameWidth, frameHeight);
        const offscreenCtx = offscreenCanvas.getContext('2d');

        offscreenCtx.fillStyle = 'white';
        offscreenCtx.fillRect(0, 0, frameWidth, frameHeight);

        const { imageBoundingBox } = applyScaling(sourceImage, offscreenCtx, settings, frameWidth, frameHeight);

        const imageData = offscreenCtx.getImageData(0, 0, frameWidth, frameHeight);
        adjustContrast(imageData, parseFloat(settings.contrast));
        ditherImage(imageData, settings);
        offscreenCtx.putImageData(imageData, 0, 0);

        ctx.drawImage(offscreenCanvas, 0, 0);

        if (settings.qrCodeEnabled) {
            console.log('Generating QR code...');
            let qrContent = '';
            switch (settings.qrContentType) {
                case 'url':
                    qrContent = settings.qrCustomText || 'https://github.com/deftdawg/neoframe';
                    break;
                case 'wifi':
                    qrContent = `WIFI:T:WPA;S:NeoFrame;P:123456789;H:false;`;
                    break;
                case 'custom':
                    qrContent = settings.qrCustomText;
                    break;
                case 'exif':
                    const imageBuffer = readFileSync(imagePathOrUrl);
                    const exifData = await getExifData(imageBuffer);
                    console.log('CLI EXIF Data:', JSON.stringify(exifData, null, 2));
                    let exifString = '';
                    if (exifData && exifData.tags) {
                        const allMetaData = exifData.tags;
                        const make = allMetaData.Make || 'Unknown';
                        const model = allMetaData.Model || 'Unknown';
                        let lens = allMetaData.LensModel || allMetaData.LensInfo || 'Unknown';
                        const focalLength = allMetaData.FocalLength ? parseFloat(allMetaData.FocalLength) : null;
                        const focalLength35 = allMetaData.FocalLengthIn35mmFilm ? parseInt(allMetaData.FocalLengthIn35mmFilm) : null;

                        function getiPhoneLensCategory(focalLength35: number): string {
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

                        exifString = `${settings.qrExifLabels ? 'Camera: ' : ''}${make} ${model}\n`;
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
                                    const roundedHeading = Math.round(headingVal * 10) / 10;
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
                    }
                    console.log('exifString:', JSON.stringify(exifString));
                    if (exifString) qrContent = exifString;
                    console.log('qrContent for exif:', JSON.stringify(qrContent));
                    break;
            }
            if (qrContent && qrContent.trim()) {
                console.log('Generating QR code for content:', JSON.stringify(qrContent));
                const qrCanvas = await generateQrCode(qrContent, settings);
                console.log('QR canvas created, size:', qrCanvas.width, 'x', qrCanvas.height);
                drawQrCodeOnCanvas(ctx, qrCanvas, settings, rotation, imageBoundingBox);
                console.log('QR code drawn on image');
            } else {
                console.log('No QR content to generate');
            }
        }

        console.log('Image processing complete.');

        const finalImageData = processImageData(ctx.getImageData(0, 0, frameWidth, frameHeight), settings);

        if (waitForOnlineTimeout > 0) {
            const online = await waitForDevice(settings.esp32Ip, waitForOnlineTimeout);
            if (!online) {
                process.exit(1);
            }
        }

        try {
            console.log('Uploading to frame...');
            const esp32IP = settings.esp32Ip;
            const blob = new Blob([finalImageData], { type: 'application/octet-stream' });
            const formData = new FormData();
            formData.append('data', blob, 'image_data.bin');

            const response = await fetch(`http://${esp32IP}/upload`, {
                method: 'POST',
                body: formData as any,
            });

            if (!response.ok) {
                throw new Error(`Error uploading to frame: ${response.statusText}`);
            }

            const responseText = await response.text();
            console.log('Upload response:', responseText);
            console.log('Successfully uploaded image to the frame.');
        } catch (uploadError) {
            console.error('An error occurred during upload:', uploadError.message);
        } finally {
            const outPath = 'dithered_image.png';
            try {
                writeFileSync(outPath, canvas.toBuffer('image/png'));
                console.log(`Dithered image saved to ${outPath}`);
            } catch (saveError) {
                console.error('Error saving dithered image:', saveError.message);
            }
        }
    } catch (error) {
        console.error('An error occurred during image processing:', error.message);
        if (error.cause) {
            console.error('Cause:', error.cause);
        }
        process.exit(1);
    }
}

main();