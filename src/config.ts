export const defaultConfig = {
  esp32Ip: '192.168.4.1',
  ditherMode: 'sixColor',
  ditherType: 'floydSteinberg',
  rotation: '0',
  scaling: 'fill',
  customScale: '100',
  ditherStrength: '1.0',
  contrast: '1.2',
  qrCodeEnabled: false,
  qrContentType: 'url',
  qrCustomText: '',
  qrPosition: 'bottom-right',
  qrMargin: '20',
  qrColor: 'rgb(0, 0, 0)',
  qrBackgroundColor: 'rgb(255, 255, 255)',
   qrBorderSize: '1',
  autosave: false,
};

export type Config = typeof defaultConfig;

export function getConfig(json?: Partial<Config>): Config {
  return { ...defaultConfig, ...json };
}