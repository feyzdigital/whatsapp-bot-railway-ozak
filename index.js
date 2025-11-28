// index.js
// Ozak Textile & Pack – WhatsApp satış asistanı (TR/DE/EN, doğal diyalog, soru odaklı)

// -----------------------------
//  DEPENDENCIES
// -----------------------------
const { create, ev } = require('@open-wa/wa-automate');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 8080;

// -----------------------------
//  QR TAKİBİ (RAILWAY)
// -----------------------------
let latestQrDataUrl = null;
let lastQrTime = 0;
let isAuthenticated = false;

// Kullanıcı bazlı hafif state (sadece RAM’de, container resetlenirse sıfırlanır)
const sessions = new Map(); // key: chatId (msg.from), value: { lang, step, lastInteraction }

// -----------------------------
//  YARDIMCI FONKSİYONLAR
// -----------------------------

function detectLanguage(text) {
  const t = (text || '').toLowerCase();

  const hasTrChars = /[çğıöşü]/.test(t);
  const hasDeChars = /[äöüß]/.test(t);

  const trWords = ['merhaba', 'selam', 'günaydın', 'iyi akşam', 'teşekkür', 'otel', 'restoran', 'kafe', 'fiyat', 'adet'];
  const deWords = ['hallo', 'guten', 'danke', 'gastronomie', 'preis', 'stück', 'servietten', 'textil'];
  const enWords = ['hello', 'hi ', 'good morning', 'good evening', 'thanks', 'price', 'pieces', 'textile'];

  let scoreTr = hasTrChars ? 2 : 0;
  let scoreDe = hasDeChars ? 2 : 0;
  let scoreEn = 0;

  trWords.forEach(w => { if (t.includes(w)) scoreTr++; });
  deWords.forEach(w => { if (t.includes(w)) scoreDe++; });
  enWords.forEach(w => { if (t.includes(w)) scoreEn++; });

  if (scoreTr >= scoreDe && scoreTr >= scoreEn && scoreTr > 0) return 'tr';
  if (scoreDe >= scoreTr && scoreDe >= scoreEn && scoreDe > 0) return 'de';
  if (scoreEn >= scoreTr && scoreEn >= scoreDe && scoreEn > 0) return 'en';

  // Çok belirsizse default Türkçe
  return 'tr';
}

function getOrCreateSession(chatId, incomingText) {
  let s = sessions.get(chatId);
  if (!s) {
    s = {
      lang: detectLanguage(incomingText),
      step: 0,
      lastInteraction: Date.now()
    };
    sessions.set(chatId, s);
  } else {
    const newLang = detectLanguage(incomingText);
    if (newLang && newLang !== s.lang) {
      s.lang = newLang;
    }
    s.lastInteraction = Date.now();
  }
  return s;
}

function randomDelay(minMs = 2000, maxMs = 5000) {
  return minMs + Math.floor(Math.random() * (maxMs - minMs));
}

async function sendWithDelay(client, to, text) {
  const delay = randomDelay();
  console.log(`✉️  ${to} numarasına ${delay} ms gecikmeyle cevap gönderilecek.`);
  setTimeout(() => {
    client
      .sendText(to, text)
      .then(() => console.log('✅ Mesaj gönderildi →', to))
      .catch(err => console.error('Mesaj gönderilemedi:', err));
  }, delay);
}

// -----------------------------
//  ASIL CEVAP ÜRETEN FONKSİYON
// -----------------------------
function buildSmartReply({ lang, text, step }) {
  const t = (text || '').toLowerCase();

  const isQuestion =
    t.includes('?') ||
    ['mısın', 'misin', 'musun', 'müsün', 'mi ', ' mı ', ' mu ', ' mü '].some(w => t.includes(w)) ||
    [' what ', ' how ', ' wer ', ' wie '].some(w => t.includes(w));

  const asksPrice =
    ['fiyat', 'ücret', 'tl', 'euro', '€, eur', 'eur', 'preis', 'kosten', 'price', 'cost'].some(w =>
      t.includes(w)
    );

  const asksDelivery =
    ['teslim', 'kargo', 'shipping', 'lieferzeit', 'kaç günde', 'ne kadar sürede', 'kaç gün'].some(w =>
      t.includes(w)
    );

  const asksWho =
    ['kimsin', 'siz kimsiniz', 'kimle görüşüyorum', 'kimle konuşuyorum', 'hangi firmasınız', 'firma ismi', 'firma adı', 'who are you', 'who am i talking', 'wer sind sie', 'mit wem'].some(w =>
      t.includes(w)
    );

  const asksLocation =
    ['neredesiniz', 'hangi ülkede', 'hangi ulke', 'adres', 'nereye bağlı', 'where are you', 'where do you ship from', 'wo sitzen sie', 'standort'].some(w =>
      t.includes(w)
    );

  const asksMOQ =
    ['minimum', 'min.', 'en az kaç', 'en az kac', 'moq', 'mindestens', 'minimum order', 'min order'].some(w =>
      t.includes(w)
    );

  const saysThanks =
    ['teşekkür', 'tesekkur', 'sağol', 'sagol', 'danke', 'thank you', 'thanks', 'thx'].some(w =>
      t.includes(w)
    );

  const smallTalk =
    ['nasılsın', 'nasilsin', 'iyisiniz', 'wie geht', 'how are you'].some(w => t.includes(w));

  const looksLikeGreeting =
    ['merhaba', 'selam', 'günaydın', 'iyi akşam', 'hallo', 'hello', 'good morning', 'guten tag', 'servus', 'hi ']
      .some(w => t.includes(w));

  const mentionsHotel = ['otel', 'hotel'].some(w => t.includes(w));
  const mentionsRestaurant = ['restoran', 'restaurant', 'lokanta', 'cafe', 'kafe', 'bistro'].some(w =>
    t.includes(w)
  );
  const mentionsTextile =
    ['peçete', 'servis', 'masa örtüsü', 'masa ortusu', 'havlu', 'bornoz', 'önlük', 'apron', 'uniforma', 'nevresim', 'çarşaf', 'carsaf', 'textile', 'textil', 'serviette', 'servietten']
      .some(w => t.includes(w));

  const productHints = {
    tr:
      'Otel, restoran ve tüm işletmeler için;\n' +
      '• Nakışlı / baskılı önlük ve çalışan kıyafetleri\n' +
      '• Peçete, runner ve masa örtüsü\n' +
      '• Oda tekstili (havlu, bornoz, nevresim vb.)\n' +
      '• Tek kullanımlık ürünler (peçete, sleeve, bardak altlığı vb.)',
    de:
      'Für Hotels, Restaurants und alle Betriebe bieten wir u.a.:\n' +
      '• Bestickte / bedruckte Schürzen und Berufsbekleidung\n' +
      '• Stoffservietten, Läufer und Tischdecken\n' +
      '• Zimmertextilien (Handtücher, Bademäntel, Bettwäsche usw.)\n' +
      '• Einwegprodukte (Servietten, Sleeves, Untersetzer usw.)',
    en:
      'For hotels, restaurants and all businesses we offer for example:\n' +
      '• Embroidered / printed aprons and staff wear\n' +
      '• Napkins, runners and tablecloths\n' +
      '• Room textiles (towels, bathrobes, bed linen etc.)\n' +
      '• Disposable products (napkins, sleeves, coasters etc.)'
  };

  // -----------------------------
  // 1) Kimle konuşuyoruz? (bot değil satışçı gibi)
  // -----------------------------
  if (asksWho) {
    if (lang === 'de') {
      return (
        'Burada Ozak Textile & Pack satış ekibi olarak yazıyoruz. 😊\n' +
        'Gastronomie-Textilien und Einwegprodukte ile ilgili ihtiyaçlarınız için size eşlik ediyoruz.\n' +
        'Kısaca işletmenizi ve öncelikli ürün ihtiyacınızı yazarsanız, noktaya atış önerilerle ilerleyelim.'
      );
    }
    if (lang === 'en') {
      return (
        'You are in contact with the sales team of Ozak Textile & Pack. 😊\n' +
        'We support you with textile and disposable solutions for your business.\n' +
        'If you briefly tell me about your business and priority products, we can move very precisely.'
      );
    }
    return (
      'Burada Ozak Textile & Pack satış ekibi olarak size yardımcı oluyoruz. 😊\n' +
      'İşletmeniz için tekstil ve tek kullanımlık ürün çözümlerini birlikte planlıyoruz.\n' +
      'Kısaca işletmenizi ve öncelikli ürün ihtiyacınızı yazarsanız, tam size göre bir yönlendirme yapabilirim.'
    );
  }

  // -----------------------------
  // 2) Lokasyon soruları
  // -----------------------------
  if (asksLocation) {
    if (lang === 'de') {
      return (
        'Ozak Textile & Pack olarak Türkiye merkezli üretim yapıyoruz ve Avrupa’daki birçok işletmeye sevkiyat sağlıyoruz. 🌍\n' +
        'Siparişlerinizde hizmet verdiğiniz ülke ve şehir bilgisiyle birlikte ürün ve adet detayını paylaşırsanız, size özel çözümü netleştirebiliriz.'
      );
    }
    if (lang === 'en') {
      return (
        'Ozak Textile & Pack is based in Turkey and we supply many businesses across Europe. 🌍\n' +
        'If you share your country/city together with product and quantity details, we can clarify the best solution for you.'
      );
    }
    return (
      'Ozak Textile & Pack olarak Türkiye merkezli üretim yapıyoruz ve Avrupa’daki birçok işletmeye sevkiyat sağlıyoruz. 🌍\n' +
      'Siz hangi ülke/şehirde hizmet veriyorsunuz? Buna göre ürün ve lojistik tarafını birlikte netleştirebiliriz.'
    );
  }

  // -----------------------------
  // 3) Teşekkür ve small talk
  // -----------------------------
  if (saysThanks && !asksPrice && !asksDelivery && !isQuestion) {
    if (lang === 'de') {
      return (
        'Rica ederim, memnuniyetle. 🙏\n' +
        'Şimdi isterseniz adım adım ilerleyelim: Öncelikle hangi ürün grubuna odaklanmak istersiniz?'
      );
    }
    if (lang === 'en') {
      return (
        'You’re very welcome. 🙏\n' +
        'If you like, we can move step by step now: which product group would you like to focus on first?'
      );
    }
    return (
      'Rica ederim, ne demek. 🙏\n' +
      'İsterseniz şimdi adım adım ilerleyelim: Öncelikle hangi ürün grubuna odaklanmak istersiniz?'
    );
  }

  if (smallTalk) {
    if (lang === 'de') {
      return (
        'Teşekkür ederim, her şey yolunda. ☺️\n' +
        'Sizin için de işler yolundaysa, işletmenize en çok değer katacak tekstil veya tek kullanımlık ürün grubundan başlayalım mı?'
      );
    }
    if (lang === 'en') {
      return (
        'Thank you, doing well. ☺️\n' +
        'If you are ready too, let’s start with the product group that will add the most value to your business.'
      );
    }
    return (
      'Teşekkür ederim, her şey yolunda. ☺️\n' +
      'Sizin için de uygunsa, işletmenize en çok değer katacak ürün grubundan başlayalım mı?'
    );
  }

  // -----------------------------
  // 4) İlk temas / selamlama (step 0-1)
  // -----------------------------
  if (step === 0 || (looksLikeGreeting && step <= 1)) {
    if (lang === 'de') {
      return (
        'Merhaba, Ozak Textile & Pack’e hoş geldiniz. 👋\n' +
        'Hotel, Restaurant, Café, Catering ve daha birçok işletme için tekstil ve Einweg-Lösungen üretiyoruz.\n\n' +
        productHints.de +
        '\n\n' +
        'Kısaca işletmenizi ve öncelikli ürün ihtiyacınızı yazarsanız, oradan devam edelim.'
      );
    }
    if (lang === 'en') {
      return (
        'Hello, welcome to Ozak Textile & Pack. 👋\n' +
        'We produce textile and disposable solutions for hotels, restaurants, cafés, catering and many other businesses.\n\n' +
        productHints.en +
        '\n\n' +
        'If you briefly describe your business and your priority product group, we can continue from there.'
      );
    }
    return (
      'Merhaba, Ozak Textile & Pack’e hoş geldiniz. 👋\n' +
      'Otel, restoran, kafe, catering ve pek çok farklı işletme için tekstil ve tek kullanımlık ürünler üretiyoruz.\n\n' +
      productHints.tr +
      '\n\n' +
      'Kısaca işletmenizi ve öncelikli ürün ihtiyacınızı yazarsanız, buradan devam edelim.'
    );
  }

  // -----------------------------
  // 5) Fiyat soruları (rakam yok, EUR ve süreç)
  // -----------------------------
  if (asksPrice) {
    if (lang === 'de') {
      return (
        'Fiyatlandırmayı ürün tipi, malzeme, baskı/nakış detayı ve adet üzerinden proje bazlı hazırlıyoruz ve tekliflerimizi EUR olarak çalışıyoruz. 💶\n\n' +
        'Sizin için net bir Angebot çıkarabilmemiz için lütfen şunlardan birkaçını yazın:\n' +
        '• Hangi ürün(ler)? (örn. Schürzen, Servietten, Tischwäsche, Handtücher…)\n' +
        '• Logolu mu, kaç renk baskı veya nakış düşünüyorsunuz?\n' +
        '• Tahmini adet veya yıllık tüketim\n\n' +
        'Bu bilgilerle size özel, yazılı bir teklif hazırlayalım.'
      );
    }
    if (lang === 'en') {
      return (
        'Pricing depends on product type, material, print/embroidery details and quantity. We prepare all offers in EUR. 💶\n\n' +
        'To prepare a clear quotation for you, please share:\n' +
        '• Which products? (e.g. aprons, napkins, tablecloths, towels…)\n' +
        '• Logo and print/embroidery details (number of colours etc.)\n' +
        '• Approximate quantity or yearly consumption\n\n' +
        'With these details we will prepare a tailored written offer.'
      );
    }
    return (
      'Fiyatlarımızı ürün tipi, malzeme, baskı/nakış detayı ve adet üzerinden, proje bazlı ve EUR cinsinden hazırlıyoruz. 💶\n\n' +
      'Sizin için net bir teklif çıkarabilmemiz için lütfen şu bilgileri kısaca paylaşın:\n' +
      '• Hangi ürün(ler)? (örneğin önlük, personel kıyafeti, peçete, masa örtüsü, havlu, bornoz vb.)\n' +
      '• Logolu mu olacak, kaç renk baskı veya nakış düşünüyorsunuz?\n' +
      '• Tahmini adet veya yıllık tüketim\n\n' +
      'Bu bilgilerle size özel, yazılı bir teklif hazırlayalım.'
    );
  }

  // -----------------------------
  // 6) Teslim / kargo soruları (net süre yok)
  // -----------------------------
  if (asksDelivery) {
    if (lang === 'de') {
      return (
        'Lieferzeit ve üretim süresi; ürün tipi, baskı/nakış detayı ve adet miktarına göre değişiyor. 📦\n' +
        'Buradan net bir gün söylemek yerine, önce projenizin detaylarını alıp size özel planlamayı paylaşmak daha sağlıklı olur.\n\n' +
        'Kısaca ürün, adet ve ülke/şehir bilgisini yazarsanız, en uygun üretim ve sevkiyat planını sizin için oluşturabiliriz.'
      );
    }
    if (lang === 'en') {
      return (
        'Production and delivery times depend on product type, print/embroidery details and quantity. 📦\n' +
        'Instead of giving a random number of days, we prefer to first understand your project and then share a realistic timeline.\n\n' +
        'If you send product, quantity and country/city info, we can plan the best possible schedule for you.'
      );
    }
    return (
      'Teslim süresi; ürün tipi, baskı/nakış detayı ve adet miktarına göre değişiyor. 📦\n' +
      'Buradan net bir gün vermek yerine, önce projenizi anlayıp size özel gerçekçi bir plan paylaşmak daha doğru olur.\n\n' +
      'Kısaca ürün, adet ve bulunduğunuz ülke/şehir bilgisini yazarsanız, sizin için en uygun üretim ve sevkiyat planını çıkarabiliriz.'
    );
  }

  // -----------------------------
  // 7) Minimum adet / MOQ
  // -----------------------------
  if (asksMOQ) {
    if (lang === 'de') {
      return (
        'Minimum adetlerimiz ürün grubuna ve baskı/nakış detayına göre değişiyor. 🎯\n' +
        'Bazı ürünlerde daha esnek, bazı ürünlerde ise belirli bir alt sınırla çalışıyoruz.\n\n' +
        'Siz hangi ürün için, yaklaşık kaç adet düşünüyorsunuz? Buna göre minimum ve avantajlı adetler konusunda net bilgi verebilirim.'
      );
    }
    if (lang === 'en') {
      return (
        'Our minimum quantities depend on the product group and the print/embroidery details. 🎯\n' +
        'For some items we are more flexible, for others we work with certain MOQ levels.\n\n' +
        'Which product are you considering and roughly how many pieces? Then I can clarify the minimum and the most economical quantity for you.'
      );
    }
    return (
      'Minimum adetlerimiz ürün grubuna ve baskı/nakış detayına göre değişiyor. 🎯\n' +
      'Bazı ürünlerde daha esnek, bazı ürünlerde ise belirli bir alt sınırla çalışıyoruz.\n\n' +
      'Siz hangi ürün için ve yaklaşık kaç adet düşünüyorsunuz? Buna göre hem minimum adet hem de en avantajlı adetler konusunda net bilgi verebilirim.'
    );
  }

  // -----------------------------
  // 8) İşletme tipi belirtilmişse
  // -----------------------------
  if (mentionsHotel || mentionsRestaurant) {
    if (lang === 'de') {
      return (
        'Anladım, teşekkürler. 🙏\n' +
        'Bu tür işletmeler için en çok çalıştığımız ürünler:\n' +
        '• Logolu çalışan kıyafetleri ve Schürzen\n' +
        '• Stoffservietten, Tischläufer ve Tischdecken\n' +
        '• Zimmertextilien (Handtücher, Bademäntel, Bettwäsche)\n\n' +
        'İsterseniz önce personel tarafı mı, masa tekstili mi yoksa oda tekstili mi sizin için daha kritik, onu netleştirelim.'
      );
    }
    if (lang === 'en') {
      return (
        'Got it, thank you. 🙏\n' +
        'For this type of business we usually focus on:\n' +
        '• Branded staff wear and aprons\n' +
        '• Table textiles (napkins, runners, tablecloths)\n' +
        '• Room textiles (towels, bathrobes, bed linen)\n\n' +
        'Which area is more important for you right now: staff, table, or room textiles?'
      );
    }
    return (
      'Harika, teşekkürler. 🙏\n' +
      'Bu tür işletmeler için en çok öne çıkan ürünlerimiz:\n' +
      '• Logolu personel kıyafetleri ve önlükler\n' +
      '• Peçete, runner ve masa örtüsü gibi masa tekstilleri\n' +
      '• Havlu, bornoz, nevresim gibi oda tekstilleri\n\n' +
      'Şu anda sizin için hangisi daha öncelikli: personel, masa mı yoksa oda tekstili mi?'
    );
  }

  // -----------------------------
  // 9) Ürün belirtilmiş ama detay azsa
  // -----------------------------
  if (mentionsTextile) {
    if (lang === 'de') {
      return (
        'Not ettim, teşekkürler. 🙏\n' +
        'Size doğru önerileri sunmak için birkaç küçük bilgi rica edeceğim:\n' +
        '• Renk veya konsept (örn. beyaz, krem, siyah, kurumsal renkleriniz)\n' +
        '• Ürünlerin üzerinde logo / nakış / baskı isteğiniz\n' +
        '• Tek seferlik bir proje mi yoksa düzenli tüketim mi?\n\n' +
        'Bu bilgilerle size en uygun kumaş, ölçü ve işçilik kombinasyonunu önerebilirim.'
      );
    }
    if (lang === 'en') {
      return (
        'Noted, thank you. 🙏\n' +
        'To give you the best possible options, I just need a few details:\n' +
        '• Colour or concept (white, cream, black, or your brand colours)\n' +
        '• Logo / embroidery / print details on the products\n' +
        '• Is it a one-time project or continuous consumption?\n\n' +
        'Based on this I can suggest the right fabric, sizes and workmanship.'
      );
    }
    return (
      'Not aldım, teşekkür ederim. 🙏\n' +
      'Sizi doğru ürüne yönlendirebilmem için birkaç küçük bilgi daha rica edeceğim:\n' +
      '• Renk veya konsept (beyaz, krem, siyah ya da kurumsal renkleriniz)\n' +
      '• Ürün üzerinde logo / nakış / baskı isteğiniz\n' +
      '• Tek seferlik bir proje mi, yoksa düzenli tüketim mi?\n\n' +
      'Bu bilgilerle size uygun kumaş, ölçü ve işçilik kombinasyonunu önerebilirim.'
    );
  }

  // -----------------------------
  // 10) Genel, belirsiz ama soru içeren mesajlar
  //     (Konu dışı bile olsa içeri çeker)
// -----------------------------
  if (isQuestion) {
    if (lang === 'de') {
      return (
        'Sorunuz için teşekkür ederim. 🙏\n' +
        'Bu kanalda özellikle tekstil ve Einweg-Lösungen tarafında size destek oluyorum, bu yüzden bazı konularda çok teknik değil; daha pratik ve işletmenize fayda sağlayacak şekilde yanıt veriyorum.\n\n' +
        'Kısaca şu an işletmeniz için hangi ürün tarafında bir ihtiyacınız var (örneğin personel kıyafeti, Servietten, Tischwäsche, oda tekstili veya tek kullanımlık ürünler)? Oradan çok daha somut ilerleyebiliriz.'
      );
    }
    if (lang === 'en') {
      return (
        'Thank you for your question. 🙏\n' +
        'Here I mainly support you with textiles and disposable products for your business, so some topics I will answer from a practical, solution-oriented perspective rather than very technical details.\n\n' +
        'To be really helpful, could you tell me which product area is currently relevant for you (staff wear, napkins, table textiles, room textiles or disposable items)? Then we can link your question directly to the right solution.'
      );
    }
    return (
      'Sorunuz için teşekkür ederim. 🙏\n' +
      'Burada özellikle işletmeniz için tekstil ve tek kullanımlık ürün çözümlerine odaklanıyorum; bu yüzden bazı konularda çok teknik değil, daha pratik ve işinize fayda sağlayacak bir bakış açısıyla yanıt veriyorum.\n\n' +
      'Sizin için şu anda hangi ürün alanı daha kritik? (örneğin personel kıyafeti, peçete/masa örtüsü, havlu/bornoz, nevresim ya da tek kullanımlık ürünler) Bunu paylaşırsanız, sorunuzla bağlantılı olarak en doğru yönlendirmeyi yapabilirim.'
    );
  }

  // -----------------------------
  // 11) Genel, belirsiz, soru olmayan mesajlar
  // -----------------------------
  if (lang === 'de') {
    return (
      'Mesajınız için teşekkür ederim. 🙏\n' +
      'Sizi doğru çözümle buluşturabilmem için kısaca işletmenizi ve şu anda odaklandığınız ürün alanını yazmanız yeterli:\n' +
      '• Hotel, Restaurant, Café, Catering, Klinik vb. hangisi?\n' +
      '• Öncelikli ürün grubu (Schürzen, Berufsbekleidung, Servietten, Tischwäsche, Zimmertextilien, Einwegprodukte…)\n\n' +
      'Bu bilgileri aldıktan sonra, tamamen işletmenize uygun bir yol haritası çıkarabiliriz.'
    );
  }
  if (lang === 'en') {
    return (
      'Thank you for your message. 🙏\n' +
      'To connect you with the right solution, it would be helpful if you briefly share:\n' +
      '• What type of business you run (hotel, restaurant, café, catering, clinic, etc.)\n' +
      '• Which product group is your current focus (staff wear, napkins, table textiles, room textiles, disposable items…)\n\n' +
      'Once I have this, I can propose a path that fits your business very precisely.'
    );
  }
  return (
    'Mesajınız için teşekkür ederim. 🙏\n' +
    'Sizi en doğru çözüme yönlendirebilmem için kısaca şunları paylaşmanız yeterli:\n' +
    '• İşletme türünüz (otel, restoran, kafe, catering, klinik vb.)\n' +
    '• Şu anda odaklandığınız ürün grubu (personel kıyafeti, önlük, peçete, masa örtüsü, havlu/bornoz, nevresim, tek kullanımlık ürünler vb.)\n\n' +
    'Bu bilgilerle, tamamen işletmenize uygun bir öneriyle devam edebiliriz.'
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
    useChrome: false, // Docker içinde Chromium kullanıyoruz
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

      client.onLogout(() => {
        console.log('Çıkış yapıldı. QR yeniden beklenecek.');
        isAuthenticated = false;
        latestQrDataUrl = null;
      });

      // -----------------------------
      //  GELEN MESAJLARA CEVAP
      // -----------------------------
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

          const text = (msg.body || '').trim();
          const session = getOrCreateSession(msg.from, text);

          if (session.step < 5) {
            session.step += 1;
          }

          const replyText = buildSmartReply({
            lang: session.lang,
            text,
            step: session.step
          });

          await sendWithDelay(client, msg.from, replyText);
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
//  EXPRESS ENDPOINTLER
// -----------------------------
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    isAuthenticated,
    qrTimestamp: lastQrTime,
    qrAgeSeconds: lastQrTime
      ? Math.round((Date.now() - lastQrTime) / 1000)
      : null
  });
});

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
//  SERVER + WA CLIENT
// -----------------------------
app.listen(PORT, () => {
  console.log('HTTP server çalışıyor:', PORT);
  start();
});
