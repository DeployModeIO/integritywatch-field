"""Generate the ~94 s cinematic ambient underscore (A-minor) for the promo.

Output: assets/music/music.wav (44.1 kHz stereo, 16-bit PCM).
Direction:
  - slow deep drone pad (detuned saw/sine layers, slow LFO)
  - soft sub-bass pulse ~90 BPM entering after ~8 s
  - low-pass-filtered noise "air" bed
  - riser/swell around 50 s building to the CTA
  - 2 s fade-in, 3 s fade-out
  - peak ~ -18 dBFS, true peak below -6 dBFS
"""
import os

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "assets", "music", "music.wav")

SR = 44100
DUR = 94.0
N = int(SR * DUR)
T = np.arange(N) / SR

rng = np.random.default_rng(20261028)

# --------------------------------------------------------------------------
# helpers
def lowpass(x, taps=96):
    k = np.ones(taps) / taps
    return np.convolve(x, k, mode="same")

def highpass(x, taps=96):
    return x - lowpass(x, taps)

# --------------------------------------------------------------------------
# 1. Drone pad (A-minor: A1, A2, E3, C3 + detuned saw layers, slow LFO)
def saw(freq, detune_cents=0.0):
    f = freq * 2 ** (detune_cents / 1200.0)
    phase = f * T
    return 2.0 * (phase - np.floor(phase + 0.5))

pad = np.zeros(N)
for f, amp, cents in [
    (55.00, 0.30, 0.0),      # A1
    (110.00, 0.22, 0.0),     # A2
    (110.00, 0.10, 6.0),     # detuned A2 (saw)
    (164.81, 0.12, 0.0),     # E3
    (130.81, 0.10, -4.0),    # C3
    (220.00, 0.06, 0.0),     # A3
]:
    pad += amp * saw(f, cents)

pad = lowpass(pad, 140)

# slow LFO on pad amplitude (two incommensurate rates)
lfo = 0.75 + 0.25 * np.sin(2 * np.pi * 0.07 * T) + 0.10 * np.sin(2 * np.pi * 0.023 * T)
pad *= lfo

# gentle filter sweep (pad opens slowly)
pad *= 0.85 + 0.15 * np.clip((T - 6.0) / 40.0, 0.0, 1.0)

# --------------------------------------------------------------------------
# 2. Sub-bass pulse ~90 BPM entering after 8 s
BPM = 90.0
beat = 60.0 / BPM
start = 8.0

kick = np.zeros(N)
kick_dur = 0.28
kick_n = int(kick_dur * SR)
kick_t = np.arange(kick_n) / SR
# downward sine sweep 80 -> 50 Hz with exponential decay
sweep = 80.0 * (50.0 / 80.0) ** (kick_t / kick_dur)
kick_sig = np.sin(2 * np.pi * np.cumsum(sweep) / SR) * np.exp(-kick_t / 0.09)

t = start
while t < DUR - 1.0:
    i = int(t * SR)
    j = min(i + kick_n, N)
    kick[i:j] += kick_sig[: j - i] * 0.9
    t += beat

kick = lowpass(kick, 48)

# --------------------------------------------------------------------------
# 3. "Air" bed: low-pass-filtered noise, very low level
noise = rng.standard_normal(N)
air = lowpass(noise, 220)
air = highpass(air, 24)  # remove DC rumble
air *= 0.015
# swell the air slightly with the riser
air *= 1.0 + 0.6 * np.clip((T - (DUR - 18.0)) / 12.0, 0.0, 1.0)

# --------------------------------------------------------------------------
# 4. Riser/swell near the end building to CTA
riser = np.zeros(N)
riser_n = rng.standard_normal(N)
riser_win = np.clip((T - (DUR - 16.0)) / 7.0, 0.0, 1.0)  # last ~16 s
# band-limited noise swell
riser_band = highpass(lowpass(riser_n, 120), 60)
riser += riser_band * (riser_win ** 2) * 0.10
# rising filtered sweep tone
sweep_f = 200.0 * 2 ** (1.0 * riser_win)  # 200 -> 400 Hz
riser += np.sin(2 * np.pi * np.cumsum(sweep_f) / SR) * (riser_win ** 3) * 0.05
# impact at the CTA peak: brief low thump
impact = np.zeros(N)
impact_i = int((DUR - 8.0) * SR)
impact_n = int(0.4 * SR)
impact_t = np.arange(impact_n) / SR
impact_sig = np.sin(2 * np.pi * 60.0 * impact_t) * np.exp(-impact_t / 0.12)
impact[impact_i:impact_i + impact_n] = impact_sig * 0.4

# --------------------------------------------------------------------------
# mix
mix = pad + kick * 0.8 + air + riser + impact

# fade in / out
fade_in = int(2.0 * SR)
fade_out = int(3.0 * SR)
mix[:fade_in] *= np.linspace(0.0, 1.0, fade_in)
mix[-fade_out:] *= np.linspace(1.0, 0.0, fade_out)

# stereo: same content, tiny decorrelated spread on the air layer for width
left = mix
right = pad + kick * 0.8 + riser + impact + (air * 0.8)

# --------------------------------------------------------------------------
# level: peak to -18 dBFS
peak = max(np.abs(left).max(), np.abs(right).max())
target_peak = 10 ** (-18.0 / 20.0)
gain = target_peak / peak
left *= gain
right *= gain

# soft safety limiter (true peak guard, knee at -6 dBFS)
ceiling = 10 ** (-6.0 / 20.0)
for ch in (left, right):
    over = np.abs(ch) - ceiling
    mask = over > 0
    ch[mask] = np.sign(ch[mask]) * (ceiling + np.log1p(over[mask] * 40.0) / 40.0)

stereo = np.stack([left, right], axis=1)

sf.write(OUT, stereo, SR, subtype="PCM_16")

# report
dur = len(stereo) / SR
rms = float(np.sqrt(np.mean(stereo ** 2)))
peak_db = 20 * np.log10(max(np.abs(left).max(), np.abs(right).max()) + 1e-12)
rms_db = 20 * np.log10(rms + 1e-12)
print("music.wav written: %s" % OUT)
print("duration  = %.3f s" % dur)
print("peak      = %.2f dBFS" % peak_db)
print("RMS       = %.2f dBFS" % rms_db)
