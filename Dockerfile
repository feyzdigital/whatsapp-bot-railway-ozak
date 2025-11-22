FROM node:18-bullseye

# Chromium ve gerekli sistem kütüphaneleri
RUN apt-get update && apt-get install -y \
    chromium \
    libglib2.0-0 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libdrm2 \
    && rm -rf /var/lib/apt/lists/*

# Uygulama klasörü
WORKDIR /app

# Bağımlılıkların kurulması
COPY package*.json ./
RUN npm install

# Proje dosyalarını kopyala
COPY . .

# Chromium yolunu env değişkenine yaz
ENV CHROME_PATH=/usr/bin/chromium

# Uygulamayı başlat
CMD ["npm", "start"]
