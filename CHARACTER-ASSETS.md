# 第六版人物素材

面部材质：`assets/zhiguo-face-v6.webp`。使用内置 imagegen 工具，以上传照片中的清晰正面照片和轮滑照片为外观参考制作。图片仅作为面部颜色材质；网格、关节、眼镜、头发和衣服在三维场景中独立生成。角色是照片参考的近似重建，不能视为本人扫描。

人体拓扑：`src/anatomical-mesh.js` 仅包含 MakeHuman hm08 核心网格的头颈、手臂和手部，以及成人女性形状目标的派生数据；不包含完整人体和其他身体部位。对脸颊、颈部、手指放松形状及骨段长度做了进一步调整。MakeHuman 核心素材的 CC0 声明见 `MAKEHUMAN-ASSET-LICENSE.md`。

最终图像提示词（内置工具模式）：

```text
Use case: identity-preserve. Asset type: photorealistic face color texture for an actual anatomical 3D game character, not a cartoon. Input 1 is the primary identity photograph of the woman named Zhiguo, input 2 supports her appearance. Generate one perfectly front-facing, orthographic close-up texture of this exact woman's face, top of forehead to bottom of chin, centered on a uniform warm skin-color background. Preserve her actual facial features: rounded oval cheeks, natural medium nose, dark brown eyes, genuine broad friendly toothy smile and upper teeth, natural skin pores, no makeup, no beauty reshaping, no generic doll face. Remove the glasses only so that separate 3D glasses can be used; preserve exact eye shapes and positions behind the glasses. Hair kept only as the hairline at the upper forehead and sides, do not obscure cheeks. Neutral flat diffuse lighting, no cast shadows, no directional highlights. Precise framing for texture projection: face centered, eyes horizontally aligned around 38% of image height, nose tip around 54%, smiling mouth center around 69%, chin at 91%, forehead hairline around 8%. Face occupies about 72% of image width. No body, no clothing, no text, no labels, no watermark, no 3D render or illustration style. The result must look like the real provided person photographed frontally.
```
