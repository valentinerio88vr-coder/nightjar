from pathlib import Path
import math, struct

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "build" / "icon.ico"
SIZE = 256
BASE_SIZE = 64
SCALE = SIZE / BASE_SIZE
pixels = []

def line_distance(px, py, x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1
    t = max(0.0, min(1.0, ((px-x1)*dx + (py-y1)*dy) / (dx*dx + dy*dy)))
    return math.hypot(px-(x1+t*dx), py-(y1+t*dy))

for y in range(SIZE):
    for x in range(SIZE):
        px, py = x / SCALE, y / SCALE
        # Rounded square background.
        cx = min(max(px, 18), 46)
        cy = min(max(py, 18), 46)
        inside = (px-cx)**2 + (py-cy)**2 <= 15**2
        # Small N monogram.
        mark = min(line_distance(px+.5/SCALE,py+.5/SCALE,21,45,21,19),
                   line_distance(px+.5/SCALE,py+.5/SCALE,21,19,43,45),
                   line_distance(px+.5/SCALE,py+.5/SCALE,43,45,43,19)) < 2.65
        dot = (px-49)**2 + (py-16)**2 <= 3**2
        if not inside:
            rgba = (0,0,0,0)
        elif dot:
            rgba = (188,173,255,255)
        elif mark:
            rgba = (151,221,169,255)
        else:
            blend = py / (BASE_SIZE-1)
            rgba = (int(37-14*blend), int(52-23*blend), int(44-19*blend), 255)
        pixels.append(rgba)

# ICO embeds a 32-bit BGRA DIB followed by the 1-bit transparency mask.
xor = bytearray()
mask = bytearray()
for y in reversed(range(SIZE)):
    row = bytearray()
    mask_row = bytearray((SIZE + 7)//8)
    for x in range(SIZE):
        r,g,b,a = pixels[y*SIZE+x]
        row.extend((b,g,r,a))
        if a == 0:
            mask_row[x//8] |= 1 << (7-(x%8))
    xor.extend(row)
    mask.extend(mask_row)
mask_stride = ((SIZE + 31)//32)*4
if mask_stride > (SIZE+7)//8:
    mask.extend(bytes((mask_stride-(SIZE+7)//8))*SIZE)
dib = struct.pack('<IiiHHIIiiII', 40, SIZE, SIZE*2, 1, 32, 0, len(xor)+len(mask), 0, 0, 0, 0) + xor + mask
header = struct.pack('<HHH', 0, 1, 1)
entry = struct.pack('<BBBBHHII', SIZE % 256, SIZE % 256, 0, 0, 1, 32, len(dib), 22)
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_bytes(header + entry + dib)
print(f'Created {OUT}')
