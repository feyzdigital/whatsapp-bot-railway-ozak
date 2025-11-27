FROM node:18-slim

# Puppeteer için gerekli Linux bağımlılıkları
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    wget \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dosyaları kopyala
COPY package*.json ./

# NPM kurulumunda izin hatası almamak için root kullan
RUN npm install --omit=dev --no-package-lock

COPY . .

# Chromium path'i OpenWA için ENV olarak zorunlu
ENV CHROME_PATH=/usr/bin/chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

CMD ["node", "index.js"]
