const express = require("express");
const { create } = require("@open-wa/wa-automate");

const app = express();
const PORT = process.env.PORT || 3000;

// 1) Railway Health Check
app.get("/", (req, res) => {
  res.send("WhatsApp bot is running on Railway 🚀");
});

// 2) WhatsApp Bot Ayarları
create({
  sessionId: "feyz-bot",

  multiDevice: true,
  headless: true, // Railway’de her zaman TRUE olacak

  authTimeout: 0,
  restartOnCrash: true,
  cacheEnabled: false,

  // 🚨 Railway'de sistem Chrome yok → paket içindeki Chromium kullanılmalı
  useChrome: false,

  chromiumArgs: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-software-rasterizer",
    "--disable-features=VizDisplayCompositor",
    "--window-size=1920,1080"
  ],

  killProcessOnBrowserClose: false,

  sessionDataPath: "./session",

  // QR Ayarları
  qrLogSkip: true,
  qrRefreshS: 0,
  qrTimeout: 0,
  qrOutput: "png",
  qrScreenshot: true
})

  .then((client) => {
    console.log("✅ WhatsApp bot başlatıldı, client hazır!");
    startBot(client);
  })

  .catch((err) => {
    console.error("❌ Bot başlatılamadı:", err);
  });

// 3) Mesajlara Cevap Veren Bot Fonksiyonu
function startBot(client) {
  client.onMessage(async (message) => {
    if (message.fromMe) return;

    const text = (message.body || "").toLowerCase().trim();

    if (text === "merhaba") {
      return client.sendText(
        message.from,
        "Merhaba! 👋 Nasıl yardımcı olabilirim?"
      );
    }

    client.sendText(
      message.from,
      "Mesajını aldım 🙌\nBu bir otomatik yanıttır."
    );
  });
}

// 4) HTTP Server – Railway için zorunlu
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Server running on port ${PORT}`);
});
