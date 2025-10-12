await Bun.build({
    entrypoints: ['./cli.ts'],
    outdir: './dist',
    target: 'bun',
    minify: true,
});

console.log('CLI build complete.');