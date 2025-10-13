import { ExifImage } from 'exif';

export function getExifData(imageBuffer: Buffer): Promise<any> {
    return new Promise((resolve) => {
        try {
            new ExifImage({ image: imageBuffer }, (error, exifData) => {
                if (error) {
                    console.error('Error parsing EXIF data:', error.message);
                    resolve(null);
                } else {
                    resolve(exifData);
                }
            });
        } catch (e: any) {
            console.error("Error parsing EXIF data:", e.message);
            resolve(null);
        }
    });
}