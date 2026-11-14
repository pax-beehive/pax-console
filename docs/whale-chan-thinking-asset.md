# 鲸鱼娘思考头像

[whale-chan-thinking-v2.png](../public/whale-chan-thinking-v2.png) 使用内置 `image_gen` 工具重新生成，是带透明背景的鲸鱼娘头像。输入图仅用于角色和表情参考；最终资产是新生成的头像，没有复制截图中的文字、气泡或手机界面。

参考为用户提供的 `Screenshot_20261113-150825.png`。角色为 DeepSeek 鲸鱼娘（鲸娘），保留蓝青色长发、鲸鳍耳、蓝蝴蝶结和白色女仆头饰。表情采用参考中的扁圆脸、半眯的方蓝眼睛、粗平上眼线、鼓脸撅嘴和托腮手，呈现呆萌思考的状态。

源资产为 1287 × 1222 的 RGBA PNG，含透明 Alpha，大小为 1,307,631 bytes。消费端应使用 Next Image 并指定 `width={20}`、`height={20}`，通过图像优化提供小尺寸资源，不应直接下发全尺寸源图。

## 最终生成 Prompt

该头像仅在当前会话模型明确识别为 DeepSeek 时显示；其他或未知模型不显示，思考文案与耗时继续保留。

完整 Prompt 如下，同步保存在生成工作文件 `/tmp/pax-whale-avatar/v2-prompt.txt`。工具模式为 imagegen skill 的 built-in `image_gen`，使用用户截图作为角色与表情参考，并设置 `transparent_background: true`。

```text
Use case: stylized-concept
Asset type: compact transparent thinking-status avatar for an app, displayed at 20 by 20 CSS pixels.
Primary request: Generate one clean chibi head icon that closely follows the whale girl (DeepSeek 鲸鱼娘 / 鲸娘) shown in the supplied screenshot, especially this exact sleepy, slightly pouty thinking expression. The screenshot is the character and expression reference; do not reproduce its interface or meme text.
Subject and invariant expression: a flattened, wide round pale face with softly puffed rosy cheeks, short small downturned pout mouth, half-lidded rectangular blue eyes and thick straight dark eyebrows or upper eyelids. Her gaze is calm and adorably blank, as if deep in thought. One small hand tucked under her cheek supports her chin, with only a small white ruffled cuff visible.
Identity: medium royal-blue long bangs and side hair with light cyan lower tips, small whale-fin-shaped ears/side flaps, white scalloped maid headband, two small blue bows. Preserve the reference's soft, simplified, slightly deadpan chibi appearance, not an excited smiling mascot.
Composition/framing: a single centered mostly front-facing large head and the one chin-resting hand. No torso or full body. The complete head, ears, bows, and hand form a compact wide silhouette occupying 90 percent of a square canvas, with clear padding and no cropping.
Style/medium: polished 2D anime sticker illustration, bold clean outlines and simple broad color shapes so the half-lidded eyes, pout and hand remain readable at 20 pixels; limited gentle shading, no fine details.
Scene/backdrop: actual transparent alpha background, no color or texture outside the character.
Constraints: no text, speech or thought bubbles, ellipsis, phone status bar, phone interface, black bars, frame, circular badge, background, watermark or logo. No large round sparkling eyes, open mouth smile, cheerful grin, ordinary fish, or whale animal. Only one character head and one chin-resting hand.
```
