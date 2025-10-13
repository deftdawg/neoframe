from playwright.sync_api import sync_playwright, expect
import os

def run_verification(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Capture console logs
    page.on("console", lambda msg: print(f"Browser console: {msg.text}"))

    try:
        # Start a local server to serve the dist directory
        # This assumes you are running the script from the root of the project
        # and have a 'dist' directory with the built files.
        # In a real CI/CD environment, this would be handled by a proper server setup.
        # For local verification, we'll use a simple file path.
        dist_path = os.path.abspath('./dist/neoframe.html')
        page.goto(f'file://{dist_path}')

        # Wait for the page to load by checking for a known element
        expect(page.locator('h1')).to_have_text('NeoFrame Image Dithering Tool')

        # Provide a file to the upload input
        page.locator('#upload').set_input_files('jules-scratch/verification/1x1.png')

        # Wait for the image to be processed and displayed on the canvas
        # A simple way to check is to see if the canvas has some content.
        # A more robust check might involve checking canvas dimensions or pixel data.
        canvas = page.locator('#canvas')
        expect(canvas).to_be_visible()

        # Give a moment for rendering
        page.wait_for_timeout(1000)

        # Take a screenshot
        page.screenshot(path='jules-scratch/verification/verification.png')

        print("Screenshot saved to jules-scratch/verification/verification.png")

    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run_verification(playwright)