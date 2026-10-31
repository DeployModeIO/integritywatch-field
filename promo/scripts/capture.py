"""Capture IntegrityWatch Field English screenshots + walkthrough video.

Screenshots: full-page PNGs (>=1920 px wide) of 8 views.
Video: one continuous 1920x1080 walkthrough (dashboard -> corrosion -> PSV
sizing -> pipeline map -> recommendations), transcribed from WebM to MP4.

The app seeds demo data on first load and the rules sweep (header "Run rules")
generates the recommendations list.
"""
import os
import subprocess
import sys
import time

from PIL import Image
from playwright.sync_api import sync_playwright
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
HERE = os.path.dirname(os.path.abspath(__file__))
SCREENCAST_DIR = os.path.join(HERE, "..", "assets", "screencast")
TMP_VIDEO_DIR = os.path.join(HERE, "..", "assets", "screencast", "_vid")
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

WALKTHROUGH = [
    ("#/dashboard", 3.8),
    ("#/corrosion/mp/MP-CORR-001", 4.4),
    ("#/psv/PSV-520-001", 3.6),
    ("#/pipelines/SYS-NORTE-16", 4.4),
    ("#/recommendations", 3.4),
]


def run(cmd):
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError("cmd failed: %s\n%s" % (" ".join(cmd), proc.stderr))
    return proc


def wait_boot(page):
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("#run-rules", timeout=40000)
    page.wait_for_function(
        "document.querySelector('#main') && document.querySelector('#main').children.length > 0",
        timeout=40000,
    )
    page.wait_for_timeout(2500)


def run_rules(page):
    try:
        page.click("#run-rules")
    except Exception as exc:  # noqa: BLE001
        print("  warn: run-rules click failed: %s" % exc)
    # wait for the recommendation badge to appear (sweep found open recs)
    try:
        page.wait_for_selector(".badge-recs:not([hidden])", timeout=20000)
    except Exception:  # noqa: BLE001
        print("  warn: badge-recs did not appear; forcing sweep via recommendations view")
        nav(page, "#/recommendations")
        try:
            page.click("button.btn-primary", timeout=5000)
        except Exception:  # noqa: BLE001
            page.locator("button", has_text="Run now").first.click(timeout=5000)
        page.wait_for_timeout(2500)
    page.wait_for_timeout(1500)


def nav(page, hash, settle=2200):
    page.evaluate("h => { window.location.hash = h; }", hash)
    page.wait_for_function(
        "document.querySelector('#main') && document.querySelector('#main').children.length > 0",
        timeout=20000,
    )
    page.wait_for_timeout(settle)


# The app keeps body overflow:hidden and scrolls inside #main, so a plain
# full_page screenshot only captures the viewport. Expand the internal scroller
# to its full content height before capturing.
EXPAND_JS = """
() => {
  const main = document.querySelector('#main');
  if (!main) return false;
  document.documentElement.style.height = 'auto';
  document.documentElement.style.overflow = 'visible';
  document.body.style.height = 'auto';
  document.body.style.overflow = 'visible';
  document.body.style.gridTemplateRows = 'auto auto auto auto';
  main.style.overflow = 'visible';
  main.style.height = 'auto';
  main.style.maxHeight = 'none';
  return true;
}
"""


def expand_main(page):
    page.evaluate(EXPAND_JS)
    page.wait_for_timeout(400)


def capture_screenshots():
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
            expand_main(page)
            path = os.path.join(SCREENCAST_DIR, name + ".png")
            page.screenshot(path=path, full_page=True)
            with Image.open(path) as im:
                results.append((name + ".png", im.width, im.height))
            print("shot %s  %dx%d" % (name + ".png", results[-1][1], results[-1][2]))

        browser.close()
    return results


def capture_walkthrough():
    os.makedirs(TMP_VIDEO_DIR, exist_ok=True)
    webm_path = os.path.join(TMP_VIDEO_DIR, "walkthrough.webm")
    mp4_path = os.path.join(SCREENCAST_DIR, "walkthrough.mp4")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        t_context = time.monotonic()
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            device_scale_factor=1,
            locale="en-US",
            record_video_dir=TMP_VIDEO_DIR,
            record_video_size={"width": 1920, "height": 1080},
        )
        page = context.new_page()
        wait_boot(page)
        run_rules(page)

        # Walkthrough scenes start here (we trim the setup before this point).
        t_walk_start = time.monotonic() - t_context

        nav(page, "#/dashboard", settle=700)
        for hash, secs in WALKTHROUGH:
            nav(page, hash, settle=700)
            start = time.time()
            step = 0
            while time.time() - start < secs:
                page.mouse.wheel(0, 320)
                page.wait_for_timeout(620)
                step += 1
                if step > 40:
                    break

        context.close()
        video = page.video
        if video is not None:
            video.save_as(webm_path)
        browser.close()

    if not os.path.exists(webm_path):
        raise RuntimeError("walkthrough webm not produced")

    # Trim the boot/rules setup and transcode to H.264 MP4.
    trim_start = max(0.0, t_walk_start - 0.4)
    run([
        FFMPEG, "-y",
        "-ss", "%.3f" % trim_start, "-i", webm_path,
        "-t", "24",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        "-r", "25",
        "-an",
        mp4_path,
    ])
    return mp4_path


def main():
    os.makedirs(SCREENCAST_DIR, exist_ok=True)
    print("== screenshots ==")
    results = capture_screenshots()
    print("== walkthrough ==")
    mp4 = capture_walkthrough()
    print("walkthrough.mp4 -> %s" % mp4)
    print("SHOTS=%d" % len(results))
    for r in results:
        print("  %s %dx%d" % r)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        import traceback
        traceback.print_exc()
        sys.exit(1)
