"""Operator-focused LinkedIn cut (plant · pipeline · refinery), English VO.

  python promo/scripts/make_operator_video.py      (server on :8419)

Outputs promo/out/integritywatch-field-operators-en.mp4 + .srt + manifest.
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
WORK = os.path.join(OUT, ".opsvideo")
QA = os.path.join(ROOT, "tools", "qa")
BASE = "http://localhost:8419/"
VOICE = "en-US-ChristopherNeural"
FALLBACK = ["en-US-GuyNeural", "en-GB-RyanNeural"]
RATE = "-2%"

NAVY, BLUE, STEEL, WHITE = "#11161c", "#0b5cad", "#8d99a6", "#ffffff"

SCENES = [
    ("s1", "card", "title_1.png"),
    ("s2", "broll", "broll_plant.png"),
    ("s3", "screen", "dashboard"),
    ("s4", "screen", "ingest"),
    ("s5", "screen", "asset"),
    ("s6", "screen", "dossier"),
    ("s7", "card", "title_2.png"),
]

LINES = {
    "s1": "This is the round that still ends on paper. A clipboard, a shift, and numbers "
          "retyped back at the office, hours after the reading was taken.",
    "s2": "Plant, pipeline, refinery. Alarm floods, relief valves past their test date, and "
          "inspection findings that nobody can find at two in the morning.",
    "s3": "IntegrityWatch Field runs on the tablet. No server, no cloud, and no signal "
          "required before an operator can make a decision.",
    "s4": "Import the round as a CSV. Forty eight readings, mapped, validated and committed "
          "on the device. Zero rows skipped, and the evidence stays with the shift.",
    "s5": "Register the equipment against ISO 14224, set the risk band, and the inspection "
          "interval follows. Overdue relief valves surface on their own.",
    "s6": "Then generate the dossier on the same tablet, ready to print, sign and hand over "
          "without waiting for the network to come back.",
    "s7": "Field data, field decisions, no signal required.",
}

PAD = {"s1": 1.6, "s2": 1.6, "s3": 1.5, "s4": 1.7, "s5": 1.7, "s6": 1.7, "s7": 2.0}
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
    d.text((150, 320), "THE OPERATOR'S ROUND", font=font(36), fill=STEEL)
    d.text((150, 390), "Paper does not", font=font(86), fill=WHITE)
    d.text((150, 495), "survive the shift.", font=font(86), fill=WHITE)
    d.line([150, 640, 410, 640], fill=BLUE, width=6)
    d.text((150, 690), "Alarm flood threshold: 10 alarms in 10 minutes  ·  EEMUA 191",
           font=font(32, False), fill=STEEL)
    img.save(os.path.join(WORK, "title_1.png"))

    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 22, H], fill=BLUE)
    d.text((150, 290), "IntegrityWatch Field", font=font(92), fill=WHITE)
    d.line([150, 430, 410, 430], fill=BLUE, width=6)
    d.text((150, 480), "For plant, pipeline and refinery operators",
           font=font(46, False), fill=STEEL)
    d.text((150, 550), "Offline integrity, inspection and handover",
           font=font(46, False), fill=STEEL)
    d.text((150, 690), "github.com/DeployModeIO/integritywatch-field",
           font=font(36, False), fill=WHITE)
    d.text((150, 755), "Tablet · no server · no cloud", font=font(34, False), fill=BLUE)
    img.save(os.path.join(WORK, "title_2.png"))
    print("  cards written")


def record_ops(targets: dict) -> dict:
    sys.path.insert(0, QA)
    from run_operator_tests import fill_form, click_btn, tr, wait_app, go  # noqa: E402

    rec_dir = os.path.join(WORK, "rec")
    os.makedirs(rec_dir, exist_ok=True)
    ds = json.load(open(os.path.join(ROOT, "datos-prueba", "ops", "operator-dataset.json"),
                        encoding="utf-8"))
    mps = ds["monitoringPoints"]
    asset = ds["apmAssets"][0]
    marks, t0 = {}, time.monotonic()

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1920, "height": 1080},
                                  record_video_dir=rec_dir,
                                  record_video_size={"width": 1920, "height": 1080},
                                  locale="en-US")
        page = ctx.new_page()

        def hold(start, target):
            while (time.monotonic() - t0) - start < target:
                page.wait_for_timeout(120)

        def clean():
            page.evaluate("""() => { const r=document.getElementById('toast-region'); if(r) r.textContent=''; }""")

        page.goto(BASE, wait_until="domcontentloaded")
        wait_app(page)

        # setup (not filmed): six points so the CSV maps
        go(page, "#/corrosion")
        for mp in mps:
            pipe = next((p for p in ds["realPipelines"] if p["id"] == mp["line"]), None)
            tnom = pipe["wallThicknessMm"] if pipe else 12.7
            proc = mp["process"]
            click_btn(page, "corrosion.newPoint")
            page.wait_for_timeout(240)
            fill_form(page, {
                "code": mp["code"], "name": mp["name"], "sector": mp["sector"],
                "systemId": mp["line"], "line": mp["line"], "material": mp["material"],
                "sensorType": mp["sensorType"], "tNom": tnom, "tMin": round(tnom * 0.8, 1),
                "h2sPpm": proc["h2sPpm"], "co2Ppm": proc["co2Ppm"],
                "totalPressureKpa": proc["totalPressureKpa"], "tempC": proc["tempC"],
                "bswPct": proc["bswPct"], "velocityMs": proc["velocityMs"],
                "inhibitorTargetPpm": proc["inhibitorTargetPpm"],
                "inhibitorResidualPpm": proc["inhibitorResidualPpm"],
            }, prefix="cf-")
            click_btn(page, "common.save")
            page.wait_for_timeout(380)

        # s4 — ingest
        page.evaluate("location.hash='#/ingest'")
        page.wait_for_timeout(1000)
        clean()
        marks["ingest_start"] = time.monotonic() - t0
        page.set_input_files("#csv-file", os.path.join(ROOT, "datos-prueba", "ops", "carga-ops.csv"))
        page.wait_for_timeout(1200)
        page.get_by_role("button", name=tr(page, "ingest.runValidation")).first.click()
        page.wait_for_timeout(1500)
        page.get_by_role("button", name=tr(page, "ingest.importBtn")).first.click()
        page.wait_for_timeout(1500)
        clean()
        page.mouse.wheel(0, 240)
        page.wait_for_timeout(600)
        hold(marks["ingest_start"], targets["s4"])
        marks["ingest_end"] = time.monotonic() - t0

        # rules so the dashboard is meaningful
        page.click("#run-rules")
        page.wait_for_timeout(2400)

        # s3 — dashboard
        page.evaluate("location.hash='#/dashboard'")
        page.wait_for_timeout(1200)
        clean()
        marks["dash_start"] = time.monotonic() - t0
        page.mouse.wheel(0, 300)
        page.wait_for_timeout(1000)
        page.mouse.wheel(0, -300)
        page.wait_for_timeout(700)
        hold(marks["dash_start"], targets["s3"])
        marks["dash_end"] = time.monotonic() - t0

        # s5 — asset
        page.evaluate("location.hash='#/apm'")
        page.wait_for_timeout(900)
        marks["asset_start"] = time.monotonic() - t0
        click_btn(page, "apm.newAsset")
        page.wait_for_timeout(320)
        fill_form(page, {
            "code": asset["code"], "name": asset["name"], "sector": asset["sector"],
            "criticality": asset["criticality"], "status": "running",
            "pof": asset["rbi"]["pof"], "cof": asset["rbi"]["cof"],
            "inspectionBaseMonths": asset["rbi"]["inspectionBaseMonths"],
        })
        page.evaluate("""() => { const s=document.querySelector('#fld-category');
            if (s) { s.value='distillationUnit'; s.dispatchEvent(new Event('change',{bubbles:true})); } }""")
        page.wait_for_timeout(600)
        click_btn(page, "common.save")
        page.wait_for_timeout(800)
        hold(marks["asset_start"], targets["s5"])
        marks["dossier_start"] = time.monotonic() - t0

        # s6 — dossier (reload avoids the known stale-render race)
        page.evaluate("location.hash='#/reports'")
        page.reload(wait_until="domcontentloaded")
        wait_app(page)
        page.wait_for_timeout(600)
        page.evaluate("""() => { const s=document.querySelector('#main select');
            s.value='dossier'; s.dispatchEvent(new Event('change',{bubbles:true})); }""")
        page.wait_for_timeout(700)
        page.evaluate("""() => { const s=document.querySelectorAll('#main select')[1];
            const o=[...s.options].find(o=>o.text.includes('MP-GB-CDU-OVH'));
            if(o){ s.value=o.value; s.dispatchEvent(new Event('change',{bubbles:true})); } }""")
        page.wait_for_timeout(400)
        page.get_by_role("button", name=tr(page, "reports.generate")).first.click()
        page.wait_for_timeout(2000)
        page.mouse.wheel(0, 200)
        page.wait_for_timeout(800)
        hold(marks["dossier_start"], targets["s6"])
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
    path = os.path.join(OUT, "integritywatch-field-operators-en.srt")
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
    path = os.path.join(OUT, "integritywatch-field-operators-en.ass")
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
    targets = {k: round(vos[k]["dur"] + PAD[k] - 0.5, 2) for k in ("s3", "s4", "s5", "s6")}
    marks = record_ops(targets)

    print("[4/6] scenes")
    durations, starts, t = {}, {}, 0.0
    for sid, _, _ in SCENES:
        durations[sid] = round(vos[sid]["dur"] + PAD[sid], 3)
        starts[sid] = round(t, 3)
        t += durations[sid]
    total = round(t, 3)

    ranges = {
        "s3": (marks["dash_start"], marks["dash_end"]),
        "s4": (marks["ingest_start"], marks["ingest_end"]),
        "s5": (marks["asset_start"], marks["dossier_start"]),
        "s6": (marks["dossier_start"], min(marks["end"], marks["video_dur"])),
    }
    clips = []
    for sid, kind, asset in SCENES:
        raw = os.path.join(WORK, f"{sid}.mp4")
        if kind == "card":
            clip_image(os.path.join(WORK, asset), raw, durations[sid], sid == "s1")
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
    final = os.path.join(OUT, "integritywatch-field-operators-en.mp4")
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
         "ass=integritywatch-field-operators-en.ass",
         "-c:v", "libx264", "-preset", "slow", "-crf", "21", "-pix_fmt", "yuv420p",
         "-c:a", "copy", "-movflags", "+faststart", burned], cwd=OUT)
    shutil.move(burned, final)

    manifest = {"video": final, "duration": dur(final),
                "size_bytes": os.path.getsize(final), "subtitles": srt,
                "voice": VOICE,
                "scenes": [{"id": s, "start": starts[s], "duration": durations[s],
                            "text": LINES[s]} for s, _, _ in SCENES]}
    with open(os.path.join(OUT, "operators-video-manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=False)
    print(f"\nDONE {final}  {manifest['duration']:.2f}s  {manifest['size_bytes']/1e6:.1f} MB")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
