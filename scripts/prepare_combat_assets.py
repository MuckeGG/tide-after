from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art-source" / "tide-original" / "combat-source-sheet-alpha.png"
OUTPUT = ROOT / "public" / "assets" / "tide-original" / "tide-combat-atlas.png"
CELL = 128
COLS = 5
ROWS = 2


def fit_sprite(sprite: Image.Image, max_width: int, max_height: int) -> Image.Image:
    bounds = sprite.getbbox()
    if not bounds:
        raise ValueError("Generated source cell is empty")
    sprite = sprite.crop(bounds)
    scale = min(max_width / sprite.width, max_height / sprite.height)
    size = (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale)))
    return sprite.resize(size, Image.Resampling.NEAREST)


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    atlas = Image.new("RGBA", (COLS * CELL, ROWS * CELL), (0, 0, 0, 0))
    source_cell_width = source.width / COLS
    source_cell_height = source.height / ROWS

    for row in range(ROWS):
        for column in range(COLS):
            left = round(column * source_cell_width)
            top = round(row * source_cell_height)
            right = round((column + 1) * source_cell_width)
            bottom = round((row + 1) * source_cell_height)
            raw = source.crop((left, top, right, bottom))
            if row == 0 and column == 2:
                # The generated contact sheet lets the elite creature overlap the
                # sword cell slightly. Clear that foreign fragment before fitting.
                raw.paste((0, 0, 0, 0), (0, 0, round(raw.width * 0.31), raw.height))
            max_size = (110, 104) if row == 0 and column < 2 else (96, 92)
            sprite = fit_sprite(raw, *max_size)
            x = column * CELL + (CELL - sprite.width) // 2
            y = row * CELL + CELL - 8 - sprite.height
            atlas.alpha_composite(sprite, (x, y))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(OUTPUT, optimize=True)
    print(f"Wrote {OUTPUT} ({atlas.width}x{atlas.height})")


if __name__ == "__main__":
    main()
