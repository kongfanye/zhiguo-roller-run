# 指锅快跑

在线游戏：[点击开始滑行](https://kongfanye.github.io/zhiguo-roller-run/)

穿上轮滑鞋，沿着 3D 海岸线追鱼。支持电脑和手机，包含五种镜头、昼夜、音效、跳跃和单脚特技。

角色全身使用三维网格与关节。第六版根据照片重新校准头身比例、肩颈和脸部，头部、手臂与手使用人体网格，手指呈放松姿态；格子衬衣有敞开的前襟、翻领、衣摆与褶皱，并搭配浅色内衫。面部材质由 imagegen 依据提供的照片制作，固定贴合到立体头部；眼镜、耳饰和双辫有三维结构。身体与腿部共用腰胯位置，肩腰和摆臂配合换脚，保留侧后蹬地、低抬脚收回和落地缓冲。这是依据照片制作的近似模型，并非人体扫描或动作捕捉。动作参考见 [MOTION-REFERENCES.md](MOTION-REFERENCES.md)，素材来源见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)，面部材质制作说明见 [CHARACTER-ASSETS.md](CHARACTER-ASSETS.md)。

## 打开游戏

玩家访问 https://kongfanye.github.io/zhiguo-roller-run/，无需下载源码。GitHub 仓库中的 HTML 代码页与游戏网址是两个地址。

电脑操作：W/S 加速刹车，A/D 变道，空格跳跃，T 特技，C 切换镜头。手机使用屏幕按钮。不操作时会自动滑行追鱼。

## GitHub Pages 设置

1. 将本目录的文件上传到自己的公开仓库 `zhiguo-roller-run`，使用 `main` 分支。
2. 打开仓库 Settings → Pages。
3. Source 选择 Deploy from a branch；Branch 选择 main；Folder 选择 /docs；点击 Save。
4. 等待 GitHub Pages 发布成功，打开控制台显示的正式网址。

此目录已经含完整构建结果 `docs/index.html` 与 `docs/assets`，启用 Pages 时不需要 Node.js、npm 或服务器。所有运行时脚本内联、图片使用相对路径，兼容 GitHub Pages 的仓库子路径；音效在浏览器生成，没有外部字体、脚本 CDN 或后端接口依赖。

GitHub Pages 是静态网页托管，无需另购域名；中国大陆不同地区的连接状况仍需实测。换到 GitHub Pages 本身不能保证免代理访问。

官方说明：https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## 修改和重建

`npm ci` 安装依赖，`npm test` 检查动作约束，`npm run build` 更新 docs。将源码及 docs 一起提交并推送后，Pages 会重新发布。

## 原作

基于 riba2534 的《鹈鹕骑单车》修改，保留原作 3D 海岸、鱼、音效和操作系统，主角改为指锅滑轮滑。

原游戏：https://claude-opus-5-5.riba2534.cn/

原源码：https://github.com/riba2534/claude-opus-5-5-demo/tree/main/pelican-bike

原 package.json 声明 ISC 许可。

Three.js 与 lil-gui 的许可文本见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
