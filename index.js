// index.js
// WhatsApp Bot + OpenAI TR/DE Kurumsal Tekstil Asistanı + QR PNG çıktısı

require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");
const { create } = require("@open-wa/wa-automate");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- 1) HEALTH CHECK ----------
app.get("/", (req, res) => {
  res.send("WhatsApp Textile Assistant bot is running 🚀");
});

// ---------- 2) QR PNG SERVİSİ ----------
// QR dosyası: /public/qr.png olarak kaydedilecek
app.get("/qr.png", (req, res) => {
  const filePath = path.join(__dirname, "public", "qr.png");

  if (!fs.existsSync(filePath)) {
    return res
      .status(404)
      .send("QR henüz hazır değil. Lütfen birkaç saniye sonra tekrar deneyin.");
  }

  res.sendFile(filePath);
});

// ---------- 3) OPENAI CLIENT ----------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------- 4) DİL TESPİTİ ----------
function detectLanguage(text) {
  const trChars = /[çğıöşüÇĞİÖŞÜ]/;
  if (trChars.test(text)) return "tr";
  return "de";
}

// ---------- 5) OPENAI CEVAP ----------
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

// ---------- 6) WHATSAPP BOT BAŞLATMA ----------
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

  // Log'da ASCII QR göstermesin, PNG'ye güveneceğiz
  qrLogSkip: true,
  qrRefreshS: 0,
  qrTimeout: 0,
  qrOutput: "png",
  qrScreenshot: false,

  // Yeni QR üretildiğinde PNG olarak kaydet
  qrCallback: async (qrData, sessionId) => {
    try {
      const publicDir = path.join(__dirname, "public");
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir);
      }

      const filePath = path.join(publicDir, "qr.png");

      await QRCode.toFile(filePath, qrData, {
        width: 512,
        margin: 2,
      });

      console.log("✅ QR PNG oluşturuldu:", filePath);
    } catch (err) {
      console.error("❌ QR PNG oluşturulurken hata:", err);
    }
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

// ---------- 7) MESAJ DİNLER ----------
function startBot(client) {
  console.log("🤖 startBot fonksiyonu çalıştı, mesajlar dinleniyor...");

  client.onMessage(async (message) => {
    if (message.fromMe) return; // kendi mesajımıza cevap verme

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

      if (!reply) throw new Error("Boş AI cevabı döndü.");

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

// ---------- 8) HTTP SERVER ----------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 HTTP server çalışıyor: http://localhost:${PORT}`);
});
