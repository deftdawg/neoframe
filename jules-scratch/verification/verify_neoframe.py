import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Listen for console messages
        page.on("console", lambda msg: print(f"Browser console: {msg.text()}"))

        # Get the absolute path to the HTML file
        import os
        html_file_path = os.path.abspath('neoframe.html')

        await page.goto(f'file://{html_file_path}')

        # Wait for the page to load
        await page.wait_for_selector('h1', timeout=5000)

        # Check that the title is correct
        await expect(page).to_have_title('Image Dithering to Epaper')

        # Upload an image
        async with page.expect_file_chooser() as fc_info:
            await page.locator('label[for="upload"]').click()
            file_chooser = await fc_info.value
            await file_chooser.set_files("test.png")

        # Wait for the image to be processed and displayed on the canvas
        await asyncio.sleep(2) # Give it a moment to render

        # Take a screenshot
        await page.screenshot(path="jules-scratch/verification/verification.png")

        await browser.close()

if __name__ == '__main__':
    asyncio.run(main())