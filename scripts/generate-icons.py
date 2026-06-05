#!/usr/bin/env python3
"""Generate Blueprint's PWA / favicon icons with no third-party deps.

Renders an opaque indigo "blueprint" tile (grid + floor-plan outline) at the
sizes the web manifest, apple-touch-icon and favicon reference. Opaque by
construction so iOS Add-to-Home-Screen doesn't show a black halo behind
transparent pixels.

    python3 scripts/generate-icons.py

Outputs into static/: favicon.png, icon-192.png, icon-512.png,
apple-touch-icon.png (180), plus a maskable icon-512-maskable.png.
"""
import os
import struct
import zlib

BG = (99, 102, 241)  # --primary indigo, matches the app theme-color
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "static")


def blend_white(px, a):
    """Blend opaque white over px (r,g,b) with alpha a in [0,1]."""
    return tuple(round(255 * a + c * (1 - a)) for c in px)


def render(size, *, safe=0.0):
    """Build an opaque RGBA buffer for a square icon of `size` px.

    `safe` insets all artwork by that fraction so the icon survives the
    circular mask Android applies to "maskable" icons.
    """
    pad = round(size * safe)
    art = size - 2 * pad

    def s(f):  # scale a fraction of the artwork area into absolute px
        return pad + round(art * f)

    cell = max(8, round(art / 8))
    line = max(1, round(size / 170))

    # Outer frame
    f0, f1 = s(0.13), s(0.87)
    ft = max(2, round(size / 26))
    # Floor-plan "room" outline (off-centre for a drawn look)
    rx0, rx1 = s(0.30), s(0.70)
    ry0, ry1 = s(0.40), s(0.68)
    rt = max(2, round(size / 42))
    wall_x = s(0.50)  # interior wall stub

    buf = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            px = BG
            inside = pad <= x < size - pad and pad <= y < size - pad
            if inside:
                # blueprint grid
                if (x - pad) % cell < line or (y - pad) % cell < line:
                    px = blend_white(px, 0.18)
                # room outline
                on_room = (rx0 <= x <= rx1 and ry0 <= y <= ry1) and (
                    x < rx0 + rt or x >= rx1 - rt or y < ry0 + rt or y >= ry1 - rt
                )
                # interior wall stub (top half of the room)
                on_wall = abs(x - wall_x) < rt // 2 + 1 and ry0 <= y <= (ry0 + ry1) // 2
                if on_room or on_wall:
                    px = blend_white(px, 0.95)
                # outer frame
                on_frame = (f0 <= x <= f1 and f0 <= y <= f1) and (
                    x < f0 + ft or x >= f1 - ft or y < f0 + ft or y >= f1 - ft
                )
                if on_frame:
                    px = blend_white(px, 0.95)
            i = (y * size + x) * 4
            buf[i:i + 4] = bytes((px[0], px[1], px[2], 255))
    return buf


def write_png(path, size, buf):
    def chunk(typ, data):
        return (struct.pack(">I", len(data)) + typ + data
                + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF))

    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type 0 (none)
        raw.extend(buf[y * size * 4:(y + 1) * size * 4])
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)
    print(f"  wrote {os.path.relpath(path)}  ({size}x{size})")


TARGETS = [
    ("favicon.png", 32, 0.0),
    ("icon-192.png", 192, 0.0),
    ("icon-512.png", 512, 0.0),
    ("apple-touch-icon.png", 180, 0.0),
    ("icon-512-maskable.png", 512, 0.18),
]

if __name__ == "__main__":
    print("Generating Blueprint icons …")
    for name, size, safe in TARGETS:
        write_png(os.path.join(OUT, name), size, render(size, safe=safe))
    print("Done.")
