# DeftDawg's Unofficial fork of [Good Display's NeoFrame HTML page](http://www.einkapp.com/esp32-133c02.html) 
for 13.3" Spectra 6 displays driven by w/ [ESP32-133C02](https://www.good-display.com/product/574.html) (Wifi firmware)

Adds:
- rotation
- scaling
- Spectra 6 rendering modes (`auto`, `vivid`, `photo`, `graphics`, `legacy`) with automatic photo/UI detection and measured-ink calibration
- batch/single CLI content detection mode (`--detect` / `--classify` / `-d <image_or_glob...>`) to check whether `auto` classifies images as `graphic` or `photo`
- seamless CLI 2-way (graphics vs legacy) and 3-way (vivid vs photo vs legacy) split rendering (`--split left-right|top-bottom|diagonal|diagonal-bl-tr` with `--split-mode-a` / `--split-mode-b` / `--split-mode-c`) and edge method labels
- QR code overlays
- 8x10 Ikea RODALM frame fit
- cli mode via `cli.ts` (provide image filename/url + settings from browser UI)
- proxy mode via `bun server.ts`/localhost:3000 (http to proxy over ethernet, proxy connects via WIFI to frame)
- proxy-cli mode (`cli.ts` via proxy mode)

<img width="2525" height="1883" alt="image" src="https://github.com/user-attachments/assets/463736f4-0b4d-4fcb-b115-708428d4795d" />
