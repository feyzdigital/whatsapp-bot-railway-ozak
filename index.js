// index.js
// WhatsApp Bot + OpenAI TR/DE Kurumsal Tekstil Asistanı
// QR kodu Railway'de dosya yerine RAM'de (base64) tutar ve /qr.png üzerinden gösterir.

require("dotenv").config();
const express = require("express");
const { create } = require("@open-wa/wa-automate");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 8080;

// QR'ı RAM'de tutacağımız değişken
let latestQrDataUrl = null;

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 1) Health-check (Railway)
app.get("/", (req, res) => {
  res.send("WhatsApp Textile Assistant bot is running 🚀");
});

// 2) QR'ı PNG olarak dönen endpoint
app.get("/qr.png", (req, res) => {
  try {
    if (!latestQrDataUrl) {
      return res.send("QR henüz hazır değil. Lütfen birkaç saniye sonra sayfayı yenileyin.");
    }

    // latestQrDataUrl formatı: "data:image/png;base64,AAAA...."
    const base64Data = latestQrDataUrl.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    res.writeHead(200, {
      "Content-Type": "image/png",
      "Content-Length": buffer.length,
    });

    return res.end(buffer);
  } catch (err) {
    console.error("❌ /qr.png endpoint'inde hata:", err);
    return res.status(500).send("QR görüntülenirken bir hata oluştu.");
  }
});

/**
 * Dil tespiti – çok kaba ama iş görür:
 * Türkçe karakter içeriyorsa TR ağırlıklı, yoksa DE ağırlıklı.
 */
function detectLanguage(text) {
  const trChars = /[çğıöşüÇĞİÖŞÜ]/;
  if (trChars.test(text)) return "tr";
  return "de";
}

/**
 * OpenAI'den cevap üret – kurumsal + samimi tekstil temsilcisi
 */
async function generateAiReply(userText, lang) {
  const baseSystemPrompt = `
Sen, Avrupa'nın her yerine premium tekstil ürünleri tedarik eden kurumsal bir firmanın 
uluslararası müşteri temsilcisisin. Tonun:
- Profesyonel,
- Samimi,
- Çözüm odaklı,
- WhatsApp sohbetine uygun kısa paragraflar halinde.

Müşterinin ihtiyacını netleştir:
- Hangi ürün(ler)le ilgilendiğini sor (otel tekstili, masa örtüsü, havlu, nevresim, vb.),
- Metraj / adet, hedef fiyat aralığı, teslim süresi gibi kritik bilgileri nazikçe iste,
- Teknik detayları (gramaj, kumaş türü, renk, ölçü vb.) sorarken müşteriyi boğma.

Sadece 1. sınıf tekstil ürünleri üretiyoruz, buna göre cevap ver.

Fiyat VERME, sadece:
- “Teklif için ölçü, adet ve teslim adresi bilgilerinizi paylaşabilir misiniz?” gibi cümlelerle bilgi topla,
- Sonunda her zaman “İsterseniz numune / fotoğraf da paylaşabiliriz.” tarzı bir cümle ekle.

Mesajların her zaman WhatsApp için hazır, tek blok metin olsun (madde madde kullanabilirsin).
`;

  const systemPromptTr = `
${baseSystemPrompt}

Cevap dili: TÜRKÇE.
Samimi ama saygılı hitap kullan ("siz" formu).
Müşteriyle ilk defa yazışıyorsan kendini kısaca tanıt:
"Ben Firma uluslararası satış ekibindenim."
`;

  const systemPromptDe = `
${baseSystemPrompt}

Antwortsprache: DEUTSCH.
Höflich, professionell, aber locker und natürlich.
Stell kurze, gezielte Fragen, um Bedarf, Menge und Lieferadresse zu klären.
`;

  const systemPrompt = lang === "tr" ? systemPromptTr : systemPromptDe;

  const input = [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: userText,
    },
  ];

  const response = await openai.responses.create({
    model: "gpt-5.1-mini",
    input,
  });

  const content = response.output[0]?.content?.[0]?.text || "";
  return content.trim();
}

// 3) Mesajlara cevap veren fonksiyon
function startBot(client) {
  console.log("🤖 startBot fonksiyonu çalıştı, mesajlar dinleniyor...");

  client.onMessage(async (message) => {
    // Kendi gönderdiğimiz mesajlara cevap verme
    if (message.fromMe) return;

    const text = (message.body || "").trim();
    if (!text) return;

    console.log("📩 Yeni mesaj:", {
      from: message.from,
      chatName: message.sender?.pushname,
      text,
    });

    // Grup mesajlarını şimdilik pas geç
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

// 4) WhatsApp Bot Başlatma
create({
  sessionId: "feyz-bot",
  multiDevice: true,
  headless: true,       // Railway'de her zaman true
  useChrome: false,     // Railway container içi Chromium
  authTimeout: 0,
  restartOnCrash: true,
  cacheEnabled: false,
  killProcessOnBrowserClose: false,
  qrLogSkip: true,      // Konsola QR ascii basma
  qrTimeout: 0,
  qrRefreshS: 45,       // 45 sn'de bir yeni QR üret
  qrCallback: (qrData, asciiQR, attempts, urlCode) => {
    // qrData: "data:image/png;base64,AAAA..."
    latestQrDataUrl = qrData;
    console.log("✅ Yeni QR alındı ve RAM'e kaydedildi. Deneme sayısı:", attempts);
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

// 5) HTTP server (Railway için zorunlu)
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 HTTP server çalışıyor: http://localhost:${PORT}`);
});
