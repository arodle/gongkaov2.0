from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto('http://localhost:3000')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(3000)
    
    # Take a full page screenshot
    page.screenshot(path='C:/Users/lirenxuan/Documents/trae_projects/gongkao/gongkao-review/scripts/result.png', full_page=True)
    
    # Also check what's rendered
    title = page.title()
    print(f"Page title: {title}")
    
    # Check if data is visible
    body_text = page.inner_text('body')
    print(f"Body text length: {len(body_text)}")
    print(f"First 500 chars: {body_text[:500]}")
    
    browser.close()
