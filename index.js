const { create, ev } = require('@open-wa/wa-automate');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 8080;

let latestQrDataUrl = null;
let lastQrTime = 0;
let isAuthenticated = false;

// -----------------------------
//  BASİT TEST CEVAP FONKSİYONU
// -----------------------------
function buildTestReply(messageBody) {
  const text = (messageBody || '').trim();

  return (
    '🧪 *Test Bot Aktif!*\n\n' +
    (text
      ? `Gelen mesajın:\n"${text}"\n\n`
      : 'Bir mesaj gönderdin ama içeriği boş gibi görünüyor.\n\n') +
    'Bu şu an sadece test yanıtı.\n' +
    'Kısa süre içinde burayı TR/DE kurumsal tekstil asistanına dönüştüreceğiz. 🤝'
  );
}

// -----------------------------
//  GLOBAL QR EVENT LISTENER
// -----------------------------
ev.on('qr.**', (qr, sessionId) => {
  console.log('🔥 Yeni QR event geldi! Session:', sessionId);

  if (!qr || typeof qr !== 'string') {
    console.log('QR geçersiz.');
    return;
  }

  // Genelde "data:image/png;base64,..." formatında geliyor
  latestQrDataUrl = qr;
  lastQrTime = Date.now();
  isAuthenticated = false;

  console.log('QR güncellendi. Uzunluk:', qr.length);
});

// -----------------------------
//  WA CLIENT BAŞLATMA
// -----------------------------
function start() {
  console.log('WA başlatılıyor...');

  create({
    sessionId: 'railway-bot',
    multiDevice: true,
    qrTimeout: 0,
    authTimeout: 0,
    qrLogSkip: false,
    headless: true,
    useChrome: false,
    cacheEnabled: false,
    restartOnCrash: start
  })
    .then(client => {
      console.log('WA Client oluşturuldu 🚀');

      // Bağlantı durumu
      client.onStateChanged(state => {
        console.log('State →', state);

        if (state === 'CONNECTED' || state === 'OPENING' || state === 'NORMAL') {
          isAuthenticated = true;
          latestQrDataUrl = null;
        } else {
          isAuthenticated = false;
        }
      });

      // Çıkış durumunda
      client.onLogout(() => {
        console.log('Çıkış yapıldı. QR yeniden beklenecek.');
        isAuthenticated = false;
        latestQrDataUrl = null;
      });

      // -----------------------------
      //  GELEN MESAJLARA OTOMATİK CEVAP
      // -----------------------------
      client.onMessage(async msg => {
        try {
          console.log('📩 Yeni mesaj geldi:', {
            from: msg.from,
            isGroupMsg: msg.isGroupMsg,
            body: msg.body
          });

          // İstersen grup mesajlarını şimdilik es geçelim
          if (msg.isGroupMsg) {
            console.log('Grup mesajı, cevaplanmayacak.');
            return;
          }

          const replyText = buildTestReply(msg.body);

          await client.sendText(msg.from, replyText);

          console.log('✅ Mesaja cevap gönderildi:', msg.from);
        } catch (err) {
          console.error('Mesaj işlenirken hata:', err);
        }
      });
    })
    .catch(err => {
      console.error('WA hata:', err);
    });
}

// -----------------------------
//  ROOT ENDPOINT
// -----------------------------
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    streamMode: true,
    isAuthenticated,
    qrTimestamp: lastQrTime,
    qrAgeSeconds: lastQrTime
      ? Math.round((Date.now() - lastQrTime) / 1000)
      : null
  });
});

// -----------------------------
//  QR STREAM ENDPOINT (HER ZAMAN GÜNCEL QR)
// -----------------------------
app.get('/qr.png', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, must-revalidate');

  if (isAuthenticated) {
    return res.status(200).send('ALREADY_AUTHENTICATED');
  }

  if (!latestQrDataUrl) {
    return res.status(503).send('QR_NOT_READY');
  }

  const base64 = latestQrDataUrl.replace(/^data:image\/png;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');

  res.setHeader('Content-Type', 'image/png');
  res.send(buffer);
});

// -----------------------------
//  SERVER + WA CLIENT BAŞLAT
// -----------------------------
app.listen(PORT, () => {
  console.log('HTTP server çalışıyor:', PORT);
  start();
});
