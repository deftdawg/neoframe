import { chmod } from 'fs/promises';

try {
    const result = await Bun.build({
        entrypoints: ['./cli.ts'],
        outdir: './dist',
        target: 'bun',
        minify: true,
        external: ['canvas'],
    });

    if (result.success) {
        await chmod('./dist/cli.js', '755');
        console.log('CLI build complete.');
    } else {
        console.error('CLI build failed:');
        for (const message of result.logs) {
            console.error(message);
        }
    }
} catch (error) {
    console.error('An unexpected error occurred during the CLI build:', error);
}