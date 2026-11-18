# Browser mark

`video-helper-icon.png` is the original AI-generated transparent blue download/play mark created for this project. The PNG is the editable source asset; runtime icons are resized copies in `extension/icons/` at 16, 32, 48 and 128 pixels. The manifest uses the 16/32 pixel copies for the toolbar and the popup uses the 48 pixel copy.

The source was generated with the built-in image-generation tool after the requested SnapAI preflight succeeded but its generation request returned a no-credit error. No API key, configuration or billing data is stored here. The browser project does not need Expo/iOS/Android icon scaffolding.

Resize from the source, preserving PNG alpha, for example:

```sh
sips -z 32 32 assets/video-helper-icon.png --out extension/icons/32.png
```
