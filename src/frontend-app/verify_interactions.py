import asyncio
from playwright.async_api import async_playwright

ARTIFACT_DIR = "./artifacts"

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        page.on("console", lambda msg: print(f"Browser console: {msg.text}"))
        page.on("pageerror", lambda err: print(f"Browser error: {err}"))
        
        print("Navigating to http://localhost:5173")
        await page.goto("http://localhost:5173")
        
        print("Waiting 25 seconds for 3D models to render...")
        await asyncio.sleep(25)
        
        print("Taking initial screenshot...")
        await page.screenshot(path=f"{ARTIFACT_DIR}/ui_initial.png")

        # --- Test 1: Picking ---
        print("Clicking center to pick a component...")
        await page.mouse.click(640, 360)
        await asyncio.sleep(2)
        await page.screenshot(path=f"{ARTIFACT_DIR}/ui_picked.png")

        # --- Test 2: Stress heatmap (mock) ---
        print("Sending stress command...")
        await page.fill('input[placeholder="叩问木石..."]', '查看热力图')
        await page.click('button:has-text("发问")')
        await asyncio.sleep(5)
        await page.screenshot(path=f"{ARTIFACT_DIR}/ui_stress.png")

        # --- Test 3: Real backend text command (INT-S3) ---
        print("Sending real backend text command: '请为我拆解一下这个斗拱系统'")
        await page.fill('input[placeholder="叩问木石..."]', '请为我拆解一下这个斗拱系统')
        await page.click('button:has-text("发问")')
        print("Waiting for AI response (up to 15s)...")
        await asyncio.sleep(15)
        await page.screenshot(path=f"{ARTIFACT_DIR}/ui_multimodal.png")

        await browser.close()
        print("Verification finished.")

if __name__ == "__main__":
    asyncio.run(run())
