# 第三方组件与参考

## Three.js

- 版本：0.180.0
- 官方项目：https://threejs.org/
- 官方源码：https://github.com/mrdoob/three.js
- 许可证：MIT，见 `licenses/THREE-MIT.txt`。
- 运行库内包含官方 `RoomEnvironment` 与 `BufferGeometryUtils.mergeGeometries`。
- Three.js 只提供图形工具；本项目未使用下载的人体心脏网格或第三方模型。

## 字体

页面嵌入了 Google Fonts 提供的 Noto Serif SC、Noto Sans SC 字符子集，只覆盖当前页面使用到的中文字符，其他字符由系统字体补齐。

- Noto Serif SC：https://fonts.google.com/noto/specimen/Noto+Serif+SC
- Noto Sans SC：https://fonts.google.com/noto/specimen/Noto+Sans+SC
- SIL Open Font License 1.1，原文见 `licenses/notoserifsc-OFL.txt` 与 `licenses/notosanssc-OFL.txt`。

## 解剖外观参考

以下资料用于核对外部形态、心尖方向、主动脉弓、肺动脉与冠状血管走向。没有将参考图片、其纹理或模型嵌入成品。

- Heart Anatomy, Anatomy and Physiology II：https://courses.lumenlearning.com/suny-ap2/chapter/heart-anatomy/
- TeachMeAnatomy, Coronary Arteries and Veins：https://teachmeanatomy.info/thorax/organs/heart/heart-vasculature/
- Heart Models, anterior model reference：https://www.slideserve.com/amory/heart-models

本项目的参数曲面、血管路径、艺术配色、形变代码、页面布局与心跳音效均为本次创作。

## 本次心动节奏参考

仅核对心房与心室的时序、纵向缩短和扭转关系，未复制图像或原文。动画参数为本项目的艺术化近似。

- OpenStax, Cardiac Cycle：https://openstax.org/books/anatomy-and-physiology/pages/19-3-cardiac-cycle
- CMR 纵向与周向心肌运动研究：https://pubmed.ncbi.nlm.nih.gov/20716369/

## 音频时钟 API 参考

用于核对输出时间戳与延迟属性的含义，未嵌入网页内容或音频素材。

- MDN, AudioContext.getOutputTimestamp：https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp
- MDN, AudioContext.baseLatency：https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/baseLatency
- MDN, AudioContext.outputLatency：https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/outputLatency
