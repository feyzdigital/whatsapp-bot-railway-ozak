const express = require("express");
const { create } = require("@open-wa/wa-automate");

const app = express();
const PORT = process.env.PORT || 3000;

// Son üretilen QR kodunu hafızada tutacağız
let latestQrBase64 = null;

// Health-check (Railway ve test için)
app.get("/", (req, res) => {
  res.send("WhatsApp bot is running on Railway 🚀");
});

// QR kodu gösteren endpoint
app.get("/qr", (req, res) => {
  if (!latestQrBase64) {
    return res.send(`
      <html>
        <body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#111;color:#eee;">
          <div>
            <h2>QR henüz hazır değil</h2>
            <p>Lütfen birkaç saniye sonra sayfayı yenile (F5).</p>
          </div>
        </body>
      </html>
    `);
  }

  res.send(`
    <html>
      <body style="display:flex;align-items:center;justify-content:center;height:100vh;background:#111;">
        <img src="data:image/png;base64,${latestQrBase64}"
             style="width:320px;height:320px;border:8px solid #fff;border-radius:16px;box-shadow:0 0 20px rgba(0,0,0,.7);" />
      </body>
    </html>
  `);
});

// WhatsApp botu oluştur
create({
  sessionId: "feyz-bot",
  multiDevice: true,
  headless: true,          // Railway'de her zaman true
  authTimeout: 0,
  restartOnCrash: true,
  cacheEnabled: false,

  // Puppeteer’ın kendi Chromium’unu kullanıyoruz
  useChrome: false,

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

  sessionDataPath: "./session",

  // QR AYARLARI
  qrLogSkip: true,   // terminale ascii QR basma
  qrRefreshS: 0,
  qrTimeout: 0,

  // QR üretildiğinde tetiklenen callback – base64'i hafızaya alıyoruz
  qrCallback: (qrBase64 /*, asciiQR, attempts, url */) => {
    try {
      // Bazı versiyonlarda "data:image/png;base64,..." prefix'i olabiliyor, güvenli tarafta kalalım
      const clean = qrBase64.replace(/^data:.*;base64,/, "");
      latestQrBase64 = clean;
      console.log("📸 Yeni QR kodu alındı ve /qr üzerinden gösteriliyor.");
    } catch (err) {
      console.error("QR callback sırasında hata:", err);
    }
  },
})
  .then((client) => {
    console.log("✅ WhatsApp bot başlatıldı, client hazırlanıyor...");
    startBot(client);
  })
  .catch((err) => {
    console.error("❌ Bot başlatılamadı:", err);
  });

// Mesajlara cevap veren basit bot
function startBot(client) {
  client.onMessage(async (message) => {
    // Kendi mesajımıza cevap vermeyelim
    if (message.fromMe) return;

    const text = (message.body || "").toLowerCase().trim();

    if (text === "merhaba") {
      return client.sendText(
        message.from,
        "Merhaba! 👋 Ben Railway üzerinde çalışan WhatsApp botuyum."
      );
    }

    return client.sendText(
      message.from,
      "Mesajını aldım 🙌\n\n(Not: Bu mesaj otomatik olarak gönderildi.)"
    );
  });

  console.log("🤖 Bot event dinleyicileri ayarlandı.");
}

// HTTP server (Railway için zorunlu)
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Server running on port ${PORT}`);
});
