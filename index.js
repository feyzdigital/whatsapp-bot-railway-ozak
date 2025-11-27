const { create } = require('@open-wa/wa-automate');
const express = require('express');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 8080;

let latestQrDataUrl = null;
let latestQrTimestamp = null;
let isAuthenticated = false;

async function generateReply(message) {
  return `Merhaba! 👋

Mesajını aldım:
"${message}"

Bu mesaj şu an test ortamından geliyor.
Birazdan buraya OpenAI tabanlı TR/DE kurumsal tekstil asistanını bağlayacağız.`;
}

function start() {
  console.log('WA client başlatılıyor...');

  create(
    {
      sessionId: 'railway-bot',
      multiDevice: true,

      qrTimeout: 0,
      authTimeout: 0,
      qrLogSkip: true,

      headless: true,
      useChrome: false,
      cacheEnabled: false,
      restartOnCrash: start
    },

    // QR CALLBACK
    async (base64Qr, asciiQR, attempt, urlCode) => {
      console.log('qrCallback tetiklendi. attempt:', attempt);

      try {
        if (base64Qr && typeof base64Qr === 'string' && base64Qr.startsWith('data:image')) {
          latestQrDataUrl = base64Qr;
          latestQrTimestamp = Date.now();
          isAuthenticated = false;
          console.log('base64Qr doğrudan kullanıldı.');
          return;
        }

        if (urlCode && typeof urlCode === 'string') {
          console.log('base64Qr yok, urlCode ile PNG üretiliyor...');
          const dataUrl = await QRCode.toDataURL(urlCode, {
            errorCorrectionLevel: 'M',
            margin: 2,
            scale: 8
          });

          latestQrDataUrl = dataUrl;
          latestQrTimestamp = Date.now();
          isAuthenticated = false;
          console.log('QR PNG, qrcode kütüphanesi ile üretildi.');
          return;
        }

        console.log(
          'Ne base64Qr ne urlCode geldi. asciiQR uzunluğu:',
          asciiQR ? asciiQR.length : null
        );
      } catch (err) {
        console.error('qrCallback içinde hata:', err);
      }
    }
  )
    .then(client => {
      console.log('WA client oluşturuldu ✅');

      client.onStateChanged(state => {
        console.log('WA state değişti →', state);

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
          const from = msg.from;
          const body = msg.body || '';

          console.log('Mesaj alındı →', from, body);

          const reply = await generateReply(body);
          await client.sendText(from, reply);
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

  const base64Data = latestQrDataUrl.split(',')[1];
  const imgBuffer = Buffer.from(base64Data, 'base64');

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store');
  res.send(imgBuffer);
});

app.listen(PORT, () => {
  console.log(`HTTP server ${PORT} portunda çalışıyor ✅`);
  start();
});
