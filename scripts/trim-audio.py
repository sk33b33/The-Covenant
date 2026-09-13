#!/usr/bin/env python3
"""
Trim an MP3 to a length, without re-encoding it.

    python3 scripts/trim-audio.py in.mp3 public/audio/enter.mp3 --seconds 6

There is no encoder in this project's toolchain — no ffmpeg, no lame — but MP3
does not need one to be shortened. The format is a stream of self-contained
frames, each carrying its own header and a fixed number of samples, so a cut on
a frame boundary produces a shorter file that is still valid MP3 at exactly the
original quality.

What it cannot do is fade. A cut lands wherever the audio happened to be, so
the caller fades in code instead — see the entry sound in src/screens/Enter.tsx.
"""

import argparse
import sys
from pathlib import Path

# Layer III's bitrate table, sample-rate table and samples-per-frame all
# depend on the MPEG *version* a given frame declares, not just Layer III
# itself — MPEG-2 and MPEG-2.5 halve the samples per frame (576, not 1152)
# and use their own, lower bitrate ladder. Treating every frame as MPEG-1
# read a real MPEG-2 clip's own frames as exactly half their true length —
# every duration this script reported for one came out exactly halved.
# Indexed by the header's own version bits: 0b00 MPEG-2.5, 0b10 MPEG-2,
# 0b11 MPEG-1 (0b01 is reserved and never produced by an encoder).
MPEG1_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
MPEG2_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
BITRATE_TABLES = {3: MPEG1_BITRATES, 2: MPEG2_BITRATES, 0: MPEG2_BITRATES}
SAMPLE_RATE_TABLES = {
    3: [44100, 48000, 32000, 0],
    2: [22050, 24000, 16000, 0],
    0: [11025, 12000, 8000, 0],
}
SAMPLES_PER_FRAME_TABLE = {3: 1152, 2: 576, 0: 576}


def id3_length(data: bytes) -> int:
    """Size of a leading ID3v2 tag, which is metadata rather than audio."""
    if data[:3] != b"ID3" or len(data) < 10:
        return 0
    # A syncsafe integer: seven bits per byte, so a size can never contain a
    # false frame sync.
    size = 0
    for byte in data[6:10]:
        size = (size << 7) | (byte & 0x7F)
    return 10 + size


def trim(data: bytes, seconds: float) -> tuple[bytes, float, int]:
    start = id3_length(data)
    i = start
    kept = 0.0
    frames = 0

    while i < len(data) - 4:
        # A frame begins with eleven set bits.
        if data[i] != 0xFF or (data[i + 1] & 0xE0) != 0xE0:
            i += 1
            continue

        version = (data[i + 1] >> 3) & 0x3
        if version == 1 or version not in BITRATE_TABLES:
            # 0b01 is a reserved version an encoder never actually writes —
            # this is sync bits lining up by coincidence in ordinary data,
            # not a real frame.
            i += 1
            continue

        bitrate = BITRATE_TABLES[version][(data[i + 2] >> 4) & 0xF]
        rate = SAMPLE_RATE_TABLES[version][(data[i + 2] >> 2) & 0x3]
        if not bitrate or not rate:
            i += 1
            continue

        samples_per_frame = SAMPLES_PER_FRAME_TABLE[version]
        length = (samples_per_frame // 8 * bitrate * 1000) // rate + ((data[i + 2] >> 1) & 1)
        duration = samples_per_frame / rate

        if kept + duration > seconds:
            break

        kept += duration
        frames += 1
        i += length

    return data[start:i], kept, frames


def main() -> None:
    parser = argparse.ArgumentParser(description="Trim an MP3 on a frame boundary.")
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--seconds", type=float, default=6.0)
    args = parser.parse_args()

    if not args.source.is_file():
        sys.exit(f"No such file: {args.source}")

    audio, kept, frames = trim(args.source.read_bytes(), args.seconds)
    if not frames:
        sys.exit("Found no MP3 frames — is this really an MP3?")

    args.destination.parent.mkdir(parents=True, exist_ok=True)
    args.destination.write_bytes(audio)

    before = args.source.stat().st_size / 1024
    after = args.destination.stat().st_size / 1024
    print(f"{args.destination}  {kept:.2f}s  {frames} frames  {before:.0f} KB -> {after:.0f} KB")


if __name__ == "__main__":
    main()
