"""Measure Zhiguo's face in her frontal portrait, the one source of her face.

Writes assets/zhiguo-face-landmarks.json, the input of tests/make-head-model.py.
Requires mediapipe (0.10+ tasks API), numpy and Pillow, plus MediaPipe's
face_landmarker.task model bundle:

  python3 tests/detect-face-landmarks.py path/to/face_landmarker.task

The face is small in the 1440 x 960 photo, so it is cropped and enlarged before
detection; landmarks are returned in original photo pixels. The canonical
mesh (468 vertices, 898 triangles, metric centimetres) comes from the bundle's
geometry pipeline metadata and gives the left/right landmark pairs.
"""
import io, json, struct, sys, zipfile
import numpy as np
from PIL import Image
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

PHOTOS = {
    # Frontal smiling portrait, head turned about 8 degrees.
    'zhiguo-identity-v8.jpg': (430, 90, 930, 590),
}


def varint(b, i):
    r = s = 0
    while True:
        c = b[i]; i += 1; r |= (c & 0x7f) << s; s += 7
        if c < 128: return r, i


def fields(b):
    i, out = 0, []
    while i < len(b):
        key, i = varint(b, i); f, t = key >> 3, key & 7
        if t == 0: v, i = varint(b, i)
        elif t == 1: v = b[i:i + 8]; i += 8
        elif t == 5: v = b[i:i + 4]; i += 4
        elif t == 2: n, i = varint(b, i); v = b[i:i + n]; i += n
        else: raise ValueError(t)
        out.append((f, t, v))
    return out


def canonical_mesh(bundle):
    meta = zipfile.ZipFile(bundle).read('geometry_pipeline_metadata_landmarks.binarypb')
    mesh = next(v for f, t, v in fields(meta) if f == 1 and t == 2)
    floats, index = [], []
    for f, t, v in fields(mesh):
        if f == 3: floats += struct.unpack(f'<{len(v) // 4}f', v)
        elif f == 4 and t == 2:
            j = 0
            while j < len(v): x, j = varint(v, j); index.append(x)
        elif f == 4: index.append(v)
    vertices = np.array(floats).reshape(-1, 5)[:, :3]
    return vertices, np.array(index).reshape(-1, 3)


def main(bundle):
    vertices, triangles = canonical_mesh(bundle)
    options = vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=bundle),
        output_facial_transformation_matrixes=True, num_faces=1,
        min_face_detection_confidence=.2, min_face_presence_confidence=.2)
    landmarker = vision.FaceLandmarker.create_from_options(options)
    photos = {}
    for name, (x0, y0, x1, y1) in PHOTOS.items():
        photo = Image.open('assets/' + name).convert('RGB')
        crop = photo.crop((x0, y0, x1, y1)); up = 2
        crop = crop.resize((crop.width * up, crop.height * up), Image.LANCZOS)
        result = landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(crop)))
        assert len(result.face_landmarks) == 1, name
        W, H = crop.size
        points = [[p.x * W / up + x0, p.y * H / up + y0, p.z * W / up] for p in result.face_landmarks[0]]
        photos[name] = {'size': photo.size, 'points': np.round(points, 3).tolist()}
        print(name, len(points), 'landmarks')
    json.dump({'source': 'MediaPipe FaceLandmarker (468 face + 10 iris landmarks; x, y photo pixels, z relative depth in pixels)',
               'canonical': {'vertices': np.round(vertices, 5).tolist(), 'triangles': triangles.tolist()},
               'photos': photos}, open('assets/zhiguo-face-landmarks.json', 'w'), separators=(',', ':'))


if __name__ == '__main__':
    main(sys.argv[1])
