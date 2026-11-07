# 云鲸归途 · 开始菜单 AI 对照实验

同一份需求文档、同一个生图模型（gpt-image-2.5-flare），交给两个 AI agent 各自独立完成的游戏开始菜单。

- `dsh/`：DeepSeek V4.1 Flash Fast（思考强度 Max，DeepSeek Harness headless），由 Claude 下达任务并验收，经过 2 轮返修
- `claude/`：Claude，在 Claude Code 中独立完成

纯静态页面，无外部依赖。所有图像均由 AI 生成，代码由 AI 编写；两个版本的图层已用同一参数统一压缩为 WebP。
