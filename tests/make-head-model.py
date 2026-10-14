"""Build Zhiguo's 3D head and skin texture from one real photograph.

Inputs (all in assets/):
  zhiguo-face-landmarks.json   478 landmarks of her face (tests/detect-face-landmarks.py)
  zhiguo-identity-v8.jpg       her frontal smiling portrait, the only face source

Outputs:
  src/zhiguo-head-model.js     head surface (radius grid), glasses and earring anchors
  assets/zhiguo-head-v14.webp  cylindrical skin texture carrying her photographed face

The character has this one face and one expression (her smile); nothing swaps
faces or expressions while she skates.

Method:
  1. Align the landmarks to MediaPipe's canonical face (similarity Procrustes) to
     undo the photo's head turn, and symmetrise the 3D shape across the mid-line.
     Scale to a 62 mm pupil distance.
  2. The head is a radius field r(azimuth, height) around a vertical axis. A
     thin-plate spline through her landmarks gives the face; an anthropometric
     adult-female cranium and neck give the rest. Their difference is extended
     harmonically beyond the face outline, so the skull meets the face without a seam.
  3. The texture uses the same (azimuth, height) layout. A thin-plate spline maps
     each texel to the portrait. The photographed wire rims and stray hairs are
     inpainted, the low-frequency sun shading is evened out so the game lights
     shade the face, and the colour is white-balanced to her skin tone.

Requires numpy, scipy and Pillow.  python3 tests/make-head-model.py
"""
import base64, json, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.interpolate import RBFInterpolator
from scipy import ndimage, sparse
from scipy.sparse.linalg import spsolve

ASSETS = 'assets/'
data = json.load(open(ASSETS + 'zhiguo-face-landmarks.json'))
canon = np.array(data['canonical']['vertices'])
PHOTO = 'zhiguo-identity-v8.jpg'

# ---------------------------------------------------------------- landmarks
OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377,
        152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
UPPER_INNER = [191, 80, 81, 82, 13, 312, 311, 310, 415]
LOWER_INNER = [95, 88, 178, 87, 14, 317, 402, 318, 324]
mirror = np.array([np.argmin(((canon - canon[i] * [-1, 1, 1]) ** 2).sum(1)) for i in range(468)])


def to3(points):
    p = np.array(points)
    return np.c_[p[:, 0], -p[:, 1], -p[:, 2]]


def procrustes(A, B):
    ma, mb = A.mean(0), B.mean(0); A0, B0 = A - ma, B - mb
    U, sig, Vt = np.linalg.svd(A0.T @ B0); d = np.sign(np.linalg.det(U @ Vt))
    D = np.diag([1, 1, d]); R = (U @ D @ Vt).T; s = (sig * np.diag(D)).sum() / (A0 ** 2).sum()
    return s, R, mb - s * R @ ma


raw = np.array(data['photos'][PHOTO]['points'])
PIXELS = raw[:, :2]
A = to3(raw); SIMILARITY = procrustes(A[:468], canon)
s_a, R_a, t_a = SIMILARITY
mean = (s_a * (R_a @ A.T)).T + t_a
face = (mean[:468] + mean[mirror] * [-1, 1, 1]) / 2
iris = mean[468:]
SCALE = 6.2 / np.linalg.norm(mean[468] - mean[473])           # 62 mm pupil distance
EYE_Y, NASION_Z = (mean[468, 1] + mean[473, 1]) / 2, face[168, 2]


def to_head(c):
    """Canonical centimetres -> head metres: +x forward, +y up, +z her right."""
    c = np.atleast_2d(c)
    return np.c_[SCALE * (c[:, 2] - NASION_Z) / 100 + .090, SCALE * (c[:, 1] - EYE_Y) / 100 + .018, -SCALE * c[:, 0] / 100]


H = to_head(face); HI = to_head(iris)

# ---------------------------------------------------------------- grid layout
AXIS_X = .005
COLS, ROWS = 192, 150


def column_azimuth(u):
    """Columns are twice as dense over the face (|az| < 90 deg) as over the back."""
    # Piecewise-linear density: weight 2 in front, 1 behind; u in [0,1] starts at the back.
    knots_u = np.array([0, 1 / 6, 5 / 6, 1]); knots_a = np.array([-np.pi, -np.pi / 2, np.pi / 2, np.pi])
    return np.interp(u, knots_u, knots_a)


def azimuth_column(a):
    knots_u = np.array([0, 1 / 6, 5 / 6, 1]); knots_a = np.array([-np.pi, -np.pi / 2, np.pi / 2, np.pi])
    return np.interp(a, knots_a, knots_u)


Y_BOTTOM, Y_TOP = -.153, .127


def row_height(v):
    """Rows: 3 mm on the neck, 1.75 mm over the face, then even arcs over the crown."""
    v = np.asarray(v, float)
    neck, face_end = 16 / ROWS, 124 / ROWS
    y = np.where(v < neck, Y_BOTTOM + (v / neck) * (-.105 - Y_BOTTOM),
                 np.where(v < face_end, -.105 + (v - neck) / (face_end - neck) * (.085 + .105), 0))
    crown = np.clip((v - face_end) / (1 - face_end), 0, 1)
    angle = np.arcsin((.085 - .030) / (Y_TOP - .030)) + crown * (np.pi / 2 - np.arcsin((.085 - .030) / (Y_TOP - .030)))
    return np.where(v >= face_end, .030 + (Y_TOP - .030) * np.sin(angle), y)


AZ = column_azimuth(np.arange(COLS + 1) / COLS)
YS = row_height(np.arange(ROWS + 1) / ROWS)
YS[-1] = Y_TOP

# ---------------------------------------------------------------- cranium
# Adult-female head: 22 cm vertex to chin, 15 cm breadth, 18 cm glabella to
# occiput. (height mm, forward half-depth, back half-depth, half-width) from the axis.
LOWER = np.array([
    [-153, 22, 62, 51], [-125, 26, 60, 50], [-105, 31, 59, 50], [-90, 36, 61, 51],
    [-60, 48, 68, 56], [-30, 65, 81, 66], [0, 77, 90, 72], [35, 85, 95, 75]], float)
DOME = {'f': (85, 40, 2.2), 'b': (95, 35, 2.4), 'w': (75, 35, 2.6)}   # value, start height, exponent


def cranium_profile(y_mm):
    out = []
    for k, key in ((1, 'f'), (2, 'b'), (3, 'w')):
        value, start, p = DOME[key]
        if y_mm <= start:
            out.append(np.interp(y_mm, LOWER[:, 0], LOWER[:, k]) if y_mm <= 35 else value)
        else:
            q = max(0., 1 - min(1., (y_mm - start) / (Y_TOP * 1000 - start)) ** p) ** (1 / p)
            out.append(value * q)
    return out


def cranium(az, y):
    f, b, w = cranium_profile(y * 1000)
    c, s = np.cos(az), np.sin(az)
    depth = f if c > 0 else b
    return 1e-3 / max(math.sqrt((c / max(depth, 1e-3)) ** 2 + (s / max(w, 1e-3)) ** 2), 1e-9)


def cylinder(points):
    return np.arctan2(points[:, 2], points[:, 0] - AXIS_X), points[:, 1], np.hypot(points[:, 0] - AXIS_X, points[:, 2])


R0 = .08                                    # arc-length scale for isotropic splines
az_l, y_l, r_l = cylinder(H)

# Recess the open mouth so the photographed teeth sit behind the lips.
extra_xyz = []
for u_i, l_i in zip(UPPER_INNER, LOWER_INNER):
    for t in (.3, .5, .7):
        p = H[u_i] * (1 - t) + H[l_i] * t
        a, yy, rr = cylinder(p[None])
        extra_xyz.append((a[0], yy[0], rr[0] - .0045))
extra = np.array(extra_xyz)
geo_points = np.r_[np.c_[az_l * R0, y_l], extra[:, :2] * [R0, 1]]
geo_values = np.r_[r_l, extra[:, 2]]
# Light regularisation (0.2 mm RMS from the landmarks) removes detector noise.
face_radius = RBFInterpolator(geo_points, geo_values, kernel='thin_plate_spline', smoothing=3e-6)


def polygon_mask(points_ij, shape):
    img = Image.new('L', (shape[1], shape[0]), 0)
    ImageDraw.Draw(img).polygon([tuple(p) for p in points_ij], fill=255)
    return np.asarray(img) > 127


# Face outline on the grid, in fractional (column, row) indices.
oval_az, oval_y, _ = cylinder(H[OVAL])
oval_ij = np.c_[azimuth_column(oval_az) * COLS, np.interp(oval_y, YS, np.arange(ROWS + 1))]
AA, YY = np.meshgrid(AZ, YS)
inside = polygon_mask(oval_ij + .5, AA.shape)

base = np.vectorize(cranium)(AA, YY)
# Smooth the piecewise profile so no shading bands appear between its knots.
base = ndimage.gaussian_filter(base, (2.5, 1.0), mode=('nearest', 'wrap'))
front = face_radius(np.c_[AA[inside] * R0, YY[inside]])
delta = np.zeros_like(base); delta[inside] = front - base[inside]

# Harmonic extension of the face/cranium difference over the rest of the head.
# Below her jaw line the surface returns to the neck within a centimetre, so the
# jaw and the underside of the chin read as clearly as in the photo.
lower = oval_y < -.02
jaw_order = np.argsort(oval_az[lower])
jaw_y = np.interp(AA, oval_az[lower][jaw_order], oval_y[lower][jaw_order], left=np.nan, right=np.nan)
under_jaw = np.nan_to_num(YY < jaw_y - .011 - .004 * np.cos(AA), nan=0).astype(bool)
fixed = inside | under_jaw | (np.abs(AA) > np.radians(140)) | (YY < -.118) | (YY > .120)
n_r, n_c = AA.shape; idx = np.arange(n_r * n_c).reshape(n_r, n_c)
dx = np.gradient(AZ)[None, :] * np.maximum(base, .02); dy = np.gradient(YS)[:, None] * np.ones_like(base)
rows_i, cols_i, vals = [], [], []
rhs = np.zeros(n_r * n_c)
for i in range(n_r):
    for j in range(n_c):
        k = idx[i, j]
        if fixed[i, j]:
            rows_i.append(k); cols_i.append(k); vals.append(1.); rhs[k] = delta[i, j]; continue
        total = 0.
        for di, dj, h in ((1, 0, dy[i, j]), (-1, 0, dy[i, j]), (0, 1, dx[i, j]), (0, -1, dx[i, j])):
            ii, jj = i + di, (j + dj) % (n_c - 1)
            if not 0 <= ii < n_r: continue
            w = 1 / h ** 2; total += w
            rows_i.append(k); cols_i.append(idx[ii, jj]); vals.append(-w)
        rows_i.append(k); cols_i.append(k); vals.append(total)
delta = spsolve(sparse.csr_matrix((vals, (rows_i, cols_i)), shape=(n_r * n_c, n_r * n_c)), rhs).reshape(n_r, n_c)
radius = base + delta

# Keep the eyes, nose and mouth crisp, but smooth the outer face, the join to the
# cranium and the jaw line over about 4 mm so no crease shows.
cell_mm = np.gradient(YS).mean() * 1000
core = np.clip((ndimage.distance_transform_edt(inside) * cell_mm - 12) / 10, 0, 1)
core = ndimage.gaussian_filter(core, 2)
smoothed = ndimage.gaussian_filter(radius, (2.4, 2.4), mode=('nearest', 'wrap'))
radius = radius * core + smoothed * (1 - core)
radius[:, -1] = radius[:, 0]
radius[-1, :] = 0

# ---------------------------------------------------------------- texture
TEX_W, TEX_H = 1024, 1024
import os, sys
DEBUG = sys.argv[1] if len(sys.argv) > 1 else None


def inpaint(img, mask, iterations=400):
    """Fill masked pixels by repeated neighbour averaging (fine for thin wires and hairs)."""
    if not mask.any(): return img
    rows, cols = np.nonzero(mask)
    r0, r1, c0, c1 = max(rows.min() - 8, 0), rows.max() + 9, max(cols.min() - 8, 0), cols.max() + 9
    if (r1 - r0) * (c1 - c0) < mask.size:
        out = img.astype(float).copy()
        out[r0:r1, c0:c1] = inpaint(img[r0:r1, c0:c1], mask[r0:r1, c0:c1], iterations)
        return out
    out = img.astype(float).copy(); m = mask.copy()
    known = ~m
    out[m] = 0
    for _ in range(iterations):
        acc = np.zeros_like(out); cnt = np.zeros(m.shape)
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            acc += np.roll(np.roll(out * known[..., None], di, 0), dj, 1)
            cnt += np.roll(np.roll(known.astype(float), di, 0), dj, 1)
        fill = m & (cnt > 0)
        out[fill] = acc[fill] / cnt[fill][:, None]
        known = known | fill
        if known.all(): break
    # Relax the filled pixels so the fill carries no streaks.
    for _ in range(60):
        blur = ndimage.uniform_filter(out, size=(3, 3, 1))
        out[mask] = blur[mask]
    return out


# Wire rims, bridges, nose pads and the hair strands that cross the face, traced
# in photo pixels. Each entry: (closed?, polyline, width px).
RIMS = [
    (True, [(626, 313), (633, 305), (667, 305), (678, 316), (677, 330), (674, 340), (661, 351.5), (641, 351.5), (626, 340)], 3.4),
    (True, [(694, 316), (704, 306), (735, 306), (744, 316), (744, 343), (733, 353.6), (708.6, 353.6), (700, 343), (699, 330)], 3.4),
    (False, [(676, 316), (686, 314.5), (696, 316)], 3.6),
    (False, [(672, 326), (675, 333)], 4.5), (False, [(698, 327), (701, 334)], 4.5),
]


def cleaned():
    """Remove the photographed rims: the traced path plus any line-like pixels
    (wire and its sharpening halo) within a few pixels of it."""
    img = np.asarray(Image.open(ASSETS + PHOTO).convert('RGB')).astype(float)
    trace_img = Image.new('L', (img.shape[1], img.shape[0]), 0); d = ImageDraw.Draw(trace_img)
    for closed, line, width in RIMS:
        pts = line + line[:1] if closed else line
        d.line(pts, fill=255, width=max(2, int(round(width - 1))), joint='curve')
    y0, y1, x0, x1 = 230, 480, 560, 820
    trace = np.asarray(trace_img)[y0:y1, x0:x1] > 127
    region = img[y0:y1, x0:x1]
    lum = region @ [.299, .587, .114]
    dev = np.abs(lum - ndimage.median_filter(lum, size=9))
    near = ndimage.binary_dilation(trace, iterations=4)
    mask = ndimage.binary_dilation(trace, iterations=1) | (near & (dev > 6))
    mask = ndimage.binary_dilation(mask, iterations=1)
    img[y0:y1, x0:x1] = inpaint(region, mask)
    return img


def bilinear(img, x, y):
    x = np.clip(x, 0, img.shape[1] - 1.001); y = np.clip(y, 0, img.shape[0] - 1.001)
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int); fx = (x - x0)[:, None]; fy = (y - y0)[:, None]
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy)
            + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)


tex_u = (np.arange(TEX_W) + .5) / TEX_W; tex_v = (np.arange(TEX_H) + .5) / TEX_H
T_AZ = column_azimuth(tex_u); T_Y = np.interp(tex_v * ROWS, np.arange(ROWS + 1), YS)
TA, TY = np.meshgrid(T_AZ, T_Y)
tex_inside = polygon_mask(np.c_[azimuth_column(oval_az) * TEX_W, np.interp(oval_y, YS, np.arange(ROWS + 1)) / ROWS * TEX_H], TA.shape)
# Distance (metres) inside the outline, for feathering.
cell = np.stack(np.gradient(np.stack([TA * R0, TY]), axis=(1, 2)))
px_m = (np.hypot(cell[0, 1], cell[1, 1]).mean() + np.hypot(cell[0, 0], cell[1, 0]).mean()) / 2
inside_dist = ndimage.distance_transform_edt(tex_inside) * px_m
band = inside_dist > 0
q = np.c_[TA[band] * R0, TY[band]]

# Skin (not eyes, nostrils or lips), used to measure shading and colour. The
# brows are repainted, so they need no protection from the strand clean-up.
def near(ids, radius):
    a_, y_, _ = cylinder(np.r_[H, HI][ids])
    out = np.zeros(TA.shape, bool)
    for a1, y1 in zip(a_, y_): out |= np.hypot((TA - a1) * R0, TY - y1) < radius
    return out


protect = near([33, 133, 362, 263, 159, 145, 386, 374, 468, 473], .009) | near([61, 291, 0, 17, 13, 14], .011) | near([98, 327], .005) | near([2], .004)
skin = band & ~protect
deep = skin & (inside_dist > .012)
sigma = .014 / px_m
# Neutral skin albedo, white-balanced against her indoor skating photo and the
# teeth of the frontal portrait (both are far less orange than the golden-hour light).
TARGET_SKIN = np.array([214., 163., 140.])


def lowpass(values, weight, radius=.014):
    sigma = radius / px_m
    return ndimage.gaussian_filter(values * weight, sigma) / np.maximum(ndimage.gaussian_filter(weight, sigma), 1e-6)


# The part of the portrait that shows clean skin, traced in photo pixels: below
# the stray strands on the upper forehead, inside the curtain of hair over her
# left eye and cheek, and inside the hair and earring on her right.
CLEAN = [(640, 293), (704, 293), (712, 306), (716, 318), (721, 330), (725, 340), (727, 350), (728, 360), (727, 370), (724, 380),
         (720, 390), (716, 400), (711, 410), (705, 420), (698, 430), (688, 436), (676, 438), (662, 435), (648, 428),
         (636, 416), (628, 404), (624, 392), (621, 375), (619, 355), (620, 335), (624, 320), (632, 306)]
img = cleaned()
pts = np.r_[np.c_[az_l * R0, y_l], np.c_[cylinder(HI)[0] * R0, cylinder(HI)[1]]]
tps = RBFInterpolator(pts, PIXELS, kernel='thin_plate_spline', smoothing=1e-9)
uv = tps(q)
tex = np.zeros((TEX_H, TEX_W, 3)); tex[band] = bilinear(img, uv[:, 0], uv[:, 1])
clean_img = Image.new('L', (img.shape[1], img.shape[0]), 0); ImageDraw.Draw(clean_img).polygon(CLEAN, fill=255)
clean_photo = np.asarray(clean_img) > 127
visible = np.zeros(TA.shape, bool)
visible[band] = clean_photo[np.clip(np.round(uv[:, 1]).astype(int), 0, img.shape[0] - 1), np.clip(np.round(uv[:, 0]).astype(int), 0, img.shape[1] - 1)]
tex[~visible] = np.median(tex[deep & visible], axis=0)
tex *= TARGET_SKIN / np.median(tex[deep & visible], axis=0)
# Thin stray strands over the skin are darker than the skin around them.
lum = tex @ [.2126, .7152, .0722]
strands = visible & ~protect & (lum < .80 * lowpass(lum, (skin & visible).astype(float)))
strands = ndimage.binary_dilation(strands, iterations=3) & visible & ~protect
tex = inpaint(tex, strands, iterations=300)
# Flatten the low-frequency sun shading (her left cheek and the side of her nose
# were in shade). Shade lit by the blue sky also takes back her skin's hue.
lum = tex @ [.2126, .7152, .0722]
gain = np.clip((np.median(lum[deep & visible]) / np.maximum(lowpass(lum, (skin & visible).astype(float), .010), 1)) ** .8, .75, 1.5)
tex *= gain[..., None]
hue = TARGET_SKIN / (TARGET_SKIN @ [.2126, .7152, .0722])
lum = (tex @ [.2126, .7152, .0722])[..., None]
tex = tex + (lum * hue - tex) * (.65 * np.clip((gain - 1) / .4, 0, 1) * ~protect)[..., None]
tex *= TARGET_SKIN / np.median(tex[deep & visible], axis=0)
# The sun also left a hard shadow under her nose; the 3D nose shades it again,
# so lift it most of the way to her skin tone (nostrils and lips excepted).
lum = tex @ [.2126, .7152, .0722]
base_zone = near([2, 164, 167, 393, 98, 327], .012) & ~near([98, 327], .0035) & ~near([0, 13, 14, 17, 61, 291, 37, 267], .006) & visible
lift = np.clip((np.median(lum[deep & visible]) / np.maximum(lowpass(lum, (skin & visible & ~near([98, 327], .0035)).astype(float), .004), 1)) ** .85, 1, 1.5)
soft_zone = ndimage.gaussian_filter(base_zone.astype(float), .002 / px_m)
tex *= (1 + (lift - 1) * soft_zone)[..., None]
# The head is symmetric: where hair hides her face (the outer half of her left
# eye, her left temple and cheek), the mirror image of the same photo's visible
# side completes it, feathered over 5 mm into the real pixels.
mirror_tex, mirror_vis = tex[:, ::-1], visible[:, ::-1]
own = np.clip(ndimage.distance_transform_edt(visible) * px_m / .005, 0, 1)
own = np.where(mirror_vis, own, visible.astype(float))
tex = tex * own[..., None] + mirror_tex * (1 - own[..., None])
face_area = visible | mirror_vis
# Near its edge the photo's broad colour (the blush on her cheeks, the shade
# along her jaw) gives way to her plain skin tone; fine detail stays.
edge_dist = ndimage.distance_transform_edt(face_area) * px_m
broad = np.stack([lowpass(tex[..., c], face_area.astype(float), .008) for c in range(3)], -1)
keep = np.clip((edge_dist - .004) / .016, 0, 1)[..., None]
tex = tex - (broad - TARGET_SKIN) * (1 - keep)
face_alpha = np.clip(edge_dist / .007, 0, 1) ** 1.2
if DEBUG:
    Image.fromarray(np.flipud(np.clip(tex, 0, 255)).astype(np.uint8)).save(DEBUG + '/warp.png')

tex = tex * face_alpha[..., None] + TARGET_SKIN * (1 - face_alpha[..., None])

# Soft brows. Her real brows are thin and sit on the photographed top rims, so
# they go with the rims; repaint them along the measured brow landmarks.
rng = np.random.default_rng(14)
grain = ndimage.gaussian_filter(rng.standard_normal(TA.shape), (0.6, 3.0))
grain = (grain - grain.mean()) / grain.std()
for upper, lower in (([70, 63, 105, 66, 107], [46, 53, 52, 65, 55]), ([300, 293, 334, 296, 336], [276, 283, 282, 295, 285])):
    ua, uy, _ = cylinder(H[upper]); la, ly, _ = cylinder(H[lower])
    ca, cy = (ua + la) / 2, (uy + ly) / 2 - .0012
    # Order the brow from its head (near the nose) to its tail.
    order = np.argsort(np.abs(ca)); ca, cy = ca[order], cy[order]
    t = np.linspace(0, 1, 60)
    seg = np.r_[0, np.cumsum(np.hypot(np.diff(ca) * R0, np.diff(cy)))]; s_ = t * seg[-1]
    path_a, path_y = np.interp(s_, seg, ca), np.interp(s_, seg, cy)
    density = np.zeros(TA.shape)
    for k in range(len(t)):
        half = .0024 * (1 - .45 * t[k]) + .0006
        d = np.hypot((TA - path_a[k]) * R0, TY - path_y[k])
        head_fade = np.clip(t[k] / .18, .35, 1) * np.clip((1 - t[k]) / .25, .25, 1)
        density = np.maximum(density, np.clip(1 - d / half, 0, 1) ** .8 * head_fade)
    brow = np.array([78., 54., 44.])
    amount = np.clip(density * (.70 + .16 * grain), 0, .85)[..., None]
    tex = tex * (1 - amount) + brow * amount

# Image rows run top-down while texture v runs bottom-up.
out = Image.fromarray(np.flipud(np.clip(tex, 0, 255)).astype(np.uint8))
out.save(ASSETS + 'zhiguo-head-v14.webp', quality=92, method=6)
skin_hex = '#%02x%02x%02x' % tuple(int(round(v)) for v in TARGET_SKIN)
print('skin', skin_hex, 'texture', out.size)

# ---------------------------------------------------------------- glasses


def glasses_point(px, py):
    """Portrait pixel on the rims -> canonical point on the frame's curved front plane."""
    M = R_a.T / s_a
    g = np.array([0., 0., 5.5])
    for _ in range(8):
        zg = 5.55 - .010 * g[0] ** 2
        rhs = np.array([px + M[0] @ t_a - M[0, 2] * zg, -py + M[1] @ t_a - M[1, 2] * zg])
        g[:2] = np.linalg.solve(M[:2, :2], rhs); g[2] = zg
    return g


def smooth_outline(points, n=96):
    """Closed polygon -> rounded closed curve through the corner points (Chaikin)."""
    pts = np.array(points, float)
    for _ in range(3):
        nxt = np.roll(pts, -1, 0); pts = np.stack([.75 * pts + .25 * nxt, .25 * pts + .75 * nxt], 1).reshape(-1, 2)
    seg = np.r_[0, np.cumsum(np.hypot(*np.diff(np.r_[pts, pts[:1]], axis=0).T))]
    t = np.linspace(0, seg[-1], n, endpoint=False)
    closed = np.r_[pts, pts[:1]]
    return np.c_[np.interp(t, seg, closed[:, 0]), np.interp(t, seg, closed[:, 1])]


# Her right lens (photo-left) traced in the portrait; the left lens mirrors it so the frame is symmetric.
lens_px = smooth_outline([(626, 313), (633, 305), (667, 305), (678, 316), (677, 330), (674, 340), (661, 351.5), (641, 351.5), (626, 340)])
lens = np.array([glasses_point(*p) for p in lens_px])
lens_head = to_head(lens)
centre_z = lens_head[:, 2].mean()
right_lens = lens_head
left_lens = lens_head * [1, 1, -1]
bridge = to_head(np.array([glasses_point(678, 316), glasses_point(686.5, 314.2)]))
bridge = np.r_[bridge, bridge[:1] * [1, 1, -1]]
bridge[1, 2] = 0
pad = to_head(np.array([glasses_point(674.5, 330)]))[0]
hinge = to_head(np.array([glasses_point(626, 316)]))[0]

# ---------------------------------------------------------------- export
quant = np.clip(np.round(radius / .13 * 65535), 0, 65535).astype('<u2')
mouth = H[[13, 14]].mean(0)
lm = {name: H[i].round(5).tolist() for name, i in
      (('noseTip', 1), ('chin', 152), ('nasion', 168), ('upperLip', 13), ('lowerLip', 14), ('mouthRight', 61), ('mouthLeft', 291),
       ('eyeOuterRight', 33), ('eyeOuterLeft', 263), ('foreheadTop', 10), ('cheekRight', 234), ('cheekLeft', 454),
       ('browRight', 105), ('browLeft', 334), ('jawRight', 172), ('jawLeft', 397))}
lm['pupilRight'] = HI[0].round(5).tolist(); lm['pupilLeft'] = HI[5].round(5).tolist(); lm['mouth'] = mouth.round(5).tolist()
r3 = lambda a: np.round(a, 5).tolist()
module = f"""// Generated by tests/make-head-model.py from Zhiguo's measured face landmarks
// (assets/zhiguo-face-landmarks.json). Do not edit by hand.
export const HEAD_MODEL={{
  version:14,
  // The one photograph her face and its single expression come from.
  source:'{PHOTO}',expression:'smile',pupilDistance:.062,
  // Radius around a vertical axis at x=axisX, on a (row: height) x (column: azimuth) grid.
  cols:{COLS},rows:{ROWS},axisX:{AXIS_X},radiusScale:{.13 / 65535:.10g},
  azimuths:{json.dumps(np.round(AZ, 6).tolist())},
  heights:{json.dumps(np.round(YS, 6).tolist())},
  radius:'{base64.b64encode(quant.tobytes()).decode()}',
  skinColor:'{skin_hex}',
  landmarks:{json.dumps(lm)},
  // Wire frame traced over the photographed glasses (her right lens; the left mirrors it).
  lens:{json.dumps(r3(right_lens))},
  bridge:{json.dumps(r3(bridge))},
  pad:{json.dumps(r3(pad))},
  hinge:{json.dumps(r3(hinge))},
}};
"""
open('src/zhiguo-head-model.js', 'w').write(module)
print('head model', len(module) // 1024, 'KB; landmarks', {k: [round(v * 1000) for v in lm[k]] for k in ('noseTip', 'chin', 'pupilRight', 'mouth')})
