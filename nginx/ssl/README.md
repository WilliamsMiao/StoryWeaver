# SSL 证书目录

请将 SSL 证书文件放置在此目录：

- `fullchain.pem` - 完整证书链
- `privkey.pem` - 私钥文件

## 获取免费 SSL 证书

推荐使用 Let's Encrypt 获取免费证书：

```bash
# 使用 certbot
sudo apt install certbot
sudo certbot certonly --standalone -d your-domain.com

# 证书位置
# /etc/letsencrypt/live/your-domain.com/fullchain.pem
# /etc/letsencrypt/live/your-domain.com/privkey.pem
```

## 复制证书到此目录

```bash
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ./nginx/ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ./nginx/ssl/
```

## 启用 HTTPS

编辑 `nginx/conf.d/storyweaver.conf`，取消 HTTPS server 块的注释。
