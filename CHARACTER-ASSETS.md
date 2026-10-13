# Character and cover assets

## Version 13: real-photo face and eight-view reference outfit (2026-10-13)

The user supplied five real photographs and an eight-view character sheet. The sheet matches `assets/zhiguo-atlas-a.webp`.

**Face.** `assets/zhiguo-face-photo-v13.webp` (552 × 816, RGBA) is built by `tests/make-face-texture.py` from `assets/zhiguo-identity-v8.jpg`, the unmodified copy of the user's frontal photograph. That photo's landmarks fit the existing head at one uniform scale of 875 px/m: pupils at y 321.6, mouth 389, chin 435, and lens centers 68 px apart. The texture is resampled at 3× that scale with a 5% shear for the slight head tilt. The earlier portrait gave the face about 315 px/m and was warped row by row; the new texture has about eight times the pixel density and needs no warping. Retouching is limited:

- Removed the photographed wire rims, bridge and nose pads, which the 3D rims replace.
- Smoothed loose strands from the bare forehead and brow area.
- Mirrored the hair-covered outer left cheek and temple from the clear right side. The eyes, nose and smile are untouched.
- Lifted the photo's shade on the rest of her left cheek, the left side of her nose and her jaw to the lit right cheek's tone. The lift uses each area's local average (about 5 mm), so skin detail stays; the 3D lights add their own shading. It applies only to shaded pixels, and the nostril, lips, teeth and eye are left out.
- Lifted thin dark lines narrower than about 4 mm (stray hairs, sharp creases and rim traces) back to the surrounding skin with a per-channel morphological closing. On the 3D face these lines read as scars; broad shading such as the smile folds stays.
- Painted soft arched brows just above the 3D rims. Her real brows are thin and sit on the photographed top rims, which were removed.
- Sharpened only the eyes and smile.
- Evened out the golden-hour light and matched the color to the reference skin tone `#d4a088`, which is also the 3D skin color.

A feathered alpha fades out beneath the 3D hairline and toward the jaw. No generative model was used.

**Glasses.** `src/zhiguo-identity.js` traces thin gold wire rims over the measured lenses (photo rims x 625–679 / 695–745, y 305–354). The geometric frames are squarer above the lens centers and rounder below. Temple arms run back into the hair.

**Hair.** `src/zhiguo-braids.js` builds 30 swept locks per side from the center part. Ray-casting places each lock on the head surface, so the locks converge on the plait roots behind each ear. The scalp follows the photo's measured forehead arch, a sideburn edge, then the nape, so hair frames the face without covering the cheeks. A soft contact shadow under the hairline seats the hair on the skin. The ear meshes were removed because the reference hair covers them in every view. Each plait has three strands following offset figure-eight paths. Collisions move whole rings of a plait over the shoulder without flattening it.

**Clothing and skates.** These follow the eight-view sheet:

- A buttoned blue/lavender/white madras plaid shirt with a pointed collar, placket, buttons, curved shirt-tail hem and turned-up short sleeves.
- A green four-petal flower pendant on a fine chain.
- Loose navy denim shorts with tan topstitching.
- Thick white crew socks.
- Black skates with a pink floral print, an instep strap with a red buckle, laces, a hinged cuff that pivots with the shin, slim frame rails and four large cream wheels.

The relaxed arm pose keeps the hands away from the hips.

## Version 12: mirrored hand bindings (2026-10-06)

The hand meshes and game skeleton now use matching anatomical sides. In `src/skater-body.js`, binding coordinates are mirrored across the arm's longitudinal plane, triangle winding is reversed and normals are recalculated. Arms, wrists and all five fingers are mirrored together to preserve continuous wrist skinning. When the palms face the body, the thumbs and index fingers are on the forward side. `tests/hands.mjs` checks hand anatomy and thumb direction in skating, balance and jump poses.

## Version 11: hands, face and twin braids (2026-10-06)

The face directly reuses the glasses and smile from the earlier `assets/zhiguo-front.webp` portrait selected by the user. Facial features were not regenerated for this revision. `src/zhiguo-identity.js` adjusts face proportions and texture mapping, and welds the forehead-to-jaw seams to prevent a central lighting split. `src/zhiguo-braids.js` creates 3D center-parted twin braids; woven strands, hair ties and braid ends move continuously with the body.

Arms and hands remain derived from the CC0 MakeHuman mesh; see `MAKEHUMAN-ASSET-LICENSE.md`. All five fingers were re-exported to restore tips mistakenly removed by the earlier height filter. Each finger relaxes around its own joints, rather than bending or compressing the entire hand. The palm follows the wrist independently, with smooth skinning into the forearm. Stable forearm joint frames prevent palm flips. `tests/hands.mjs` checks closed fingertip geometry, finger-segment lengths, palm direction, stretching of the actual hand mesh and frame-to-frame continuity.

## Real-photo cover and author avatar (2026-10-06)

The cover uses a cutout from the user's real inline-skating photograph, saved as `assets/zhiguo-cover-photo-v10.png`. The built-in imagegen editor removed the background and other people while retaining the photographed face, clothes and skates. Small arm and hand areas hidden by the child in the original image were reconstructed during editing. This photo is used only on the cover; gameplay uses the 3D character and skating animation.

`assets/kongfanye-avatar.jpg` is the user's original image of a boy in red, without generative editing. The cover displays "Game by kongfanye" with a link to the author's GitHub profile. Both images are embedded in the game HTML for standalone files and mobile web access.

Final imagegen editing prompt:

```text
Use case: background-extraction. Asset type: transparent photograph cutout for a web game's cover. Edit target: the attached indoor skating photo. Extract ONLY the tall adult woman standing in the CENTER of the photo, wearing round glasses, two brown braids, open blue/beige plaid short-sleeve shirt over a light T-shirt, dark shorts, tall white socks and black/red inline roller skates. She is smiling and looking slightly downward. Remove ALL background, the child in the pink helmet, other people, the little pasted duplicate figures, clouds, doodles and all objects. Preserve the adult woman's exact photographed face, glasses, smile, hair, proportions, visible skin pixels, clothing and skate details, and her original pose. This must remain a faithful photographic cutout of the same actual woman, not a drawing, render, beauty retouch or a newly invented person. Only reconstruct the small parts of her arm/hand/clothing obscured by the child, consistent with the original pose. Center her complete body with both roller skates visible, tightly framed in a tall portrait image, small transparent margin. Genuine alpha transparency everywhere outside her silhouette; no floor, no shadow, no text, no white or checkerboard background.
```

## Version 9: earlier loose-hair assets

This revision changed only hairstyle and color. It used the user's `296ff0e8951bce2cf749336926849908.jpg`, copied to `assets/zhiguo-hair-reference-v9.jpg`, as a reference for center-parted auburn hair with light waves and uneven ends reaching the chest, shoulders and back.

`src/zhiguo-hair.js` builds a closed rear hair layer and thick side locks, connected continuously to the head surface, with fine edge strands. A damped spring follows the movement and avoids the existing chest and back contours. `assets/zhiguo-front-v9.webp` preserves a rendered version 9 comparison; the current cover uses the real-photo cutout.

At the time, face vertices, normals, indices, photograph projection, lighting and head position were unchanged from version 8. SHA-256 comparisons and turn/balance/jump continuity checks verified that revision. The body, clothing and skating motion were also retained. Version 11 later replaced the runtime face and hair as described above.

## Version 8: original-photo projection (historical)

`assets/zhiguo-identity-v8.jpg` is an unmodified copy of the user's `8537f67ccf205780df65d0cd6f959bde.jpg`, at 1440 × 960. Version 8 used this original photograph rather than the generated version 7 face. The complete photo was embedded in the game and character preview and shown in its comparison panel. Version 11 later restored the earlier front portrait.

The original photo and project copy share SHA-256 `D3A0104E1B6A1633827F3C3A45593E75924F06126B195FC560D33B31D6114592`. Only the 3D material's coordinates, edge blending and lighting were adjusted.

The version 8 mapping in `src/zhiguo-identity.js` used these pixel landmarks: hairline (678,268), eyes (678,325), nose (684,362), smile (679,391), chin (670,438). Continuous head and neck surfaces prevented generic eye-socket or mouth openings from hiding the photo's eyes and smile. Ears, arms and hands used the CC0 anatomical mesh; hair, glasses arms and earrings used 3D geometry. Front glasses came from the photo, avoiding duplicate frames.

Version 8 originally used dark-brown center-parted twin braids, replaced by loose hair in version 9. Clothing remained an open beige-and-blue plaid short-sleeve shirt, undershirt, dark shorts, white socks and black-and-red inline skates. `assets/zhiguo-front-v8.webp` preserves the earlier 3D render. Side geometry was approximated from the photographs rather than scanned.

The following entries preserve earlier asset provenance. These earlier face textures are not used by the current character.

## Version 7: replaced face texture

`assets/zhiguo-face-v7.webp` was generated with the built-in imagegen tool, using the user's eight-view character sheet as the sole identity reference. It was saved as WebP and embedded in the game and character-preview HTML. Version 6 assets were retained for comparison. The model and texture approximate the reference photographs rather than representing a scan.

Final generation prompt:

```text
Use case: identity-preserve. Asset type: high-resolution diffuse face color texture for a real volumetric 3D roller-skating character. Input image 1 is the sole identity reference: the eight-view turnaround of the same smiling woman with fine wire eyeglasses, center-parted brown hair and two braids, plaid shirt. Generate one square, perfectly front-facing orthographic close-up of this exact woman's face, preserving the reference woman's rounded oval cheeks, distinctive dark eyes, nose proportions, brow shapes, toothy cheerful smile and visible upper teeth. Do not change facial identity, age appearance or facial structure. Remove eyeglasses only, because independent three-dimensional frames are added by the game. Use neutral flat diffuse lighting, natural skin texture, no strong shadows, no highlights. Composition required for projection onto an existing 3D head: warm skin-color uniform background; face centered; cheeks span about 72% of image width; forehead hairline at 8% of image height; eyes horizontal at 38%; nose tip at 54%; mouth center at 69%; chin at 91%. Minimal hair only at the outer hairline and upper edge; do not cover cheeks with hair. No shoulders, body, clothes, text, labels, border, watermark, collage or multiple faces. Output a crisp 1024x1024 photorealistic color texture, not a rendered 3D figure, not cartoon. This is a face material asset derived from the identity reference, not a claim of an exact biometric scan.
```

## Version 6: earlier face and anatomical assets

`assets/zhiguo-face-v6.webp` was generated with the built-in imagegen tool using clear front and inline-skating photographs as appearance references. The image served only as a face color texture; mesh, joints, glasses, hair and clothing were independently created in 3D. The character is a photographic-reference reconstruction rather than a scan.

`src/anatomical-mesh.js` contains only head/neck, arms and hands from the MakeHuman hm08 core mesh, with derived adult-female shape-target data. It does not include the complete body or other body parts. Cheeks, neck, relaxed fingers and bone-segment lengths were subsequently adjusted. The core assets' CC0 declaration is in `MAKEHUMAN-ASSET-LICENSE.md`.

Final generation prompt:

```text
Use case: identity-preserve. Asset type: photorealistic face color texture for an actual anatomical 3D game character, not a cartoon. Input 1 is the primary identity photograph of the woman named Zhiguo, input 2 supports her appearance. Generate one perfectly front-facing, orthographic close-up texture of this exact woman's face, top of forehead to bottom of chin, centered on a uniform warm skin-color background. Preserve her actual facial features: rounded oval cheeks, natural medium nose, dark brown eyes, genuine broad friendly toothy smile and upper teeth, natural skin pores, no makeup, no beauty reshaping, no generic doll face. Remove the glasses only so that separate 3D glasses can be used; preserve exact eye shapes and positions behind the glasses. Hair kept only as the hairline at the upper forehead and sides, do not obscure cheeks. Neutral flat diffuse lighting, no cast shadows, no directional highlights. Precise framing for texture projection: face centered, eyes horizontally aligned around 38% of image height, nose tip around 54%, smiling mouth center around 69%, chin at 91%, forehead hairline around 8%. Face occupies about 72% of image width. No body, no clothing, no text, no labels, no watermark, no 3D render or illustration style. The result must look like the real provided person photographed frontally.
```
