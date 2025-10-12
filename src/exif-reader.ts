import { readFileSync } from 'fs';
import * as exifParser from 'exif-parser';

export function getExifData(imageBuffer: Buffer): any {
    try {
        const parser = exifParser.create(imageBuffer);
        return parser.parse();
    } catch (e) {
        console.error("Error parsing EXIF data:", e);
        return null;
    }
}