"""Recapture the 8 English app views as viewport-sized (1920x1080) screenshots.

Viewport-only (no full_page, no #main scroller expansion) so every PNG is a
clean, undistorted 16:9 frame for the promo assembly.
"""
import os
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SCREENCAST_DIR = os.path.join(HERE, "..", "assets", "screencast")
BASE = "http://localhost:8419/"

VIEWS = [
    ("dashboard", "#/dashboard"),
    ("corrosion-detail", "#/corrosion/mp/MP-CORR-001"),
    ("psv-sizing", "#/psv/PSV-520-001"),
    ("pipeline-map", "#/pipelines/SYS-NORTE-16"),
    ("apm-detail", "#/apm/APM-MD-001"),
    ("recommendations", "#/recommendations"),
    ("reports", "#/reports"),
    ("admin", "#/admin"),
]


def wait_boot(page):
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("#run-rules", timeout=40000)
    page.wait_for_function(
        "document.querySelector('#main') && document.querySelector('#main').children.length > 0",
        timeout=40000,
    )
    page.wait_for_timeout(2500)


def run_rules(page):
    page.click("#run-rules")
    try:
        page.wait_for_selector(".badge-recs:not([hidden])", timeout=20000)
    except Exception:  # noqa: BLE001
        page.evaluate("h => { window.location.hash = h; }", "#/recommendations")
        page.wait_for_timeout(1500)
        page.locator("button", has_text="Run now").first.click(timeout=5000)
        page.wait_for_timeout(2500)
    page.wait_for_timeout(1200)


def nav(page, hash, settle=2000):
    page.evaluate("h => { window.location.hash = h; }", hash)
    page.wait_for_function(
        "document.querySelector('#main') && document.querySelector('#main').children.length > 0",
        timeout=20000,
    )
    page.wait_for_timeout(settle)


def main():
    os.makedirs(SCREENCAST_DIR, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            device_scale_factor=1,
            locale="en-US",
        )
        page = context.new_page()
        wait_boot(page)
        run_rules(page)

        results = []
        for name, hash in VIEWS:
            nav(page, hash)
            path = os.path.join(SCREENCAST_DIR, name + ".png")
            page.screenshot(path=path)
            with Image.open(path) as im:
                results.append((name + ".png", im.width, im.height))
            print("shot %s  %dx%d" % (name + ".png", results[-1][1], results[-1][2]))

        browser.close()

    bad = [r for r in results if r[1] != 1920 or r[2] != 1080]
    print("SHOTS=%d" % len(results))
    for r in results:
        print("  %s %dx%d" % r)
    if bad:
        print("ERROR: non-1080p screenshots: %s" % bad)
        sys.exit(1)
    print("ALL_1080P_OK")


if __name__ == "__main__":
    try:
        main()
    except Exception:  # noqa: BLE001
        import traceback
        traceback.print_exc()
        sys.exit(1)
