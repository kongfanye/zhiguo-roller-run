# Zhiguo Roller Run

Online game: [Start skating](https://kongfanye.github.io/zhiguo-roller-run/)

Game by kongfanye. The cover uses a cutout from the user's real photograph of Zhiguo on inline skates. The author avatar is the user's image of a boy in red.

Lace up your skates and catch fish along a 3D coast. Play on desktop or mobile, with five camera modes, day and night, sound effects, jumps and a one-foot balance trick.

The entire character uses 3D meshes and joints. Version 14 models her head and hair from scratch from her real photographs. The head's shape is measured from her frontal smiling portrait: 478 face landmarks give the 3D surface of her face, which joins an adult-female cranium and neck, and the same photo is her skin texture. She has this one face and one expression, her smile, throughout the game. Large hexagonal rose-gold wire glasses are traced over her real frames and sit in front of her eyes. Her hair follows her braided photos: a center part, curtain strands framing her face, hair over the ears, and two loose three-strand braids from behind the ears over the front of her shoulders, tied with pink-and-white elastics. Clothing follows the reference sheet: a buttoned blue-and-lavender plaid short-sleeve shirt with a pointed collar and a green flower pendant, loose navy denim shorts, thick white socks, and black skates with a pink floral print, hinged cuffs and large cream wheels. Each finger bends around its own joints, and the thumbs point forward when the palms face the body (version 12). The cranium, ears and back of the head are anthropometric rather than scanned, since the photos show only her face.

The existing skeleton and skating motion remain: alternate sideways pushes, recovery and weight transfer, with continuous arm and braid movement and smooth transitions between gliding, jumping, landing and balancing. The face texture is embedded in the HTML, so it also loads when the file is opened directly. All eight viewing angles use the same 3D model; the camera never changes the character's shape. See [MOTION-REFERENCES.md](MOTION-REFERENCES.md) for movement notes, [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for attribution, and [CHARACTER-ASSETS.md](CHARACTER-ASSETS.md) for face and cover assets.

`docs/character.html` is a standalone 3D character preview showing the photo-based head texture. It supports eight directions, face and upper-body framing, a top view, drag-to-orbit, slow playback, pause, and skating/gliding/balancing/jumping. It shares the game's model and animation code and opens directly in a browser.

## Play

Visit [the live game](https://kongfanye.github.io/zhiguo-roller-run/) without downloading source code. The HTML source page in the GitHub repository and the playable game are different URLs.

Desktop controls: W/S to accelerate/brake, A/D to steer, Space to jump, T for a trick, and C to switch cameras. On mobile, use the on-screen buttons. With no manual input, Zhiguo automatically skates and chases fish.

## GitHub Pages setup

1. Upload this directory to a public repository named `zhiguo-roller-run` on the `main` branch.
2. Open Settings → Pages in the repository.
3. Select Deploy from a branch, choose `main` and `/docs`, then click Save.
4. Wait for deployment to finish and open the published URL shown by GitHub.

The complete build is included in `docs/index.html` and `docs/assets`. Serving it with Pages requires no Node.js, npm or application server. Runtime scripts are inlined, and asset links use relative paths compatible with a repository subdirectory. Sounds are generated in the browser; there are no external font, script CDN or backend dependencies.

GitHub Pages provides static hosting without purchasing a domain. Connectivity from mainland China varies by location and must be tested; switching to Pages alone does not guarantee access without a proxy.

See GitHub's [publishing-source documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Edit and rebuild

Run `npm ci` to install dependencies. `npm test` checks motion constraints, joint continuity at 30/60/120 Hz, her head's proportions and smooth surface, that her face never changes while she skates, braid movement, hand completeness and deformation. `python3 tests/make-head-model.py` rebuilds the head shape, glasses and skin texture from her portrait and its landmarks (requires numpy, scipy and Pillow); `tests/detect-face-landmarks.py` re-measures the landmarks with MediaPipe. `npm run build` updates the game and character preview. `npm run test:render` uses the installed Edge browser to verify eight directions, mobile rendering, motion controls and direct HTML loading; set `EDGE_PATH` to use another Chromium executable. Commit and push both the source and `docs` output to redeploy Pages.

The published interface, runtime messages, code comments, test captions and project documentation are in English. The English release uses the version 14 character.

## Original game

Adapted from riba2534's Pelican on a Bicycle, retaining the original 3D coast, fish, sounds and controls while replacing the rider with Zhiguo on inline skates.

- [Original game](https://claude-opus-5-5.riba2534.cn/)
- [Original source](https://github.com/riba2534/claude-opus-5-5-demo/tree/main/pelican-bike)

The original `package.json` declares the ISC license. Three.js and lil-gui license text is included in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
