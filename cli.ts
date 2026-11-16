#!/usr/bin/env bun
import { readFileSync, writeFileSync, statSync, existsSync } from 'fs';
import { setDefaultResultOrder } from 'node:dns';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { getConfig, Config } from './src/config';
import { detectContentMode } from './src/algorithms';
import { renderFrameImageData, processImageData } from './src/image-processor';
import { applyScaling } from './src/scaling';
import { generateQrContent } from './src/qr-content-generator';

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

async function ensureCompatibleFontconfig() {
    if (process.env.FONTCONFIG_FILE || process.platform !== 'linux') return;
    const guessFamilyConf = '/etc/fonts/conf.d/48-guessfamily.conf';
    try {
        if (!existsSync(guessFamilyConf)) return;
        const contents = readFileSync(guessFamilyConf, 'utf-8');
        if (!contents.includes('xsi:nil')) return;

        const fallbackConfPath = '/tmp/neoframe-fonts.conf';
        const fallbackConf = [
            '<?xml version="1.0"?>',
            '<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">',
            '<fontconfig>',
            '  <dir>/run/current-system/sw/share/X11/fonts</dir>',
            '  <dir>/usr/share/fonts</dir>',
            '  <cachedir>/tmp/neoframe-fontcache</cachedir>',
            '</fontconfig>',
            '',
        ].join('\n');
        writeFileSync(fallbackConfPath, fallbackConf);
        process.env.FONTCONFIG_FILE = fallbackConfPath;

        // Bun's JS process.env assignments do not always update C environ for native addons like node-canvas.
        const { dlopen, FFIType } = await import('bun:ffi');
        const libc = dlopen('libc.so.6', {
            setenv: { args: [FFIType.cstring, FFIType.cstring, FFIType.i32], returns: FFIType.i32 },
        });
        libc.symbols.setenv(Buffer.from('FONTCONFIG_FILE\0'), Buffer.from(`${fallbackConfPath}\0`), 1);
    } catch {
        // Ignore fontconfig workaround errors and fall back to system config
    }
}

function enableIpv4FirstDns() {
    try {
        setDefaultResultOrder('ipv4first');
    } catch (error) {
        console.warn('Unable to set IPv4-first DNS result ordering:', errorMessage(error));
    }
}

async function resolveHttpUrlIpv4First(url: string, headers?: HeadersInit) {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'http:' || isIP(parsedUrl.hostname)) {
        return null;
    }

    try {
        const address = await lookup(parsedUrl.hostname, { family: 4 });
        const hostHeader = parsedUrl.host;
        parsedUrl.hostname = address.address;

        const resolvedHeaders = new Headers(headers);
        if (!resolvedHeaders.has('Host')) {
            resolvedHeaders.set('Host', hostHeader);
        }

        return { url: parsedUrl.toString(), headers: resolvedHeaders };
    } catch (error) {
        console.warn(`Could not resolve ${parsedUrl.hostname} to an IPv4 address, using original URL:`, errorMessage(error));
        return null;
    }
}

async function fetchImageUrl(url: string, options: RequestInit, resolveUrlIpv4First: boolean) {
    if (!resolveUrlIpv4First) {
        return fetch(url, options);
    }

    const resolved = await resolveHttpUrlIpv4First(url, options.headers);
    if (!resolved) {
        return fetch(url, options);
    }

    try {
        return await fetch(resolved.url, { ...options, headers: resolved.headers });
    } catch (error) {
        console.warn(`IPv4 fetch failed for ${url}, retrying original URL:`, errorMessage(error));
        return fetch(url, options);
    }
}

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

const VALID_RENDER_MODES = new Set(['auto', 'vivid', 'photo', 'graphics', 'legacy']);
const VALID_SPLIT_MODES = new Set(['none', 'left-right', 'top-bottom']);
const VALUE_FLAGS = new Set([
    '--wait-for-online',
    '--if-modified-since',
    '--render-mode',
    '--split',
    '--split-mode-a',
    '--split-mode-b',
]);

function getFlagValue(args: string[], flag: string): string | undefined {
    const idx = args.indexOf(flag);
    if (idx !== -1 && idx + 1 < args.length && !args[idx + 1].startsWith('--')) {
        return args[idx + 1];
    }
    return undefined;
}

function getPositionalArgs(args: string[]): string[] {
    const positional: string[] = [];
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (VALUE_FLAGS.has(arg)) {
            i++;
            continue;
        }
        if (arg.startsWith('--') || arg === '-d') continue;
        positional.push(arg);
    }
    return positional;
}

function expandDetectTargets(inputs: string[]): string[] {
    const targets: string[] = [];
    for (const input of inputs) {
        if (input.startsWith('http') || existsSync(input) || !/[*?[]/.test(input)) {
            targets.push(input);
            continue;
        }
        const isAbs = input.startsWith('/');
        const pattern = isAbs ? input.slice(1) : input;
        const cwd = isAbs ? '/' : '.';
        const matches = Array.from(new Bun.Glob(pattern).scanSync({ cwd, followSymlinks: true }))
            .map((match) => (isAbs ? `/${match}` : match))
            .sort();
        targets.push(...(matches.length > 0 ? matches : [input]));
    }
    return targets;
}

async function runDetectMode(
    inputs: string[],
    resolveUrlIpv4First: boolean,
    canvasMod: typeof import('canvas')
) {
    const { loadImage, createCanvas } = canvasMod;
    const targets = expandDetectTargets(inputs);
    if (targets.length === 0) {
        console.error('Usage: ./dist/cli.js --detect <image_path_or_url_or_glob...>');
        process.exit(1);
    }

    const useColor = !process.env.NO_COLOR;
    const colorize = (code: string, text: string) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
    const maxNameLen = Math.max(...targets.map((target) => target.length));

    for (const target of targets) {
        const paddedName = colorize('1;37', target.padEnd(maxNameLen));
        try {
            let image;
            if (target.startsWith('http')) {
                const response = await fetchImageUrl(target, {}, resolveUrlIpv4First);
                if (!response.ok) {
                    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
                }
                const buffer = await response.arrayBuffer();
                image = await loadImage(Buffer.from(buffer));
            } else {
                image = await loadImage(target);
            }

            const canvas = createCanvas(image.width, image.height);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0);
            const imageData = ctx.getImageData(0, 0, image.width, image.height);
            const result = detectContentMode(imageData as unknown as ImageData);
            const isGraphics = result.mode === 'graphics';

            const typeLabel = isGraphics
                ? colorize('1;36', 'graphic')
                : colorize('1;32', 'photo  ');
            const renderModeValue = isGraphics
                ? colorize('33', result.mode)
                : colorize('35', result.mode);

            const { flatRatio, uniqueColors, top10Share, smoothGradientRatio } = result.metrics;
            const flatStr = colorize(flatRatio > 0.55 ? '36' : '32', flatRatio.toFixed(2));
            const uniqStr = colorize(uniqueColors < 1200 ? '36' : '32', String(uniqueColors));
            const top10Str = colorize(top10Share > 0.65 ? '36' : '32', top10Share.toFixed(2));
            const gradStr = colorize(smoothGradientRatio < 0.20 ? '36' : '32', smoothGradientRatio.toFixed(2));

            console.log(
                `${paddedName}  ${typeLabel}  ` +
                `${colorize('2', '(renderMode=')}${renderModeValue}` +
                `${colorize('2', ', flatRatio=')}${flatStr}` +
                `${colorize('2', ', uniqueColors=')}${uniqStr}` +
                `${colorize('2', ', top10Share=')}${top10Str}` +
                `${colorize('2', ', smoothGrad=')}${gradStr}` +
                `${colorize('2', ')')}`
            );
        } catch (error) {
            console.log(`${paddedName}  ${colorize('1;31', 'error  ')}  ${colorize('31', `(${errorMessage(error)})`)}`);
        }
    }
}

function printUsage() {
    console.error('Usage:');
    console.error('  ./dist/cli.js <path_to_image_or_url> <json_config_string_or_path_to_json> [--wait-for-online <seconds>] [--if-modified-since <timestamp>] [--resolve-url-ipv4-first] [--render-mode <auto|vivid|photo|graphics|legacy>] [--split <none|left-right|top-bottom>] [--split-mode-a <mode>] [--split-mode-b <mode>]');
    console.error('  ./dist/cli.js --detect <image_path_or_url_or_glob...>');
}

async function main() {
    await ensureCompatibleFontconfig();
    const canvasMod = await import('canvas');
    const { loadImage, createCanvas } = canvasMod;
    const args = process.argv.slice(2);
    const positionalArgs = getPositionalArgs(args);

    if (args.includes('--detect') || args.includes('--classify') || args.includes('-d')) {
        const resolveUrlIpv4First = args.includes('--resolve-url-ipv4-first');
        if (resolveUrlIpv4First) {
            enableIpv4FirstDns();
        }
        await runDetectMode(positionalArgs, resolveUrlIpv4First, canvasMod);
        return;
    }

    const [imagePathOrUrl, configStrOrPath] = positionalArgs;

    const waitForOnlineStr = getFlagValue(args, '--wait-for-online');
    const waitForOnlineTimeout = waitForOnlineStr ? parseInt(waitForOnlineStr, 10) : 0;

    const ifModifiedSinceStr = getFlagValue(args, '--if-modified-since');
    const ifModifiedSince = ifModifiedSinceStr ? parseInt(ifModifiedSinceStr, 10) : 0;

    const renderModeFlag = getFlagValue(args, '--render-mode');
    const splitFlag = getFlagValue(args, '--split');
    const splitModeAFlag = getFlagValue(args, '--split-mode-a');
    const splitModeBFlag = getFlagValue(args, '--split-mode-b');

    if (!imagePathOrUrl || !configStrOrPath) {
        printUsage();
        process.exit(1);
    }

    for (const [flag, val] of [
        ['--render-mode', renderModeFlag],
        ['--split-mode-a', splitModeAFlag],
        ['--split-mode-b', splitModeBFlag],
    ] as const) {
        if (val !== undefined && !VALID_RENDER_MODES.has(val)) {
            console.error(`Error: Invalid value "${val}" for ${flag}. Expected one of: auto, vivid, photo, graphics, legacy`);
            process.exit(1);
        }
    }
    if (splitFlag !== undefined && !VALID_SPLIT_MODES.has(splitFlag)) {
        console.error(`Error: Invalid value "${splitFlag}" for --split. Expected one of: none, left-right, top-bottom`);
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
    if (renderModeFlag) settings.renderMode = renderModeFlag;
    if (splitModeAFlag) settings.renderMode = splitModeAFlag;
    if (splitModeBFlag) settings.splitRenderMode = splitModeBFlag;
    if (splitFlag) settings.splitMode = splitFlag;

    const resolveUrlIpv4First = settings.resolveUrlIpv4First || args.includes('--resolve-url-ipv4-first');
    if (resolveUrlIpv4First) {
        enableIpv4FirstDns();
    }

    // Check for duplicate local image file
    let shouldUpdateLastFile = false;
    if (!imagePathOrUrl.startsWith('http')) {
        const fileStats = statSync(imagePathOrUrl);
        const currentSize = fileStats.size;
        const lastFilePath = '/tmp/neoframe.last';
        if (existsSync(lastFilePath)) {
            const lastSizeStr = readFileSync(lastFilePath, 'utf-8');
            const lastSize = parseInt(lastSizeStr, 10);
            if (lastSize === currentSize) {
                console.log(`Error: ${imagePathOrUrl} is the same size as the last image sent to the frame (remove /tmp/neoframe.last to resend or provide an image file with a different size)`);
                process.exit(100);
            }
        }
        shouldUpdateLastFile = true;
    }

    try {
        console.log('Loading image...');
        let image;
        if (imagePathOrUrl.startsWith('http')) {
            const fetchOptions: any = {};
            if (ifModifiedSince > 0) {
                const date = new Date(ifModifiedSince * 1000);
                fetchOptions.headers = {
                    'If-Modified-Since': date.toUTCString()
                };
            }
            const response = await fetchImageUrl(imagePathOrUrl, fetchOptions, resolveUrlIpv4First);
            if (response.status === 304) {
                const isoDate = new Date(ifModifiedSince * 1000).toISOString().replace('T', ' ').slice(0, 19);
                console.log(`Web server reports image as unchanged since ${ifModifiedSince} (${isoDate})`);
                process.exit(100);
            }
            if (!response.ok) {
                throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
            }
            const buffer = await response.arrayBuffer();
            image = await loadImage(Buffer.from(buffer));
        } else {
            image = await loadImage(imagePathOrUrl);
        }

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
        renderFrameImageData(imageData, settings, {
            rotation,
            imageBoundingBox,
            onLog: (message) => console.log(message),
        });
        offscreenCtx.putImageData(imageData, 0, 0);

        ctx.drawImage(offscreenCanvas, 0, 0);

        if (settings.qrCodeEnabled) {
            console.log('Generating QR code...');
            const qrContent = await generateQrContent({
                qrContentType: settings.qrContentType,
                qrCustomText: settings.qrCustomText,
                qrExifLabels: settings.qrExifLabels,
                qrExifGps: settings.qrExifGps,
                qrExifMaps: settings.qrExifMaps,
                imagePathOrBuffer: imagePathOrUrl,
                isBrowser: false
            });
            if (qrContent && qrContent.trim()) {
                const { generateQrCode, drawQrCodeOnCanvas } = await import('./src/qr-generator');
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

            // Save dithered image
            const outPath = 'dithered_image.png';
            try {
                writeFileSync(outPath, canvas.toBuffer('image/png'));
                console.log(`Dithered image saved to ${outPath}`);
            } catch (saveError) {
                console.error('Error saving dithered image:', saveError.message);
            }

            // Update last file if needed
            if (shouldUpdateLastFile) {
                const fileStats = statSync(imagePathOrUrl);
                const currentSize = fileStats.size;
                const lastFilePath = '/tmp/neoframe.last';
                writeFileSync(lastFilePath, currentSize.toString());
            }
        } catch (uploadError) {
            console.error('An error occurred during upload:', uploadError.message);
            process.exit(1);
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
