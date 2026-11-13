# 鲸鱼娘思考头像

[whale-chan-thinking.png](../public/whale-chan-thinking.png) 使用内置 `image_gen` 工具重新生成，是带透明背景的鲸鱼娘头像。输入图仅用于角色身份参考；最终资产是新生成的正面大头头像，没有裁剪或复制原始精灵图。

参考角色为 DeepSeek 鲸鱼娘（鲸娘），保留蓝青色长发、鲸鳍样侧发、蓝眼睛和白色女仆发箍。角色参考来自 [codex-pet-DeepSeek-girl](https://github.com/xpy12367/codex-pet-DeepSeek-girl)，原始参考图为 [spritesheet.webp](https://raw.githubusercontent.com/xpy12367/codex-pet-DeepSeek-girl/main/spritesheet.webp)。

源资产为 1254 × 1254 的 RGBA PNG，含透明 Alpha，大小为 1,497,974 bytes。消费端应使用 Next Image 并指定 `width={20}`、`height={20}`，通过图像优化提供小尺寸资源，不应直接下发全尺寸源图。

## 最终生成 Prompt

完整 Prompt 如下。工具模式为 imagegen skill 的 built-in `image_gen`，使用角色参考图并设置 `transparent_background: true`。

```text
Use case: stylized-concept
Asset type: tiny transparent app UI avatar shown at 20 by 20 CSS pixels before a thinking status label.
Primary request: Create one new, clean, front-facing chibi head avatar of DeepSeek whale girl (鲸鱼娘 / 鲸娘), using the supplied spritesheet only as a character identity reference. This is a new UI asset, not a crop or a spritesheet.
Input image 1: identity reference only. Preserve her recognizable dark royal-blue hair flowing into cyan tips, long bangs, whale-fin-shaped side hair, rounded cute face, large bright blue eyes, white scalloped maid headband, and small blue hair tuft at the crown.
Scene/backdrop: genuinely transparent background with alpha; empty outside the character.
Composition/framing: a single symmetrical front-facing large head and just a hint of shoulders. The head and hair fill about 90 percent of the square canvas, centered with modest clear padding. Headband and side hair fully inside the frame. No full body.
Style/medium: crisp polished anime chibi illustration, bold clean silhouette, simple broad color shapes, limited shading, friendly alert expression. Designed to remain recognizable at 20 pixels, avoid busy micro-detail.
Color palette: deep royal blue and cyan hair, blue eyes, pale face, white headband, small navy-and-white collar.
Constraints: one character head only. No text, logos, watermarks, frame, circle badge, background, surrounding decorations, ordinary fish, or whale animal. Preserve actual transparent alpha.
```
