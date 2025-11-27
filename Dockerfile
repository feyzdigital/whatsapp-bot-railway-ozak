FROM ghcr.io/puppeteer/puppeteer:22.6.1

# Çalışma dizini
WORKDIR /app

# Önce package.json ve package-lock.json'u kopyala
COPY package*.json ./

# İzin problemini çözmek için root olarak npm install çalıştır
USER root

# package-lock üzerinde yazmaya çalıştığı için EACCES alıyorduk.
# root olarak çalıştırıp, package-lock'ı ellememesi için --no-package-lock ekledik.
RUN npm install --omit=dev --no-package-lock

# Şimdi geriye kalan tüm dosyaları kopyala
COPY . .

# /app dizinini tekrar pptruser'a devret
RUN chown -R pptruser:pptruser /app

# Uygulama pptruser ile çalışsın (puppeteer imajının default user'ı)
USER pptruser

# Uygulamayı başlat
CMD ["node", "index.js"]
