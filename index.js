const { create } = require('@open-wa/wa-automate');
const express = require('express');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 8080;

let latestQrDataUrl = null;
let latestQrTimestamp = null;
let isAuthenticated = false;

async function generateReply(message) {
  return `Mesajını aldım: "${message}"`;
}

function start() {
  console.log("WA başlatılıyor...");

  create(
    {
      sessionId: 'railway-bot',
      multiDevice: true,
      qrTimeout: 0,
      authTimeout: 0,
      headless: true,
      qrLogSkip: false,   // DEBUG İÇİN AÇIK
      useChrome: false,
      cacheEnabled: false,
      restartOnCrash: start
    }
  ).then(client => {

    // *** ASIL QR CALLBACK BURADA: ONQR ***
    client.onQR(async qr => {
      console.log("onQR tetiklendi!");

      try {
        const dataUrl = await QRCode.toDataURL(qr, {
          errorCorrectionLevel: 'M',
          margin: 2,
          scale: 8
        });

        latestQrDataUrl = dataUrl;
        latestQrTimestamp = Date.now();
        isAuthenticated = false;

        console.log("QR PNG hafızaya kaydedildi.");
      } catch (err) {
        console.error("QR PNG üretim hatası:", err);
      }
    });

    // Durumlar
    client.onStateChanged(state => {
      console.log("State:", state);

      if (state === "CONNECTED" || state === "OPENING" || state === "NORMAL") {
        isAuthenticated = true;
        latestQrDataUrl = null;
        latestQrTimestamp = null;
      }

      if (state === "UNPAIRED" || state === "UNLAUNCHED") {
        isAuthenticated = false;
      }
    });

    // Mesaj işleme
    client.onMessage(async msg => {
      const reply = await generateReply(msg.body || "");
      await client.sendText(msg.from, reply);
    });

  })
  .catch(err => {
    console.error("WA başlatılırken hata:", err);
  });
}

// HTTP ROUTES
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    isAuthenticated,
    qrReady: !!latestQrDataUrl,
    lastQrAgeSeconds: latestQrTimestamp
      ? Math.round((Date.now() - latestQrTimestamp) / 1000)
      : null
  });
});

app.get("/qr.png", (req, res) => {
  if (isAuthenticated) return res.send("ALREADY_AUTHENTICATED");

  if (!latestQrDataUrl) return res.status(503).send("QR_NOT_READY");

  const img = latestQrDataUrl.split(",")[1];
  const buffer = Buffer.from(img, "base64");

  res.setHeader("Content-Type", "image/png");
  res.send(buffer);
});

app.listen(PORT, () => {
  console.log("HTTP server çalışıyor:", PORT);
  start();
});
