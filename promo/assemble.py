"""IntegrityWatch Field promo assembler.

Phase 1 deliverable: a COMPLETE, ready-to-run assembly script. It renders a
1920x1080 H.264/AAC promo (~60 s) from:

  assets/vo/vo_*.wav           voiceover (6 lines)
  assets/music/music.wav       ambient underscore
  assets/screencast/*.png      app stills
  assets/screencast/walkthrough.mp4  app screen video
  assets/broll/*.png           AI b-roll stills (0..N, missing -> generated card)

Storyboard (6 scenes), effects (Ken Burns, crossfades, kinetic titles, teal/orange
grade, vignette) and EBU R128 loudness normalization are all implemented below.

Run:
  python assemble.py --selftest    # prove ffmpeg + zoompan path (does NOT build promo)
  python assemble.py               # full build into out/integritywatch-field-promo.mp4
"""
import argparse
import glob
import os
import re
import subprocess
import sys

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
ASSETS = os.path.join(HERE, "assets")
VO_DIR = os.path.join(ASSETS, "vo")
MUSIC = os.path.join(ASSETS, "music", "music.wav")
SCREENCAST = os.path.join(ASSETS, "screencast")
BROLL_DIR = os.path.join(ASSETS, "broll")
TITLES_DIR = os.path.join(ASSETS, "titles")
OUT_DIR = os.path.join(HERE, "out")
TMP_DIR = os.path.join(HERE, "out", ".tmp")
LANG = "en"  # "en" | "es"; set via --lang


def out_mp4(lang=None):
    lang = lang or LANG
    return os.path.join(OUT_DIR, "integritywatch-field-promo%s.mp4" % ("" if lang == "en" else "-" + lang))


def out_srt(lang=None):
    lang = lang or LANG
    return os.path.join(OUT_DIR, "integritywatch-field-promo%s.srt" % ("" if lang == "en" else "-" + lang))

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

W, H = 1920, 1080
FPS = 25
XFADE = 0.5          # crossfade between scenes (s)
PAD = 0.35           # per-scene padding added to VO length (s)
MUSIC_GAIN = 13.7    # dB; raise ambient bed (~-33.7 LUFS) to ~-20 LUFS under VO
GRADE = (
    "eq=contrast=1.04:saturation=1.10,"
    "colorbalance=rs=-0.04:bs=0.07:rh=0.04:bh=-0.05,"
    "vignette=PI/5"
)

FONT_CANDIDATES = [
    os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", "bahnschrift.ttf"),
    os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", "segoeuib.ttf"),
    os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", "arialbd.ttf"),
]

VO_TEXTS = {
    "en": {
        1: "What happens to your pipeline integrity when the connection drops?",
        2: "In oil and gas, the real work happens far from the office. Wells, pipelines, offshore platforms. And there, your data used to stop at the last bar of signal.",
        3: "Meet IntegrityWatch Field. An offline-first integrity and compliance operations center that runs entirely on your device. No server, no cloud, no connection required.",
        4: "Model corrosion with De Waard and Milliams. Size relief valves to API 520 and 526. Map pipelines by kilometer, with ILD and UT inspections. Run risk-based inspection with API 580. And let the R1 to R17 engine turn every reading into a decision.",
        5: "Seven languages. Light and dark. Import CSV and WITSML. Export portable case files. Install it once, and it works anywhere, fully offline.",
        6: "IntegrityWatch Field. Built for wells, pipelines, and offshore assets. Interested in a demo or implementation? Message me.",
    },
    "es": {
        1: "¿Qué pasa con la integridad de tus ductos cuando se pierde la conexión?",
        2: "En el sector del petróleo y el gas, el trabajo real ocurre lejos de la oficina. Pozos, oleoductos, plataformas marinas. Y ahí, tus datos solían detenerse en la última barra de señal.",
        3: "Te presento IntegrityWatch Field. Un centro de operaciones de integridad y cumplimiento que funciona primero sin conexión, y corre por completo en tu dispositivo. Sin servidor, sin nube, sin necesidad de conexión.",
        4: "Modela la corrosión con De Waard y Milliams. Dimensiona válvulas de alivio según API 520 y 526. Mapea oleoductos por kilómetro, con inspecciones ILD y UT. Ejecuta inspección basada en riesgo con API 580. Y deja que el motor R1 a R17 convierta cada lectura en una decisión.",
        5: "Siete idiomas. Modo claro y oscuro. Importa CSV y WITSML. Exporta archivos de caso portátiles. Instálalo una vez y funciona en cualquier lugar, totalmente sin conexión.",
        6: "IntegrityWatch Field. Diseñado para pozos, oleoductos y activos marinos. ¿Te interesa una demo o una implementación? Escríbeme.",
    },
}

TEXT = {
    "en": {
        "badge_offline": "100% OFFLINE",
        "title_offline_first": "Offline-first",
        "label_7_languages": "7 languages",
        "label_portable": "Portable case files",
        "cta_tagline": "Integrity that works offline",
        "cta_message": "Interested in a demo or implementation? Message me.",
    },
    "es": {
        "badge_offline": "100% SIN CONEXIÓN",
        "title_offline_first": "Sin conexión primero",
        "label_7_languages": "7 idiomas",
        "label_portable": "Archivos de caso portátiles",
        "cta_tagline": "Integridad que funciona sin conexión",
        "cta_message": "¿Te interesa una demo o implementación? Escríbeme.",
    },
}

EVIDENCE = os.path.join(ROOT, "docs", "evidence")


# --------------------------------------------------------------------------
# low-level helpers
def log(msg):
    print("[assemble] " + msg, flush=True)


def run(cmd):
    log("  $ " + " ".join(cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        log("  STDERR: " + (proc.stderr or "").strip()[-2000:])
        raise RuntimeError("ffmpeg failed (exit %d): %s" % (proc.returncode, " ".join(cmd)))
    return proc


def wav_duration(path):
    return float(sf.info(path).duration)


def img_size(path):
    with Image.open(path) as im:
        return im.size  # (w, h)


def video_duration(path):
    proc = subprocess.run(
        [FFMPEG, "-i", path], capture_output=True, text=True
    )
    for line in (proc.stderr or "").splitlines():
        if "Duration:" in line:
            hh, mm, ss = line.split("Duration:")[1].strip().split(",")[0].split(":")
            return int(hh) * 3600 + int(mm) * 60 + float(ss)
    raise RuntimeError("cannot read duration of %s" % path)


def resolve_font():
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return p
    return None


# --------------------------------------------------------------------------
# title / card rendering (PIL)
def _font(size, bold=True):
    path = resolve_font()
    if path:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default()


def _draw_centered(draw, text, font, y, fill, stroke=None, stroke_w=0):
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    x = (W - tw) // 2 - bbox[0]
    if stroke:
        draw.text((x, y), text, font=font, fill=fill, stroke_width=stroke_w, stroke_fill=stroke)
    else:
        draw.text((x, y), text, font=font, fill=fill)


def render_title_png(out_path, main_text, sub_text=None, size=110, sub_size=46,
                     fill=(255, 255, 255, 255), sub_fill=(200, 220, 235, 235),
                     shadow=(0, 0, 0, 160)):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    font = _font(size)
    sub_font = _font(sub_size)

    if sub_text:
        main_y = (H // 2) - 60
        sub_y = main_y + size + 30
    else:
        main_y = (H // 2) - size // 2

    _draw_centered(d, main_text, font, main_y + 4, shadow, shadow, 3)
    _draw_centered(d, main_text, font, main_y, fill)

    if sub_text:
        _draw_centered(d, sub_text, sub_font, sub_y + 3, shadow, shadow, 2)
        _draw_centered(d, sub_text, sub_font, sub_y, sub_fill)

    im.save(out_path)
    return out_path


def render_gradient_card(out_path, main_text, sub_text=None, color_top=(10, 30, 48), color_bot=(6, 14, 24)):
    """Dark gradient card used for missing b-roll stills and the CTA end card.
    sub_text may contain newlines for multiple centered lines."""
    import numpy as np
    top = np.array(color_top, dtype=np.float64)
    bot = np.array(color_bot, dtype=np.float64)
    ramp = np.linspace(0.0, 1.0, H, dtype=np.float64)[:, None]
    rows = (top[None, :] * (1 - ramp) + bot[None, :] * ramp)
    img = np.repeat(rows[:, None, :], W, axis=1).astype(np.uint8)
    rgba = Image.fromarray(img, "RGB").convert("RGBA")
    d = ImageDraw.Draw(rgba)
    font = _font(120)
    sub_font = _font(44)
    main_y = (H // 2) - 60
    _draw_centered(d, main_text, font, main_y, (255, 255, 255, 255))
    if sub_text:
        lines = sub_text.split("\n")
        start_y = main_y + 130
        for i, ln in enumerate(lines):
            _draw_centered(d, ln, sub_font, start_y + i * 56, (160, 200, 220, 255))
    rgba.save(out_path)
    return out_path


def np_lerp_color(c):
    return tuple(float(v) for v in c)


# --------------------------------------------------------------------------
# media resolution
def broll_named(name, label):
    """Resolve a named b-roll still. Returns the file if the designer placed it,
    else generates a dark gradient card fallback (never substitutes silently)."""
    p = os.path.join(BROLL_DIR, name)
    if os.path.exists(p):
        return p
    out = os.path.join(TITLES_DIR, name + ".fallback.png")
    if not os.path.exists(out):
        render_gradient_card(out, label, "field intelligence, offline")
    return out


def evidence_path(name):
    p = os.path.join(EVIDENCE, name)
    if os.path.exists(p):
        return p
    return None


# --------------------------------------------------------------------------
# ffmpeg filter builders
def kenburns_filter(w_in, h_in, dur):
    """Return a filter string turning a still into a 1920x1080 25 fps clip.

    Wide/landscape stills (aspect >= 1.5) get a slow zoom-in (Ken Burns);
    tall/portrait stills are scaled to COVER 1920x1080 preserving aspect and
    panned vertically with an animated crop (never distorts the aspect)."""
    frames = max(1, int(round(dur * FPS)))
    aspect = w_in / max(1, h_in)
    if aspect >= 1.5:
        # landscape zoom-in
        return (
            "scale=3840:2160:force_original_aspect_ratio=increase,"
            "crop=3840:2160,"
            "zoompan=z='1+0.0008*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
            ":d=%d:s=1920x1080:fps=25" % frames
        )
    # tall / portrait: scale-to-cover (aspect preserved), then pan a 1920x1080
    # window from top to bottom over the clip duration with an animated crop.
    return (
        "scale=1920:1080:force_original_aspect_ratio=increase,"
        "crop=1920:1080:0:'(ih-1080)*min(t/%.3f,1)'" % dur
    )


def title_input_filter(dur, t0, t1):
    """Build the filter fragment for one title overlay input (fade + slight zoom)."""
    frames = max(1, int(round(dur * FPS)))
    fin = max(0.0, t0)
    fout = max(fin + 0.1, t1 - 0.3)
    fade_d = 0.35
    return (
        "format=rgba,"
        "zoompan=z='1.0+0.0008*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
        ":d=%d:s=1920x1080:fps=25,"
        "format=rgba,"
        "fade=t=in:st=%.3f:d=%.3f:alpha=1,"
        "fade=t=out:st=%.3f:d=%.3f:alpha=1" % (frames, fin, fade_d, fout, fade_d)
    )


# --------------------------------------------------------------------------
# clip rendering
def render_clip(media, dur, out):
    """Normalize a single media item (still or video) to a 1920x1080 25 fps clip."""
    os.makedirs(os.path.dirname(out), exist_ok=True)
    cmd = [FFMPEG, "-y"]
    if media["kind"] == "still":
        path = media["path"]
        w, h = img_size(path)
        if w / max(1, h) < 1.5:
            cmd += ["-loop", "1", "-i", path]  # loop the still for the animated-crop pan
        else:
            cmd += ["-i", path]
        vf = kenburns_filter(w, h, dur) + ",setsar=1,settb=AVTB,format=yuv420p"
        cmd += ["-vf", vf, "-t", "%.3f" % dur, "-r", str(FPS)]
    elif media["kind"] == "video":
        cmd += ["-i", media["path"], "-t", "%.3f" % dur]
        vf = "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=25,settb=AVTB,format=yuv420p"
        cmd += ["-vf", vf, "-r", str(FPS), "-an"]
    else:
        raise ValueError("unknown media kind %r" % media["kind"])

    cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", out]
    run(cmd)
    return out


def concat_xfade(clips, out):
    """Concatenate clips with crossfades (same fps/res/size assumed)."""
    if len(clips) == 1:
        import shutil
        shutil.copyfile(clips[0], out)
        return out
    n = len(clips)
    cmd = [FFMPEG, "-y"]
    for c in clips:
        cmd += ["-i", c]

    durs = [video_duration(c) for c in clips]
    fc = []
    prev = "[0:v]"
    acc = durs[0]
    for i in range(1, n):
        offset = acc - XFADE
        label = "[v%d]" % i
        fc.append("%s[%d:v]xfade=transition=fade:duration=%.3f:offset=%.3f%s" %
                  (prev, i, XFADE, offset, label))
        prev = label
        acc = acc + durs[i] - XFADE

    fc.append("%sformat=yuv420p[vout]" % prev)
    cmd += ["-filter_complex", ";".join(fc), "-map", "[vout]",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", out]
    run(cmd)
    return out


def overlay_titles(video_in, titles, out):
    """Overlay pre-rendered title PNGs (with fade + slight zoom) onto a clip."""
    if not titles:
        import shutil
        shutil.copyfile(video_in, out)
        return out
    dur = video_duration(video_in)
    cmd = [FFMPEG, "-y", "-i", video_in]
    for t in titles:
        cmd += ["-i", t["png"]]

    n_in = 1 + len(titles)
    fc = ["[0:v]setpts=PTS-STARTPTS[base]"]
    overlays = []
    cur = "base"
    for i, t in enumerate(titles):
        idx = i + 1
        lab = "[t%d]" % idx
        fc.append("[%d:v]%s%s" % (idx, title_input_filter(dur, t["t0"], t["t1"]), lab))
        out_lab = "[o%d]" % idx
        fc.append("[%s]%soverlay=0:0%s" % (cur, lab, out_lab))
        cur = "o%d" % idx
        overlays.append(t)

    fc.append("[%s]format=yuv420p[vout]" % cur)
    cmd += ["-filter_complex", ";".join(fc), "-map", "[vout]",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", out]
    run(cmd)
    return out


def apply_grade(video_in, out):
    cmd = [FFMPEG, "-y", "-i", video_in, "-vf", GRADE + ",format=yuv420p",
           "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", out]
    run(cmd)
    return out


# --------------------------------------------------------------------------
# scenes
def build_scene(scene, dur, idx):
    """Render one scene to out/.tmp/scene-<idx>.mp4 (video only)."""
    tmp = os.path.join(TMP_DIR, "scene-%02d.mp4" % idx)
    titles = scene.get("titles", [])

    media_items = scene["media"]
    if len(media_items) == 1:
        base = os.path.join(TMP_DIR, "scene-%02d-base.mp4" % idx)
        render_clip(media_items[0], dur, base)
    else:
        sub_dur = dur / len(media_items)
        sub_clips = []
        for j, m in enumerate(media_items):
            sc = os.path.join(TMP_DIR, "scene-%02d-sub-%d.mp4" % (idx, j))
            render_clip(m, sub_dur + XFADE, sc)  # pad so xfades fill the scene
            sub_clips.append(sc)
        base = os.path.join(TMP_DIR, "scene-%02d-base.mp4" % idx)
        concat_xfade(sub_clips, base)
        # trim back to exact scene duration (the pad above made it slightly long)
        base = trim_clip(base, dur, os.path.join(TMP_DIR, "scene-%02d-base2.mp4" % idx))

    with_titles = os.path.join(TMP_DIR, "scene-%02d-titles.mp4" % idx)
    overlay_titles(base, titles, with_titles)
    apply_grade(with_titles, tmp)
    return tmp


def trim_clip(video_in, dur, out):
    cmd = [FFMPEG, "-y", "-i", video_in, "-t", "%.3f" % dur,
           "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", out]
    run(cmd)
    return out


def scene_definitions():
    def t(png, text, sub, t0, t1):
        return {"png": png, "text": text, "sub": sub, "t0": t0, "t1": t1}

    dash = os.path.join(SCREENCAST, "dashboard.png")
    psv = os.path.join(SCREENCAST, "psv-sizing.png")
    corr = os.path.join(SCREENCAST, "corrosion-detail.png")
    pmap = os.path.join(SCREENCAST, "pipeline-map.png")
    apm = os.path.join(SCREENCAST, "apm-detail.png")
    recs = os.path.join(SCREENCAST, "recommendations.png")
    walk = os.path.join(SCREENCAST, "walkthrough.mp4")

    offshore = broll_named("broll_offshore.png", "INTEGRITYWATCH FIELD")
    wellhead = broll_named("broll_wellhead.png", "REMOTE FIELD")
    bcorr = broll_named("broll_corrosion.png", "CORROSION")
    bpipeline = broll_named("broll_pipeline.png", "PIPELINES")
    bmaritime = broll_named("broll_maritime.png", "MARITIME")

    dark_es = evidence_path("dashboard-dark-es.png")
    light_ar = evidence_path("dashboard-light-ar.png")

    scenes = [
        {
            "vo": "vo_1.wav", "min": 4.5,
            "media": [{"kind": "still", "path": offshore}],
            "titles": [t(os.path.join(TITLES_DIR, "title-1.png"),
                         "INTEGRITYWATCH FIELD", None, 0.4, 4.2)],
        },
        {
            "vo": "vo_2.wav", "min": 10.0,
            "media": [{"kind": "still", "path": wellhead}],
            "titles": [t(os.path.join(TITLES_DIR, "badge-2.png"),
                         TEXT[LANG]["badge_offline"], None, 0.6, 13.0)],
        },
        {
            "vo": "vo_3.wav", "min": 11.0,
            "media": [{"kind": "still", "path": dash}],
            "titles": [t(os.path.join(TITLES_DIR, "title-3.png"),
                         TEXT[LANG]["title_offline_first"], None, 0.5, 13.0)],
        },
        {
            "vo": "vo_4.wav", "min": 20.0,
            "media": [
                {"kind": "video", "path": walk},
                {"kind": "still", "path": corr},
                {"kind": "still", "path": psv},
                {"kind": "still", "path": pmap},
                {"kind": "still", "path": apm},
                {"kind": "still", "path": recs},
                {"kind": "still", "path": bcorr},
                {"kind": "still", "path": bpipeline},
            ],
            "titles": [
                t(os.path.join(TITLES_DIR, "label-4a.png"), "API 520/526", None, 1.0, 6.0),
                t(os.path.join(TITLES_DIR, "label-4b.png"), "De Waard\u2013Milliams", None, 6.5, 11.5),
                t(os.path.join(TITLES_DIR, "label-4c.png"), "API 580 RBI", None, 12.0, 17.0),
                t(os.path.join(TITLES_DIR, "label-4d.png"), "R1\u2013R17", None, 17.5, 23.0),
            ],
        },
        {
            "vo": "vo_5.wav", "min": 10.0,
            "media": [
                {"kind": "still", "path": bmaritime},
                {"kind": "still", "path": dark_es or broll_named("broll_offshore.png", "INTEGRITYWATCH FIELD")},
                {"kind": "still", "path": light_ar or broll_named("broll_wellhead.png", "REMOTE FIELD")},
            ],
            "titles": [
                t(os.path.join(TITLES_DIR, "label-5a.png"), TEXT[LANG]["label_7_languages"], None, 0.8, 4.5),
                t(os.path.join(TITLES_DIR, "label-5b.png"), "CSV / WITSML", None, 5.0, 9.0),
                t(os.path.join(TITLES_DIR, "label-5c.png"), TEXT[LANG]["label_portable"], None, 9.5, 14.0),
            ],
        },
        {
            "vo": "vo_6.wav", "min": 8.0,
            "media": [{"kind": "still", "path": os.path.join(TITLES_DIR, "cta-card.png")}],
            "titles": [],
        },
    ]
    return scenes


# --------------------------------------------------------------------------
# audio
def measure_loudnorm(path):
    """First pass of two-pass loudnorm: measure the mix and return the values
    needed to apply a linear (accurate) normalization to -14 LUFS / -1.5 dBTP."""
    cmd = [FFMPEG, "-i", path, "-af",
           "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    text = (proc.stdout or "") + (proc.stderr or "")

    def get(key):
        m = re.search(r'"%s"\s*:\s*"([-0-9.]+)"' % key, text)
        return m.group(1) if m else None

    vals = {
        "input_i": get("input_i"),
        "input_tp": get("input_tp"),
        "input_lra": get("input_lra"),
        "input_thresh": get("input_thresh"),
    }
    if any(v is None for v in vals.values()):
        raise RuntimeError("loudnorm measure failed:\n%s" % text[-2000:])
    log("  loudnorm measured: I=%s TP=%s LRA=%s thresh=%s" %
        (vals["input_i"], vals["input_tp"], vals["input_lra"], vals["input_thresh"]))
    return vals


def build_audio_track(starts, durs, total):
    """Build the final audio deterministically in numpy, then loudness-normalize.

    VO is mixed at its natural level (speech peaks ~-2.6 dBFS); the ambient music
    bed is raised to ~-20 LUFS and ducked under VO; the whole mix is then measured
    and normalized to EBU R128 (-14 LUFS / -1.5 dBTP) with a gain + true-peak
    limiter, iterating once if the limiter pulls the loudness off target."""
    import numpy as np

    SR = 44100
    n = int(round(total * SR))
    vo_bus = np.zeros((n, 2), dtype=np.float64)
    vo_active = np.zeros(n, dtype=np.float64)

    vo_paths = sorted(glob.glob(os.path.join(VO_DIR, "vo_*.wav")))
    env_kernel = np.ones(int(0.10 * SR)) / int(0.10 * SR)
    for i, vp in enumerate(vo_paths):
        data, sr = sf.read(vp, dtype="float64")
        data = np.stack([data, data], axis=1) if data.ndim == 1 else data[:, :2]
        s = int(round(starts[i] * SR))
        e = min(n, s + data.shape[0])
        if e > s:
            seg = data[: e - s]
            vo_bus[s:e] += seg
            env = np.convolve(np.abs(seg[:, 0]), env_kernel, mode="same")
            vo_active[s:e] += env

    # music bed: raise to ~-20 LUFS, duck under VO, fade out its tail so it never
    # cuts abruptly (handles music both longer and shorter than the timeline).
    mus, sr = sf.read(MUSIC, dtype="float64")
    mus = np.stack([mus, mus], axis=1) if mus.ndim == 1 else mus[:, :2]
    mus = mus * (10 ** (MUSIC_GAIN / 20.0))
    f = int(3.0 * SR)
    if mus.shape[0] > n:
        mus = mus[:n]
        mus[-f:] *= np.linspace(1.0, 0.0, f)[:, None]
    else:
        mus[-f:] *= np.linspace(1.0, 0.0, f)[:, None]
        mus = np.pad(mus, ((0, n - mus.shape[0]), (0, 0)))
    env_norm = vo_active / (np.max(vo_active) + 1e-12)
    duck = 1.0 - 0.5 * np.clip(env_norm * 3.0, 0.0, 1.0)
    mus *= duck[:, None]

    mix = vo_bus + mus
    mix_pre = os.path.join(TMP_DIR, "mix-pre.wav")
    sf.write(mix_pre, np.clip(mix, -1.0, 1.0), SR, "PCM_16")

    # loudness-normalize to EBU R128 (-14 LUFS, -1.5 dBTP) with ffmpeg loudnorm.
    # TP is targeted at -1.8 dBTP so the AAC encode's true-peak overshoot still
    # lands the final file at or below -1.5 dBTP.
    mix_wav = os.path.join(TMP_DIR, "mix.wav")
    run([FFMPEG, "-y", "-i", mix_pre,
         "-af", "loudnorm=I=-14:TP=-1.8:LRA=11",
         "-ar", str(SR), "-ac", "2", "-c:a", "pcm_s16le", mix_wav])

    final_audio = os.path.join(TMP_DIR, "audio.m4a")
    run([FFMPEG, "-y", "-i", mix_wav, "-c:a", "aac", "-b:a", "192k", final_audio])
    return final_audio


# --------------------------------------------------------------------------
# SRT
def srt_time(sec):
    ms = int(round(sec * 1000))
    h = ms // 3600000
    m = (ms % 3600000) // 60000
    s = (ms % 60000) // 1000
    mm = ms % 1000
    return "%02d:%02d:%02d,%03d" % (h, m, s, mm)


def make_srt(starts, durs):
    lines = []
    for i, (st, du) in enumerate(zip(starts, durs)):
        idx = i + 1
        text = VO_TEXTS[LANG].get(idx, "")
        lines.append("%d" % idx)
        lines.append("%s --> %s" % (srt_time(st), srt_time(st + du)))
        lines.append(text)
        lines.append("")
    srt = out_srt()
    with open(srt, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return srt


# --------------------------------------------------------------------------
# self-test
def self_test():
    os.makedirs(TMP_DIR, exist_ok=True)

    # landscape branch (zoom-in Ken Burns)
    dash = os.path.join(SCREENCAST, "dashboard.png")
    if not os.path.exists(dash):
        raise RuntimeError("dashboard.png missing; run capture.py first")
    w, h = img_size(dash)
    out1 = os.path.join(TMP_DIR, "selftest-landscape.mp4")
    render_clip({"kind": "still", "path": dash}, 2.0, out1)
    log("SELF-TEST landscape OK: %s (%dx%d -> 1920x1080, %.2fs)" %
        (dash, w, h, video_duration(out1)))

    # tall branch (animated crop pan; must never distort aspect)
    tall = os.path.join(TMP_DIR, "selftest-tall.png")
    Image.new("RGB", (1920, 3200), (18, 38, 56)).save(tall)
    out2 = os.path.join(TMP_DIR, "selftest-tall.mp4")
    render_clip({"kind": "still", "path": tall}, 3.0, out2)
    log("SELF-TEST tall OK: 1920x3200 -> 1920x1080, %.2fs" % video_duration(out2))
    log("SELF-TEST tall filter: %s" % kenburns_filter(1920, 3200, 3.0))

    for f in (out1, out2, tall):
        if os.path.exists(f):
            os.remove(f)
    log("SELF-TEST clips deleted. ffmpeg: %s" % FFMPEG)
    return 0


# --------------------------------------------------------------------------
# main
def main(full, lang="en"):
    global LANG
    LANG = lang
    os.makedirs(TMP_DIR, exist_ok=True)
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(TITLES_DIR, exist_ok=True)

    if not full:
        log("dry run: computing timings + SRT only (use --full to build the video)")
    else:
        log("full build requested")

    vo_paths = sorted(glob.glob(os.path.join(VO_DIR, "vo_*.wav")))
    if len(vo_paths) != 6:
        raise RuntimeError("expected 6 VO files, found %d" % len(vo_paths))

    vo_durs = [wav_duration(p) for p in vo_paths]
    scenes = scene_definitions()
    durs = [max(s["min"], vo_durs[i] + PAD) for i, s in enumerate(scenes)]

    starts = [0.0]
    for i in range(1, len(durs)):
        starts.append(starts[i - 1] + durs[i - 1] - XFADE)
    total = starts[-1] + durs[-1]

    log("scene durations: %s" % ", ".join("%.2f" % d for d in durs))
    log("scene starts:    %s" % ", ".join("%.2f" % s for s in starts))
    log("total video:     %.2f s" % total)

    # render titles (always regenerate so text changes take effect)
    for i, scene in enumerate(scenes):
        for t in scene.get("titles", []):
            render_title_png(t["png"], t["text"], t.get("sub"))
    # CTA end card (wordmark + tagline + demo/implementation CTA; no GitHub URL)
    render_gradient_card(os.path.join(TITLES_DIR, "cta-card.png"),
                         "INTEGRITYWATCH FIELD",
                         TEXT[LANG]["cta_tagline"] + "\n" + TEXT[LANG]["cta_message"])

    # subtitles
    srt = make_srt(starts, durs)
    log("SRT written: %s" % srt)

    if not full:
        log("dry run complete (no video built).")
        return

    # render scenes
    scene_clips = []
    for i, scene in enumerate(scenes):
        clip = build_scene(scene, durs[i], i + 1)
        scene_clips.append(clip)
        log("scene %d rendered: %s" % (i + 1, clip))

    video_only = os.path.join(TMP_DIR, "video.mp4")
    concat_xfade(scene_clips, video_only)
    log("video track: %s (%.2fs)" % (video_only, video_duration(video_only)))

    audio = build_audio_track(starts, durs, total)
    log("audio track: %s" % audio)

    final = out_mp4()
    run([FFMPEG, "-y", "-i", video_only, "-i", audio,
         "-c:v", "copy", "-c:a", "copy", "-movflags", "+faststart",
         "-shortest", final])
    log("FINAL: %s" % final)
    log("done.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--full", action="store_true", help="build the full promo video")
    parser.add_argument("--selftest", action="store_true", help="run the ffmpeg/zoompan self-test")
    parser.add_argument("--lang", choices=["en", "es"], default="en", help="language: en or es")
    args = parser.parse_args()

    if args.selftest:
        self_test()
    else:
        main(args.full, args.lang)
