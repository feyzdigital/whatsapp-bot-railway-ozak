const { create, ev } = require('@open-wa/wa-automate');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 8080;

let latestQrDataUrl = null;
let lastQrTime = 0;
let isAuthenticated = false;

// ----------------------------------------------------
//  DİL ALGILAMA (TR / DE / EN)
// ----------------------------------------------------
function detectLanguage(messageBody) {
  const text = (messageBody || '').toLowerCase();

  const hasTrChars = /[ığüşöçİĞÜŞÖÇ]/.test(messageBody || '');

  // Basit kelime bazlı algılama
  if (
    hasTrChars ||
    /(merhaba|selam|fiyat|adet|otel|restoran|lokanta|kafe|broşür|katalog)/.test(
      text
    )
  ) {
    return 'tr';
  }

  if (
    /(hallo|guten tag|guten morgen|angebot|preis|stück|stickerei|servietten|schürze|tischwäsche|hotellerie)/.test(
      text
    )
  ) {
    return 'de';
  }

  if (
    /(hello|hi |good morning|good afternoon|price|quotation|napkin|apron|towel|hotel|restaurant|cafe|catalog)/.test(
      text
    )
  ) {
    return 'en';
  }

  // Hiçbirine uymuyorsa: varsayılan Türkçe
  return 'tr';
}

// ----------------------------------------------------
//  ÜRÜN / İHTİYAÇ TİPİ ALGILAMA (çok kaba)
// ----------------------------------------------------
function detectInterest(messageBody) {
  const text = (messageBody || '').toLowerCase();

  if (/(önlük|schürze|apron)/.test(text)) return 'apron';
  if (/(peçete|serviette|servietten|napkin)/.test(text)) return 'napkin';
  if (/(masa örtüsü|tischdecke|tablecloth)/.test(text)) return 'tablecloth';
  if (/(amerikan servis|placemat)/.test(text)) return 'placemat';
  if (/(havlu|towel|handtuch)/.test(text)) return 'towel';
  if (/(baskı|print|druck)/.test(text)) return 'print';
  if (/(nakış|embroidery|stickerei)/.test(text)) return 'embroidery';
  if (/(ambalaj|paket|package|verpackung|disposable)/.test(text)) return 'packaging';

  return 'generic';
}

// ----------------------------------------------------
//  FİYAT SORULARINI YAKALA (ama fiyat VERME)
// ----------------------------------------------------
function isPriceQuestion(messageBody) {
  const text = (messageBody || '').toLowerCase();
  return (
    /(fiyat|ücret|kaça|kaç euro|ne kadar|maliyet)/.test(text) ||
    /(price|cost|how much|euro)/.test(text) ||
    /(preis|kosten|wie viel)/.test(text)
  );
}

// ----------------------------------------------------
//  DİLE GÖRE CEVAP ÜRETİCİ
// ----------------------------------------------------
function buildReply(messageBody) {
  const lang = detectLanguage(messageBody);
  const interest = detectInterest(messageBody);
  const text = (messageBody || '').trim();

  // 1) Fiyat sorulmuşsa ama fiyat vermeden yönlendir
  if (isPriceQuestion(messageBody)) {
    if (lang === 'de') {
      return (
        'Vielen Dank für Ihre Anfrage. 😊\n\n' +
        'Damit wir Ihnen ein passendes Angebot in *EUR* erstellen können, benötige ich kurz ein paar Infos:\n' +
        '1️⃣ Art Ihres Betriebs (Hotel, Restaurant, Café, Catering usw.)\n' +
        '2️⃣ Für welches Produkt interessieren Sie sich? (z.B. Schürzen, Stoffservietten, Tischwäsche, Einwegprodukte usw.)\n' +
        '3️⃣ Ungefähre Stückzahl / monatlicher Bedarf\n\n' +
        'Auf dieser Basis bereiten wir ein individuelles Angebot für Sie vor.'
      );
    }

    if (lang === 'en') {
      return (
        'Thank you for your message. 😊\n\n' +
        'To prepare a tailored offer in *EUR*, may I ask you a few quick questions:\n' +
        '1️⃣ What type of business do you have? (hotel, restaurant, café, catering, etc.)\n' +
        '2️⃣ Which product group are you interested in? (aprons, napkins, table linen, towels, disposable items, etc.)\n' +
        '3️⃣ Approximate quantity / monthly demand?\n\n' +
        'Once we have this information, we will prepare a customised offer for you.'
      );
    }

    // varsayılan TR
    return (
      'Mesajınız için teşekkür ederiz. 😊\n\n' +
      'Size *EUR* bazlı net bir teklif hazırlayabilmemiz için kısaca şu bilgileri alabilir miyim:\n' +
      '1️⃣ İşletme türünüz nedir? (otel, restoran, kafe, catering vb.)\n' +
      '2️⃣ Hangi ürün grubu ile ilgileniyorsunuz? (önlük, peçete, masa örtüsü, havlu, tek kullanımlık ürünler vb.)\n' +
      '3️⃣ Tahmini adet ya da aylık tüketim miktarınız nedir?\n\n' +
      'Bu bilgilerle size özel bir teklif hazırlayalım.'
    );
  }

  // 2) Selam / ilk temas – genel karşılama
  const isJustGreeting =
    text &&
    text.length < 40 &&
    /(merhaba|selam|hallo|hello|hi|guten tag|guten morgen)/i.test(text);

  if (isJustGreeting) {
    if (lang === 'de') {
      return (
        'Hallo, herzlich willkommen bei *Ozak Textile & Pack*. 👋\n\n' +
        'Wir produzieren individuell bedruckte und bestickte Textilien sowie Einwegprodukte für Hotels, Restaurants, Cafés und Catering-Betriebe.\n\n' +
        'Damit ich Sie direkt richtig beraten kann:\n' +
        '• Was für ein Betrieb sind Sie? (Hotel, Restaurant, Café, Catering …)\n' +
        '• Für welche Produktgruppe interessieren Sie sich zuerst?'
      );
    }

    if (lang === 'en') {
      return (
        'Hello, welcome to *Ozak Textile & Pack*. 👋\n\n' +
        'We manufacture custom printed and embroidered textiles, as well as disposable products for hotels, restaurants, cafés and catering businesses.\n\n' +
        'To guide you properly:\n' +
        '• What type of business do you run? (hotel, restaurant, café, catering, etc.)\n' +
        '• Which product group would you like to start with?'
      );
    }

    return (
      'Merhaba, *Ozak Textile & Pack*’e hoş geldiniz. 👋\n\n' +
      'Otel, restoran, kafe ve catering işletmeleri için özel baskılı ve nakışlı tekstil ürünleri ile tek kullanımlık çözümler üretiyoruz.\n\n' +
      'Sizi doğru yönlendirebilmem için kısaca sorabilir miyim:\n' +
      '• İşletme türünüz nedir?\n' +
      '• Öncelikle hangi ürün grubunu düşünüyorsunuz?'
    );
  }

  // 3) İlgi alanına göre kısa tanıtım + sorular
  if (lang === 'de') {
    switch (interest) {
      case 'apron':
        return (
          'Vielen Dank für Ihr Interesse an unseren Schürzen. 👨‍🍳👩‍🍳\n\n' +
          'Wir fertigen professionelle Schürzen mit *Druck* und *Stickerei* – ideal für Service- und Küchenpersonal.\n\n' +
          'Damit wir das passende Modell empfehlen können:\n' +
          '1️⃣ In welchem Bereich werden die Schürzen eingesetzt? (Service, Küche, Bar …)\n' +
          '2️⃣ Bevorzugte Farbe(n) und Stoffart?\n' +
          '3️⃣ Ungefähre Stückzahl?'
        );
      case 'napkin':
        return (
          'Stoffservietten sind ein wichtiger Teil des Tischbildes. 🕯️🍷\n\n' +
          'Wir produzieren hochwertige Servietten, auf Wunsch mit Logo-Druck oder Stickerei, speziell für Hotels und Restaurants.\n\n' +
          'Darf ich kurz fragen:\n' +
          '1️⃣ Welches Format bevorzugen Sie? (z.B. 40×40 cm)\n' +
          '2️⃣ Welche Farbe bzw. Farbrichtung?\n' +
          '3️⃣ Ca. Stückzahl oder monatlicher Verbrauch?'
        );
      case 'tablecloth':
        return (
          'Tischwäsche ist entscheidend für den Gesamteindruck Ihres Hauses. 🤍\n\n' +
          'Wir fertigen Tischdecken in Sondermaßen, mit robusten Stoffen, abgestimmt auf Ihr Konzept.\n\n' +
          'Können Sie mir kurz sagen:\n' +
          '1️⃣ Welche Tischgrößen bzw. Maße Sie benötigen\n' +
          '2️⃣ Welche Stoffqualität Sie bevorzugen\n' +
          '3️⃣ Wie viele Tische ungefähr ausgestattet werden sollen?'
        );
      case 'packaging':
        return (
          'Zu unseren Lösungen gehören auch Einweg- und Verpackungsprodukte mit Ihrem Branding. 📦\n\n' +
          'Zum Beispiel: bedruckte Servietten, To-go-Verpackungen, Becherhüllen u.v.m.\n\n' +
          'Damit wir gezielt Vorschläge machen können:\n' +
          '1️⃣ In welchem Bereich möchten Sie Einwegprodukte einsetzen?\n' +
          '2️⃣ Welche Produkte haben Sie konkret im Kopf?\n' +
          '3️⃣ Ungefähre Mengen / monatlicher Bedarf?'
        );
      default:
        return (
          'Vielen Dank für Ihre Nachricht. 🙏\n\n' +
          'Wir sind auf maßgeschneiderte Textilien und Einwegprodukte für die Gastronomie und Hotellerie spezialisiert – inkl. *Logodruck* und *Stickerei*.\n\n' +
          'Damit ich Ihnen passende Vorschläge machen kann, sagen Sie mir bitte kurz:\n' +
          '1️⃣ Art Ihres Betriebs (Hotel, Restaurant, Café, Catering …)\n' +
          '2️⃣ Für welche Produktgruppe interessieren Sie sich zuerst?\n' +
          '3️⃣ Ungefähre Stückzahl bzw. jährlicher Bedarf?'
        );
    }
  }

  if (lang === 'en') {
    switch (interest) {
      case 'apron':
        return (
          'Thank you for your interest in our professional aprons. 👨‍🍳👩‍🍳\n\n' +
          'We produce durable aprons with *logo print* and *embroidery*, ideal for service and kitchen teams.\n\n' +
          'To recommend the best option for you:\n' +
          '1️⃣ Where will the aprons be used? (service, kitchen, bar, etc.)\n' +
          '2️⃣ Preferred colours and fabric type?\n' +
          '3️⃣ Approximate quantity?'
        );
      case 'napkin':
        return (
          'Napkins are a key detail on your tables. 🕯️🍷\n\n' +
          'We offer high-quality fabric napkins, with optional logo print or embroidery, tailored for hotels and restaurants.\n\n' +
          'May I ask:\n' +
          '1️⃣ What size do you prefer? (e.g. 40×40 cm)\n' +
          '2️⃣ Which colour range?\n' +
          '3️⃣ Approximate quantity or monthly usage?'
        );
      case 'tablecloth':
        return (
          'Table linen defines the overall look of your venue. 🤍\n\n' +
          'We produce custom-sized tablecloths with fabrics suitable for intensive professional use.\n\n' +
          'To guide you better:\n' +
          '1️⃣ What table sizes / dimensions do you need?\n' +
          '2️⃣ Preferred fabric quality?\n' +
          '3️⃣ Rough number of tables to be covered?'
        );
      case 'packaging':
        return (
          'We also provide branded disposable and packaging solutions. 📦\n\n' +
          'Examples: printed napkins, to-go packaging, cup sleeves and more.\n\n' +
          'To make concrete suggestions:\n' +
          '1️⃣ In which area do you plan to use disposable products?\n' +
          '2️⃣ Which items are you mainly interested in?\n' +
          '3️⃣ Approximate volumes / monthly demand?'
        );
      default:
        return (
          'Thank you for reaching out. 🙏\n\n' +
          'Ozak Textile & Pack specialises in custom textiles and disposable products for hotels, restaurants, cafés and catering – including *logo print* and *embroidery*.\n\n' +
          'To make the most relevant suggestions, could you please tell me:\n' +
          '1️⃣ What type of business you run\n' +
          '2️⃣ Which product group you are interested in first\n' +
          '3️⃣ Approximate quantity or annual demand'
        );
    }
  }

  // 4) Varsayılan: Türkçe senaryo
  switch (interest) {
    case 'apron':
      return (
        'Önlük tarafına ilginiz için teşekkür ederiz. 👨‍🍳👩‍🍳\n\n' +
        'Profesyonel mutfak ve servis ekipleri için, baskılı ve nakışlı uzun ömürlü önlükler üretiyoruz.\n\n' +
        'Sizi doğru modele yönlendirmek için kısaca sorabilir miyim:\n' +
        '1️⃣ Önlükler hangi alanda kullanılacak? (servis, mutfak, bar vb.)\n' +
        '2️⃣ Tercih ettiğiniz renk ve kumaş tipi nedir?\n' +
        '3️⃣ Tahmini adet / dönemsel ihtiyacınız ne kadar?'
      );
    case 'napkin':
      return (
        'Kumaş peçeteler, masanın genel şıklığını tamamlayan önemli bir detaydır. 🕯️🍷\n\n' +
        'Otel ve restoranlar için logolu baskı veya nakışlı, farklı ölçülerde kumaş peçeteler üretiyoruz.\n\n' +
        'Kısaca şunları paylaşabilir misiniz:\n' +
        '1️⃣ Tercih ettiğiniz ölçü nedir? (örn. 40×40 cm)\n' +
        '2️⃣ Renk veya konsept tercihiniz nedir?\n' +
        '3️⃣ Tahmini adet ya da aylık kullanım miktarı nedir?'
      );
    case 'tablecloth':
      return (
        'Masa örtüleri, işletmenizin ilk izleniminde büyük rol oynar. 🤍\n\n' +
        'Yoğun kullanıma uygun, özel ölçülü masa örtüleri üretiyoruz.\n\n' +
        'Size uygun çözümü önermek için:\n' +
        '1️⃣ Masa ölçüleriniz / ebatlarınız nelerdir?\n' +
        '2️⃣ Kumaş kalitesi ve renk tercihiniz nedir?\n' +
        '3️⃣ Kaç masa için düşünüyorsunuz?'
      );
    case 'packaging':
      return (
        'Tek kullanımlık ve ambalaj tarafında da markanıza özel baskılı çözümler sunuyoruz. 📦\n\n' +
        'Örneğin: baskılı peçeteler, paket servis ambalajları, bardak kılıfları vb.\n\n' +
        'Daha net yönlendirebilmem için:\n' +
        '1️⃣ Hangi alanda kullanmayı planlıyorsunuz? (restoran, kafe, otel odası vb.)\n' +
        '2️⃣ Hangi ürünlere öncelik veriyorsunuz?\n' +
        '3️⃣ Tahmini adet / aylık tüketiminiz nedir?'
      );
    default:
      return (
        'Mesajınız için teşekkür ederiz. 🙏\n\n' +
        '*Ozak Textile & Pack* olarak otel, restoran, kafe ve catering işletmeleri için özel baskılı ve nakışlı tekstil ürünleri ile tek kullanımlık çözümler üretiyoruz.\n\n' +
        'Sizi en doğru ürünlere yönlendirebilmemiz için kısaca paylaşabilir misiniz:\n' +
        '1️⃣ İşletme türünüz nedir? (otel, restoran, kafe, catering vb.)\n' +
        '2️⃣ Hangi ürün grubundan başlamak istersiniz? (önlük, peçete, masa örtüsü, havlu, tek kullanımlık ürünler vb.)\n' +
        '3️⃣ Tahmini adet veya yıllık tüketim miktarınız nedir?'
      );
  }
}

// ----------------------------------------------------
//  GLOBAL QR EVENT LISTENER
// ----------------------------------------------------
ev.on('qr.**', (qr, sessionId) => {
  console.log('🔥 Yeni QR event geldi! Session:', sessionId);

  if (!qr || typeof qr !== 'string') {
    console.log('QR geçersiz.');
    return;
  }

  latestQrDataUrl = qr;
  lastQrTime = Date.now();
  isAuthenticated = false;

  console.log('QR güncellendi. Uzunluk:', qr.length);
});

// ----------------------------------------------------
//  WA CLIENT BAŞLATMA
// ----------------------------------------------------
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

      client.onStateChanged(state => {
        console.log('State →', state);

        if (state === 'CONNECTED' || state === 'OPENING' || state === 'NORMAL') {
          isAuthenticated = true;
          latestQrDataUrl = null;
        } else {
          isAuthenticated = false;
        }
      });

      client.onLogout(() => {
        console.log('Çıkış yapıldı. QR yeniden beklenecek.');
        isAuthenticated = false;
        latestQrDataUrl = null;
      });

      // ----------------------------------------------------
      //  GELEN MESAJLARA CEVAP
      // ----------------------------------------------------
      client.onMessage(async msg => {
        try {
          console.log('📩 Yeni mesaj geldi:', {
            from: msg.from,
            isGroupMsg: msg.isGroupMsg,
            body: msg.body
          });

          if (msg.isGroupMsg) {
            console.log('Grup mesajı, cevaplanmayacak.');
            return;
          }

          const replyText = buildReply(msg.body);
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

// ----------------------------------------------------
//  ROOT ENDPOINT
// ----------------------------------------------------
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

// ----------------------------------------------------
//  QR ENDPOINT
// ----------------------------------------------------
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

// ----------------------------------------------------
//  SERVER + WA CLIENT BAŞLAT
// ----------------------------------------------------
app.listen(PORT, () => {
  console.log('HTTP server çalışıyor:', PORT);
  start();
});
