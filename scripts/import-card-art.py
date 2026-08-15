#!/usr/bin/env python3
"""
Import card artwork into the game's art pipeline.

    python3 scripts/import-card-art.py --dir ~/covenant-art     a whole folder
    python3 scripts/import-card-art.py jacob ~/renders/jacob.png   one at a time

Two source formats are accepted and told apart automatically by aspect ratio:

  Bare artwork (~0.85 wide/tall)
      What the generated prompts ask for. Resized only.

  A complete card render (~0.71 wide/tall)
      A full Covenant card: black outer border, gold filigree frame, parchment
      nameplate, artwork window, tree-of-life orb, empty text box. The game
      draws its own frame in code so HP, attacks and damage can be laid over
      it, so only the artwork window is taken.

Both land at ART_WIDTH as WebP in public/art/cards/<card-id>.webp.
See docs/ART.md for the full contract.
"""

import argparse
import re
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required:  pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "art" / "cards"
CARD_DATA = ROOT / "src" / "data" / "cards.ts"

# Artwork window inside a 1054x1492 complete card render, measured from the
# gold bevel inwards. The bottom stops just above the tree-of-life orb, which
# the code frame redraws itself.
SOURCE_SIZE = (1054, 1492)
ART_WINDOW = (74, 178, 972, 1232)

# A complete card is 1054/1492 = 0.706; bare artwork is 898/1054 = 0.852. The
# midpoint separates them with room to spare on both sides.
FULL_CARD_ASPECT = SOURCE_SIZE[0] / SOURCE_SIZE[1]
ART_ASPECT = (ART_WINDOW[2] - ART_WINDOW[0]) / (ART_WINDOW[3] - ART_WINDOW[1])
ASPECT_THRESHOLD = (FULL_CARD_ASPECT + ART_ASPECT) / 2

# Exported width. Cards render at most ~420 CSS px wide, so 720 covers 2x
# displays with room to spare.
ART_WIDTH = 720
QUALITY = 84

SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}


def card_ids() -> set[str]:
    """
    Every card id in the set.

    Read out of the TypeScript source by pattern rather than imported: this is
    a Python script and the ids sit on one stable line shape. It means a
    filename typo is caught here instead of producing an orphan webp nothing
    ever loads.
    """
    if not CARD_DATA.exists():
        return set()
    return set(re.findall(r"^\s{4}id: '([^']+)'", CARD_DATA.read_text(), re.MULTILINE))


def normalise(stem: str) -> str:
    """
    Turns a filename into a candidate card id.

    Tolerant of what actually comes out of an image tool and a downloads
    folder: capitals, spaces, underscores, and the "(1)" or " copy" a second
    save adds.
    """
    name = stem.strip()
    name = re.sub(r"\s*\(\d+\)$", "", name)
    name = re.sub(r"\s+copy(\s+\d+)?$", "", name, flags=re.IGNORECASE)
    name = name.lower().replace("_", "-").replace(" ", "-")
    name = re.sub(r"[^a-z0-9-]", "", name)
    return re.sub(r"-{2,}", "-", name).strip("-")


def import_art(card_id: str, source: Path) -> str:
    """Writes one card's art. Returns a short description of what it did."""
    image = Image.open(source).convert("RGB")
    aspect = image.size[0] / image.size[1]

    if aspect < ASPECT_THRESHOLD:
        # A complete card render: take the artwork window out of it.
        sx = image.size[0] / SOURCE_SIZE[0]
        sy = image.size[1] / SOURCE_SIZE[1]
        box = (
            round(ART_WINDOW[0] * sx),
            round(ART_WINDOW[1] * sy),
            round(ART_WINDOW[2] * sx),
            round(ART_WINDOW[3] * sy),
        )
        art = image.crop(box)
        mode = "cropped from card"
    else:
        art = image
        mode = "bare art"

    width, height = art.size
    art = art.resize((ART_WIDTH, round(ART_WIDTH * height / width)), Image.LANCZOS)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    destination = OUT_DIR / f"{card_id}.webp"
    art.save(destination, "WEBP", quality=QUALITY, method=6)

    kb = destination.stat().st_size / 1024
    return f"{art.size[0]}x{art.size[1]}  {kb:6.1f} KB  ({mode})"


def import_directory(folder: Path) -> int:
    ids = card_ids()
    if not ids:
        print(f"Could not read card ids from {CARD_DATA}", file=sys.stderr)
        return 1

    files = sorted(p for p in folder.iterdir() if p.suffix.lower() in SUFFIXES)
    if not files:
        print(f"No images found in {folder}")
        return 1

    matched, unmatched = [], []
    for path in files:
        candidate = normalise(path.stem)
        (matched if candidate in ids else unmatched).append((candidate, path))

    for card_id, path in matched:
        print(f"{card_id:28} {import_art(card_id, path)}")

    if unmatched:
        print(f"\nNo card matches {len(unmatched)} file(s) — rename them to <card-id>.png:")
        for candidate, path in unmatched:
            print(f"  {path.name}  ->  looked for '{candidate}'")

    have = {p.stem for p in OUT_DIR.glob("*.webp")} if OUT_DIR.exists() else set()
    still_missing = sorted(ids - have)
    print(f"\nImported {len(matched)}. Coverage: {len(have)}/{len(ids)} cards illustrated.")
    if still_missing:
        preview = ", ".join(still_missing[:8])
        more = f" (+{len(still_missing) - 8} more)" if len(still_missing) > 8 else ""
        print(f"Still awaiting art: {preview}{more}")

    return 0 if matched else 1


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import card artwork.", formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--dir", type=Path, help="import every image in a folder")
    parser.add_argument(
        "pairs", nargs="*", help="alternating <card-id> <source-file> for one-off imports"
    )
    args = parser.parse_args()

    if args.dir:
        if not args.dir.is_dir():
            sys.exit(f"Not a directory: {args.dir}")
        sys.exit(import_directory(args.dir))

    if not args.pairs or len(args.pairs) % 2:
        sys.exit(__doc__)

    ids = card_ids()
    for card_id, source in zip(args.pairs[::2], args.pairs[1::2]):
        if ids and card_id not in ids:
            print(f"Warning: '{card_id}' is not a card in the set", file=sys.stderr)
        print(f"{card_id:28} {import_art(card_id, Path(source))}")


if __name__ == "__main__":
    main()
