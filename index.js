const { create, ev } = require('@open-wa/wa-automate');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 8080;

let latestQrDataUrl = null;
let latestQrTimestamp = null;
let isAuthenticated = false;

// Basit test reply
async function generateReply(message) {
  return `Mesajını aldım: "${message}"`;
}

// 🔥 GLOBAL QR EVENT LISTENER (create'den bağımsız, tek sefer)
ev.on('qr.**', async (qrcode, sessionId) => {
  try {
    console.log('ev qr.** event tetiklendi! sessionId:', sessionId);
    console.log('qrcode type/len:', typeof qrcode, qrcode ? qrcode.length : null);

    if (!qrcode || typeof qrcode !== 'string') {
      console.log('ev qr.**: qrcode string değil, işlem yapılmadı.');
      return;
    }

    // qrcode zaten "data:image/png;base64,..." formatında geliyor
    if (qrcode.startsWith('data:image')) {
      latestQrDataUrl = qrcode;
      latestQrTimestamp = Date.now();
      isAuthenticated = false;
      console.log('ev qr.**: dataURL hafızaya kaydedildi.');
    } else {
      console.log('ev qr.**: Beklenen dataURL formatı değil, yine de saklanıyor.');
      latestQrDataUrl = qrcode;
      latestQrTimestamp = Date.now();
      isAuthenticated = false;
    }
  } catch (err) {
    console.error('ev qr.** içinde hata:', err);
  }
});

function start() {
  console.log('WA client başlatılıyor...');

  create({
    sessionId: 'railway-bot',
    multiDevice: true,

    qrTimeout: 0,
    authTimeout: 0,
    qrLogSkip: false, // ASCII QR logda görünsün

    headless: true,
    useChrome: false,
    cacheEnabled: false,
    restartOnCrash: start
  })
    .then(client => {
      console.log('WA client oluşturuldu ✅');

      client.onStateChanged(state => {
        console.log('State değişti:', state);

        if (state === 'CONNECTED' || state === 'OPENING' || state === 'NORMAL') {
          isAuthenticated = true;
          latestQrDataUrl = null;
          latestQrTimestamp = null;
        }

        if (state === 'UNPAIRED' || state === 'UNLAUNCHED') {
          isAuthenticated = false;
        }
      });

      client.onMessage(async msg => {
        try {
          const reply = await generateReply(msg.body || '');
          await client.sendText(msg.from, reply);
        } catch (err) {
          console.error('Mesaj işlenirken hata:', err);
        }
      });

      client.onLogout(() => {
        console.log('Kullanıcı logout oldu, yeniden QR beklenecek.');
        isAuthenticated = false;
        latestQrDataUrl = null;
        latestQrTimestamp = null;
      });
    })
    .catch(err => {
      console.error('WA client oluşturulurken hata:', err);
    });
}

// HTTP ROUTES
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    port: String(PORT),
    isAuthenticated,
    qrReady: !!latestQrDataUrl,
    lastQrAgeSeconds: latestQrTimestamp
      ? Math.round((Date.now() - latestQrTimestamp) / 1000)
      : null
  });
});

app.get('/qr.png', (req, res) => {
  if (isAuthenticated) {
    return res.status(410).send('ALREADY_AUTHENTICATED');
  }

  if (!latestQrDataUrl || !latestQrTimestamp) {
    return res.status(503).send('QR_NOT_READY');
  }

  const maxAgeMs = 60 * 1000;
  const age = Date.now() - latestQrTimestamp;

  if (age > maxAgeMs) {
    console.log('QR süresi dolmuş, yenisi bekleniyor...');
    return res.status(410).send('QR_EXPIRED');
  }

  let base64Data;

  if (latestQrDataUrl.startsWith('data:image')) {
    base64Data = latestQrDataUrl.split(',')[1];
  } else {
    // Her ihtimale karşı: saf base64 ise
    base64Data = latestQrDataUrl;
  }

  const imgBuffer = Buffer.from(base64Data, 'base64');

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store');
  res.send(imgBuffer);
});

app.listen(PORT, () => {
  console.log(`HTTP server ${PORT} portunda çalışıyor ✅`);
  start();
});
