# 思绪 MMind

个人随想记录 App，支持语音输入，AI（DeepSeek）自动整理成文集。

## 项目结构

```
MMind/
├── app/                      # Expo 手机端（项目根）
│   ├── (tabs)/
│   │   ├── index.tsx         # 时间流
│   │   ├── write.tsx         # 写随想
│   │   ├── collections.tsx   # 文集册
│   │   ├── insights.tsx      # 洞察
│   │   └── _layout.tsx
│   ├── collection/[id].tsx   # 文集详情
│   ├── _layout.tsx
│   ├── package.json
│   └── eas.json
├── backend/
│   ├── main.py               # FastAPI 入口
│   ├── ai_worker.py          # AI 整理（DeepSeek）
│   ├── database.py           # SQLite CRUD
│   ├── scheduler.py          # 每日定时整理
│   └── requirements.txt
└── hooks/
    └── useApi.ts             # axios 实例 + zustand store
```

## 前置条件

- Node.js 18+
- Python 3.11+
- DeepSeek API Key（在 [platform.deepseek.com](https://platform.deepseek.com) 申请）
- ffmpeg（whisper 语音识别依赖，可选）

## 后端启动

```bash
cd backend
pip install -r requirements.txt

# 设置 DeepSeek API Key
export DEEPSEEK_API_KEY=sk-xxxxxxxxxxxx   # Linux/Mac
set DEEPSEEK_API_KEY=sk-xxxxxxxxxxxx       # Windows

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

API 文档访问：http://localhost:8000/docs

## 手机端开发

```bash
# 1. 安装依赖
npm install

# 2. 查找本机局域网 IP
ipconfig          # Windows
ifconfig          # Mac/Linux

# 3. 修改 API 地址
# 编辑 hooks/useApi.ts，将 API_BASE 改为你的 IP，例如：
# export const API_BASE = 'http://192.168.1.50:8000'

# 4. 启动开发服务器
npx expo start

# 5. 手机扫描二维码（需安装 Expo Go App）
#    或按 a 在 Android 模拟器运行
```

## 打包 APK

```bash
# 安装 EAS CLI
npm install -g eas-cli

# 登录 Expo 账号
eas login

# 配置项目（首次）
eas build:configure

# 打包 preview APK（可直接安装）
eas build --platform android --profile preview
```

打包完成后下载 .apk 文件，传至手机安装即可。

## 外网访问（Tailscale）

使用 Tailscale 可以让手机在任何网络访问家里的后端服务：

1. 安装 Tailscale：https://tailscale.com/download
2. 在电脑和手机上都安装并登录同一账号
3. 查看电脑的 Tailscale IP（通常是 100.x.x.x）
4. 将 `hooks/useApi.ts` 中的 `API_BASE` 改为 Tailscale IP：
   ```ts
   export const API_BASE = 'http://100.64.0.1:8000'
   ```
5. 后端绑定 `0.0.0.0` 启动即可（已是默认）

## 主要功能

| 页面   | 功能                                     |
|--------|------------------------------------------|
| 时间流 | 按日期分组展示随想，下拉刷新             |
| 写随想 | 文字输入 + 语音录音（Whisper 转文字）    |
| 文集册 | AI 整理的主题文集，点击查看完整 Markdown |
| 洞察   | 统计数据 + 主题分布 + AI 洞察文字        |

## AI 整理逻辑

1. 读取最近 7 天随想（少于 3 条跳过）
2. 用本地关键词匹配给随想打标签（无 API 消耗）
3. 调用 DeepSeek 提取 2-5 个核心主题
4. 针对每个主题生成 500-800 字 Markdown 文集
5. 每日凌晨 2:00 自动触发，也可手动点击「立即整理」

## 环境变量

| 变量名             | 说明                   |
|--------------------|------------------------|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥（必填）|
