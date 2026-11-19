## Project Overview

- Refer to the README.md file for project overview

## Dev environment tips

- Think hard to produce solutions that are as simple and concise as possible to achieve the requirements
- Avoid duplicating identical/near-identical logic in multiple places, whenever identical logic is needed try to refactor that logic to a centralized location where all instances can use it.
- Use `devbox` to manage dependencies, do not specify package versions, include colourize build and example run instructions in the init_hook along with any pre-build setup that needs to be done.
- Use `bun` to build project for all targets
- Anytime a UI control is implemented, it should be done such that if it's state is active on restoration that element is visible to the user and if that control takes input from the user it has a debounce delay of 2 seconds before it effects any rendering changes to avoid frustrating the user with too many rerendering delays
- When you complete a task successfully or unsuccessfully add a comment to the PR and push the commits to the working branch, DON'T MAKE THE USER HAVE TO ASK OR FOLLOW UP WITH YOU TO DO SO!
- When working on your working branch, if the last commit was made by the user, it is the user fixing or improving your work, take the time to understand what was done and attempt to preserve/learn from it rather than reverting it in your new commits.

## Documentation

- When you open a pull request make the title and summary something meaningful, title could be your new branch name, summary can start with the standard `Fixes #issue` line but should also include a brief statement of what the original issue was and what you changed in the PR.
- Do not delete code comments unless the code accompanying them has also been deleted/changed to make them irrelavant
- Whenever you are asked to produced documentation do so in Markdown format
- Where diagrams are required use Mermaid diagrams, be sure to properly quote all strings so as to not produce mermaid parser errors (if you can test that mermaid diagrams render before including them even better)
- Whenever the user asks you to implement new requirements add them to the New Requirements section at the bottom of this document with enough detail you could reproduce them by reading this document alone

## New Requirements

### General Communication

- The ESP32 does not return CORS headers `'no-cors' mode` must be used when communicating with it, this is particularily important for the health check functions

### QR Codes

- QR Codes need to be placed relative to the orientation of the rotated image (not the physical panel), similarily QR margins need to be from the image as it will be rendered on the target field of view.  So if the Field of View is for the RODALM the QR margins need to be from the edge of what is viewable, not the panel edge

### URL Fetching

- The CLI must support resolving passed-in image URL hostnames using IPv4 first, and the Home Assistant NeoFrame add-on must expose that setting as a default-enabled checkbox for the source image URL.

### Spectra 6 Rendering Modes & Split A/B Comparison

- Spectra 6 (`ditherMode === 'sixColor'`) must support 5 `renderMode` options: `auto` (default), `vivid`, `photo`, `graphics`, and `legacy`, plus `inkSaturation` (`0.0`–`1.0`, default `0.5`) blending between pure RGB and measured Spectra 6 reflectance (`[[0,0,0], [161,164,165], [208,190,71], [156,72,75], [61,59,94], [58,91,70]]`).
- `auto` mode inspects the viewable `imageBoundingBox` (flat-neighbor ratio, 5-bit quantized unique color count / top-10 share, smooth gradient ratio, subtle dark-edge share, optional EXIF bias) and classifies images as `graphics` (UI/dashboards/text/comics), `photo` (dark-background graphics with significant low-contrast dim detail such as Word/Digital Clocks where error diffusion preserves dark tonal range better than ordered dithering or vivid's perceived palette), or `vivid` (photographs).
- `vivid` lifts midtones (`gamma = 0.75`), boosts saturation (`1.15x`), and error-diffuses toward the white-normalized perceived palette; `photo` error-diffuses toward the `inkSaturation`-blended palette; `graphics` adapts pastel hues by measured ink darkness (attenuated for already-dark colors so dark-mode UI contrast is preserved), snaps close colors (`<= 48`), applies 8x8 Bayer ordered dithering (restricting neutral greys to Black/White using the full Black-to-White palette range as spread so dark/light greys do not collapse into dead zones), and sharpens neutral 3x3 high-contrast edges against light surfaces (`maxL >= textThreshold`) for crisp text; `legacy` preserves the original Lab + blue-threshold pipeline.
- Both CLI (`--render-mode`, `--split`, `--split-mode-a`, `--split-mode-b`, `--split-mode-c`) and the shared frame renderer must support seamless 2-way and 3-way split rendering (`splitMode`: `none`, `left-right`, `top-bottom`, `diagonal`, `diagonal-tl-br`, `diagonal-bl-tr`) relative to the rotated viewable `imageBoundingBox` (matching QR orientation rules) without a divider line and with isolated error-diffusion buffers. When `splitRenderMode` is `auto` (default), `graphics` images split 2-way (`graphics` vs `legacy`) and photographs split 3-way (`vivid` vs `photo` vs `legacy`).
- When split rendering is active, each segment's uppercase mode name (`VIVID`, `PHOTO`, `GRAPHICS`, `LEGACY`) must be rendered as a compact high-contrast Black/White pill label along that segment's longest outer edge of the viewable `imageBoundingBox`, oriented appropriately (horizontal left-to-right on top/bottom edges, rotated 90° clockwise flowing top-to-bottom on left/right side edges).
- The CLI must also support a batch/single detection mode (`--detect` / `--classify` / `-d <image_path_or_url_or_glob...>`) that accepts one or more images or globs (e.g. `*.png`), prints each file name, and reports whether `auto` classifies it as `graphic` or `photo` (alongside its detection metrics) without modifying `/tmp/neoframe.last`, `dithered_image.png`, or uploading to the ESP32.
- The browser UI exposes `renderMode` and `inkSaturation` (with 2-second debounce on slider input and state-restoration visibility control) without exposing split controls; the Home Assistant NeoFrame add-on exposes `render_mode`, `ink_saturation`, `split_mode`, `split_render_mode`, and `split_render_mode_c` in its add-on settings.
