"""Draw the app icons (public/icons/*.png) from the favicon's design: three
white bars on green. Pure Python, no image library needed.

    python scripts/make-icons.py
"""
import struct
import zlib
from pathlib import Path

GREEN = (0x1F, 0x6F, 0x4A)
WHITE = (0xFF, 0xFF, 0xFF)
# Bars on the favicon's 32-unit grid: (x0, y0, x1, y1). They sit inside the
# central 80% so the icon also works as a maskable (cropped) icon.
BARS = [(8, 10, 11, 22), (14.5, 6, 17.5, 22), (21, 14, 24, 22)]


def png(size):
    scale = size / 32
    rows = []
    for y in range(size):
        row = bytearray([0])   # filter: none
        for x in range(size):
            u, v = (x + 0.5) / scale, (y + 0.5) / scale
            on = any(x0 <= u < x1 and y0 <= v < y1 for x0, y0, x1, y1 in BARS)
            row += bytes(WHITE if on else GREEN)
        rows.append(bytes(row))

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
            + chunk(b"IEND", b""))


if __name__ == "__main__":
    out = Path(__file__).resolve().parents[1] / "public" / "icons"
    out.mkdir(parents=True, exist_ok=True)
    for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
        (out / name).write_bytes(png(size))
        print("wrote", name)
