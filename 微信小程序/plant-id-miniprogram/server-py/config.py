# 百度智能云「植物识别」密钥
# 获取步骤：
#   1. 打开 https://ai.baidu.com ，注册/登录
#   2. 控制台 → 产品服务 → 图像识别 → 创建应用（勾选「植物识别」）
#   3. 在应用详情里复制 API Key 和 Secret Key，分别设置到环境变量 BAIDU_API_KEY 和 BAIDU_SECRET_KEY
#   4. 免费额度足够开发联调（注意调用频率限制）
import os

BAIDU_API_KEY = os.environ.get("BAIDU_API_KEY", "")
BAIDU_SECRET_KEY = os.environ.get("BAIDU_SECRET_KEY", "")
