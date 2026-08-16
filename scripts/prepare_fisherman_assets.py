"""Build the eight-direction 64px fisherman animation atlas from a 4x2 turnaround."""

from pathlib import Path
import sys

from PIL import Image, ImageOps


FRAME = 64
ROWS = (
    "south",
    "southWest",
    "west",
    "northWest",
    "north",
    "northEast",
    "east",
    "southEast",
)

# Source contact sheet cells. The north-west pose is mirrored from north-east
# because the generated sheet supplied two south-facing three-quarter poses.
SOURCE_CELLS = {
    "south": (0, False),
    "southWest": (7, False),
    "west": (6, False),
    "northWest": (5, True),
    "north": (4, False),
    "northEast": (5, False),
    "east": (2, False),
    "southEast": (1, False),
}


def crop_pose(source: Image.Image, index: int, mirror: bool) -> Image.Image:
    cell_width = source.width // 4
    cell_height = source.height // 2
    column = index % 4
    row = index // 4
    pose = source.crop((
        column * cell_width,
        row * cell_height,
        (column + 1) * cell_width,
        (row + 1) * cell_height,
    ))
    bounds = pose.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError(f"No opaque pose found in source cell {index}")
    pose = pose.crop(bounds)
    if mirror:
        pose = ImageOps.mirror(pose)
    pose.thumbnail((48, 60), Image.Resampling.NEAREST)
    frame = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    frame.alpha_composite(pose, ((FRAME - pose.width) // 2, FRAME - pose.height))
    return frame


def animated_frame(base: Image.Image, column: int) -> Image.Image:
    if column < 2:
        frame = Image.new("RGBA", base.size, (0, 0, 0, 0))
        frame.alpha_composite(base, (0, -1 if column == 1 else 0))
        return frame

    phase = column - 2
    bob = (0, -1, -2, -1, 0, -1)[phase]
    sway = (-1, 0, 1, 1, 0, -1)[phase]
    left_step = (1, 0, -1, -1, 0, 1)[phase]
    right_step = -left_step
    split_y = 48
    frame = Image.new("RGBA", base.size, (0, 0, 0, 0))
    body = base.crop((0, 0, FRAME, split_y))
    left_boot = base.crop((0, split_y, FRAME // 2, FRAME))
    right_boot = base.crop((FRAME // 2, split_y, FRAME, FRAME))
    frame.alpha_composite(body, (sway, bob))
    frame.alpha_composite(left_boot, (0, split_y + left_step))
    frame.alpha_composite(right_boot, (FRAME // 2, split_y + right_step))
    return frame


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: prepare_fisherman_assets.py INPUT_ALPHA OUTPUT_DIR")
    source_path = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    output_dir.mkdir(parents=True, exist_ok=True)
    source = Image.open(source_path).convert("RGBA")

    bases = {
        direction: crop_pose(source, *SOURCE_CELLS[direction])
        for direction in ROWS
    }
    atlas = Image.new("RGBA", (FRAME * 8, FRAME * 8), (0, 0, 0, 0))
    for row, direction in enumerate(ROWS):
        for column in range(8):
            atlas.alpha_composite(animated_frame(bases[direction], column), (column * FRAME, row * FRAME))
    atlas.save(output_dir / "fisherman-motion.png", optimize=True)

    portrait_source = source.crop((0, 0, source.width // 4, source.height // 2))
    portrait_bounds = portrait_source.getchannel("A").getbbox()
    if portrait_bounds:
        portrait_source = portrait_source.crop(portrait_bounds)
    portrait_source.thumbnail((384, 576), Image.Resampling.NEAREST)
    portrait = Image.new("RGBA", (384, 576), (0, 0, 0, 0))
    portrait.alpha_composite(
        portrait_source,
        ((portrait.width - portrait_source.width) // 2, portrait.height - portrait_source.height),
    )
    portrait.save(output_dir / "fisherman-portrait.png", optimize=True)


if __name__ == "__main__":
    main()
