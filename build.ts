await Bun.build({
    entrypoints: ['./src/main.ts'],
    outdir: './dist',
    target: 'browser',
    minify: true,
});

console.log('Build complete.');