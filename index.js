// index.js
// WhatsApp Bot + OpenAI TR/DE Kurumsal Tekstil Asistanı
// + HTTP üzerinden okunabilir QR kod gösterimi

require("dotenv").config();
const express = require("express");
const { create } = require("@open-wa/wa-automate");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

// --- OpenAI client ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Bellekte son üretilen QR'ı tutacağız (base64 PNG)
let latestQrBase64 = null;

// --- Health-check (Railway) ---
app.get("/", (req, res) => {
  res.send("WhatsApp Textile Assistant bot is running 🚀");
});

// QR'ı görüntülemek için basit bir HTML sayfası
app.get("/qr", (req, res) => {
  if (!latestQrBase64) {
    return res
      .status(503)
      .send(
        "QR henüz hazır değil. Lütfen birkaç saniye sonra sayfayı yenileyin."
      );
  }

  const html = `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <title>WhatsApp Bot QR</title>
    </head>
    <body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;height:100vh;">
      <div style="text-align:center;color:#fff;font-family:sans-serif">
        <h2>WhatsApp Bot QR Kodu</h2>
        <img src="${latestQrBase64}" alt="WhatsApp QR" style="width:320px;height:320px;border:8px solid #fff;border-radius:12px;background:#fff;" />
        <p style="margin-top:16px;">
          WhatsApp &gt; Bağlı Cihazlar &gt; <b>Cihaz Bağla</b> deyip bu kodu okutun.
        </p>
      </div>
    </body>
  </html>
  `;
  res.send(html);
});

// Sadece PNG isteyenler için direkt resim endpoint’i
app.get("/qr.png", (req, res) => {
  if (!latestQrBase64) {
    return res
      .status(503)
      .send("QR henüz hazır değil. Birkaç saniye sonra tekrar deneyin.");
  }

  const base64Data = latestQrBase64.split(",")[1];
  const imgBuffer = Buffer.from(base64Data, "base64");
  res.setHeader("Content-Type", "image/png");
  res.send(imgBuffer);
});

// --- OpenAI'den cevap üret – TR/DE kurumsal + samimi tekstil temsilcisi ---
function detectLanguage(text) {
  const trChars = /[çğıöşüÇĞİÖŞÜ]/;
  if (trChars.test(text)) return "tr";
  return "de";
}

async function generateAiReply(userText, lang) {
  const baseSystemPrompt = `
Sen, Avrupa'nın her yerine premium 1. sınıf tekstil ürünleri tedarik eden
kurumsal bir firmanın uluslararası müşteri temsilcisisin. Tonun:
- Profesyonel,
- Samimi,
- Çözüm odaklı,
- WhatsApp sohbetine uygun, kısa paragraflı.

Müşterinin ihtiyacını netleştir:
- Hangi ürün(ler)le ilgilendiğini sor (otel tekstili, masa örtüsü, havlu, nevresim, vb.),
- Metraj / adet, hedef fiyat aralığı, teslim süresi gibi kritik bilgileri nazikçe iste,
- Teknik detayları (gramaj, kumaş türü, renk, ölçü vb.) sorarken müşteriyi boğma.

Fiyat VERME, sadece:
- "Teklif için ölçü, adet ve teslim adresi bilgilerinizi paylaşabilir misiniz?" gibi cümlelerle bilgi topla,
- Sonunda her zaman "İsterseniz numune / fotoğraf da paylaşabiliriz." tarzı bir cümle ekle.

Mesajların her zaman WhatsApp için hazır, tek blok metin olsun (gerekirse madde madde).
`;

  const systemPromptTr = `
${baseSystemPrompt}

Cevap dili: TÜRKÇE.
Samimi ama saygılı hitap kullan ("siz" formu).
Müşteriyle ilk defa yazışıyorsan kendini kısaca tanıt:
"Ben uluslararası satış ekibindenim, 1. sınıf tekstil ürünlerinde size yardımcı olabilirim."
`;

  const systemPromptDe = `
${baseSystemPrompt}

Antwortsprache: DEUTSCH.
Höflich, professionell, aber locker und natürlich.
Stell kurze, gezielte Fragen, um Bedarf, Menge und Lieferadresse zu klären.
`;

  const systemPrompt = lang === "tr" ? systemPromptTr : systemPromptDe;

  const input = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userText },
  ];

  const response = await openai.responses.create({
    model: "gpt-5.1-mini",
    input,
  });

  const content = response.output[0]?.content?.[0]?.text || "";
  return content.trim();
}

// --- WhatsApp Bot Başlatma ---
create({
  sessionId: "feyz-bot",
  multiDevice: true,
  headless: true, // Railway'de her zaman true
  useChrome: false,
  authTimeout: 0,
  restartOnCrash: true,
  cacheEnabled: false,
  killProcessOnBrowserClose: false,
  sessionDataPath: "./session",

  // QR'ı log'da ASCII olarak göstermeyi kapatıyoruz
  qrLogSkip: true,
  qrTimeout: 0,
  qrRefreshS: 40,

  // QR geldiğinde base64 PNG verisini yakalayalım
  qrCallback: (qrBase64, asciiQR, attempts, urlCode) => {
    latestQrBase64 = qrBase64;
    console.log(
      "✅ Yeni QR üretildi. Tarayıcıdan /qr adresini açıp bu kodu okutabilirsiniz. Deneme sayısı:",
      attempts
    );
  },

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
})
  .then((client) => {
    console.log("✅ WhatsApp bot başlatıldı, client hazır!");
    startBot(client);
  })
  .catch((err) => {
    console.error("❌ Bot başlatılamadı:", err);
  });

// --- Mesajlara cevap veren fonksiyon ---
function startBot(client) {
  console.log("🤖 startBot fonksiyonu çalıştı, mesajlar dinleniyor...");

  client.onMessage(async (message) => {
    if (message.fromMe) return;

    const text = (message.body || "").trim();
    if (!text) return;

    console.log("📩 Yeni mesaj:", {
      from: message.from,
      chatName: message.sender?.pushname,
      text,
    });

    if (message.isGroupMsg) {
      console.log("↩️ Grup mesajı, cevaplanmıyor.");
      return;
    }

    const lang = detectLanguage(text);

    try {
      const reply = await generateAiReply(text, lang);

      if (!reply) {
        throw new Error("Boş AI cevabı döndü.");
      }

      await client.sendText(message.from, reply);
      console.log("✅ Yanıt gönderildi.");
    } catch (err) {
      console.error("❌ Mesaj yanıtlarken hata:", err);

      const fallback =
        lang === "tr"
          ? "Şu an teknik bir sorun yaşıyoruz, mesajınızı aldım ve ekibimize ilettim. En kısa sürede size dönüş yapacağız. 🙏"
          : "Im Moment gibt es ein technisches Problem. Ich habe Ihre Nachricht erhalten und an unser Team weitergeleitet. Wir melden uns so schnell wie möglich. 🙏";

      try {
        await client.sendText(message.from, fallback);
      } catch (e2) {
        console.error("❌ Fallback mesaj da gönderilemedi:", e2);
      }
    }
  });
}

// --- HTTP server (Railway için zorunlu) ---
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 HTTP server çalışıyor: http://localhost:${PORT}`);
});
