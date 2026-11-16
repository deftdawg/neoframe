import { test, expect } from 'bun:test';
import { getConfig, defaultConfig } from './config';

test('getConfig with no overrides', () => {
    const config = getConfig();
    expect(config).toEqual(defaultConfig);
    expect(config.renderMode).toBe('auto');
    expect(config.inkSaturation).toBe('0.5');
    expect(config.splitMode).toBe('none');
    expect(config.splitRenderMode).toBe('photo');
});

test('getConfig with overrides', () => {
    const overrides = {
        esp32Ip: '1.2.3.4',
        ditherMode: 'fourColor',
        renderMode: 'vivid',
        inkSaturation: '0.7',
        splitMode: 'left-right',
        splitRenderMode: 'graphics',
    };
    const config = getConfig(overrides);
    expect(config.esp32Ip).toBe('1.2.3.4');
    expect(config.ditherMode).toBe('fourColor');
    expect(config.renderMode).toBe('vivid');
    expect(config.inkSaturation).toBe('0.7');
    expect(config.splitMode).toBe('left-right');
    expect(config.splitRenderMode).toBe('graphics');
    expect(config.ditherType).toBe(defaultConfig.ditherType);
});