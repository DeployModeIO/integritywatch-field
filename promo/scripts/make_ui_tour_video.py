"""Operator-focused LinkedIn cut (plant Â· pipeline Â· refinery), English VO.

  python promo/scripts/make_operator_video.py      (server on :8419)

Outputs promo/out/integritywatch-field-uitour-en.mp4 + .srt + manifest.
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
WORK = os.path.join(OUT, ".uivideo")
QA = os.path.join(ROOT, "tools", "qa")
BASE = "http://localhost:8419/"
VOICE = "en-US-ChristopherNeural"
FALLBACK = ["en-US-GuyNeural", "en-GB-RyanNeural"]
RATE = "-2%"

NAVY, BLUE, STEEL, WHITE = "#11161c", "#0b5cad", "#8d99a6", "#ffffff"

SCENES = [
    ("s1", "card", "title_1.png"),
    ("s2", "screen", "dashboard"),
    ("s3", "screen", "corrosion"),
    ("s4", "screen", "apm"),
    ("s5", "screen", "psv"),
    ("s6", "screen", "pipeline"),
    ("s7", "still", "docs/ui-tour-2026-10-31/11-ingest-validation.png"),
    ("s8", "screen", "records"),
    ("s9", "screen", "reports"),
    ("s10", "card", "title_2.png"),
]

LINES = {
    "s1": "Every integrity function your operators need, on one tablet, with no server "
          "and no connection.",
    "s2": "Start on the dashboard. Key indicators, a heatmap of every monitoring point, "
          "and symbols that tell you what the equipment is at a glance.",
    "s3": "Open a point. The pictogram says what it is, the state says how bad it is, "
          "and the trend shows where it is going.",
    "s4": "Register assets against ISO 14224. The category carries its symbol, and the "
          "risk band drives the inspection interval.",
    "s5": "Relief valves keep their own registry, with sizing and overdue tests flagged "
          "in red before anyone has to ask.",
    "s6": "A pipeline is not an icon. It is a kilometres bar: severity per segment, "
          "every asset placed by station, findings where they happened.",
    "s7": "Inject the field round as a CSV. Columns are mapped automatically, every row "
          "is validated, and the bad one is rejected with a reason.",
    "s8": "Run the rules and the app turns readings into ranked recommendations.",
    "s9": "Then generate the dossier on the device, ready to print, sign and hand over.",
    "s10": "Field data. Field decisions. No signal required.",
}

PAD = {"s1": 1.4, "s2": 1.4, "s3": 1.4, "s4": 1.4, "s5": 1.4,
       "s6": 1.5, "s7": 1.5, "s8": 1.3, "s9": 1.4, "s10": 2.0}

SRT_STYLE = ("FontName=Segoe UI,FontSize=13,PrimaryColour=&H00FFFFFF,"
             "OutlineColour=&H00000000,BorderStyle=1,Outline=1.3,Shadow=0.7,"
             "MarginV=24,Alignment=2")


def run(cmd, cwd=None):
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError("cmd failed: %s\n%s" % (" ".join(cmd), p.stderr[-2000:]))
    return p


def dur(path):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                      "-of", "default=nw=1:nk=1", path]).stdout.strip())


def font(size, bold=True):
    return ImageFont.truetype(os.path.join("C:\\Windows\\Fonts",
                                           "segoeuib.ttf" if bold else "segoeui.ttf"), size)


async def synth(text, mp3):
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
        run(["ffmpeg", "-y", "-i", mp3, "-ar", "48000", "-ac", "1",
             "-c:a", "pcm_s16le", wav])
        vos[sid] = {"wav": wav, "dur": dur(wav), "text": text, "voice": voice}
        print(f"  VO {sid}: {vos[sid]['dur']:5.2f}s")
    return vos


def make_cards():
    W, H = 1920, 1080
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 22, H], fill=BLUE)
    d.text((150, 320), "INTEGRITYWATCH FIELD", font=font(34), fill=STEEL)
    d.text((150, 390), "Every function.", font=font(88), fill=WHITE)
    d.text((150, 495), "One tablet.", font=font(88), fill=WHITE)
    d.line([150, 640, 410, 640], fill=BLUE, width=6)
    d.text((150, 690), "Ingest · assets · relief valves · pipelines · rules · reports",
           font=font(30, False), fill=STEEL)
    img.save(os.path.join(WORK, "title_1.png"))

    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 22, H], fill=BLUE)
    d.text((150, 290), "IntegrityWatch Field", font=font(92), fill=WHITE)
    d.line([150, 430, 410, 430], fill=BLUE, width=6)
    d.text((150, 480), "Offline integrity, inspection and compliance",
           font=font(44, False), fill=STEEL)
    d.text((150, 560), "for wells, pipelines and process plants",
           font=font(44, False), fill=STEEL)
    d.text((150, 700), "github.com/DeployModeIO/integritywatch-field",
           font=font(36, False), fill=WHITE)
    d.text((150, 765), "Tablet · no server · no cloud", font=font(34, False), fill=BLUE)
    img.save(os.path.join(WORK, "title_2.png"))
    print("  cards written")


def record_ui(targets: dict) -> dict:
    sys.path.insert(0, QA)
    from run_ui_tour import tr, click, go, fill  # noqa: E402

    rec_dir = os.path.join(WORK, "rec")
    os.makedirs(rec_dir, exist_ok=True)
    csv_path = os.path.join(ROOT, "datos-prueba", "ui-tour-demo.csv")
    marks, t0 = {}, time.monotonic()

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1920, "height": 1080},
                                  record_video_dir=rec_dir,
                                  record_video_size={"width": 1920, "height": 1080},
                                  locale="en-US")
        page = ctx.new_page()

        def hold(start_mark, target):
            while (time.monotonic() - t0) - start_mark < target:
                page.wait_for_timeout(120)

        def clean():
            page.evaluate("() => { const r=document.getElementById('toast-region'); if (r) r.textContent=''; }")

        page.goto(BASE, wait_until="domcontentloaded")
        page.wait_for_selector("#run-rules", timeout=45000)
        page.wait_for_function(
            "document.querySelector('#main') && document.querySelector('#main').children.length > 0",
            timeout=45000)
        page.wait_for_timeout(2000)

        # s2 — dashboard
        clean()
        marks["dash_start"] = time.monotonic() - t0
        page.mouse.wheel(0, 260); page.wait_for_timeout(900); page.mouse.wheel(0, -260)
        page.wait_for_timeout(500)
        hold(marks["dash_start"], targets["s2"])
        marks["corr_start"] = time.monotonic() - t0

        # s3 — corrosion list + detail
        go(page, "#/corrosion", 1200)
        page.wait_for_timeout(700)
        go(page, "#/corrosion/mp/MP-CORR-001", 1400)
        page.wait_for_timeout(600)
        hold(marks["corr_start"], targets["s3"])
        marks["apm_start"] = time.monotonic() - t0

        # s4 — assets
        go(page, "#/apm", 1400)
        page.wait_for_timeout(900)
        hold(marks["apm_start"], targets["s4"])
        marks["psv_start"] = time.monotonic() - t0

        # s5 — relief valves
        go(page, "#/psv", 1400)
        page.wait_for_timeout(900)
        hold(marks["psv_start"], targets["s5"])
        marks["pipe_start"] = time.monotonic() - t0

        # s6 — pipeline map
        sid = page.evaluate("""async () => { const r = await IW.core.db.getAll('pipelineSystems'); return r[0] ? r[0].id : null; }""")
        if sid:
            go(page, "#/pipelines/" + sid, 1500)
            page.evaluate("() => { const m = document.querySelector('.map-card'); if (m) m.scrollIntoView({block:'center'}); }")
            page.wait_for_timeout(900)
        hold(marks["pipe_start"], targets["s6"])
        marks["ingest_start"] = time.monotonic() - t0

        # s7 — ingestion
        go(page, "#/ingest", 1200)
        page.wait_for_selector("#csv-file", timeout=15000)
        page.wait_for_timeout(900)
        clean()
        page.set_input_files("#csv-file", csv_path)
        page.wait_for_timeout(1300)
        page.get_by_role("button", name=tr(page, "ingest.runValidation")).first.click()
        page.wait_for_timeout(1600)
        page.get_by_role("button", name=tr(page, "ingest.importBtn")).first.click()
        page.wait_for_timeout(1400)
        clean()
        page.mouse.wheel(0, 220)
        page.wait_for_timeout(500)
        hold(marks["ingest_start"], targets["s7"])
        marks["recs_start"] = time.monotonic() - t0

        # s8 — rules
        page.click("#run-rules")
        page.wait_for_timeout(2400)
        go(page, "#/recommendations", 1300)
        page.wait_for_timeout(700)
        hold(marks["recs_start"], targets["s8"])
        marks["rep_start"] = time.monotonic() - t0

        # s9 — dossier (reload drops the stale-render race)
        page.evaluate("location.hash='#/reports'")
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("#main select", timeout=20000)
        page.wait_for_timeout(1000)
        page.evaluate("""() => { const s=document.querySelector('#main select'); s.value='dossier'; s.dispatchEvent(new Event('change',{bubbles:true})); }""")
        page.wait_for_timeout(700)
        page.evaluate("""() => { const s=document.querySelectorAll('#main select')[1]; const o=Array.from(s.options).find(o=>o.text.includes('MP-CORR-001')); if(o){ s.value=o.value; s.dispatchEvent(new Event('change',{bubbles:true})); } }""")
        page.wait_for_timeout(400)
        page.get_by_role("button", name=tr(page, "reports.generate")).first.click()
        page.wait_for_timeout(1800)
        page.mouse.wheel(0, 180)
        page.wait_for_timeout(600)
        hold(marks["rep_start"], targets["s9"])
        marks["end"] = time.monotonic() - t0

        ctx.close()
        browser.close()

    videos = [os.path.join(rec_dir, f) for f in os.listdir(rec_dir) if f.endswith(".webm")]
    video = max(videos, key=os.path.getmtime)
    marks["video"] = video
    marks["video_dur"] = dur(video)
    print(f"  recording {os.path.basename(video)} {marks['video_dur']:.1f}s")
    return marks


def clip_image(img, out, d, zoom_in=True):
    fps = 30
    frames = max(2, int(d * fps))
    z = "min(zoom+0.00045,1.12)" if zoom_in else "if(lte(zoom,1.0),1.12,max(1.001,zoom-0.00045))"
    vf = (f"scale=2400:-1,zoompan=z='{z}':d={frames}:s=1920x1080:fps={fps},"
          f"trim=duration={d},setsar=1,fade=t=in:st=0:d=0.4")
    run(["ffmpeg", "-y", "-loop", "1", "-i", img, "-t", f"{d:.3f}", "-vf", vf,
         "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-an", out])


def clip_still(img, out, d):
    vf = ("scale=1920:1080:force_original_aspect_ratio=decrease,"
          "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x11161c,fps=30,"
          "setsar=1,fade=t=in:st=0:d=0.4")
    run(["ffmpeg", "-y", "-loop", "1", "-i", img, "-t", f"{d:.3f}", "-vf", vf,
         "-c:v", "libx264", "-preset", "medium", "-crf", "20",
         "-pix_fmt", "yuv420p", "-an", out])


def clip_video(src, out, start, d):
    vf = ("scale=1920:1080:force_original_aspect_ratio=decrease,"
          "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x11161c,fps=30,"
          "setsar=1,fade=t=in:st=0:d=0.35")
    run(["ffmpeg", "-y", "-ss", f"{max(0.0,start):.3f}", "-i", src, "-t", f"{d:.3f}",
         "-vf", vf, "-c:v", "libx264", "-preset", "medium", "-crf", "20",
         "-pix_fmt", "yuv420p", "-an", out])


def compose_vo(vos, starts, total):
    out = os.path.join(WORK, "vo.wav")
    buf = bytearray(int(48000 * total) * 2)
    for sid, info in vos.items():
        with wave.open(info["wav"], "rb") as r:
            frames = r.readframes(r.getnframes())
        off = int(starts[sid] * 48000) * 2
        end = off + len(frames)
        if end > len(buf):
            buf.extend(b"\x00" * (end - len(buf)))
        buf[off:end] = frames
    with wave.open(out, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(48000)
        w.writeframes(bytes(buf))
    return out


def write_srt(vos, starts):
    path = os.path.join(OUT, "integritywatch-field-uitour-en.srt")
    def ts(t):
        h = int(t // 3600); m = int((t % 3600) // 60); s = int(t % 60)
        ms = int(round((t - int(t)) * 1000))
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
    with open(path, "w", encoding="utf-8") as fh:
        for i, sid in enumerate(LINES, 1):
            fh.write(f"{i}\n{ts(starts[sid])} --> {ts(starts[sid] + vos[sid]['dur'])}\n"
                     f"{LINES[sid]}\n\n")
    return path


def write_ass(vos, starts) -> str:
    path = os.path.join(OUT, "integritywatch-field-uitour-en.ass")
    def ts(t):
        h = int(t // 3600); m = int((t % 3600) // 60); sec = t % 60
        return f"{h:d}:{m:02d}:{sec:05.2f}"
    header = ("[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n"
              "WrapStyle: 0\nScaledBorderAndShadow: yes\n\n"
              "[V4+ Styles]\n"
              "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
              "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, "
              "ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, "
              "MarginL, MarginR, MarginV, Encoding\n"
              "Style: Default,Segoe UI,34,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,"
              "-1,0,0,0,100,100,0,0,1,2.0,0.6,2,90,90,86,1\n\n"
              "[Events]\n"
              "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, "
              "Effect, Text\n")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(header)
        for sid in LINES:
            import textwrap
            text = "\\N".join(textwrap.wrap(LINES[sid].replace("\n", " "), 64))
            fh.write(f"Dialogue: 0,{ts(starts[sid])},{ts(starts[sid] + vos[sid]['dur'])},"
                     f"Default,,0,0,0,,{text}\n")
    return path


def main() -> int:
    for d in (WORK, OUT):
        os.makedirs(d, exist_ok=True)
    print("[1/6] voice over")
    vos = build_vo()
    print("[2/6] cards")
    make_cards()
    print("[3/6] recording")
    targets = {k: round(vos[k]["dur"] + PAD[k] - 0.5, 2) for k in ("s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9")}
    marks = record_ui(targets)

    print("[4/6] scenes")
    durations, starts, t = {}, {}, 0.0
    for sid, _, _ in SCENES:
        durations[sid] = round(vos[sid]["dur"] + PAD[sid], 3)
        starts[sid] = round(t, 3)
        t += durations[sid]
    total = round(t, 3)

    ranges = {
        "s2": (marks["dash_start"], marks["corr_start"]),
        "s3": (marks["corr_start"], marks["apm_start"]),
        "s4": (marks["apm_start"], marks["psv_start"]),
        "s5": (marks["psv_start"], marks["pipe_start"]),
        "s6": (marks["pipe_start"], marks["ingest_start"]),
        "s7": (marks["ingest_start"], marks["recs_start"]),
        "s8": (marks["recs_start"], marks["rep_start"]),
        "s9": (marks["rep_start"], min(marks["end"], marks["video_dur"])),
    }
    clips = []
    for sid, kind, asset in SCENES:
        raw = os.path.join(WORK, f"{sid}.mp4")
        if kind == "card":
            clip_image(os.path.join(WORK, asset), raw, durations[sid], sid == "s1")
        elif kind == "still":
            clip_still(os.path.join(ROOT, asset.replace("/", os.sep)), raw, durations[sid])
        elif kind == "broll":
            clip_image(os.path.join(ASSETS, "broll", asset), raw, durations[sid])
        else:
            s, e = ranges[sid]
            avail = max(0.6, e - s)
            start = s + max(0.0, (avail - durations[sid]) / 2)
            clip_video(marks["video"], raw, start, durations[sid])
        got = dur(raw)
        if got + 0.05 < durations[sid]:
            pad = os.path.join(WORK, f"{sid}_p.mp4")
            run(["ffmpeg", "-y", "-i", raw, "-vf",
                 f"tpad=stop_mode=clone:stop_duration={durations[sid]-got+0.1:.2f}",
                 "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                 "-pix_fmt", "yuv420p", "-an", pad])
            raw = pad
        clips.append(raw)
        print(f"  {sid} {durations[sid]:.2f}s")

    print("[5/6] concat + audio")
    lst = os.path.join(WORK, "scenes.txt")
    with open(lst, "w", encoding="utf-8") as fh:
        for c in clips:
            fh.write(f"file '{c.replace(os.sep,'/')}'\n")
    silent = os.path.join(WORK, "video.mp4")
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", silent])
    vo = compose_vo(vos, starts, total)
    music = os.path.join(ASSETS, "music", "music.wav")
    final = os.path.join(OUT, "integritywatch-field-uitour-en.mp4")
    run(["ffmpeg", "-y", "-i", silent, "-i", vo, "-i", music, "-filter_complex",
         f"[2:a]atrim=0:{total},volume=0.13,afade=t=in:st=0:d=1.5,"
         f"afade=t=out:st={max(0,total-3):.2f}:d=3[m];"
         f"[1:a][m]amix=inputs=2:duration=first:dropout_transition=0,alimiter=limit=0.95[a]",
         "-map", "0:v", "-map", "[a]", "-t", f"{total:.3f}",
         "-c:v", "libx264", "-preset", "slow", "-crf", "21", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", final])

    print("[6/6] subtitles")
    srt = write_srt(vos, starts)
    ass = write_ass(vos, starts)
    burned = os.path.join(WORK, "burned.mp4")
    run(["ffmpeg", "-y", "-i", final, "-vf",
         "ass=integritywatch-field-uitour-en.ass",
         "-c:v", "libx264", "-preset", "slow", "-crf", "21", "-pix_fmt", "yuv420p",
         "-c:a", "copy", "-movflags", "+faststart", burned], cwd=OUT)
    shutil.move(burned, final)

    manifest = {"video": final, "duration": dur(final),
                "size_bytes": os.path.getsize(final), "subtitles": srt,
                "voice": VOICE,
                "scenes": [{"id": s, "start": starts[s], "duration": durations[s],
                            "text": LINES[s]} for s, _, _ in SCENES]}
    with open(os.path.join(OUT, "uitour-video-manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=False)
    print(f"\nDONE {final}  {manifest['duration']:.2f}s  {manifest['size_bytes']/1e6:.1f} MB")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)

