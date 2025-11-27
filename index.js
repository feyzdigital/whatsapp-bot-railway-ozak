const { create } = require('@open-wa/wa-automate');
const express = require('express');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 8080;

let latestQrDataUrl = null;
let latestQrTimestamp = null;
let isAuthenticated = false;

// Basit test reply
async function generateReply(message) {
  return `Mesajını aldım: "${message}"`;
}

function start() {
  console.log('WA client başlatılıyor...');

  create({
    sessionId: 'railway-bot',
    multiDevice: true,

    // QR ayarları
    qrTimeout: 0,
    authTimeout: 0,
    qrLogSkip: false, // ASCII QR'ı logda da görelim

    headless: true,
    useChrome: false,
    cacheEnabled: false,
    restartOnCrash: start,

    // 🔥 ASIL ÖNEMLİ KISIM: qrCallback CONFIG İÇİNDE
    qrCallback: async (qrArg1, qrArg2, qrArg3, qrArg4) => {
      console.log('qrCallback tetiklendi!');
      console.log('qrCallback arg1 type/len:', typeof qrArg1, qrArg1 ? qrArg1.length : null);
      console.log('qrCallback arg2 type/len:', typeof qrArg2, qrArg2 ? qrArg2.length : null);
      console.log('qrCallback arg3 type/val:', typeof qrArg3, qrArg3);
      console.log('qrCallback arg4 type/len:', typeof qrArg4, qrArg4 ? qrArg4.length : null);

      try {
        let source = null;

        // Sırayla hangi argüman kullanılabilir bakıyoruz
        if (qrArg4 && typeof qrArg4 === 'string') {
          // Çoğu MD sürümünde urlCode burada geliyor
          console.log('qrCallback: urlCode (arg4) kullanılıyor.');
          source = qrArg4;
        } else if (qrArg1 && typeof qrArg1 === 'string') {
          console.log('qrCallback: arg1 kullanılıyor.');
          source = qrArg1;
        } else if (qrArg2 && typeof qrArg2 === 'string') {
          console.log('qrCallback: arg2 kullanılıyor.');
          source = qrArg2;
        }

        if (!source) {
          console.log('qrCallback: kullanılabilir QR kaynağı bulunamadı.');
          return;
        }

        // Eğer zaten data:image ile başlıyorsa direkt al
        if (source.startsWith('data:image')) {
          latestQrDataUrl = source;
          latestQrTimestamp = Date.now();
          isAuthenticated = false;
          console.log('qrCallback: dataURL direkt kaydedildi.');
          return;
        }

        // Değilse qrcode kütüphanesiyle PNG üret
        const dataUrl = await QRCode.toDataURL(source, {
          errorCorrectionLevel: 'M',
          margin: 2,
          scale: 8
        });

        latestQrDataUrl = dataUrl;
        latestQrTimestamp = Date.now();
        isAuthenticated = false;
        console.log('qrCallback: QR PNG üretildi ve hafızaya kaydedildi.');
      } catch (err) {
        console.error('qrCallback içinde hata:', err);
      }
    }
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
