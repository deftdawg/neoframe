import { test, expect } from 'bun:test';
import { getConfig, defaultConfig } from './config';

test('getConfig with no overrides', () => {
    const config = getConfig();
    expect(config).toEqual(defaultConfig);
});

test('getConfig with overrides', () => {
    const overrides = {
        esp32Ip: '1.2.3.4',
        ditherMode: 'fourColor',
    };
    const config = getConfig(overrides);
    expect(config.esp32Ip).toBe('1.2.3.4');
    expect(config.ditherMode).toBe('fourColor');
    expect(config.ditherType).toBe(defaultConfig.ditherType);
});