const express = require("express");
const { create } = require("@open-wa/wa-automate");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// QR dosyasını sabit bir path'te tutacağız
const QR_PATH = path.join(__dirname, "session", "last.qr.png");

// 1) Health-check
app.get("/", (req, res) => {
  res.send("WhatsApp bot is running on Railway 🚀");
});

// 2) QR görüntüsü için endpoint
app.get("/qr", (req, res) => {
  fs.access(QR_PATH, fs.constants.F_OK, (err) => {
    if (err) {
      return res
        .status(404)
        .send("QR henüz hazır değil, birkaç saniye sonra yenileyin. 🔄");
    }
    res.sendFile(QR_PATH);
  });
});

// 3) WhatsApp Bot Ayarları
create({
  sessionId: "feyz-bot",

  multiDevice: true,
  headless: true,          // Railway'de her zaman headless
  authTimeout: 0,
  restartOnCrash: true,
  cacheEnabled: false,

  // Railway içinde kendi Chromium'unu kullansın
  useChrome: false,

  // Chromium argümanları (Docker için önemli)
  chromiumArgs: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-software-rasterizer",
    "--disable-features=VizDisplayCompositor",
    "--window-size=1920,1080",
  ],

  killProcessOnBrowserClose: false,

  // Oturum dosyaları
  sessionDataPath: "./session",

  // QR ayarları
  qrLogSkip: true,     // Konsola ASCII QR basma
  qrRefreshS: 0,
  qrTimeout: 0,
  qrOutput: "png",
  qrScreenshot: true,

  // 🔥 QR kodunu base64 olarak yakalayıp PNG'ye çeviriyoruz
  qrCallback: async (qrData /* base64 PNG */, asciiQR, attempts, url) => {
    try {
      if (!qrData) return;

      const base64 = qrData.replace(/^data:image\/png;base64,/, "");
      await fs.promises.mkdir(path.dirname(QR_PATH), { recursive: true });
      await fs.promises.writeFile(QR_PATH, Buffer.from(base64, "base64"));

      console.log("📷 Yeni QR kaydedildi:", QR_PATH);
    } catch (err) {
      console.error("QR kaydedilirken hata:", err);
    }
  },
})
  .then((client) => {
    console.log("✅ WhatsApp bot başlatıldı, client hazır!");
    startBot(client);
  })
  .catch((err) => {
    console.error("❌ Bot başlatılamadı:", err);
  });

// 4) Mesajlara Cevap Veren Bot Fonksiyonu
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

// 5) HTTP Server – Railway için zorunlu
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Server running on port ${PORT}`);
});
