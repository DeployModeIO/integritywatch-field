"""Generate the 6 English voiceover WAV files for the IntegrityWatch Field promo.

Uses edge_tts (voice en-US-ChristopherNeural, rate -4%, fallback en-US-GuyNeural)
and converts the resulting MP3 to 44.1 kHz mono 16-bit WAV with ffmpeg.
"""
import asyncio
import os
import subprocess
import sys

import edge_tts
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "..", "assets", "vo")
TMP_DIR = os.path.join(HERE, "..", "assets", "vo", "_tmp")

PRIMARY_VOICE = "es-MX-JorgeNeural"
FALLBACK_VOICES = ["es-MX-LibertoNeural", "es-CO-GonzaloNeural", "es-AR-TomasNeural"]
RATE = "-4%"

LINES = {
    1: "¿Qué pasa con la integridad de tus ductos cuando se pierde la conexión?",
    2: "En el sector del petróleo y el gas, el trabajo real ocurre lejos de la oficina. Pozos, oleoductos, plataformas marinas. Y ahí, tus datos solían detenerse en la última barra de señal.",
    3: "Te presento IntegrityWatch Field. Un centro de operaciones de integridad y cumplimiento que funciona primero sin conexión, y corre por completo en tu dispositivo. Sin servidor, sin nube, sin necesidad de conexión.",
    4: "Modela la corrosión con De Waard y Milliams. Dimensiona válvulas de alivio según API 520 y 526. Mapea oleoductos por kilómetro, con inspecciones ILD y UT. Ejecuta inspección basada en riesgo con API 580. Y deja que el motor R1 a R17 convierta cada lectura en una decisión.",
    5: "Siete idiomas. Modo claro y oscuro. Importa CSV y WITSML. Exporta archivos de caso portátiles. Instálalo una vez y funciona en cualquier lugar, totalmente sin conexión.",
    6: "IntegrityWatch Field. Diseñado para pozos, oleoductos y activos marinos. ¿Te interesa una demo o una implementación? Escríbeme.",
}


def run(cmd):
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError("command failed: %s\n%s" % (" ".join(cmd), proc.stderr))
    return proc


async def synth(text, voice, mp3_path):
    communicate = edge_tts.Communicate(text, voice, rate=RATE)
    await communicate.save(mp3_path)


def convert(mp3_path, wav_path):
    run([
        FFMPEG, "-y", "-i", mp3_path,
        "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le",
        wav_path,
    ])


async def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(TMP_DIR, exist_ok=True)

    for idx in sorted(LINES):
        text = LINES[idx]
        wav_path = os.path.join(OUT_DIR, "vo_%d.wav" % idx)
        mp3_path = os.path.join(TMP_DIR, "vo_%d.mp3" % idx)

        errors = []
        used_voice = None
        for voice in [PRIMARY_VOICE] + FALLBACK_VOICES:
            try:
                await synth(text, voice, mp3_path)
                used_voice = voice
                break
            except Exception as exc:  # noqa: BLE001
                errors.append("%s: %s" % (voice, exc))

        if used_voice is None:
            raise RuntimeError("all voices failed: %s" % "; ".join(errors))

        convert(mp3_path, wav_path)
        size = os.path.getsize(wav_path)
        print("vo_%d.wav  voice=%s  bytes=%d" % (idx, used_voice, size))

    print("DONE")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:  # noqa: BLE001
        print("ERROR: %s" % exc, file=sys.stderr)
        sys.exit(1)
