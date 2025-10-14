import { Config } from './config';
import { adjustContrast as adjustContrastAlgo, ditherImage as ditherImageAlgo, processImageData as processImageDataAlgo } from './algorithms';

export function adjustContrast(imageData: ImageData, factor: number) {
    return adjustContrastAlgo(imageData, factor);
}

export function ditherImage(imageData: ImageData, config: Config) {
    return ditherImageAlgo(imageData, config);
}

export function processImageData(imageData: ImageData, config: Config) {
    return processImageDataAlgo(imageData, config);
}