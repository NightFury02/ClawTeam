# ClawTeam README 媒体资源清单

本文档列出了 README.md 和 README_CN.md 中需要插入的所有图片和视频资源。

## 核心定位变化

**新定位**: ClawTeam 将个人打磨的 OpenClaw 智能体团队转变为组织资产，实现跨用户、跨团队的协作网络。

**关键差异**:
- OpenClaw 多智能体模式：个人生产力（你的智能体协同工作）
- ClawTeam：组织生产力（每个人的智能体协同工作）

## 📸 图片资源

### 1. 组织网络主图/动图 ⭐ 高优先级
**位置**: README 顶部，标题下方
**文件**: `docs/images/hero-organizational-network.gif`
**描述**: 展示来自不同用户/团队的智能体通过 ClawTeam 协作
**建议内容**:
- 3-4 个用户图标，每个用户有 2-3 个智能体
- 用户之间的智能体相互连接和协作
- 显示"发现" → "共享" → "协作" → "组织资产"的过程
- 强调跨用户边界的协作
**尺寸**: 1200x600px
**格式**: GIF 或 MP4（自动播放）

---

### 2. 智能体发现与委派流程图 ⭐ 高优先级
**位置**: 工作原理 - 步骤 3
**文件**: `docs/images/agent-discovery-delegation.png`
**描述**: 展示用户如何发现和使用他人共享的智能体
**建议内容**:
```
用户 A 的智能体
        ↓
   搜索 ClawTeam 网络
        ↓
   发现用户 B 的"SecurityPro"智能体
   （显示评分、能力、使用次数）
        ↓
   委派任务
        ↓
   SecurityPro 执行（在用户 B 的机器上）
        ↓
   返回结果给用户 A
```
- 清晰标注每个步骤
- 显示隐私边界（数据不跨用户）
- 使用不同颜色区分不同用户
**尺寸**: 1000x700px
**格式**: PNG

---

## 🎥 视频资源

### 1. 演示工作流视频
**位置**: README 顶部，问题解决部分之后
**文件**: `docs/videos/demo-workflow.mp4`
**描述**: 2 分钟演示视频展示真实工作流
**建议内容**:
1. 开发者在终端中委派代码审查任务
2. 仪表板显示任务被接收
3. Code Review Bot 自动发现 Security Bot
4. 两个 bot 协作（显示消息交换）
5. 结果返回给开发者
6. 显示最终报告
**时长**: 2 分钟
**格式**: MP4（H.264）
**分辨率**: 1920x1080
**帧率**: 30fps

---

### 2. 会话生成演示
**位置**: OpenClaw 集成 - 主会话 + 子会话架构
**文件**: `docs/videos/session-spawning-demo.mp4`
**描述**: 屏幕录制展示会话生成实际操作
**建议内容**:
1. 显示主 OpenClaw 会话
2. 任务到达
3. 主会话自动生成子会话
4. 子会话执行任务
5. 结果返回主会话
6. 子会话自动清理
**时长**: 1-1.5 分钟
**格式**: MP4（H.264）
**分辨率**: 1920x1080
**帧率**: 30fps

---

### 3. 手动 vs 自动化对比
**位置**: 设计哲学 - 智能体对智能体部分
**文件**: `docs/videos/comparison-manual-vs-automated.mp4`
**描述**: 并排比较手动工作流和自动化工作流
**建议内容**:
- 左侧：手动方式（复制粘贴、切换工具）
- 右侧：ClawTeam 方式（自动协作）
- 显示时间对比
- 显示错误率对比
**时长**: 1 分钟
**格式**: MP4（H.264）
**分辨率**: 1920x1080（分屏）
**帧率**: 30fps

---

### 4. 快速入门指南
**位置**: 快速开始部分
**文件**: `docs/videos/quick-start-guide.mp4`
**描述**: 完整的快速入门演练
**建议内容**:
1. 克隆仓库
2. 安装依赖
3. 启动 Docker 服务
4. 运行数据库迁移
5. 启动所有服务
6. 访问仪表板
7. 运行第一个示例
**时长**: 3-4 分钟
**格式**: MP4（H.264）
**分辨率**: 1920x1080
**帧率**: 30fps

---

### 5. 多智能体代码审查
**位置**: 使用场景 - 多智能体代码审查
**文件**: `docs/videos/use-case-code-review.mp4`
**描述**: 完整的代码审查工作流演示
**建议内容**:
1. 开发者提交代码审查请求
2. Code Review Bot 接收任务
3. 自动委派给 Security Bot 和 Performance Bot
4. 显示并行执行
5. 结果汇总
6. 最终报告展示
**时长**: 2-3 分钟
**格式**: MP4（H.264）
**分辨率**: 1920x1080
**帧率**: 30fps

---

### 6. 仪表板导览
**位置**: 仪表板与监控部分
**文件**: `docs/videos/dashboard-tour.mp4`
**描述**: 仪表板功能的完整导览
**建议内容**:
1. Bot 注册表功能
2. 任务看板（拖拽、筛选）
3. 消息收件箱（实时更新）
4. 会话监控（主会话和子会话）
5. 分析图表（任务统计、性能指标）
6. 通知功能
**时长**: 2-3 分钟
**格式**: MP4（H.264）
**分辨率**: 1920x1080
**帧率**: 30fps

---

## 📁 目录结构

建议在项目中创建以下目录结构：

```
ClawTeam/
└── docs/
    ├── images/
    │   ├── hero-collaboration.gif
    │   ├── primitive-layers.png
    │   ├── session-architecture.png
    │   ├── task-delegation-sequence.png
    │   ├── session-persistence-timeline.png
    │   ├── architecture-overview.png
    │   ├── dashboard-collaboration-example.png
    │   ├── use-case-research.png
    │   ├── k8s-deployment.png
    │   ├── openclaw-plugin-screenshot.png
    │   ├── dashboard-overview-annotated.png
    │   └── footer-community.png
    └── videos/
        ├── demo-workflow.mp4
        ├── session-spawning-demo.mp4
        ├── comparison-manual-vs-automated.mp4
        ├── quick-start-guide.mp4
        ├── use-case-code-review.mp4
        └── dashboard-tour.mp4
```

## 🎨 设计指南

### 颜色方案
- **主色**: #2563EB (蓝色 - 代表技术和信任)
- **辅色**: #10B981 (绿色 - 代表成功和协作)
- **强调色**: #F59E0B (橙色 - 代表活力和创新)
- **背景**: #F9FAFB (浅灰 - 清爽干净)
- **文字**: #1F2937 (深灰 - 易读)

### 图标风格
- 使用一致的图标库（推荐 Heroicons 或 Feather Icons）
- 线条粗细一致
- 圆角风格统一

### 字体
- **标题**: Inter Bold 或 SF Pro Display
- **正文**: Inter Regular 或 SF Pro Text
- **代码**: JetBrains Mono 或 Fira Code

### 动画
- 流畅的过渡（300-500ms）
- 使用缓动函数（ease-in-out）
- 避免过度动画

## 📊 优先级

### 高优先级（必须有）
1. ✅ Hero 主图/动图
2. ✅ 会话架构图
3. ✅ 演示工作流视频
4. ✅ 仪表板协作示例截图

### 中优先级（强烈推荐）
5. ✅ 原语层次图
6. ✅ 任务委派序列图
7. ✅ 快速入门指南视频
8. ✅ 仪表板导览视频

### 低优先级（可选）
9. ⭕ 会话持久化时间线
10. ⭕ 研究工作流图
11. ⭕ Kubernetes 部署架构
12. ⭕ 其他使用场景视频

## 🛠️ 制作工具推荐

### 图片制作
- **Figma**: 专业设计工具，适合制作架构图和流程图
- **Excalidraw**: 手绘风格图表，适合快速原型
- **Draw.io**: 免费的图表工具
- **Canva**: 适合制作营销图片

### 视频制作
- **OBS Studio**: 免费的屏幕录制工具
- **ScreenFlow** (Mac): 专业的屏幕录制和编辑
- **Camtasia**: 跨平台的屏幕录制和编辑工具
- **DaVinci Resolve**: 免费的专业视频编辑软件

### GIF 制作
- **LICEcap**: 轻量级 GIF 录制工具
- **GIPHY Capture** (Mac): 简单易用的 GIF 制作工具
- **ScreenToGif**: Windows 上的强大 GIF 工具

## 📝 注意事项

1. **文件大小**:
   - 图片尽量控制在 500KB 以内
   - GIF 控制在 2MB 以内
   - 视频控制在 10MB 以内（或使用 YouTube 链接）

2. **版权**:
   - 确保所有素材都有使用权
   - 使用开源图标库
   - 标注第三方资源来源

3. **可访问性**:
   - 为所有图片添加 alt 文本
   - 视频提供字幕
   - 确保颜色对比度符合 WCAG 标准

4. **国际化**:
   - 图表中的文字尽量使用英文
   - 或准备中英文两个版本
   - 视频可以添加多语言字幕

---

**更新日期**: 2026-03-03
**维护者**: ClawTeam Documentation Team
