import { serve } from 'bun';

serve({
  fetch(req) {
    const url = new URL(req.url);
    const filepath = url.pathname === '/' ? '/neoframe.html' : url.pathname;
    const file = Bun.file(`.${filepath}`);
    return new Response(file);
  },
  error() {
    return new Response(null, { status: 404 });
  }
});

console.log("Listening on http://localhost:3000");