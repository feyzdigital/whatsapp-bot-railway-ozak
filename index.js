// index.js
const { create } = require('@open-wa/wa-automate');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 8080;

// QR ve durum bilgileri hafızada tutulacak
let latestQrDataUrl = null;       // data:image/png;base64,...
let latestQrTimestamp = null;     // Date.now()
let isAuthenticated = false;      // true olduğunda QR'a gerek yok

// ---- OpenAI veya başka cevaplama mantığını buraya ekleyeceğiz ---- //
// Şimdilik sadece test amaçlı TR/DE karışık bir cevap dönüyor:
async function generateReply(message) {
  return `Merhaba! 👋

Mesajını aldım:
"${message}"

Bu mesaj şu an test ortamından geliyor.
Birazdan buraya OpenAI tabanlı TR/DE kurumsal tekstil asistanını bağlayacağız.`;
}

// ---- WhatsApp client'i başlatan fonksiyon ---- //
function start() {
  console.log('WA client başlatılıyor...');

  create(
    {
      sessionId: 'railway-bot',
      multiDevice: true,

      // QR ayarları
      qrTimeout: 0,           // QR süresiz beklesin, Railway kill etmesin
      authTimeout: 0,
      qrLogSkip: true,        // ASCII QR yazdırma (terminalde bozuk görünmesin)

      // Headless Chrome / Railway uyumu
      headless: true,
      useChrome: true,
      killProcessOnBrowserClose: true,
      cacheEnabled: false,
      restartOnCrash: start,  // Çökünce tekrar başlat

      chromiumArgs: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-features=site-per-process',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-dev-shm-usage'
      ],

      // İLERİ AŞAMADA kullanabileceğimiz ayarlar (şimdilik kapalı):
      // sessionData: process.env.WA_SESSION_DATA || undefined,
      // sessionDataPath: './session'
    },

    // QR CALLBACK → base64 PNG burada geliyor
    (base64Qr, asciiQR, attempt, urlCode) => {
      if (!base64Qr) {
        console.log('QR callback çağrıldı ama base64Qr boş geldi!');
        return;
      }

      latestQrDataUrl = base64Qr;         // data:image/png;base64,...
      latestQrTimestamp = Date.now();
      isAuthenticated = false;

      console.log('Yeni QR üretildi. Deneme:', attempt);
    }
  )
    .then(client => {
      console.log('WA client oluşturuldu ✅');

      // Bağlantı durumu
      client.onStateChanged(state => {
        console.log('WA state değişti →', state);

        if (state === 'CONNECTED' || state === 'OPENING' || state === 'NORMAL') {
          isAuthenticated = true;
          // Artık QR'a gerek yok, hafızadakini silebiliriz
          latestQrDataUrl = null;
          latestQrTimestamp = null;
        }

        if (state === 'UNPAIRED' || state === 'UNLAUNCHED') {
          isAuthenticated = false;
        }
      });

      // Mesaj yakalama
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

      // Logout durumunda QR tekrar alınabilsin
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

// ---- HTTP SERVER (Railway burayı görüyor) ---- //

// Sağlık kontrolü
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

// QR endpoint → PNG olarak döner
app.get('/qr.png', (req, res) => {
  // Zaten oturum açıksa QR göstermeyelim
  if (isAuthenticated) {
    return res.status(410).send('ALREADY_AUTHENTICATED');
  }

  if (!latestQrDataUrl || !latestQrTimestamp) {
    return res.status(503).send('QR_NOT_READY');
  }

  // 60 saniyeden eski QR'ları geçersiz say
  const maxAgeMs = 60 * 1000;
  const age = Date.now() - latestQrTimestamp;

  if (age > maxAgeMs) {
    console.log('QR süresi dolmuş, yenisi bekleniyor...');
    return res.status(410).send('QR_EXPIRED');
  }

  // data:image/png;base64,***** kısmından sadece base64 datasını al
  const base64Data = latestQrDataUrl.split(',')[1];
  const imgBuffer = Buffer.from(base64Data, 'base64');

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store');
  res.send(imgBuffer);
});

// HTTP server'ı başlat, sonra WA client'i ayağa kaldır
app.listen(PORT, () => {
  console.log(`HTTP server ${PORT} portunda çalışıyor ✅`);
  start(); // WA client'i başlat
});
