"""Build the LinkedIn promo video for IntegrityWatch Field (English, ~80 s).

Pipeline:
  1. Synthesize 6 English VO lines (edge-tts) and measure them with ffprobe.
  2. Record the real app in a single Playwright session (1920x1080) and cut it
     into three segments: dashboard, ingest, asset + dossier.
  3. Build title cards with PIL (brand palette, no third-party logos).
  4. Render one clip per scene at exact VO duration, concat, lay VO + music,
     burn subtitles, write the .srt and the LinkedIn copy.

Usage:
    python promo/scripts/make_fieldtest_video.py
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import sys
import time
import wave

import edge_tts
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PROMO = os.path.join(ROOT, "promo")
ASSETS = os.path.join(PROMO, "assets")
OUT = os.path.join(PROMO, "out")
WORK = os.path.join(OUT, ".fieldtest")
QA = os.path.join(ROOT, "tools", "qa")
CAPS = os.path.join(ROOT, "docs", "field-tests-2026-10-30")
BASE = "http://localhost:8419/"

NAVY = "#11161c"
BLUE = "#0b5cad"
STEEL = "#8d99a6"
WHITE = "#ffffff"

VOICE = "en-US-ChristopherNeural"
FALLBACK = ["en-US-GuyNeural", "en-GB-RyanNeural"]
RATE = "-2%"

# scene: (id, kind, asset, caption)
SCENES = [
    ("s1", "card", "title_1.png", ""),
    ("s2", "broll", "broll_offshore.png", ""),
    ("s3", "screen", "dashboard", ""),
    ("s4", "screen", "ingest", ""),
    ("s5", "screen", "asset", ""),
    ("s5b", "screen", "dossier", ""),
    ("s6", "card", "title_2.png", ""),
]

LINES = {
    "s1": "Offshore and onshore, integrity teams still run on paper, on spreadsheets, "
          "and on the last bar of signal. The well does not wait for the office.",
    "s2": "When the connection drops, the measurement survives. The evidence does not. "
          "Decisions wait for a report that never gets written, and the next inspection "
          "repeats the same trip.",
    "s3": "IntegrityWatch Field is an offline-first integrity and compliance centre. "
          "It runs entirely on the tablet. No server, no cloud, no connection, "
          "and nothing to synchronise before you can decide.",
    "s4": "Import a field CSV. The app detects the delimiter, maps the columns, validates "
          "every row and commits the readings on the device. Thirty two rows, zero skipped.",
    "s5": "Register the asset from real line data, set the risk band, and let the app "
          "calculate the inspection interval.",
    "s5b": "Then generate the point dossier on the same device. Real line attributes in. "
           "A document you can print, sign and defend.",
    "s6": "IntegrityWatch Field. Field data, field decisions, no signal required.",
}

PAD = {"s1": 1.2, "s2": 1.2, "s3": 1.3, "s4": 1.3, "s5": 1.3, "s5b": 1.3, "s6": 1.8}

SRT_STYLE = ("FontName=Segoe UI,FontSize=13,PrimaryColour=&H00FFFFFF,"
             "OutlineColour=&H00000000,BorderStyle=1,Outline=1.3,Shadow=0.7,"
             "MarginV=24,Alignment=2")


def run(cmd, cwd=None):
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError("cmd failed: %s\n%s" % (" ".join(cmd), proc.stderr[-2500:]))
    return proc


def ffprobe_duration(path: str) -> float:
    out = run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
               "-of", "default=nw=1:nk=1", path]).stdout.strip()
    return float(out)


def font(size: int, bold: bool = True):
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(os.path.join("C:\\Windows\\Fonts", name), size)


# --------------------------------------------------------------------------- VO
async def synth(text: str, mp3: str):
    last = None
    for voice in [VOICE] + FALLBACK:
        try:
            await edge_tts.Communicate(text, voice, rate=RATE).save(mp3)
            return voice
        except Exception as exc:  # noqa: BLE001
            last = exc
    raise RuntimeError(f"TTS failed: {last}")


def build_vo():
    vos = {}
    for sid, text in LINES.items():
        mp3 = os.path.join(WORK, f"vo_{sid}.mp3")
        wav = os.path.join(WORK, f"vo_{sid}.wav")
        voice = asyncio.run(synth(text, mp3))
        run(["ffmpeg", "-y", "-i", mp3, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", wav])
        dur = ffprobe_duration(wav)
        vos[sid] = {"wav": wav, "dur": dur, "text": text, "voice": voice}
        print(f"  VO {sid}: {dur:5.2f}s  ({voice})")
    return vos


# ------------------------------------------------------------------------ cards
def make_cards():
    W, H = 1920, 1080
    # Scene 1: the problem
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 22, H], fill=BLUE)
    d.text((150, 330), "THE PROBLEM", font=font(38), fill=STEEL)
    d.text((150, 400), "The measurement exists.", font=font(88), fill=WHITE)
    d.text((150, 505), "The evidence does not.", font=font(88), fill=WHITE)
    d.line([150, 640, 150 + 260, 640], fill=BLUE, width=6)
    d.text((150, 690), "92 hydrocarbon releases reported offshore in 2024  ·  HSE",
           font=font(34, False), fill=STEEL)
    img.save(os.path.join(WORK, "title_1.png"))

    # Scene 6: CTA
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 22, H], fill=BLUE)
    d.text((150, 300), "IntegrityWatch Field", font=font(96), fill=WHITE)
    d.line([150, 440, 150 + 260, 440], fill=BLUE, width=6)
    d.text((150, 490), "Offline integrity and compliance", font=font(48, False), fill=STEEL)
    d.text((150, 560), "for wells, pipelines and offshore assets",
           font=font(48, False), fill=STEEL)
    d.text((150, 700), "github.com/DeployModeIO/integritywatch-field",
           font=font(38, False), fill=WHITE)
    d.text((150, 770), "Runs on the tablet · no server · no cloud",
           font=font(34, False), fill=BLUE)
    img.save(os.path.join(WORK, "title_2.png"))
    print("  cards written")


# ------------------------------------------------------------------ screen cast
def record_app(targets: dict) -> dict:
    sys.path.insert(0, QA)
    from run_field_tests import fill_form, tr, click_btn  # noqa: E402

    rec_dir = os.path.join(WORK, "rec")
    os.makedirs(rec_dir, exist_ok=True)
    app = json.load(open(os.path.join(ROOT, "datos-prueba", "real", "app-dataset.json"),
                         encoding="utf-8"))
    pipes = {p["id"]: p for p in app["pipelines"]}
    mps = app["monitoringPoints"]

    marks = {}
    t0 = time.monotonic()

    def hold(start_mark, target):
        """Keep the beat on screen until it fills its scene duration."""
        while (time.monotonic() - t0) - start_mark < target:
            page.wait_for_timeout(120)

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1920, "height": 1080},
                                  record_video_dir=rec_dir,
                                  record_video_size={"width": 1920, "height": 1080},
                                  locale="en-US")
        page = ctx.new_page()
        page.goto(BASE, wait_until="domcontentloaded")
        page.wait_for_selector("#run-rules", timeout=45000)
        page.wait_for_function(
            "document.querySelector('#main') && document.querySelector('#main').children.length > 0",
            timeout=45000)
        page.wait_for_timeout(2200)

        def clean():
            page.evaluate("""() => {
                const r = document.getElementById('toast-region');
                if (r) { r.textContent = ''; }
            }""")

        # ---- 1) register the four real points (setup, not filmed)
        page.evaluate("location.hash='#/corrosion'")
        page.wait_for_timeout(900)
        for mp in mps:
            pipe = pipes[mp["line"]]
            proc = mp["process"]
            click_btn(page, "corrosion.newPoint")
            page.wait_for_timeout(260)
            fill_form(page, {
                "code": mp["code"], "name": mp["name"], "sector": mp["sector"],
                "systemId": mp["line"], "line": mp["line"], "material": mp["material"],
                "sensorType": mp["sensorType"], "tNom": pipe["wallThicknessMm"],
                "tMin": round(pipe["wallThicknessMm"] * 0.8, 1),
                "h2sPpm": proc["h2sPpm"], "co2Ppm": proc["co2Ppm"],
                "totalPressureKpa": proc["totalPressureKpa"], "tempC": proc["tempC"],
                "bswPct": proc["bswPct"], "velocityMs": proc["velocityMs"],
                "inhibitorTargetPpm": proc["inhibitorTargetPpm"],
                "inhibitorResidualPpm": proc["inhibitorResidualPpm"],
            }, prefix="cf-")
            click_btn(page, "common.save")
            page.wait_for_timeout(420)

        # ---- 2) ingest beat (scene s4)
        page.evaluate("location.hash='#/ingest'")
        page.wait_for_timeout(1100)
        clean()
        marks["ingest_start"] = time.monotonic() - t0
        page.set_input_files("#csv-file", os.path.join(ROOT, "datos-prueba", "real", "carga-corrosion.csv"))
        page.wait_for_timeout(1300)
        page.get_by_role("button", name=tr(page, "ingest.runValidation")).first.click()
        page.wait_for_timeout(1600)
        page.get_by_role("button", name=tr(page, "ingest.importBtn")).first.click()
        page.wait_for_timeout(1400)
        clean()
        page.mouse.wheel(0, 250)
        page.wait_for_timeout(600)
        hold(marks["ingest_start"], targets["s4"])
        marks["ingest_end"] = time.monotonic() - t0

        # ---- 3) rules sweep so the dashboard shows the real workload
        page.click("#run-rules")
        page.wait_for_timeout(2600)

        # ---- 4) dashboard beat (scene s3) with the real dataset loaded
        page.evaluate("location.hash='#/dashboard'")
        page.wait_for_timeout(1300)
        clean()
        marks["dash_start"] = time.monotonic() - t0
        page.mouse.wheel(0, 320)
        page.wait_for_timeout(1100)
        page.mouse.wheel(0, -320)
        page.wait_for_timeout(700)
        hold(marks["dash_start"], targets["s3"])
        marks["dash_end"] = time.monotonic() - t0

        # ---- 5) asset beat (scene s5)
        page.evaluate("location.hash='#/apm'")
        page.wait_for_timeout(900)
        marks["asset_start"] = time.monotonic() - t0
        click_btn(page, "apm.newAsset")
        page.wait_for_timeout(350)
        valve = app["apmAssets"][0]
        fill_form(page, {
            "code": valve["code"], "name": valve["name"], "sector": "midstream",
            "criticality": "B", "status": "running", "pof": 3, "cof": 3,
            "inspectionBaseMonths": 24,
        })
        page.wait_for_timeout(700)
        click_btn(page, "common.save")
        page.wait_for_timeout(900)
        hold(marks["asset_start"], targets["s5"])
        marks["dossier_start"] = time.monotonic() - t0

        # ---- 6) dossier beat (scene s5b)
        page.evaluate("location.hash='#/reports'")
        page.wait_for_timeout(1200)
        page.evaluate("""() => {
            const s = document.querySelector('#main select');
            s.value = 'dossier';
            s.dispatchEvent(new Event('change', {bubbles: true}));
        }""")
        page.wait_for_timeout(700)
        page.evaluate("""() => {
            const s = document.querySelectorAll('#main select')[1];
            const o = Array.from(s.options).find(o => o.text.includes('MP-PL774'));
            if (o) { s.value = o.value; s.dispatchEvent(new Event('change', {bubbles: true})); }
        }""")
        page.wait_for_timeout(500)
        page.get_by_role("button", name=tr(page, "reports.generate")).first.click()
        page.wait_for_timeout(2200)
        page.mouse.wheel(0, 240)
        page.wait_for_timeout(900)
        hold(marks["dossier_start"], targets["s5b"])
        marks["end"] = time.monotonic() - t0

        ctx.close()
        browser.close()

    videos = [os.path.join(rec_dir, f) for f in os.listdir(rec_dir) if f.endswith(".webm")]
    if not videos:
        raise RuntimeError("no screen recording produced")
    video = max(videos, key=os.path.getmtime)
    print(f"  recording: {os.path.basename(video)}  dur={ffprobe_duration(video):.2f}s")
    marks["video"] = video
    marks["video_dur"] = ffprobe_duration(video)
    return marks


# -------------------------------------------------------------------- rendering
def clip_from_image(img: str, out: str, dur: float, zoom_in: bool = True):
    fps = 30
    frames = max(2, int(dur * fps))
    z = "min(zoom+0.00045,1.14)" if zoom_in else "if(lte(zoom,1.0),1.14,max(1.001,zoom-0.00045))"
    vf = (
        f"scale=2400:-1,zoompan=z='{z}':d={frames}:s=1920x1080:fps={fps},"
        f"trim=duration={dur},setsar=1,fade=t=in:st=0:d=0.4"
    )
    run(["ffmpeg", "-y", "-loop", "1", "-i", img, "-t", f"{dur:.3f}",
         "-vf", vf, "-c:v", "libx264", "-preset", "medium", "-crf", "20",
         "-pix_fmt", "yuv420p", "-an", out])


def clip_from_video(src: str, out: str, start: float, dur: float):
    vf = ("scale=1920:1080:force_original_aspect_ratio=decrease,"
          "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x11161c,fps=30,"
          "setsar=1,fade=t=in:st=0:d=0.35")
    run(["ffmpeg", "-y", "-ss", f"{max(0.0, start):.3f}", "-i", src, "-t", f"{dur:.3f}",
         "-vf", vf, "-c:v", "libx264", "-preset", "medium", "-crf", "20",
         "-pix_fmt", "yuv420p", "-an", out])


def add_caption(src: str, out: str, text: str):
    if not text:
        shutil.copyfile(src, out)
        return
    txt = text.replace("\u00b7", "/").replace("'", "").replace(":", " -")
    txt = txt.encode("ascii", "ignore").decode("ascii").strip()
    vf = (f"drawtext=fontfile='C\\:/Windows/Fonts/segoeuib.ttf':text='{txt}':"
          f"x=84:y=88:fontsize=30:fontcolor=white:"
          f"box=1:boxcolor=0x0b5cad@0.92:boxborderw=18")
    run(["ffmpeg", "-y", "-i", src, "-vf", vf, "-c:v", "libx264", "-preset", "medium",
         "-crf", "20", "-pix_fmt", "yuv420p", "-an", out])


def compose_vo(vos: dict, starts: dict, total: float) -> str:
    """Place every VO take into one silent 48 kHz mono track (header-safe)."""
    out = os.path.join(WORK, "vo.wav")
    frames_needed = int(48000 * total)
    buf = bytearray(frames_needed * 2)
    for sid, info in vos.items():
        with wave.open(info["wav"], "rb") as r:
            if r.getframerate() != 48000 or r.getnchannels() != 1 or r.getsampwidth() != 2:
                raise RuntimeError(f"unexpected wav format for {sid}")
            frames = r.readframes(r.getnframes())
        off = int(starts[sid] * 48000) * 2
        end = off + len(frames)
        if end > len(buf):
            buf.extend(b"\x00" * (end - len(buf)))
        buf[off:end] = frames
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(48000)
        w.writeframes(bytes(buf))
    return out


def write_srt(vos: dict, starts: dict) -> str:
    path = os.path.join(OUT, "integritywatch-field-fieldtest-en.srt")
    def ts(t):
        h = int(t // 3600); m = int((t % 3600) // 60); s = int(t % 60)
        ms = int(round((t - int(t)) * 1000))
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
    with open(path, "w", encoding="utf-8") as fh:
        for i, sid in enumerate(LINES, 1):
            fh.write(f"{i}\n{ts(starts[sid])} --> {ts(starts[sid] + vos[sid]['dur'])}\n"
                     f"{vos[sid]['text']}\n\n")
    return path


def main() -> int:
    for d in (WORK, OUT):
        os.makedirs(d, exist_ok=True)
    print("[1/6] voice over")
    vos = build_vo()
    print("[2/6] title cards")
    make_cards()
    print("[3/6] recording the app")
    targets = {sid: round(vos[sid]["dur"] + PAD[sid] - 0.5, 2) for sid in ("s3", "s4", "s5", "s5b")}
    marks = record_app(targets)
    print("[4/6] cutting scenes")
    durations, starts, t = {}, {}, 0.0
    for sid, _, _, _ in SCENES:
        durations[sid] = round(vos[sid]["dur"] + PAD[sid], 3)
        starts[sid] = round(t, 3)
        t += durations[sid]
    total = round(t, 3)

    seg_ranges = {
        "s3": (marks["dash_start"], marks["dash_end"]),
        "s4": (marks["ingest_start"], marks["ingest_end"]),
        "s5": (marks["asset_start"], marks["dossier_start"]),
        "s5b": (marks["dossier_start"], min(marks["end"], marks["video_dur"])),
    }
    clips = []
    for sid, kind, asset, caption in SCENES:
        raw = os.path.join(WORK, f"{sid}_raw.mp4")
        if kind == "card":
            clip_from_image(os.path.join(WORK, asset), raw, durations[sid],
                            zoom_in=(sid == "s1"))
        elif kind == "broll":
            clip_from_image(os.path.join(ASSETS, "broll", asset), raw, durations[sid])
        else:
            s, e = seg_ranges[sid]
            need = durations[sid]
            avail = max(0.6, e - s)
            start = s
            if avail > need:
                start = s + (avail - need) / 2.0
            clip_from_video(marks["video"], raw, start, need)
        final = os.path.join(WORK, f"{sid}.mp4")
        add_caption(raw, final, caption)
        clips.append(final)
        print(f"  {sid}: {durations[sid]:5.2f}s")

    # Pad any short screen clip by holding its last frame.
    for i, (sid, kind, _, _) in enumerate(SCENES):
        got = ffprobe_duration(clips[i])
        if got + 0.05 < durations[sid]:
            fixed = os.path.join(WORK, f"{sid}_pad.mp4")
            run(["ffmpeg", "-y", "-i", clips[i], "-vf",
                 f"tpad=stop_mode=clone:stop_duration={durations[sid] - got + 0.1:.2f}",
                 "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                 "-pix_fmt", "yuv420p", "-an", fixed])
            clips[i] = fixed

    print("[5/6] concatenating + audio")
    listfile = os.path.join(WORK, "scenes.txt")
    with open(listfile, "w", encoding="utf-8") as fh:
        for c in clips:
            fh.write(f"file '{c.replace(os.sep, '/')}'\n")
    silent = os.path.join(WORK, "video.mp4")
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", listfile,
         "-c", "copy", silent])

    vo_track = compose_vo(vos, starts, total)
    music = os.path.join(ASSETS, "music", "music.wav")
    final = os.path.join(OUT, "integritywatch-field-fieldtest-en.mp4")
    run([
        "ffmpeg", "-y", "-i", silent, "-i", vo_track, "-i", music,
        "-filter_complex",
        f"[2:a]atrim=0:{total},volume=0.13,afade=t=in:st=0:d=1.5,"
        f"afade=t=out:st={max(0, total - 3):.2f}:d=3[m];"
        f"[1:a][m]amix=inputs=2:duration=first:dropout_transition=0,alimiter=limit=0.95[a]",
        "-map", "0:v", "-map", "[a]", "-t", f"{total:.3f}",
        "-c:v", "libx264", "-preset", "slow", "-crf", "21",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart", final,
    ])

    print("[6/6] subtitles + manifest")
    srt = write_srt(vos, starts)
    burned = os.path.join(WORK, "burned.mp4")
    run(["ffmpeg", "-y", "-i", final, "-vf",
         f"subtitles=integritywatch-field-fieldtest-en.srt:force_style='{SRT_STYLE}'",
         "-c:v", "libx264", "-preset", "slow", "-crf", "21",
         "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", burned],
        cwd=OUT)
    shutil.move(burned, final)

    manifest = {
        "video": final,
        "duration": ffprobe_duration(final),
        "size_bytes": os.path.getsize(final),
        "subtitles": srt,
        "voice": VOICE,
        "scenes": [{"id": s, "kind": k, "start": starts[s], "duration": durations[s],
                    "text": LINES[s]} for s, k, _, _ in SCENES],
        "recorded_segments": {k: v for k, v in seg_ranges.items()},
    }
    with open(os.path.join(OUT, "fieldtest-video-manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=False)

    print(f"\nDONE {final}")
    print(f"     {manifest['duration']:.2f}s  {manifest['size_bytes'] / 1e6:.1f} MB")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
