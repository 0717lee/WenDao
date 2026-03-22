import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        page.on("console", lambda msg: print(f"Browser console: {msg.text}"))
        page.on("pageerror", lambda err: print(f"Browser error: {err}"))
        print("Navigating to http://localhost:5173")
        await page.goto("http://localhost:5173")
        print("Waiting 20 seconds for models to render...")
        await asyncio.sleep(20)
        print("Taking screenshot...")
        await page.screenshot(path="./artifacts/ui_rework.png")
        await browser.close()
        print("Screenshot saved.")

if __name__ == "__main__":
    asyncio.run(run())
