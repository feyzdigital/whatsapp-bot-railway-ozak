// index.js
// WhatsApp Bot + OpenAI TR/DE Kurumsal Tekstil Asistanı

require("dotenv").config();
const express = require("express");
const { create } = require("@open-wa/wa-automate");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 8080;

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Bellekte son QR görselini tutacağız (Buffer olarak)
let latestQrImage = null;

/** 1) Health check */
app.get("/", (req, res) => {
  res.send("WhatsApp Textile Assistant bot is running 🚀");
});

/** 2) QR PNG endpoint */
app.get("/qr.png", (req, res) => {
  if (!latestQrImage) {
    return res
      .status(503)
      .send("QR henüz hazır değil. Lütfen birkaç saniye sonra sayfayı yenileyin.");
  }

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-store");
  res.send(latestQrImage);
});

/** 3) WhatsApp botu başlat */
create({
  sessionId: "feyz-bot",
  multiDevice: true,
  headless: true,
  useChrome: false,
  authTimeout: 0,
  restartOnCrash: true,
  cacheEnabled: false,
  killProcessOnBrowserClose: false,
  sessionDataPath: "./session",

  // QR logunu konsola basma, ama callback ile alacağız
  qrLogSkip: true,
  qrRefreshS: 30,
  qrTimeout: 0,

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

  // Yeni QR geldiğinde çalışacak callback
  qrCallback: (qrBase64, asciiQR, attempts, urlCode) => {
    try {
      if (!qrBase64) return;

      // Bazı sürümlerde "data:image/png;base64,..." diye gelir, bazı sürümlerde sadece base64
      const base64Data = qrBase64.replace(/^data:image\/png;base64,/, "");
      latestQrImage = Buffer.from(base64Data, "base64");
      console.log("✅ Yeni QR alındı, /qr.png üzerinden görüntülenebilir. Deneme:", attempts);
    } catch (err) {
      console.error("❌ QR callback hata:", err);
    }
  },
})
  .then((client) => {
    console.log("✅ WhatsApp bot başlatıldı, client hazır!");
    startBot(client);
  })
  .catch((err) => {
    console.error("❌ Bot başlatılamadı:", err);
  });

/** Dil tespiti – çok basit: TR karakter varsa TR, yoksa DE */
function detectLanguage(text) {
  const trChars = /[çğıöşüÇĞİÖŞÜ]/;
  if (trChars.test(text)) return "tr";
  return "de";
}

/** OpenAI cevabı üreten fonksiyon – kurumsal + samimi tekstil temsilcisi */
async function generateAiReply(userText, lang) {
  const baseSystemPrompt = `
Sen, Avrupa'nın her yerine premium 1. sınıf tekstil ürünleri tedarik eden kurumsal bir firmanın 
uluslararası müşteri temsilcisisin. Tonun:
- Profesyonel,
- Samimi,
- Çözüm odaklı,
- WhatsApp sohbetine uygun kısa paragraflar halinde.

Müşterinin ihtiyacını netleştir:
- Hangi ürün(ler)le ilgilendiğini sor (otel tekstili, masa örtüsü, havlu, nevresim, vb.),
- Metraj / adet, hedef fiyat aralığı, teslim süresi gibi kritik bilgileri nazikçe iste,
- Teknik detayları (gramaj, kumaş türü, renk, ölçü vb.) sorarken müşteriyi boğma.

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

/** Mesajlara cevap veren fonksiyon */
function startBot(client) {
  console.log("🤖 startBot fonksiyonu çalıştı, mesajlar dinleniyor...");

  client.onMessage(async (message) => {
    // Kendi mesajlarımıza cevap verme
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

/** 4) HTTP server (Railway için zorunlu) */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 HTTP server çalışıyor: http://localhost:${PORT}`);
});
