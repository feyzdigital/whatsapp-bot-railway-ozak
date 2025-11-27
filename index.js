const { create, ev } = require('@open-wa/wa-automate');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 8080;

let latestQrDataUrl = null;
let lastQrTime = 0;
let isAuthenticated = false;

// -----------------------------
//  GLOBAL QR EVENT LISTENER
// -----------------------------
ev.on("qr.**", (qr, sessionId) => {
  console.log("🔥 Yeni QR event geldi! Session:", sessionId);

  if (!qr || typeof qr !== "string") {
    console.log("QR geçersiz.");
    return;
  }

  // Base64 PNG formatında geliyor → direkt sakla
  latestQrDataUrl = qr;
  lastQrTime = Date.now();
  isAuthenticated = false;

  console.log("QR güncellendi. Uzunluk:", qr.length);
});

// -----------------------------
//  WA CLIENT BAŞLATMA
// -----------------------------
function start() {
  console.log("WA başlatılıyor...");

  create({
    sessionId: "railway-bot",
    multiDevice: true,
    qrTimeout: 0,
    authTimeout: 0,
    qrLogSkip: false,
    headless: true,
    useChrome: false,
    cacheEnabled: false,
    restartOnCrash: start,
  })
    .then((client) => {
      console.log("WA Client oluşturuldu 🚀");

      client.onStateChanged((state) => {
        console.log("State →", state);

        if (state === "CONNECTED" || state === "OPENING" || state === "NORMAL") {
          isAuthenticated = true;
          latestQrDataUrl = null;
        } else {
          isAuthenticated = false;
        }
      });

      client.onLogout(() => {
        console.log("Çıkış yapıldı. QR yeniden beklenecek.");
        isAuthenticated = false;
        latestQrDataUrl = null;
      });
    })
    .catch((err) => console.error("WA hata:", err));
}

// -----------------------------
//  ROOT ENDPOINT
// -----------------------------
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    streamMode: true,
    isAuthenticated,
    qrTimestamp: lastQrTime,
    qrAgeSeconds: lastQrTime ? Math.round((Date.now() - lastQrTime) / 1000) : null
  });
});

// -----------------------------
//  QR STREAM ENDPOINT (HER ZAMAN GÜNCEL QR)
// -----------------------------
app.get("/qr.png", (req, res) => {
  res.setHeader("Cache-Control", "no-store, must-revalidate");

  // Zaten giriş yapıldıysa QR gerekmez
  if (isAuthenticated) {
    return res.status(200).send("ALREADY_AUTHENTICATED");
  }

  // QR henüz yok → 1 saniye sonra yenile
  if (!latestQrDataUrl) {
    return res.status(503).send("QR_NOT_READY");
  }

  // PNG base64 formatından ayıkla → gönder
  const base64 = latestQrDataUrl.replace(/^data:image\/png;base64,/, "");
  const buffer = Buffer.from(base64, "base64");

  res.setHeader("Content-Type", "image/png");
  res.send(buffer);
});

// -----------------------------
//  SERVER + WA CLIENT BAŞLAT
// -----------------------------
app.listen(PORT, () => {
  console.log("HTTP server çalışıyor:", PORT);
  start();
});
