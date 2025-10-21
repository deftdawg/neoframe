import { getExifData } from './exif-reader';
import { processExifData } from './exif-processor';

export interface QrContentParams {
    qrContentType: string;
    qrCustomText?: string;
    qrExifLabels?: boolean;
    qrExifGps?: boolean;
    qrExifMaps?: boolean;
    imagePathOrBuffer?: string | Buffer;
    isBrowser?: boolean;
    originalImage?: HTMLImageElement;
}

export async function generateQrContent(params: QrContentParams): Promise<string | null> {
    const {
        qrContentType,
        qrCustomText,
        qrExifLabels = true,
        qrExifGps = false,
        qrExifMaps = false,
        imagePathOrBuffer,
        isBrowser = false,
        originalImage
    } = params;

    let qrContent: string | null = null;

    switch (qrContentType) {
        case 'url':
            qrContent = qrCustomText || 'https://github.com/deftdawg/neoframe';
            break;
        case 'wifi':
            qrContent = `WIFI:T:WPA;S:NeoFrame;P:123456789;H:false;`;
            break;
        case 'custom':
            qrContent = qrCustomText || '';
            break;
        case 'exif':
            if (isBrowser && originalImage) {
                // Browser implementation
                return new Promise((resolve) => {
                    import('@sitemark/exifr').then((exifr: any) => {
                        (exifr.default || exifr).parse(originalImage).then((allMetaData: any) => {
                            const hasExif = !!(allMetaData?.Make || allMetaData?.Model || allMetaData?.LensModel || allMetaData?.LensInfo || allMetaData?.FocalLength || allMetaData?.FocalLengthIn35mmFilm || allMetaData?.ExposureTime || allMetaData?.FNumber || allMetaData?.ISOSpeedRatings || allMetaData?.GPSLatitude);
                            if (!hasExif) {
                                resolve(null);
                                return;
                            }

                            const settings = { qrExifLabels, qrExifGps, qrExifMaps };
                            const exifString = processExifData(allMetaData, settings);
                            resolve(exifString || null);
                        }).catch(() => {
                            resolve(null);
                        });
                    }).catch(() => {
                        resolve(null);
                    });
                });
            } else if (!isBrowser && imagePathOrBuffer) {
                // CLI implementation
                try {
                    const exifData = await getExifData(imagePathOrBuffer as Buffer);
                    if (exifData && exifData.tags) {
                        const settings = { qrExifLabels, qrExifGps, qrExifMaps };
                        const exifString = processExifData(exifData.tags, settings);
                        qrContent = exifString || null;
                    }
                } catch (error) {
                    console.error('Error parsing EXIF data:', error);
                }
            }
            break;
    }

    return qrContent;
}
