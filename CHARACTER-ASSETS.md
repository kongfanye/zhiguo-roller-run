# 第九版人物素材

本版只修改发型与发色。发型参考用户提供的 `296ff0e8951bce2cf749336926849908.jpg`，项目保存原照副本为 `assets/zhiguo-hair-reference-v9.jpg`。形态为中分、胸前与肩背长度的自然披发，带轻微波浪、不齐的发尾和红棕色。

`src/zhiguo-hair.js` 创建闭合的后脑发层与有厚度的两侧发束，头顶沿现有头部曲面连续衔接，细发丝补充边缘。披发通过解析阻尼弹簧跟随动作，并与现有胸背轮廓避让。`assets/zhiguo-front-v9.webp` 为本版真实三维渲染，作为游戏首页缩略图。

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
