const express = require("express");
const { create } = require("@open-wa/wa-automate");

const app = express();
const PORT = process.env.PORT || 3000;

// Health-check (Railway ve test için)
app.get("/", (req, res) => {
  res.send("WhatsApp bot is running on Railway 🚀");
});

// WhatsApp botu başlat
create({
  sessionId: "feyz-bot",

  // Çoklu cihaz
  multiDevice: true,

  // Sunucuda her zaman headless
  headless: true,

  // Harici Chrome/Chromium kullan
  useChrome: true,

  // Docker'daki Chromium yolu
  executablePath: process.env.CHROME_PATH || "/usr/bin/chromium",

  // Daha stabil çalışma için minimum argüman
  chromiumArgs: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
  ],

  // Ek bazı ayarlar
  authTimeout: 0,
  restartOnCrash: true,
  cacheEnabled: false,
  killProcessOnBrowserClose: false,

  // Oturum dosyaları (kalıcı olması için)
  sessionDataPath: "./session",

  // QR ayarları (ASCII spam olmasın)
  qrLogSkip: true,
  qrRefreshS: 0,
  qrTimeout: 0,
  qrOutput: "png",
  qrScreenshot: true,
})
  .then((client) => {
    console.log("✅ WhatsApp bot başlatıldı, client hazır!");
    startBot(client);
  })
  .catch((err) => {
    console.error("❌ Bot başlatılamadı:", err);
  });

// Mesajlara cevap veren basit bot
function startBot(client) {
  client.onMessage(async (message) => {
    // Kendi mesajlarına cevap verme
    if (message.fromMe) return;

    const text = (message.body || "").toLowerCase().trim();

    if (text === "merhaba") {
      return client.sendText(
        message.from,
        "Merhaba! 👋 Nasıl yardımcı olabilirim?"
      );
    }

    return client.sendText(
      message.from,
      "Mesajını aldım 🙌\nBu bir otomatik yanıttır."
    );
  });
}

// HTTP server (Railway için şart)
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Server running on port ${PORT}`);
});

