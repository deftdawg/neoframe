from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--no-sandbox'])
    page = browser.new_page()
    page.goto("http://localhost:3000/neoframe.html")
    page.screenshot(path="jules-scratch/verification/verification.png")
    browser.close()