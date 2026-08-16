"""Build the 64px runtime atlas and compact portrait from the generated concept sheet."""

from pathlib import Path
import sys
from PIL import Image


def fit_pose(source: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    pose = source.crop(box)
    alpha = pose.getchannel("A")
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError(f"No opaque pixels in crop {box}")
    pose = pose.crop(bounds)
    pose.thumbnail((54, 62), Image.Resampling.LANCZOS)
    frame = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    frame.alpha_composite(pose, ((64 - pose.width) // 2, 64 - pose.height))
    return frame


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: prepare_diver_assets.py INPUT OUTPUT_DIR")
    source_path = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    output_dir.mkdir(parents=True, exist_ok=True)
    source = Image.open(source_path).convert("RGBA")
    width, height = source.size
    quadrants = {
        "down": (0, 0, width // 2, height // 2),
        "up": (width // 2, 0, width, height // 2),
        "left": (0, height // 2, width // 2, height),
        "right": (width // 2, height // 2, width, height),
    }
    order = ["down", "left", "right", "up"]
    atlas = Image.new("RGBA", (64 * len(order), 64), (0, 0, 0, 0))
    frames = {name: fit_pose(source, quadrants[name]) for name in order}
    for index, name in enumerate(order):
        atlas.alpha_composite(frames[name], (index * 64, 0))
    atlas.save(output_dir / "diver-directions.png", optimize=True)

    portrait = source.crop(quadrants["down"])
    bounds = portrait.getchannel("A").getbbox()
    if bounds:
        portrait = portrait.crop(bounds)
    portrait.thumbnail((384, 576), Image.Resampling.LANCZOS)
    portrait.save(output_dir / "diver-portrait.png", optimize=True)


if __name__ == "__main__":
    main()
