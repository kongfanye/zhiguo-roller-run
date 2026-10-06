# 人物与封面素材

## 第十二版左右手镜像修正（2026-10-06）

修正人体素材与游戏骨架之间的左右手对应关系：在 `src/skater-body.js` 中沿手臂的纵向平面镜像绑定坐标，同时翻转三角形绕序并重新计算法线，确保外表面正常显示。手臂、手腕与五指共同镜像，使手腕蒙皮保持连续；掌心朝向身体时，拇指和食指位于前侧。`tests/hands.mjs` 增加左右手解剖方向和拇指朝向检查，覆盖轮滑、平衡与跳跃姿态。

## 第十一版手部、面部与双辫（2026-10-06）

按用户选定的图三，面部直接复用旧版 `assets/zhiguo-front.webp` 中的正面眼镜与微笑，没有重新生成五官。`src/zhiguo-identity.js` 调整脸部比例、贴图映射，焊接前额到下颌的网格接缝，避免脸部中央光照断裂。头发使用 `src/zhiguo-braids.js` 的三维中分双辫，编织发束、发绳与发尾共同随身体连续运动。

手臂与手部继续来自 CC0 的 MakeHuman 人体网格，来源见 `MAKEHUMAN-ASSET-LICENSE.md`。重新导出完整五指，补上旧版高度筛选误删的指尖。每根手指围绕自身指节形成自然放松姿态，不再对整只手做统一弯折或横向挤压；手掌独立随手腕运动，手腕与前臂之间平滑蒙皮。前臂采用固定朝向的关节坐标，避免掌心反转。`tests/hands.mjs` 检查指尖网格闭合、指节长度、掌心方向、实际手部网格的拉伸和帧间连续性。

## 真人封面与作者头像（2026-10-06）

首页封面改用用户提供的真人轮滑照片提取人物，文件为 `assets/zhiguo-cover-photo-v10.png`。使用内置 imagegen 编辑生成透明抠图，保留本人五官、衣着与轮滑鞋；去除背景及其他人物，原照片被遮挡的手臂和手部由编辑补全。首页照片仅用于封面，游戏内使用三维人物和轮滑动作。

作者头像 `assets/kongfanye-avatar.jpg` 是用户提供的红衣小男孩原图，未使用生成工具修改。封面显示“游戏作者：kongfanye”并链接到作者 GitHub。两张图片内嵌在游戏 HTML 中，独立文件和手机网页均可加载。

内置 imagegen 最终提示词：

```text
Use case: background-extraction. Asset type: transparent photograph cutout for a web game's cover. Edit target: the attached indoor skating photo. Extract ONLY the tall adult woman standing in the CENTER of the photo, wearing round glasses, two brown braids, open blue/beige plaid short-sleeve shirt over a light T-shirt, dark shorts, tall white socks and black/red inline roller skates. She is smiling and looking slightly downward. Remove ALL background, the child in the pink helmet, other people, the little pasted duplicate figures, clouds, doodles and all objects. Preserve the adult woman's exact photographed face, glasses, smile, hair, proportions, visible skin pixels, clothing and skate details, and her original pose. This must remain a faithful photographic cutout of the same actual woman, not a drawing, render, beauty retouch or a newly invented person. Only reconstruct the small parts of her arm/hand/clothing obscured by the child, consistent with the original pose. Center her complete body with both roller skates visible, tightly framed in a tall portrait image, small transparent margin. Genuine alpha transparency everywhere outside her silhouette; no floor, no shadow, no text, no white or checkerboard background.
```

## 第九版人物素材

本版只修改发型与发色。发型参考用户提供的 `296ff0e8951bce2cf749336926849908.jpg`，项目保存原照副本为 `assets/zhiguo-hair-reference-v9.jpg`。形态为中分、胸前与肩背长度的自然披发，带轻微波浪、不齐的发尾和红棕色。

`src/zhiguo-hair.js` 创建闭合的后脑发层与有厚度的两侧发束，头顶沿现有头部曲面连续衔接，细发丝补充边缘。披发通过解析阻尼弹簧跟随动作，并与现有胸背轮廓避让。`assets/zhiguo-front-v9.webp` 为第九版真实三维渲染，保留供对照；当前首页使用真人照片抠图。

面部网格顶点、法线、索引、照片材质投影与光照、头部位置均保持第八版原样。`tests/hair.mjs` 对这些数据及原照片做 SHA-256 比对，并检查转弯、平衡和跳跃时发束连续运动。人体、衣服与原有轮滑动作也保持原样。

## 第八版面部（继续使用）

当前运行时面部素材为 `assets/zhiguo-identity-v8.jpg`：用户提供的 `8537f67ccf205780df65d0cd6f959bde.jpg` 的原始文件副本，1440 × 960。没有生成或替换五官，没有使用第七版的生成面部。完整原照片内嵌到游戏与人物预览，预览页的本人照片对照也显示同一张原照。

原照与项目副本的 SHA-256 均为 `D3A0104E1B6A1633827F3C3A45593E75924F06126B195FC560D33B31D6114592`，核对原始文件一致。只在三维材质中调整坐标、边缘混合与光照。

`src/zhiguo-identity.js` 定义像素坐标与立体面部的对应关系：发际线 (678,268)、眼线 (678,325)、鼻部 (684,362)、笑容 (679,391)、下巴 (670,438)。头颈采用连续立体曲面，避免通用模型眼窝、嘴部开口遮挡照片里的眼睛和笑容。耳部、手臂和手部继续使用 CC0 人体网格；头发、镜腿与耳饰为三维几何。正面镜框来自原照片，避免叠加出两副眼镜。

第八版原发型为中分深棕双辫，已在第九版替换为披发。服装继续采用开襟米蓝格子短袖、内搭、深色短裤、白袜与黑红轮滑鞋。`assets/zhiguo-front-v8.webp` 保存旧版三维渲染以供对照。侧面结构依据照片近似重建，不是本人扫描。

以下保存旧版来源记录，旧版面部已经不用于当前角色。

## 第七版（已替换）

面部材质：`assets/zhiguo-face-v7.webp`。使用内置 imagegen 工具，以本次用户提供的八方向人物图为唯一身份参考生成；保存为 WebP 并内嵌到游戏和人物预览 HTML。保留先前的 v6 素材以便比较。模型与贴图属于参考照片的近似重建，并非扫描。

本次最终生成提示词（内置工具模式）：

```text
Use case: identity-preserve. Asset type: high-resolution diffuse face color texture for a real volumetric 3D roller-skating character. Input image 1 is the sole identity reference: the eight-view turnaround of the same smiling woman with fine wire eyeglasses, center-parted brown hair and two braids, plaid shirt. Generate one square, perfectly front-facing orthographic close-up of this exact woman's face, preserving the reference woman's rounded oval cheeks, distinctive dark eyes, nose proportions, brow shapes, toothy cheerful smile and visible upper teeth. Do not change facial identity, age appearance or facial structure. Remove eyeglasses only, because independent three-dimensional frames are added by the game. Use neutral flat diffuse lighting, natural skin texture, no strong shadows, no highlights. Composition required for projection onto an existing 3D head: warm skin-color uniform background; face centered; cheeks span about 72% of image width; forehead hairline at 8% of image height; eyes horizontal at 38%; nose tip at 54%; mouth center at 69%; chin at 91%. Minimal hair only at the outer hairline and upper edge; do not cover cheeks with hair. No shoulders, body, clothes, text, labels, border, watermark, collage or multiple faces. Output a crisp 1024x1024 photorealistic color texture, not a rendered 3D figure, not cartoon. This is a face material asset derived from the identity reference, not a claim of an exact biometric scan.
```

以下为第六版素材记录。

面部材质：`assets/zhiguo-face-v6.webp`。使用内置 imagegen 工具，以上传照片中的清晰正面照片和轮滑照片为外观参考制作。图片仅作为面部颜色材质；网格、关节、眼镜、头发和衣服在三维场景中独立生成。角色是照片参考的近似重建，不能视为本人扫描。

人体拓扑：`src/anatomical-mesh.js` 仅包含 MakeHuman hm08 核心网格的头颈、手臂和手部，以及成人女性形状目标的派生数据；不包含完整人体和其他身体部位。对脸颊、颈部、手指放松形状及骨段长度做了进一步调整。MakeHuman 核心素材的 CC0 声明见 `MAKEHUMAN-ASSET-LICENSE.md`。

最终图像提示词（内置工具模式）：

```text
Use case: identity-preserve. Asset type: photorealistic face color texture for an actual anatomical 3D game character, not a cartoon. Input 1 is the primary identity photograph of the woman named Zhiguo, input 2 supports her appearance. Generate one perfectly front-facing, orthographic close-up texture of this exact woman's face, top of forehead to bottom of chin, centered on a uniform warm skin-color background. Preserve her actual facial features: rounded oval cheeks, natural medium nose, dark brown eyes, genuine broad friendly toothy smile and upper teeth, natural skin pores, no makeup, no beauty reshaping, no generic doll face. Remove the glasses only so that separate 3D glasses can be used; preserve exact eye shapes and positions behind the glasses. Hair kept only as the hairline at the upper forehead and sides, do not obscure cheeks. Neutral flat diffuse lighting, no cast shadows, no directional highlights. Precise framing for texture projection: face centered, eyes horizontally aligned around 38% of image height, nose tip around 54%, smiling mouth center around 69%, chin at 91%, forehead hairline around 8%. Face occupies about 72% of image width. No body, no clothing, no text, no labels, no watermark, no 3D render or illustration style. The result must look like the real provided person photographed frontally.
```
