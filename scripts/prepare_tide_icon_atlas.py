"""Create the original transparent runtime icon/effect/facility atlas."""

from pathlib import Path
import sys
from PIL import Image, ImageDraw


FRAME = 32
NAMES = [
    "wood", "plastic", "scrap", "fiber", "fish", "meal", "water", "parts",
    "splash", "woodchip", "spark", "bubble",
    "deck", "net", "purifier", "grill", "storage", "reinforcedDeck",
    "workshop", "sail", "garden", "radio", "beacon",
]


def frame(draw: ImageDraw.ImageDraw, index: int):
    left = index * FRAME
    return left, lambda x, y: (left + x, y)


def icon(draw: ImageDraw.ImageDraw, name: str, index: int):
    left, p = frame(draw, index)
    shadow = (6, 18, 21, 110)
    copper = (177, 99, 51, 255)
    brass = (226, 188, 80, 255)
    teal = (83, 192, 187, 255)
    navy = (24, 48, 56, 255)
    draw.ellipse([left + 5, 24, left + 27, 29], fill=shadow)

    if name == "wood":
        for y, color in [(9, (120, 67, 38, 255)), (14, (165, 97, 51, 255)), (19, (137, 78, 43, 255))]:
            draw.rounded_rectangle([left + 5, y, left + 27, y + 6], 2, fill=color, outline=(74, 45, 32, 255))
            draw.line([p(8, y + 2), p(22, y + 2)], fill=(211, 145, 79, 255), width=1)
    elif name == "plastic":
        draw.rounded_rectangle([left + 10, 8, left + 23, 25], 4, fill=(102, 184, 188, 255), outline=(33, 90, 98, 255), width=2)
        draw.rectangle([left + 13, 5, left + 20, 9], fill=(43, 105, 112, 255))
        draw.rectangle([left + 13, 12, left + 20, 18], fill=(199, 235, 225, 255))
    elif name == "scrap":
        draw.polygon([p(7, 11), p(24, 7), p(27, 21), p(12, 26), p(5, 19)], fill=(109, 119, 116, 255), outline=(47, 57, 59, 255))
        draw.line([p(10, 13), p(22, 10)], fill=(206, 215, 199, 255), width=2)
        draw.rectangle([left + 21, 8, left + 26, 22], fill=(185, 82, 47, 255))
    elif name == "fiber":
        for inset in [0, 4, 8]:
            draw.arc([left + 6 + inset // 2, 7 + inset // 2, left + 26 - inset // 2, 27 - inset // 2], 25, 330, fill=(215, 190, 124, 255), width=3)
        draw.line([p(9, 22), p(25, 8)], fill=(127, 92, 55, 255), width=2)
    elif name == "fish":
        draw.ellipse([left + 7, 10, left + 24, 23], fill=teal, outline=(31, 91, 96, 255), width=2)
        draw.polygon([p(23, 16), p(29, 10), p(28, 23)], fill=(70, 145, 143, 255), outline=(31, 91, 96, 255))
        draw.ellipse([left + 10, 13, left + 12, 15], fill=(242, 224, 149, 255))
        draw.line([p(8, 18), p(20, 18)], fill=(180, 232, 218, 255), width=1)
    elif name == "meal":
        draw.pieslice([left + 6, 10, left + 27, 28], 0, 180, fill=(166, 73, 43, 255), outline=(76, 43, 34, 255))
        draw.ellipse([left + 6, 13, left + 27, 20], fill=(222, 168, 75, 255), outline=(90, 57, 38, 255))
        draw.arc([left + 9, 3, left + 16, 15], 210, 335, fill=(226, 231, 211, 255), width=2)
        draw.arc([left + 17, 2, left + 24, 14], 210, 335, fill=(226, 231, 211, 255), width=2)
    elif name == "water":
        draw.polygon([p(16, 4), p(25, 17), p(23, 24), p(16, 28), p(9, 24), p(7, 17)], fill=(91, 199, 207, 255), outline=(28, 92, 108, 255))
        draw.line([p(12, 17), p(15, 10)], fill=(213, 247, 235, 255), width=2)
    elif name == "parts":
        draw.ellipse([left + 7, 7, left + 27, 27], fill=brass, outline=(85, 65, 35, 255), width=2)
        for x, y in [(16, 4), (16, 28), (4, 16), (28, 16), (8, 8), (24, 8), (8, 24), (24, 24)]:
            draw.rectangle([left + x - 2, y - 2, left + x + 2, y + 2], fill=(175, 126, 48, 255))
        draw.ellipse([left + 12, 12, left + 22, 22], fill=navy)
    elif name == "splash":
        draw.arc([left + 4, 9, left + 28, 28], 185, 355, fill=(180, 239, 232, 255), width=3)
        draw.line([p(10, 19), p(7, 10)], fill=(110, 205, 202, 255), width=2)
        draw.line([p(19, 17), p(22, 7)], fill=(200, 246, 236, 255), width=2)
    elif name == "woodchip":
        draw.polygon([p(5, 20), p(11, 8), p(15, 18)], fill=(204, 135, 67, 255))
        draw.polygon([p(14, 24), p(19, 11), p(23, 22)], fill=(128, 76, 43, 255))
        draw.polygon([p(22, 19), p(27, 7), p(29, 17)], fill=(231, 165, 88, 255))
    elif name == "spark":
        draw.polygon([p(16, 3), p(19, 12), p(28, 8), p(22, 17), p(29, 22), p(19, 21), p(16, 29), p(13, 21), p(4, 24), p(10, 16), p(5, 10), p(13, 12)], fill=(247, 210, 82, 255))
        draw.ellipse([left + 13, 13, left + 20, 20], fill=(255, 244, 178, 255))
    elif name == "bubble":
        draw.ellipse([left + 6, 8, left + 24, 26], outline=(168, 235, 230, 255), width=2)
        draw.ellipse([left + 19, 4, left + 28, 13], outline=(100, 197, 198, 255), width=2)
        draw.ellipse([left + 10, 11, left + 14, 15], fill=(220, 250, 241, 255))
    elif name in ("deck", "reinforcedDeck"):
        draw.polygon([p(5, 10), p(26, 8), p(28, 23), p(7, 27)], fill=(160, 94, 51, 255), outline=(73, 45, 32, 255))
        draw.line([p(7, 16), p(27, 14)], fill=(214, 145, 75, 255), width=2)
        draw.line([p(8, 22), p(27, 20)], fill=(100, 59, 39, 255), width=2)
        if name == "reinforcedDeck":
            draw.line([p(4, 9), p(27, 7), p(30, 23), p(7, 29), p(4, 9)], fill=(160, 177, 171, 255), width=2)
    elif name == "net":
        for line in range(7, 28, 5):
            draw.line([p(line, 7), p(line - 5, 27)], fill=(214, 189, 123, 255), width=1)
            draw.line([p(5, line), p(27, line - 5)], fill=(214, 189, 123, 255), width=1)
        draw.arc([left + 4, 4, left + 29, 29], 0, 180, fill=(124, 83, 49, 255), width=2)
    elif name == "purifier":
        draw.rounded_rectangle([left + 7, 9, left + 26, 27], 4, fill=navy, outline=(75, 113, 112, 255), width=2)
        draw.rounded_rectangle([left + 10, 13, left + 23, 21], 2, fill=(160, 220, 211, 255))
        draw.arc([left + 10, 3, left + 23, 15], 180, 360, fill=brass, width=2)
    elif name == "grill":
        draw.ellipse([left + 5, 10, left + 28, 26], fill=(42, 52, 55, 255), outline=(125, 132, 126, 255), width=2)
        draw.ellipse([left + 9, 14, left + 24, 22], fill=(211, 83, 48, 255))
        for x in range(10, 25, 4):
            draw.line([p(x, 10), p(x, 24)], fill=(196, 197, 180, 255), width=1)
    elif name == "storage":
        draw.rounded_rectangle([left + 5, 11, left + 28, 27], 4, fill=(139, 78, 43, 255), outline=(67, 41, 31, 255), width=2)
        draw.arc([left + 6, 4, left + 27, 20], 180, 360, fill=(210, 151, 76, 255), width=2)
        draw.rectangle([left + 14, 17, left + 19, 23], fill=brass)
    elif name == "workshop":
        draw.polygon([p(5, 27), p(7, 9), p(26, 7), p(29, 25)], fill=(45, 67, 70, 255), outline=(23, 37, 40, 255))
        draw.rectangle([left + 8, 10, left + 27, 14], fill=(177, 116, 58, 255))
        draw.line([p(12, 22), p(22, 12)], fill=(199, 211, 200, 255), width=3)
    elif name == "sail":
        draw.line([p(10, 27), p(10, 4)], fill=(70, 48, 35, 255), width=3)
        draw.polygon([p(12, 5), p(27, 19), p(12, 23)], fill=(225, 210, 169, 255), outline=(133, 101, 65, 255))
        draw.line([p(13, 15), p(24, 19)], fill=(204, 82, 48, 255), width=3)
    elif name == "garden":
        draw.polygon([p(5, 16), p(27, 14), p(29, 27), p(7, 29)], fill=(88, 52, 36, 255))
        for x in [10, 17, 24]:
            draw.line([p(x, 23), p(x - 2, 9)], fill=(74, 138, 82, 255), width=3)
            draw.line([p(x, 15), p(x + 4, 11)], fill=(106, 172, 91, 255), width=2)
    elif name == "radio":
        draw.rounded_rectangle([left + 5, 9, left + 27, 27], 3, fill=navy, outline=(80, 105, 104, 255), width=2)
        draw.rectangle([left + 8, 12, left + 18, 18], fill=teal)
        draw.ellipse([left + 20, 19, left + 24, 23], fill=brass)
        draw.line([p(23, 9), p(28, 2)], fill=(211, 222, 210, 255), width=2)
    elif name == "beacon":
        draw.polygon([p(11, 27), p(14, 7), p(20, 7), p(23, 27)], fill=(54, 71, 73, 255))
        draw.rounded_rectangle([left + 10, 4, left + 24, 11], 2, fill=brass)
        draw.ellipse([left + 4, 0, left + 30, 20], outline=(241, 207, 86, 90), width=2)


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: prepare_tide_icon_atlas.py OUTPUT")
    output = Path(sys.argv[1])
    output.parent.mkdir(parents=True, exist_ok=True)
    atlas = Image.new("RGBA", (FRAME * len(NAMES), FRAME), (0, 0, 0, 0))
    draw = ImageDraw.Draw(atlas)
    for index, name in enumerate(NAMES):
        icon(draw, name, index)
    atlas.save(output, optimize=True)
    print(f"Wrote {output} ({atlas.width}x{atlas.height})")


if __name__ == "__main__":
    main()
