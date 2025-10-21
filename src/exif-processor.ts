export function processExifData(allMetaData: any, settings: any): string {
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

    return exifString.trim();
}
