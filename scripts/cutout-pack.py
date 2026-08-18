#!/usr/bin/env python3
"""
Cut a booster-pack product photo out of its studio backdrop.

    python3 scripts/cutout-pack.py source.png public/art/packs/wrapper.webp

rembg's matte alone is not enough here: on this photo its alpha ramp fades
over roughly 40px of a ~1050px-wide image, which reads as a soft dark halo
once the pack sits on anything but a near-black page — exactly the "there's
a background on the pack" complaint this script exists to fix. Two things
are done on top of the raw matte:

  1. A levels stretch on the alpha channel collapses that 40px ramp back down
     to a normal few-pixel antialiased edge.
  2. Colour decontamination recovers the true foreground colour for whatever
     short ramp remains, so the edge doesn't carry a tint of the (near-black)
     backdrop it was cut from. Without this, partially-transparent edge
     pixels still show blended background colour, which reads as a dark
     fringe on a light page.

The result is cropped to its own bounding box — no reason to ship a large
transparent margin — and written as an alpha-channel webp.
"""

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageFilter

try:
    import numpy as np
except ImportError:
    sys.exit("Needs numpy: pip install numpy")

try:
    from rembg import remove, new_session
except ImportError:
    sys.exit("Needs rembg + onnxruntime: pip install rembg onnxruntime")


def cutout(source: Image.Image) -> Image.Image:
    session = new_session("u2net")
    raw = remove(source.convert("RGB"), session=session)

    src = np.asarray(source.convert("RGB")).astype(np.float64)
    alpha0 = np.asarray(raw)[:, :, 3].astype(np.float64)

    # A robust background colour, sampled from the original photo wherever
    # the raw matte is confidently background (not from rembg's own RGB
    # output, which may already carry some blending).
    bg_color = np.median(src[alpha0 < 8], axis=0)

    # Stretch the ramp. These bounds are tuned to this photo's matte, not a
    # universal constant — re-check the edge profile (see the plan/PR notes)
    # if this is re-run against a differently lit source.
    low, high = 50.0, 170.0
    alpha1 = np.clip((alpha0 - low) / (high - low), 0.0, 1.0)

    # Decontaminate: recover the true foreground colour by removing the
    # background's contribution, using the *stretched* alpha so the divide
    # isn't blowing up on the tiny raw values right at the old ramp's foot.
    a = alpha1[:, :, None]
    safe_a = np.where(a < 0.06, 1.0, a)
    fg = np.clip((src - bg_color[None, None, :] * (1 - safe_a)) / safe_a, 0, 255)

    out = Image.merge(
        "RGBA",
        [Image.fromarray(fg[:, :, c].astype(np.uint8)) for c in range(3)]
        + [Image.fromarray(np.clip(alpha1 * 255, 0, 255).astype(np.uint8))],
    )

    # A small blur on the alpha channel only, so the tightened edge is a
    # normal antialiased line rather than a hard stair-step.
    r, g, b, a_ch = out.split()
    return Image.merge("RGBA", (r, g, b, a_ch.filter(ImageFilter.GaussianBlur(0.6))))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--width", type=int, default=620, help="output width in px")
    parser.add_argument("--pad", type=int, default=8, help="px kept around the tight crop")
    args = parser.parse_args()

    if not args.source.is_file():
        sys.exit(f"No such file: {args.source}")

    out = cutout(Image.open(args.source))

    w, h = out.size
    mask = out.split()[-1].point(lambda p: 255 if p > 8 else 0)
    l, t, r, b = mask.getbbox()
    l, t = max(0, l - args.pad), max(0, t - args.pad)
    r, b = min(w, r + args.pad), min(h, b + args.pad)
    out = out.crop((l, t, r, b))

    target_h = round(out.size[1] * args.width / out.size[0])
    out = out.resize((args.width, target_h), Image.LANCZOS)

    args.destination.parent.mkdir(parents=True, exist_ok=True)
    out.save(args.destination, "WEBP", quality=82, alpha_quality=80, method=6)

    kb = args.destination.stat().st_size / 1024
    print(f"{args.destination}  {out.size[0]}x{out.size[1]}  {kb:.0f} KB")


if __name__ == "__main__":
    main()
