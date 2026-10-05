# 轮滑动作更新（2026-10-05）

参考轮滑教练 Asha Kirkby 的 Skatefresh 教学：

- https://skatefresh.com/how-to-get-a-more-powerful-skating-stride/
- https://skatefresh.com/wp-content/uploads/2020/08/Speed-Eng-Intermediate-Focus-Points.pdf

动作采用「支撑滑行 → 向侧方蹬地 → 抬脚收回 → 落地换脚」的周期。重心向支撑腿移动，支撑膝保持弯曲，收腿脚抬离地面，左右腿交替，手臂随之摆动。停止蹬地时平滑收敛为滑行姿态；跳跃时两脚离地；落地时屈膝缓冲；单脚特技保留右脚承重。

src/skating-motion.js 负责步态；src/zhiguo-rig.js 使用两段腿部 IK 和手臂关节转动驱动既有八方向贴图。脸部与眼镜保留原贴图，只随躯干整体移动，不做五官形变。两条腿使用独立的源图区域，减少收腿时跨过透明区域的网格折叠；上半身和手臂使用连续网格维持连接。

这仍是照片风格的多方向角色动画，并非动作捕捉或真实三维人体扫描。侧面前后推移的投影、八方向切换和遮挡存在局限。

验证：`node tests/gait.mjs` 检查八方向姿态有限值、轮滑支撑、不穿地、阶段连续性、滑行停止步频、单脚特技承重、跳跃与落地缓冲。另检查桌面与手机浏览器画面、镜头切换和触控按钮。
