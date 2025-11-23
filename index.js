const express = require("express");
const { create } = require("@open-wa/wa-automate");

// --- Express / Health Check ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("WhatsApp bot is running on Railway 🚀");
});

// --- OpenAI Ayarları ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn(
    "⚠️ OPENAI_API_KEY tanımlı değil. Railway Variables kısmına eklemezsen AI cevapları çalışmaz."
  );
}

// Basit dil tespiti (TR / DE)
function detectLanguage(text) {
  if (!text) return "tr";

  const lower = text.toLowerCase();

  // Çok kabaca Almanca karakter / kelime kontrolü
  const hasGermanChars = /[äöüß]/.test(lower);
  const germanWords = ["hallo", "guten", "danke", "bitte", "lg", "mit freundlichen grüßen"];

  if (hasGermanChars || germanWords.some((w) => lower.includes(w))) {
    return "de";
  }

  // Varsayılan Türkçe
  return "tr";
}

// OpenAI'den cevap üret
async function generateAiReply(userText) {
  const lang = detectLanguage(userText);

  // API key yoksa basit fallback cevap
  if (!OPENAI_API_KEY) {
    if (lang === "de") {
      return (
        "Vielen Dank für Ihre Nachricht 🙏\n" +
        "Unsere Vertriebsabteilung meldet sich in Kürze persönlich bei Ihnen."
      );
    }

    return (
      "Mesajınız için çok teşekkür ederiz 🙏\n" +
      "Satış ekibimiz en kısa sürede sizinle birebir iletişime geçecektir."
    );
  }

  const systemPrompt = `
Sen, Avrupa'nın her yerine premium tekstil ürünleri tedarik eden bir firmanın
uluslararası satış temsilcisisin.

Firma: Örnek Premium Textile (kurumsal, güvenilir, Avrupa odaklı).
Rolün:
- WhatsApp üzerinden yazan müşterilerle sıcak, profesyonel ve doğal bir tonla konuşmak.
- Asla bot olduğunu söylememek; kendini insan satış temsilcisi gibi ifade etmek.
- Kısa, okunabilir WhatsApp mesajları yazmak (1–3 cümle, gerekirse 2 paragraf).
- Gerektiğinde 1 net soru sorarak sohbeti ilerletmek (ölçü, adet, teslim tarihi, ülke vb.).
- Fiyat / stok / özel bilgi bilmediğin durumda UYDURMAK yerine:
  - “Size en doğru fiyat için teklif hazırlayayım.” gibi cümle kur,
  - E-mail veya şirket bilgisi talep et.

Dil:
- Müşteri hangi dilde yazıyorsa o dilde cevap ver (Türkçe veya Almanca).
- Karışık ise, mümkün olduğunca o dilin ağırlıkta olduğu dilde yaz.

Türkçe ton:
- Kurumsal, kibar, çözüm odaklı, samimi.
- Örnek hitap: “Merhaba, ben satış ekibindenim.” / “Memnuniyetle yardımcı olurum.”

Almanca ton:
- Höflich, professionell, freundlich.
- Örnek hitap: “Guten Tag, vielen Dank für Ihre Nachricht.” / “Gerne helfe ich Ihnen weiter.”

Kısaca:
- İnsan gibi yaz.
- Emojiyi abartma ama arada kullanabilirsin (🙏✨🙂).
- Her seferinde uzun paragraf yazma; WhatsApp akışına uygun, nefes alan mesajlar yaz.
`;

  const userInstruction =
    lang === "de"
      ? `Kunde schreibt auf Deutsch. Antworte bitte auf natürlichem, professionellem Deutsch.\n\nKundennachricht:\n${userText}`
      : `Müşteri Türkçe yazıyor. Lütfen doğal, profesyonel ve samimi bir Türkçe ile cevap ver.\n\nMüşteri mesajı:\n${userText}`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: [{ type: "text", text: systemPrompt }],
          },
          {
            role: "user",
            content: [{ type: "text", text: userInstruction }],
          },
        ],
        max_output_tokens: 300,
      }),
    });

    const data = await response.json();

    // Responses API içinden metni çek
    const firstOutput = data.output?.[0];
    const firstContent = firstOutput?.content?.[0];

    let aiText =
      (firstContent && (firstContent.text || firstContent.output_text)) ||
      null;

    if (!aiText) {
      // Beklenmedik durumda fallback
      if (lang === "de") {
        return (
          "Vielen Dank für Ihre Nachricht 🙏\n" +
          "Unsere Vertriebsabteilung meldet sich in Kürze persönlich bei Ihnen."
        );
      }

      return (
        "Mesajınız için teşekkür ederiz 🙏\n" +
        "Size en kısa sürede satış ekibimiz tarafından dönüş yapılacaktır."
      );
    }

    return aiText.trim();
  } catch (err) {
    console.error("❌ OpenAI isteğinde hata:", err);

    // Hata durumunda yine kibar fallback
    if (detectLanguage(userText) === "de") {
      return (
        "Im Moment gibt es ein technisches Problem 🙏\n" +
        "Wir melden uns so schnell wie möglich persönlich bei Ihnen."
      );
    }

    return (
      "Şu an teknik bir sorun yaşıyoruz 🙏\n" +
      "Size en kısa sürede birebir dönüş yapacağız."
    );
  }
}

// --- WhatsApp Bot Başlatma ---
create({
  sessionId: "feyz-bot",
  multiDevice: true,
  headless: true, // Railway'de her zaman headless

  authTimeout: 0,
  restartOnCrash: true,
  cacheEnabled: false,

  // Railway'de sistem Chrome yok, paket Chromium kullansın
  useChrome: false,

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

  killProcessOnBrowserClose: false,

  sessionDataPath: "./session",

  // QR ayarları (Railway için yine PNG üretir ama sen görmeyeceksin)
  qrLogSkip: true,
  qrRefreshS: 0,
  qrTimeout: 0,
  qrOutput: "png",
  qrScreenshot: true,
})
  .then((client) => {
    console.log("✅ WhatsApp bot başlatıldı, client hazır!");
    startBot(client);
  })
  .catch((err) => {
    console.error("❌ Bot başlatılamadı:", err);
  });

// --- Mesajları Dinleyen Kısım ---
function startBot(client) {
  client.onMessage(async (message) => {
    try {
      // Kendi mesajlarımıza cevap verme
      if (message.fromMe) return;

      const text = (message.body || "").trim();
      if (!text) return;

      console.log("💬 Gelen mesaj:", text);

      const reply = await generateAiReply(text);

      if (reply && reply.length > 0) {
        await client.sendText(message.from, reply);
        console.log("📤 Gönderilen cevap:", reply);
      }
    } catch (err) {
      console.error("❌ Mesaj işlerken hata:", err);
    }
  });
}

// --- HTTP Server (Railway için şart) ---
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Server running on port ${PORT}`);
});
