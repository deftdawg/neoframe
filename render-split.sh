#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SPLIT_MODE="diagonal"
SCALING="fit_8x10"
ROTATION="0"
OUTPUT_PATH=""
SEND_TO_FRAME="false"
SEND_TARGET=""
FILES=()

usage() {
    cat <<EOF
Usage: $(basename "$0") [options] <image_file...>

Render seamless split-comparison PNGs to disk (split-<name>.png), optionally sending to the ESP32 frame.
By default, graphics split 2-way (GRAPHICS vs LEGACY) and photos split 3-way (VIVID vs PHOTO vs LEGACY).

Options:
  --split <mode>           Split geometry: diagonal (default), diagonal-bl-tr, left-right, top-bottom
  --scaling <mode>         Scaling mode: fit_8x10 (default), fill_8x10, fit, fill, original
  --rotation <deg>         Rotation in degrees: 0 (default), 90, 180, 270
  -s, --send [ip_or_host]  Also upload the rendered split image to the NeoFrame ESP32
                           (resolves esp32s3-B049A4 via DNS with 192.168.4.1 fallback if omitted)
  --ip <ip_or_host>        Target ESP32 IP/hostname (implies --send)
  -o, --output <f>         Output path (single input file only)
  -h, --help               Show this help
EOF
}

is_probable_target() {
    local val="${1:-}"
    [[ -n "$val" && "$val" != -* && ! -e "$val" ]] || return 1
    [[ ! "$val" =~ \.(png|jpg|jpeg|gif|webp|bmp|PNG|JPG|JPEG|GIF|WEBP|BMP)$ && "$val" != *[*?[]* ]]
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --split)
            SPLIT_MODE="${2:?Missing value for --split}"
            shift 2
            ;;
        --scaling)
            SCALING="${2:?Missing value for --scaling}"
            shift 2
            ;;
        --rotation)
            ROTATION="${2:?Missing value for --rotation}"
            shift 2
            ;;
        -s|--send)
            SEND_TO_FRAME="true"
            if [[ $# -ge 2 ]] && is_probable_target "$2"; then
                SEND_TARGET="$2"
                shift 2
            else
                shift
            fi
            ;;
        --send=*|-s=*)
            SEND_TO_FRAME="true"
            SEND_TARGET="${1#*=}"
            shift
            ;;
        --ip)
            SEND_TO_FRAME="true"
            SEND_TARGET="${2:?Missing value for --ip}"
            shift 2
            ;;
        -o|--output)
            OUTPUT_PATH="${2:?Missing value for --output}"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        --)
            shift
            FILES+=("$@")
            break
            ;;
        -*)
            echo "Unknown option: $1" >&2
            usage >&2
            exit 1
            ;;
        *)
            FILES+=("$1")
            shift
            ;;
    esac
done

if [[ ${#FILES[@]} -eq 0 ]]; then
    usage >&2
    exit 1
fi

if [[ -n "$OUTPUT_PATH" && ${#FILES[@]} -gt 1 ]]; then
    echo "Error: -o/--output can only be used with a single input image." >&2
    exit 1
fi

FILTERED_FILES=()
for f in "${FILES[@]}"; do
    if [[ ${#FILES[@]} -gt 1 && "$(basename "$f")" == split-* ]]; then
        continue
    fi
    FILTERED_FILES+=("$f")
done

if [[ ${#FILTERED_FILES[@]} -eq 0 ]]; then
    echo "No non-split input files found." >&2
    exit 1
fi

# Silence NixOS Fontconfig 2.18 vs devbox Fontconfig 2.17 XML warnings when present.
if [[ -z "${FONTCONFIG_FILE:-}" && -f /etc/fonts/conf.d/48-guessfamily.conf ]] && grep -q 'xsi:nil' /etc/fonts/conf.d/48-guessfamily.conf 2>/dev/null; then
    cat > /tmp/neoframe-fonts.conf <<'XML'
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>/run/current-system/sw/share/X11/fonts</dir>
  <dir>/usr/share/fonts</dir>
  <cachedir>/tmp/neoframe-fontcache</cachedir>
</fontconfig>
XML
    export FONTCONFIG_FILE="/tmp/neoframe-fonts.conf"
fi

SEND_IP=""
if [[ "$SEND_TO_FRAME" == "true" ]]; then
    TARGET="${SEND_TARGET:-esp32s3-B049A4}"
    if [[ "$TARGET" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        SEND_IP="$TARGET"
    else
        RESOLVED_IP="$(nslookup "$TARGET" 10.0.0.1 2>/dev/null | grep 'Address' | grep -v '#' | tail -1 | awk '{print $2}' || true)"
        if [[ -z "$RESOLVED_IP" ]]; then
            RESOLVED_IP="$(nslookup "$TARGET" 2>/dev/null | grep 'Address' | grep -v '#' | tail -1 | awk '{print $2}' || true)"
        fi
        if [[ -n "$RESOLVED_IP" ]]; then
            SEND_IP="$RESOLVED_IP"
        elif [[ -n "$SEND_TARGET" ]]; then
            SEND_IP="$SEND_TARGET"
        else
            SEND_IP="192.168.4.1"
        fi
    fi
    echo "Target NeoFrame ESP32: ${SEND_IP}"
fi

NEOFRAME_SCRIPT_DIR="$SCRIPT_DIR" \
NEOFRAME_SPLIT_MODE="$SPLIT_MODE" \
NEOFRAME_SCALING="$SCALING" \
NEOFRAME_ROTATION="$ROTATION" \
NEOFRAME_OUTPUT="$OUTPUT_PATH" \
NEOFRAME_SEND_IP="$SEND_IP" \
bun -e '
import { loadImage, createCanvas } from "canvas";
import { writeFileSync } from "fs";
import { basename, extname } from "path";

const root = process.env.NEOFRAME_SCRIPT_DIR!;
const { getConfig } = await import(`${root}/src/config.ts`);
const { applyScaling } = await import(`${root}/src/scaling.ts`);
const { renderFrameImageData, processImageData } = await import(`${root}/src/image-processor.ts`);

const splitMode = process.env.NEOFRAME_SPLIT_MODE!;
const scaling = process.env.NEOFRAME_SCALING!;
const rotationStr = process.env.NEOFRAME_ROTATION!;
const explicitOutput = process.env.NEOFRAME_OUTPUT || "";
const sendIp = process.env.NEOFRAME_SEND_IP || "";
const rotation = parseInt(rotationStr, 10) || 0;
const inputs = process.argv.slice(1);
let failures = 0;

for (const input of inputs) {
    try {
        const img = await loadImage(input);
        const rotCanvas = createCanvas(
            rotation === 90 || rotation === 270 ? img.height : img.width,
            rotation === 90 || rotation === 270 ? img.width : img.height
        );
        const rctx = rotCanvas.getContext("2d");
        rctx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
        rctx.rotate((rotation * Math.PI) / 180);
        rctx.drawImage(img, -img.width / 2, -img.height / 2);

        const frameWidth = 1200;
        const frameHeight = 1600;
        const canvas = createCanvas(frameWidth, frameHeight);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, frameWidth, frameHeight);

        const cfg = getConfig({ splitMode, scaling, rotation: rotationStr });
        const { imageBoundingBox } = applyScaling(rotCanvas as any, ctx as any, cfg, frameWidth, frameHeight);
        const imageData = ctx.getImageData(0, 0, frameWidth, frameHeight);

        renderFrameImageData(imageData as any, cfg, {
            rotation,
            imageBoundingBox,
            onLog: (msg: string) => console.log(`[${basename(input)}] ${msg}`),
        });
        ctx.putImageData(imageData, 0, 0);

        const stem = basename(input, extname(input));
        const outPath = explicitOutput || `split-${stem}.png`;
        writeFileSync(outPath, canvas.toBuffer("image/png"));
        console.log(`Saved -> ${outPath}`);

        if (sendIp) {
            console.log(`Uploading ${basename(input)} to http://${sendIp}/upload...`);
            const packed = processImageData(imageData as any, cfg);
            const blob = new Blob([packed], { type: "application/octet-stream" });
            const formData = new FormData();
            formData.append("data", blob, "image_data.bin");

            const response = await fetch(`http://${sendIp}/upload`, {
                method: "POST",
                body: formData as any,
            });
            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
            }
            const responseText = await response.text();
            console.log(`Upload response: ${responseText}`);
        }
    } catch (err: any) {
        console.error(`[${input}] Failed: ${err?.message ?? err}`);
        failures++;
    }
}
if (failures > 0) process.exit(1);
' "${FILTERED_FILES[@]}"
