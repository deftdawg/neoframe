import { test, expect } from 'bun:test';
import { getConfig, defaultConfig } from './config';

test('getConfig with no overrides', () => {
    const config = getConfig();
    expect(config).toEqual(defaultConfig);
    expect(config.renderMode).toBe('auto');
    expect(config.inkSaturation).toBe('0.5');
    expect(config.splitMode).toBe('none');
    expect(config.splitRenderMode).toBe('auto');
    expect(config.splitRenderModeC).toBe('auto');
    expect(config.splitDitherTypeC).toBe('');
});

test('getConfig with overrides', () => {
    const overrides = {
        esp32Ip: '1.2.3.4',
        ditherMode: 'fourColor',
        renderMode: 'vivid',
        inkSaturation: '0.7',
        splitMode: 'diagonal',
        splitRenderMode: 'photo',
        splitRenderModeC: 'legacy',
    };
    const config = getConfig(overrides);
    expect(config.esp32Ip).toBe('1.2.3.4');
    expect(config.ditherMode).toBe('fourColor');
    expect(config.renderMode).toBe('vivid');
    expect(config.inkSaturation).toBe('0.7');
    expect(config.splitMode).toBe('diagonal');
    expect(config.splitRenderMode).toBe('photo');
    expect(config.splitRenderModeC).toBe('legacy');
    expect(config.ditherType).toBe(defaultConfig.ditherType);
});