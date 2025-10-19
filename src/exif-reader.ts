const ExifImage = require('exif').ExifImage;

export function getExifData(imageBuffer: Buffer): Promise<any> {
    return new Promise((resolve) => {
        try {
            new ExifImage({ image: imageBuffer }, (error, exifData) => {
                if (error) {
                    console.error('Error parsing EXIF data:', error.message);
                    resolve(null);
                } else {
                    // Combine exif, gps, image into tags to match exif-js structure
                    const tags = { ...exifData.exif, ...exifData.gps, ...exifData.image };
                    resolve({ tags });
                }
            });
        } catch (e: any) {
            console.error("Error parsing EXIF data:", e.message);
            resolve(null);
        }
    });
}