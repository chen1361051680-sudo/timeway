"""Regenerate mobile WebP assets: python scripts/optimize-images.py (requires Pillow).

Original PNGs are retained for future design edits. No runtime Python dependency.
Reference sheets keep their dimensions because CSS uses them as image sprites.
"""

from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
SIZES = {
    "login-background.png": (1040, 1850),
    "login-logo.png": (396, 396),
    "requester-logo.png": (300, 300),
    "map-landscape.png": (1040, 1400),
    "map-service.png": (384, 384),
    "images/profile-avatar.png": (300, 300),
}


def optimize():
    before = after = 0
    for source in sorted(PUBLIC.rglob("*.png")):
        relative = source.relative_to(PUBLIC).as_posix()
        if relative in SIZES:
            bounds = SIZES[relative]
        elif source.name.endswith("-header.png"):
            bounds = (1040, 1040)
        elif source.name.endswith("-reference.png"):
            bounds = None
        elif source.stem in {"hall-companion", "hall-medical", "hall-housework", "hall-walk"}:
            bounds = (384, 384)
        else:
            # New artwork needs an explicit display-size decision.
            continue
        with Image.open(source) as original:
            picture = ImageOps.exif_transpose(original)
            picture = picture.convert("RGBA" if "A" in picture.getbands() else "RGB")
            if bounds:
                picture.thumbnail(bounds, getattr(Image, "Resampling", Image).LANCZOS)
            destination = source.with_suffix(".webp")
            picture.save(destination, "WEBP", quality=85, method=6)
            with Image.open(destination) as check:
                check.load()
                assert check.size == picture.size
                assert ("A" in check.getbands()) == ("A" in picture.getbands())
            old_size, new_size = source.stat().st_size, destination.stat().st_size
            before += old_size
            after += new_size
            print(f"{relative}: {original.size} -> {picture.size}; {old_size} -> {new_size} bytes")
    print(f"Total: {before} -> {after} bytes; saved {(1 - after / before) * 100:.1f}%")


if __name__ == "__main__":
    optimize()
