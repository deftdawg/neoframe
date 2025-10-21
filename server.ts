import { serve } from "bun";
import { readFile, writeFile, unlink } from "fs/promises";
import { join } from "path";
import { createCanvas } from "canvas";

const MAX_IMAGE_SIZE_MB = 50;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

async function handleHealth(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Health check: Verify both proxy server AND ESP32 connectivity
    if (url.pathname === "/health") {
        // Get ESP32 IP from query parameter (passed by frontend)
        const esp32Ip = url.searchParams.get("esp32_ip") || "192.168.4.1";

        try {
            // Try to check downstream ESP32 health
            const esp32Response = await fetch(`http://${esp32Ip}/health`, {
                method: "GET",
                signal: AbortSignal.timeout(3000), // 3 second timeout
            });

            // Any HTTP response from ESP32 means it's reachable/healthy
            // Only network errors mean unreachable
            return new Response("OK", { status: 200 });

        } catch (error) {
            // ESP32 not reachable (network error)
            return new Response("ESP32 unreachable", { status: 504 });
        }
    }

    return new Response("Not Found", { status: 404 });
}

async function handleCli(request: Request): Promise<Response> {
    if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
    }

    try {
        const url = new URL(request.url);
        const settingsParam = url.searchParams.get("settings");

        if (!settingsParam) {
            return new Response("Missing settings parameter", { status: 400 });
        }

        // Parse settings to get ESP32 IP
        let settings: any;
        try {
            settings = JSON.parse(settingsParam);
        } catch (error) {
            return new Response("Invalid JSON in settings parameter", { status: 400 });
        }

        const esp32Ip = settings.esp32Ip || "192.168.4.1";
        let imagePath: string | null = null;

        // Check if we have form data with image file
        const contentType = request.headers.get("content-type") || "";
        if (contentType.includes("multipart/form-data")) {
            const formData = await request.formData();
            const imageFile = formData.get("image") as File | null;

            if (imageFile) {
                if (imageFile.size > MAX_IMAGE_SIZE_BYTES) {
                    return new Response(`Image file too large. Maximum size: ${MAX_IMAGE_SIZE_MB}MB`, { status: 413 });
                }

                // Save uploaded image to temp file with appropriate extension
                let extension = "";
                if (imageFile.type === "image/png") {
                    extension = ".png";
                } else if (imageFile.type === "image/jpeg") {
                    extension = ".jpg";
                } else if (imageFile.type === "image/gif") {
                    extension = ".gif";
                } else {
                    extension = ".bin"; // fallback
                }
                imagePath = `/tmp/neoframe-uploaded-image${extension}`;
                const imageBuffer = await imageFile.arrayBuffer();
                await writeFile(imagePath, new Uint8Array(imageBuffer));
            } else {
                return new Response("Missing image in form data", { status: 400 });
            }
        } else {
            return new Response("Expected multipart form data with image", { status: 400 });
        }

        // Run CLI processing
        let uploadResponse = "CLI processing completed";
        try {
            const cliProcess = Bun.spawn(['./cli.ts', imagePath, JSON.stringify(settings)], {
                cwd: process.cwd(),
                stdout: 'pipe',
                stderr: 'pipe'
            });

            const exitCode = await cliProcess.exited;
            const stdout = await new Response(cliProcess.stdout).text();
            const stderr = await new Response(cliProcess.stderr).text();

            if (exitCode !== 0) {
                console.error("CLI stderr:", stderr);
                return new Response(`CLI processing failed: ${stderr}`, { status: 500 });
            }

            console.log("CLI stdout:", stdout);

            // Extract the upload response from CLI output
            const uploadResponseMatch = stdout.match(/Upload response: (.+)/);
            uploadResponse = uploadResponseMatch ? uploadResponseMatch[1] : "CLI processing completed";

        } catch (error) {
            console.error("Failed to run CLI:", error);
            return new Response("Failed to run CLI processing", { status: 500 });
        }

        // Clean up temp file
        if (imagePath) {
            try {
                await unlink(imagePath);
            } catch (error) {
                console.error("Failed to clean up temp file:", error);
            }
        }

        return new Response(uploadResponse, { status: 200 });

    } catch (error) {
        console.error("CLI processing error:", error);
        return new Response("Internal server error", { status: 500 });
    }
}

async function handleProxy(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Get ESP32 IP from query parameters or default
    const esp32Ip = url.searchParams.get("esp32_ip") || "192.168.4.1";
    const esp32Url = `http://${esp32Ip}${url.pathname}${url.search}`;

    let body: ArrayBuffer | undefined = undefined;
    if (request.method !== "GET" && request.method !== "HEAD") {
        body = await request.arrayBuffer();
    }

    // Special handling for /upload: capture image_data.bin and convert to PNG
    if (url.pathname === "/upload" && request.method === "POST" && body) {
        try {
            // Create a temporary request to parse form data
            const tempRequest = new Request('http://dummy', {
                    method: request.method,
                    headers: request.headers,
                    body: body
                });
            const formData = await tempRequest.formData();
            const imageFile = formData.get("data") as File | null;
            if (imageFile) {
                const imageBuffer = await imageFile.arrayBuffer();
                const data = new Uint8Array(imageBuffer);
                // Assume sixColor format, 1200x1600 pixels, packed 2 pixels per byte (3 bits each)
                const width = 1200;
                const height = 1600;
                const colorMap = [
                        [0, 0, 0, 255],       // black
                        [255, 255, 255, 255], // white
                        [255, 255, 0, 255],   // yellow
                        [255, 0, 0, 255],     // red
                        [255, 255, 255, 255], // white (unused)
                        [0, 0, 255, 255],     // blue
                        [0, 255, 0, 255],     // green
                        [255, 255, 255, 255]  // white (unused)
                    ];
                const canvas = createCanvas(width, height);
                const ctx = canvas.getContext('2d');
                const imageData = ctx.createImageData(width, height);
                let dataIndex = 0;
                for (let i = 0; i < data.length; i++) {
                    const byte = data[i];
                    const color1 = (byte >> 4) & 0x07;
                    const color2 = byte & 0x07;
                    const rgba1 = colorMap[color1];
                    const rgba2 = colorMap[color2];
                    imageData.data[dataIndex++] = rgba1[0];
                    imageData.data[dataIndex++] = rgba1[1];
                    imageData.data[dataIndex++] = rgba1[2];
                    imageData.data[dataIndex++] = rgba1[3];
                    imageData.data[dataIndex++] = rgba2[0];
                    imageData.data[dataIndex++] = rgba2[1];
                    imageData.data[dataIndex++] = rgba2[2];
                    imageData.data[dataIndex++] = rgba2[3];
                }
                ctx.putImageData(imageData, 0, 0);
                const pngBuffer = canvas.toBuffer('image/png');
                await writeFile(join(process.cwd(), 'dithered_image.png'), pngBuffer);
            } else {
                console.error("No data file found in /upload request");
            }
        } catch (error) {
            console.error("Failed to process image_data.bin:", error);
        }
    }

    try {
        const esp32Response = await fetch(esp32Url, {
            method: request.method,
            headers: request.headers,
            body: body,
        });

        return new Response(esp32Response.body, {
            status: esp32Response.status,
            statusText: esp32Response.statusText,
            headers: esp32Response.headers,
        });
    } catch (error) {
        console.error("Proxy error:", error);
        return new Response("ESP32 unreachable", { status: 502 });
    }
}

serve({
    port: 3000,
    async fetch(request) {
        const url = new URL(request.url);

        // Handle API endpoints
        if (url.pathname === "/health") {
            return handleHealth(request);
        }

        if (url.pathname === "/cli") {
            return handleCli(request);
        }

        if (url.pathname === "/image") {
            try {
                const imagePath = join(process.cwd(), 'dithered_image.png');
                const file = await readFile(imagePath);
                return new Response(file, {
                    headers: {
                        'Content-Type': 'image/png',
                        'Cache-Control': 'no-cache'
                    }
                });
            } catch (error) {
                return new Response('Image not found', { status: 404 });
            }
        }

        // Serve static files for GET/HEAD requests
        if (request.method === "GET" || request.method === "HEAD") {
            const filepath = url.pathname === '/' ? '/neoframe.html' : url.pathname;
            if (filepath === '/favicon.ico') {
                // Return 204 No Content for favicon requests to avoid errors
                return new Response(null, { status: 204 });
            }
            try {
                const file = Bun.file(`.${filepath}`);
                return new Response(file);
            } catch (error) {
                // If not a static file, try to proxy to ESP32
                return handleProxy(request);
            }
        } else {
            // For POST/PUT/etc, directly proxy to ESP32
            return handleProxy(request);
        }
    },
});

console.log("NeoFrame proxy server running on port 3000");