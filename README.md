# 指锅快跑

在线游戏：[点击开始滑行](https://kongfanye.github.io/zhiguo-roller-run/)

游戏作者：kongfanye。游戏封面使用用户提供的指锅真人轮滑照片抠图，作者头像使用用户提供的红衣小男孩图片。

穿上轮滑鞋，沿着 3D 海岸线追鱼。支持电脑和手机，包含五种镜头、昼夜、音效、跳跃和单脚特技。

角色全身使用三维网格与关节。第九版按用户的新照片把双辫改为中分披发，长度落到胸前与肩背，带自然波浪和偏红的棕色。头顶、两侧与后脑共用连续三维发层，运动时发尾轻微摆动并避开胸背。面部保持第八版原样：五官直接取自本人原照片，贴合连续的立体脸部，保留本人眼形、眉毛、笑容与眼镜轮廓。服装为开襟米蓝格子短袖衬衫、灰色内搭、深色短裤、白袜和黑红轮滑鞋。人物侧面、耳部和后脑为照片参考的近似建模，并非扫描模型。

保留现有的人体骨架和轮滑动作：左右交替蹬地、回收、落地承重，手臂和披发连续跟随，滑行、跳跃落地与单脚平衡平滑过渡。照片材质内嵌于 HTML，直接打开文件也能显示。八个方向共用同一个立体模型，镜头不会改变人物形状。动作说明见 [MOTION-REFERENCES.md](MOTION-REFERENCES.md)，素材来源见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)，原照片材质的说明见 [CHARACTER-ASSETS.md](CHARACTER-ASSETS.md)。

`docs/character.html` 是独立的三维人物预览，提供本人照片对照，支持八方向、面部特写、上半身、俯视、拖拽环绕、慢速播放、暂停以及轮滑/滑行/平衡/跳跃。它与游戏使用相同模型和动画代码，可直接在浏览器打开。

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

`npm ci` 安装依赖，`npm test` 检查动作约束、30/60/120 Hz 下的关节连续性、披发运动，以及第八版面部数据完全不变，`npm run build` 更新游戏和人物预览。`npm run test:render` 使用本机 Edge 进行八方向、手机画面、动作切换及直接打开 HTML 的浏览器验证；其他 Chromium 浏览器可通过 `EDGE_PATH` 指定可执行文件。将源码及 docs 一起提交并推送后，Pages 会重新发布。

## 原作

基于 riba2534 的《鹈鹕骑单车》修改，保留原作 3D 海岸、鱼、音效和操作系统，主角改为指锅滑轮滑。

原游戏：https://claude-opus-5-5.riba2534.cn/

原源码：https://github.com/riba2534/claude-opus-5-5-demo/tree/main/pelican-bike

原 package.json 声明 ISC 许可。

Three.js 与 lil-gui 的许可文本见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
