const exifr = require('exifr');

export function getExifData(imageBuffer: Buffer): Promise<any> {
    try {
        return exifr.parse(imageBuffer).then((exifData: any) => {
            return { tags: exifData };
        }).catch((error: any) => {
            console.error('Error parsing EXIF data:', error.message);
            return null;
        });
    } catch (e: any) {
        console.error("Error parsing EXIF data:", e.message);
        return Promise.resolve(null);
    }
}