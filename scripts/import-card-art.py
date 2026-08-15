#!/usr/bin/env python3
"""
Import full-bleed Covenant card renders into the game's art pipeline.

The source renders are complete cards (1054x1492): black outer border, gold
filigree frame, parchment nameplate, artwork window, tree-of-life orb and an
empty parchment text box. The game draws its own frame in code so that HP,
attacks, weakness and retreat can be laid over it, so all we want from a
source render is the artwork window itself.

    python3 scripts/import-card-art.py <card-id> <source.png> [more...]

Writes public/art/cards/<card-id>.webp at ART_WIDTH, ready to drop in.
See docs/ART.md for the full contract.
"""

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required:  pip install Pillow")

# Artwork window inside a 1054x1492 source render, measured from the gold
# bevel inwards. The bottom stops just above the tree-of-life orb, which the
# code frame redraws itself.
SOURCE_SIZE = (1054, 1492)
ART_WINDOW = (74, 178, 972, 1232)

# Exported width. Cards render at most ~420 CSS px wide, so 720 covers 2x
# displays with room to spare.
ART_WIDTH = 720
QUALITY = 84

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "art" / "cards"


def import_art(card_id: str, source: Path) -> None:
    image = Image.open(source).convert("RGB")

    if image.size != SOURCE_SIZE:
        # Scale the window proportionally for renders at another resolution.
        sx = image.size[0] / SOURCE_SIZE[0]
        sy = image.size[1] / SOURCE_SIZE[1]
        box = (
            round(ART_WINDOW[0] * sx),
            round(ART_WINDOW[1] * sy),
            round(ART_WINDOW[2] * sx),
            round(ART_WINDOW[3] * sy),
        )
    else:
        box = ART_WINDOW

    art = image.crop(box)
    width, height = art.size
    art = art.resize((ART_WIDTH, round(ART_WIDTH * height / width)), Image.LANCZOS)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    destination = OUT_DIR / f"{card_id}.webp"
    art.save(destination, "WEBP", quality=QUALITY, method=6)

    kb = destination.stat().st_size / 1024
    print(f"{card_id:28} {art.size[0]}x{art.size[1]}  {kb:6.1f} KB")


def main() -> None:
    args = sys.argv[1:]
    if not args or len(args) % 2:
        sys.exit(__doc__)

    for card_id, source in zip(args[::2], args[1::2]):
        import_art(card_id, Path(source))


if __name__ == "__main__":
    main()
