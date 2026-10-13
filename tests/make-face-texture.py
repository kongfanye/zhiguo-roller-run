"""Build the version 13 face texture from the user's original frontal photograph.

The source is assets/zhiguo-identity-v8.jpg, an unmodified copy of the user's
photo. The face is resampled into the 3D head's coordinates at one uniform
scale. The photographed wire rims (replaced by 3D rims) and loose forehead
strands are filled from the surrounding skin, the hair-covered outer left
cheek is mirrored from the clear right side, thin dark lines that would read
as scars are lifted from the skin, large-scale sunlight is evened out, and a
feathered alpha channel blends the face into the 3D skin and hair.

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
BROW = np.array([104, 70, 56], np.float32)  # Soft brown brows, matching the hair.
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


def dilate(mask, radius, z, y):
    """Grow a mask by radius meters (via a blur threshold)."""
    return blur(mask.astype(np.float32), radius * OUT_PX_PER_M / 2) > .02


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


def grey_morph(channel, size, close=True):
    """Morphological closing (removes thin dark lines) or opening (thin bright lines)."""
    img = Image.fromarray(np.clip(channel, 0, 255).astype(np.uint8), 'L')
    first, second = (ImageFilter.MaxFilter, ImageFilter.MinFilter) if close else (ImageFilter.MinFilter, ImageFilter.MaxFilter)
    return np.asarray(img.filter(first(size)).filter(second(size))).astype(np.float32)


def morph_rgb(image, size, close=True):
    """Per-channel closing/opening, softened so no square kernel edges remain."""
    return np.stack([blur(grey_morph(image[..., k], size, close), 2.0) for k in range(3)], -1)


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
    nose_mouth = ellipse(z, y, .001, -.0195, .017, .0085) | ellipse(z, y, .002, -.0505, .029, .0150)

    # 1. The 3D gold rims replace the photographed ones, so painted rims never
    #    separate from the 3D frames as a double outline at an angle.
    rims = frames(z, y) & ~eyes
    image = fill(image, rims, ~rims)

    # 2. Loose strands cross the bare forehead and her thin brows, which sit on
    #    the photographed top rims; the forehead is smoothed down to the bridge
    #    of the nose (eyes untouched) and soft brows are painted back in step 7.
    above = smooth(y, .040, .049) * (1 - blur(eyes.astype(np.float32), 3))
    strands = (above > 0) & ((lum < blur(lum, 4) - 4) | ~skin)
    clean = fill(image, strands, skin)
    image = image * (1 - above[..., None]) + blur(clean, 5.0) * above[..., None]

    # 3. Hair and its shadow cover the outer part of her left cheek and temple
    #    (and show through that lens); her clear right side is mirrored there,
    #    while the eye, nose and smile stay as photographed.
    keep = blur((eyes | nose_mouth).astype(np.float32), 3)
    m = (smooth(-z, .030, .046) * (1 - keep))[..., None]
    image = image * (1 - m) + mirror(image, z) * m
    skin = skin | (m[..., 0] > .5)

    # 4. Thin dark lines across the skin (stray hairs, creases and leftovers of
    #    the rims) read as scars on the 3D face. A morphological closing lifts
    #    every dark line narrower than ~4 mm back to the surrounding skin, while
    #    broad shading stays; the eyes, nostrils and lips are protected.
    #    Each channel is closed separately, so a line takes on the color of the
    #    skin around it instead of a brightened, orange version of its shadow.
    protect = blur(dilate(eyes | nose_mouth, .0040, z, y).astype(np.float32), 5)
    lifted = np.maximum(image, morph_rgb(image, 11))
    image = image + (lifted - image) * (1 - protect)[..., None]
    #    Faint bright traces along the filled rims are pressed back the same way.
    band = blur(dilate(rims, .0018, z, y).astype(np.float32), 2.0) * (1 - protect)
    pressed = np.minimum(image, morph_rgb(image, 9, close=False))
    image = image + (pressed - image) * band[..., None]

    # 5. Even out large-scale sunlight so the 3D lights shade the face instead.
    region = ellipse(z, y, -.002, -.004, .074, .104) & (y < hairline(z) + .004)
    lit = (skin & region & ~eyes & ~nose_mouth).astype(np.float32)
    low = blur(image * lit[..., None], 48) / np.maximum(blur(lit, 48), 1e-4)[..., None]
    mean = (image * lit[..., None]).sum((0, 1)) / lit.sum()
    image = image / np.clip(low / mean, .55, 1.8) ** .85

    # 6. Feathered alpha: full inside the face, fading beneath the 3D hairline
    #    and towards the jaw and outer cheeks, where the same skin color takes
    #    over; any hair left at the temples fades out with it.
    inside = np.clip((1 - (((z + .002) / .076) ** 2 + ((y + .004) / .108) ** 2)) / .16, 0, 1)
    # Opaque up to just under the 3D hair edge (hairline - 8 mm, standing off the skin).
    top = smooth(hairline(z) + .001 - y, 0, .006)
    # Only hair left beyond the temples fades out; inside the face the skin was
    # already retouched, so no notch is cut into the forehead.
    temples = blur((skin | (np.abs(z + .002) < .052) | (y < 0)).astype(np.float32), 9)
    alpha = np.minimum(np.minimum(inside, top) ** 1.4, temples)

    # Golden-hour light made the photo orange; match the reference skin tone,
    # which is also the 3D skin color, so the feathered edge is invisible.
    image = image * (SKIN / mean)
    image = np.where((alpha > 0)[..., None], image, SKIN)

    # 7. Soft arched brows just above the 3D rims' top bars, symmetric about the
    #    face's midline: fuller inner heads, an arch two-thirds out, a tapering
    #    tail and slightly uneven density like real brow hair.
    grain = blur(np.random.default_rng(13).random(z.shape).astype(np.float32), 1.2)
    grain = .80 + .40 * (grain - grain.min()) / (grain.max() - grain.min())
    for side in (1, -1):
        across = side * (z - PUPIL_MIDLINE)
        t = np.clip((across - .012) / .051, 0, 1)
        centre = .0458 + .0062 * (1 - ((t - .64) / .64) ** 2) - .0032 * smooth(t, .74, 1)
        half = .0031 - .0019 * t ** .8
        reach = smooth(across, .010, .019) * (1 - smooth(across, .055, .064))
        brow = (1 - smooth(np.abs(y - centre) / half, .25, 1.35)) * reach * (.56 - .20 * t) * grain
        image = image + (BROW - image) * np.clip(brow, 0, 1)[..., None]
    rgb = np.clip(image, 0, 255).astype(np.uint8)
    # Sharpen the eyes and smile only; sharpening skin would bring lines back.
    sharp = np.asarray(Image.fromarray(rgb, 'RGB').filter(ImageFilter.UnsharpMask(radius=2, percent=50, threshold=2))).astype(np.float32)
    rgb = np.clip(rgb * (1 - protect[..., None]) + sharp * protect[..., None], 0, 255).astype(np.uint8)
    out = Image.fromarray(np.dstack([rgb, (alpha * 255).astype(np.uint8)]), 'RGBA')
    out.save(OUTPUT, quality=94, method=6)
    print(json.dumps({'texture': OUTPUT.name, 'size': [W, H], 'pxPerMeter': OUT_PX_PER_M,
                      'z0': Z0, 'y0': Y0, 'edgeSkin': '#%02x%02x%02x' % tuple(int(c) for c in SKIN)}))


if __name__ == '__main__':
    main()
