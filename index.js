const express = require("express");
const { create } = require("@open-wa/wa-automate");

const app = express();
const PORT = process.env.PORT || 3000;

// 1) Railway ve lokal için health-check endpoint
app.get("/", (req, res) => {
  res.send("WhatsApp bot is running ✅");
});

// 2) WhatsApp botu başlat
create({
  sessionId: "feyz-bot",
  multiDevice: true,

  // Şu an QR'ı görebilmek için headless: false
  // Railway'e geçtiğimizde bunu true yapabiliriz.
  headless: false,

  authTimeout: 0,
  restartOnCrash: true,
  cacheEnabled: false,
  useChrome: true,
  killProcessOnBrowserClose: false,

  // Oturum dosyaları
  sessionDataPath: "./session",

  // QR AYARLARI
  qrLogSkip: true,      // ASCII QR'ı terminale basma
  qrRefreshS: 0,        // Otomatik yenileme yok (tek QR yeterli)
  qrTimeout: 0,         // Süre kısıtlaması olmasın
  qrOutput: "png",      // PNG formatında üret
  qrScreenshot: true,   // PNG'yi otomatik dosyaya kaydet

  // Tarayıcı penceresini düzgün açmak için
  chromiumArgs: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--start-maximized",
    "--window-size=1920,1080",
  ],
})
  .then((client) => {
    console.log("✅ WhatsApp bot başlatıldı, client hazır.");
    startBot(client);
  })
  .catch((err) => {
    console.error("❌ Bot başlatılırken hata:", err);
  });

// 3) Mesajlara cevap veren basit fonksiyon
function startBot(client) {
  client.onMessage(async (message) => {
    // Kendi gönderdiğin mesajlara cevap verme
    if (message.fromMe) return;

    const text = (message.body || "").toLowerCase().trim();

    if (text === "merhaba") {
      await client.sendText(
        message.from,
        "Merhaba! 👋 Ben otomatik WhatsApp botuyum."
      );
    } else {
      await client.sendText(
        message.from,
        "Mesajını aldım, teşekkürler 🙌\n\n(Not: Bu mesaj otomatik gönderildi.)"
      );
    }
  });
}

// 4) HTTP server (Railway için şart)
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 HTTP server çalışıyor: http://localhost:${PORT}`);
});
