# Cartoonify - 图片卡通化网站

前后端分离的图片卡通化 Web 应用。上传任意图片，一键转换为卡通风格。

## 项目结构

```
.
├── backend/        # Python FastAPI 后端，OpenCV 图像处理
└── frontend/       # 原生 HTML/CSS/JS 前端
```

## 快速开始

### 1. 启动后端

```bash
cd backend
pip install -r requirements.txt
python main.py
```

后端默认监听 `http://127.0.0.1:8000`，自动启用 CORS。

### 2. 启动前端

直接用浏览器打开 `frontend/index.html`，或在 `frontend/` 目录起一个静态服务器：

```bash
cd frontend
python -m http.server 5500
```

然后访问 `http://127.0.0.1:5500`。

## 功能

- 拖拽 / 点击上传图片
- 4 种卡通风格可选：
  - **Classic Cartoon**（经典卡通）：双边滤波 + 自适应阈值边缘
  - **Pencil Sketch**（铅笔素描）
  - **Color Quantization**（色块化）：K-means 颜色聚类
  - **Stylization**（艺术化）：OpenCV stylization filter
- 强度参数可调
- 实时预览原图与结果对比
- 一键下载结果

## API

`POST /api/cartoonify`

- form-data: `file` (image/*), `style` (string), `strength` (int 1-10)
- 返回: `image/png`

`GET /api/styles` — 返回可用风格列表

`GET /health` — 健康检查
