const { create, ev } = require('@open-wa/wa-automate');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 8080;

// Runtime durum değişkenleri
let latestQrDataUrl = null;
let lastQrTime = 0;
let isAuthenticated = false;
let hostNumber = null;         // Bağlı hattın numarası
let clientReady = false;       // OpenWA tamamen hazır mı?

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
  clientReady = false;

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
    qrTimeout: 0,          // QR süresiz
    authTimeout: 0,        // Auth süresiz
    qrLogSkip: false,      // ASCII QR loglansın (yedek plan)
    headless: true,
    useChrome: false,
    cacheEnabled: false,
    restartOnCrash: start
  })
    .then(async (client) => {
      console.log('WA Client oluşturuldu 🚀');

      // Global referans (HTTP endpointlerden erişmek için)
      global.waClient = client;

      // 👉 Bağlı numarayı öğren
      try {
        hostNumber = await client.getHostNumber();
        console.log('📌 BAĞLANAN WHATSAPP NUMARASI:', hostNumber);
      } catch (err) {
        console.error('❌ Host numarası alınamadı:', err);
      }

      // İstemci tamamen hazır olduğunda (mesaj dinleme, vs.)
      client.onStateChanged((state) => {
        console.log('⚙️ State →', state);

        if (state === 'CONNECTED' || state === 'OPENING' || state === 'NORMAL') {
          isAuthenticated = true;
        } else {
          isAuthenticated = false;
        }
      });

      client.onLogout(() => {
        console.log('🚪 Çıkış yapıldı. QR yeniden beklenecek.');
        isAuthenticated = false;
        clientReady = false;
        latestQrDataUrl = null;
      });

      // Genel hazır olma eventi
      client.onAnyMessage((msg) => {
        if (!clientReady) {
          console.log('✅ İlk mesaj alındı, clientReady = true');
          clientReady = true;
        }

        console.log('📨 onAnyMessage tetiklendi:', {
          from: msg.from,
          isGroupMsg: msg.isGroupMsg,
          body: msg.body
        });
      });

      // -----------------------------
      //  GELEN MESAJLARA OTOMATİK CEVAP
      // -----------------------------
      client.onMessage(async (msg) => {
        try {
          console.log('📩 Yeni mesaj geldi (onMessage):', {
            from: msg.from,
            isGroupMsg: msg.isGroupMsg,
            body: msg.body
          });

          // Grup mesajlarını şimdilik pas geçelim
          if (msg.isGroupMsg) {
            console.log('➡️ Grup mesajı, cevaplanmayacak.');
            return;
          }

          const replyText = buildTestReply(msg.body);
          await client.sendText(msg.from, replyText);

          console.log('✅ Mesaja cevap gönderildi:', msg.from);
        } catch (err) {
          console.error('❌ Mesaj işlenirken hata:', err);
        }
      });
    })
    .catch((err) => {
      console.error('WA hata:', err);
    });
}

// -----------------------------
//  ROOT ENDPOINT
// -----------------------------
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    port: PORT.toString(),
    isAuthenticated,
    clientReady,
    hostNumber,
    qrReady: !!latestQrDataUrl,
    lastQrAgeSeconds: lastQrTime
      ? Math.round((Date.now() - lastQrTime) / 1000)
      : null
  });
});

// -----------------------------
//  BAĞLI NUMARAYI DIŞARIYA VEREN ENDPOINT
// -----------------------------
app.get('/me', async (req, res) => {
  try {
    if (!global.waClient) {
      return res.status(503).json({ error: 'CLIENT_NOT_READY' });
    }

    const num = await global.waClient.getHostNumber();
    return res.json({
      number: num,
      isAuthenticated,
      clientReady
    });
  } catch (err) {
    console.error('❌ /me endpoint hatası:', err);
    return res.status(500).json({ error: err.toString() });
  }
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
