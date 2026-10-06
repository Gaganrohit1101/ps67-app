import struct, zlib, math, os
from pathlib import Path

def create_png(width, height, path):
    # RGBA image buffer
    raw = bytearray()
    # Brand colors:
    # Background: #4c35c7 (76, 53, 199, 255)
    # Bars: #ffffff (255, 255, 255, 255)
    # Canvas transparent or dark #12101f
    
    corner_radius = width * 0.22
    cx, cy = width / 2, height / 2
    
    # 2 diagonal bars rotated by -30 deg
    rad = math.radians(-30)
    cos_a = math.cos(rad)
    sin_a = math.sin(rad)
    
    bar_w = width * 0.17
    bar_h = height * 0.58
    bar_gap = width * 0.28
    
    for y in range(height):
        row = bytearray([0]) # filter type 0 (None)
        for x in range(width):
            # Rounded rectangle check for icon boundary
            # inset by 4% for nice padding
            pad = width * 0.04
            rx = x - pad
            ry = y - pad
            rw = width - pad * 2
            rh = height - pad * 2
            
            in_base = False
            if 0 <= rx <= rw and 0 <= ry <= rh:
                # Check corners
                dx = max(0, corner_radius - rx, rx - (rw - corner_radius))
                dy = max(0, corner_radius - ry, ry - (rh - corner_radius))
                if dx * dx + dy * dy <= corner_radius * corner_radius:
                    in_base = True
            
            if not in_base:
                row.extend([0, 0, 0, 0])
                continue
                
            # Default to purple brand background
            color = [76, 53, 199, 255]
            
            # Check bars relative to center
            nx = x - cx
            ny = y - cy
            # Rotate by +30 deg to align with bar axes
            rx_rot = nx * cos_a + ny * sin_a
            ry_rot = -nx * sin_a + ny * cos_a
            
            # Left bar centered at rx_rot = -bar_gap/2
            # Right bar centered at rx_rot = +bar_gap/2
            in_bar1 = abs(rx_rot + bar_gap / 2) <= (bar_w / 2) and abs(ry_rot) <= (bar_h / 2)
            in_bar2 = abs(rx_rot - bar_gap / 2) <= (bar_w / 2) and abs(ry_rot) <= (bar_h / 2)
            
            # Round bar caps
            cap_r = bar_w / 2
            if abs(rx_rot + bar_gap / 2) <= cap_r and abs(ry_rot) > (bar_h / 2 - cap_r):
                dy_cap = abs(ry_rot) - (bar_h / 2 - cap_r)
                dx_cap = abs(rx_rot + bar_gap / 2)
                in_bar1 = (dx_cap * dx_cap + dy_cap * dy_cap) <= (cap_r * cap_r)
                
            if abs(rx_rot - bar_gap / 2) <= cap_r and abs(ry_rot) > (bar_h / 2 - cap_r):
                dy_cap = abs(ry_rot) - (bar_h / 2 - cap_r)
                dx_cap = abs(rx_rot - bar_gap / 2)
                in_bar2 = (dx_cap * dx_cap + dy_cap * dy_cap) <= (cap_r * cap_r)
            
            if in_bar1 or in_bar2:
                color = [255, 255, 255, 255]
                
            row.extend(color)
        raw.extend(row)
        
    compressed = zlib.compress(raw, 9)
    
    # PNG structure
    png = bytearray(b'\x89PNG\r\n\x1a\n')
    
    def chunk(tag, data):
        length = struct.pack('>I', len(data))
        t = tag.encode('ascii')
        crc = struct.pack('>I', zlib.crc32(t + data) & 0xffffffff)
        return length + t + data + crc

    # IHDR
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    png.extend(chunk('IHDR', ihdr))
    png.extend(chunk('IDAT', compressed))
    png.extend(chunk('IEND', b''))
    
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)
    print(f'Wrote {path} ({len(png)} bytes)')

if __name__ == '__main__':
    root = Path(__file__).resolve().parent.parent
    public_dir = root / 'ui/sovereign/public'
    create_png(192, 192, public_dir / 'icon-192.png')
    create_png(512, 512, public_dir / 'icon-512.png')
