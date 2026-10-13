"""Build the version 13 face texture from the user's original frontal photograph.

The source is assets/zhiguo-identity-v8.jpg, an unmodified copy of the user's
photo. The face is resampled into the 3D head's coordinates at one uniform
scale. The photographed wire rims (replaced by 3D rims) and loose forehead
strands are filled from the surrounding skin, the hair-covered outer left
cheek is mirrored from the clear right side, large-scale sunlight is evened
out, and a feathered alpha channel blends the face into the 3D skin and hair.

Run from the repository root: python3 tests/make-face-texture.py
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets' / 'zhiguo-identity-v8.jpg'
OUTPUT = ROOT / 'assets' / 'zhiguo-face-photo-v13.webp'

# Photo landmarks (pixels): pupils at y 321.6, mouth 389, chin 435. Lens
# centers are 68 px apart, matching the head's 0.0777 m lens spacing.
PX_PER_M = 875.0
EYE_Y, EYE_HEAD_Y, MID_X = 321.6, .026, 683.0
SHEAR = .05  # The head is tilted slightly; keep the eye line, center the chin.
SKIN = np.array([212, 160, 136], np.float32)  # Reference sheet skin tone (#d4a088).
# Output texture covers z in [-Z0, Z0] and y in [Y1, Y0] of head space.
SCALE, Z0, Y0 = 3.0, .105, .150
OUT_PX_PER_M = PX_PER_M * SCALE
W, H = 552, 816


def head_grid():
    u, v = np.meshgrid(np.arange(W) + .5, np.arange(H) + .5)
    return Z0 - u / OUT_PX_PER_M, Y0 - v / OUT_PX_PER_M


def resample(photo):
    # Output (u, v) -> photo (x, y): x = MID_X - SHEAR (y - EYE_Y) - z PX_PER_M.
    f = EYE_Y - (Y0 - EYE_HEAD_Y) * PX_PER_M
    a, b = 1 / SCALE, -SHEAR / SCALE
    c = MID_X - SHEAR * (f - EYE_Y) - Z0 * PX_PER_M
    return photo.transform((W, H), Image.AFFINE, (a, b, c, 0, 1 / SCALE, f), resample=Image.BICUBIC)


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def hairline(z):
    """Forehead hairline measured from the photo, in head space (meters)."""
    z = np.abs(z)
    return .108 - .020 * smooth(z, .010, .040) - .080 * smooth(z, .030, .080)


def ellipse(z, y, cz, cy, rz, ry):
    return ((z - cz) / rz) ** 2 + ((y - cy) / ry) ** 2 < 1


def box(array, size, axis):
    """Moving average along one axis with edge padding."""
    pad = [(0, 0)] * array.ndim
    pad[axis] = (size // 2 + 1, size // 2)
    padded = np.pad(array, pad, mode='edge')
    total = np.cumsum(padded, axis=axis, dtype=np.float64)
    n = array.shape[axis]
    upper = np.take(total, np.arange(size, size + n), axis=axis)
    lower = np.take(total, np.arange(0, n), axis=axis)
    return ((upper - lower) / size).astype(np.float32)


def blur(array, radius):
    """Gaussian approximation (three box passes) with standard deviation radius."""
    size = max(1, int(round(np.sqrt(12 * radius * radius / 3 + 1))))
    size += 1 - size % 2
    out = array.astype(np.float32)
    for _ in range(3):
        out = box(box(out, size, 0), size, 1)
    return out


# The photographed lenses, shared with the 3D wire rims in src/zhiguo-identity.js:
# (center z, center y, half width, half height) in head space. The geometric
# frames are squarer above (superellipse power 0.62) and rounder below (0.85).
LENSES = ((.0354, .0178, .0309, .0271), (-.0423, .0165, .0288, .0276))
PUPIL_MIDLINE = .0014


def fill(image, holes, valid):
    """Replace holes with the surrounding valid pixels (normalized convolution)."""
    weight = (valid & ~holes).astype(np.float32)
    result = None
    for radius, lo, hi in ((40, 0, 1), (12, .03, .25), (4, .05, .35)):
        cover = blur(weight, radius)
        spread = blur(image * weight[..., None], radius) / np.maximum(cover, 1e-4)[..., None]
        result = spread if result is None else result + (spread - result) * smooth(cover, lo, hi)[..., None]
    soft = np.clip(blur(holes.astype(np.float32), 1.0) * 1.6, 0, 1)[..., None]
    return image * (1 - soft) + result * soft


def frames(z, y):
    """The photographed wire rims, bridge and nose pads."""
    mask = np.zeros(z.shape, bool)
    for cz, cy, hw, hh in LENSES:
        e = np.where(y > cy, 2 / .62, 2 / .85)
        rho = (np.abs((z - cz) / hw) ** e + np.abs((y - cy) / hh) ** e) ** (1 / e)
        mask |= np.abs(rho - 1) * min(hw, hh) < .0022
    bridge_y = .0325 + .0015 * np.cos((z + .0046) / .0091 * np.pi / 2)
    mask |= (z < .0060) & (z > -.0152) & (np.abs(y - bridge_y) < .0017)
    for pz, py in ((.0086, .0167), (-.0180, .0155)):
        mask |= ellipse(z, y, pz, py, .0040, .0045)
    return mask


def mirror(image, z):
    """Each row mirrored about the face's midline (between the pupils)."""
    u = (Z0 - (2 * PUPIL_MIDLINE - z)) * OUT_PX_PER_M - .5
    u0 = np.clip(np.floor(u).astype(int), 0, W - 2)
    t = np.clip(u - u0, 0, 1)[..., None]
    rows = np.arange(H)[:, None]
    return image[rows, u0] * (1 - t) + image[rows, u0 + 1] * t


def main():
    photo = Image.open(SOURCE).convert('RGB')
    image = np.asarray(resample(photo)).astype(np.float32)
    z, y = head_grid()
    r, g, b = image[..., 0], image[..., 1], image[..., 2]
    lum = .30 * r + .59 * g + .11 * b
    skin = (r > 135) & (g > 85) & (r - b > 38) & (r - g > 20) & (r < 252)
    eyes = ellipse(z, y, .0355, .0250, .0190, .0100) | ellipse(z, y, -.0330, .0245, .0190, .0100)
    brows = ellipse(z, y, .036, .052, .021, .0065) | ellipse(z, y, -.034, .051, .020, .0065)
    nose_mouth = ellipse(z, y, .001, -.0195, .017, .0085) | ellipse(z, y, .002, -.0505, .029, .0150)

    # 1. The 3D gold rims replace the photographed ones, so painted rims never
    #    separate from the 3D frames as a double outline at an angle.
    rims = frames(z, y) & ~eyes
    image = fill(image, rims, ~rims)

    # 2. Loose strands cross the bare forehead; it is smoothed down to the bridge
    #    of the nose, leaving the brows and eyes untouched.
    above = smooth(y, .040, .049) * (1 - blur(brows.astype(np.float32), 2.5)) * (1 - blur(eyes.astype(np.float32), 3))
    strands = (above > 0) & ((lum < blur(lum, 4) - 4) | ~skin)
    clean = fill(image, strands, skin)
    image = image * (1 - above[..., None]) + blur(clean, 5.0) * above[..., None]

    # 3. Hair and its shadow cover the outer part of her left cheek and temple
    #    (and show through that lens); her clear right side is mirrored there,
    #    while the eye, nose and smile stay as photographed.
    keep = blur((eyes | nose_mouth | brows).astype(np.float32), 3)
    m = (smooth(-z, .030, .046) * (1 - keep))[..., None]
    image = image * (1 - m) + mirror(image, z) * m
    skin = skin | (m[..., 0] > .5)

    # 4. Even out large-scale sunlight so the 3D lights shade the face instead.
    region = ellipse(z, y, -.002, -.004, .074, .104) & (y < hairline(z) + .004)
    lit = (skin & region & ~eyes & ~nose_mouth).astype(np.float32)
    low = blur(image * lit[..., None], 48) / np.maximum(blur(lit, 48), 1e-4)[..., None]
    mean = (image * lit[..., None]).sum((0, 1)) / lit.sum()
    image = image / np.clip(low / mean, .55, 1.8) ** .85

    # 5. Feathered alpha: full inside the face, fading beneath the 3D hairline
    #    and towards the jaw and outer cheeks, where the same skin color takes
    #    over; any hair left at the temples fades out with it.
    inside = np.clip((1 - (((z + .002) / .076) ** 2 + ((y + .004) / .108) ** 2)) / .16, 0, 1)
    # Opaque up to just under the 3D hair edge (hairline - 8 mm, standing off the skin).
    top = smooth(hairline(z) + .001 - y, 0, .006)
    temples = blur((skin | ellipse(z, y, .001, -.004, .050, .080) | (y < 0)).astype(np.float32), 3)
    alpha = np.minimum(np.minimum(inside, top) ** 1.4, temples)

    # Golden-hour light made the photo orange; match the reference skin tone,
    # which is also the 3D skin color, so the feathered edge is invisible.
    image = image * (SKIN / mean)
    image = np.where((alpha > 0)[..., None], image, SKIN)
    rgb = np.clip(image, 0, 255).astype(np.uint8)
    sharp = Image.fromarray(rgb, 'RGB').filter(ImageFilter.UnsharpMask(radius=2, percent=50, threshold=2))
    out = Image.fromarray(np.dstack([np.asarray(sharp), (alpha * 255).astype(np.uint8)]), 'RGBA')
    out.save(OUTPUT, quality=94, method=6)
    print(json.dumps({'texture': OUTPUT.name, 'size': [W, H], 'pxPerMeter': OUT_PX_PER_M,
                      'z0': Z0, 'y0': Y0, 'edgeSkin': '#%02x%02x%02x' % tuple(int(c) for c in SKIN)}))


if __name__ == '__main__':
    main()
