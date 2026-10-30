# Odgovori vlasnika procesa

Od: Gojko (preko Luke)
Primljeno: 29.10.2026.
Pitanja: `docs/pitanja-za-vlasnika-procesa.md`

Odgovori su ovde sažeti, uz napomenu šta svaki od njih menja u aplikaciji.

## A. Kako izgleda jedna vožnja

**A1. Prvo sav utovar, pa istovar?** Da, to je najčešći slučaj: kamion utovari sve u Srbiji,
pa istovara u inostranstvu. Ponekad kamion usput istovari i utovari, ali to je redak slučaj
i u prvoj verziji se zanemaruje.
→ Pretpostavka o dve faze po ruti ostaje.

**A2. Početak i kraj rute.** Kamion kupi robu iz više magacina, pa kreće na daleki put.
Ruta **počinje u prvom magacinu** iz kog kamion polazi, a **završava se kod poslednje
isporuke**. Ta tačka postaje početna tačka kamiona u planiranju za sledeću nedelju.
→ Menja se: ruta više ne počinje u bazi i nema povratka. Prvi magacin bira optimizacija.
Prenos krajnje tačke u sledeće planiranje je za kasnije (videti „Otvoreno“).

**A3. Obavezan redosled.** Može da postoji, ali se u prvoj verziji zanemaruje i dodaje
kasnije.
→ Bez promene.

**A4. Jedna tura po kamionu.** Da, jedan kamion vozi samo jednu turu (npr. iz Srbije u
Švedsku).
→ Bez promene.

## B. Kamioni

**B1. Spisak kamiona.** Kamioni se ne unose. Aplikacija sama pravi kamione sa nazivima
„Kamion 1“, „Kamion 2“..., a korisnik kasnije menja nazive i dodaje vozače. U oko 95%
slučajeva to je standardna cerada (dimenzije su već u aplikaciji), pa prva verzija
pretpostavlja da su svi kamioni standardna cerada. Korisnik kasnije sam menja dimenzije
(npr. stavi manji kamion).
→ Menja se: flota se ne unosi unapred, već je pravi aplikacija.

**B2. Težina.** Da, ukupna težina robe u kamionu ne sme da bude veća od nosivosti kamiona.
Nosivost standardne cerade je „mislim 13 tona ili tako nešto“.
→ Menja se: težina postaje ograničenje (do sada je bila izvan MVP-a). Kamion dobija polje za
nosivost, a tačan broj treba potvrditi.

## C. Podaci iz Excel tabele

**C1. DIMENZIJE su LDM.** Da.

**C2. TEŽINA.** Da, čitanje je tačno. Format će se u Excel-u možda unositi neuredno, ali će
se od korisnika tražiti dogovoreni format.

**C3. Nejasni redovi.** Za pojedinosti pitati Teodoru ili Andreja. Za potrebe algoritma
podaci mogu da se popune proizvoljno.
→ Stvarni redovi se ispravljaju u koraku ručne ispravke pri uvozu; ništa od toga ne ide u
repozitorijum.

**C4. Broj pošiljke.** Za sada broj praviti od reda ili naziva robe, uz oznaku reda u
Excel-u.
→ Aplikacija to već radi (ime fajla i red).

**C5. Deljenje pošiljke.** Nikada. Pošiljka za jednu dostavu nikada ne ide na više kamiona.
→ Bez promene.

## D. Za kasnije

**D1. Rokovi isporuke.** Za sada ne.

**D2. Redosled utovara.** Redosled utovara zavisi od redosleda istovara: ono što se prvo
istovara mora biti pozadi.
→ Nije jasno da li je ovo obavezno već u prvoj verziji (videti „Otvoreno“).

**D3. Ograničenja puteva.** Verovatno postoje, ali se u prvoj verziji zanemaruju.

## Otvoreno posle odgovora

1. **Nosivost standardne cerade.** Odgovor je „mislim 13 tona“. Za šleper sa ceradom (13,6 m)
   uobičajena nosivost je bliža 24 tone, pa broj treba potvrditi pre nego što postane
   ograničenje. **Privremeno 13 t** (odluka korisnika 30.10.2026), dok Gojko ne potvrdi.
2. **Redosled utovara (D2).** Ako se roba utovaruje redom kojim kamion obilazi magacine, a
   ono što se prvo istovara mora biti pozadi, onda redosled magacina zavisi od redosleda
   isporuka. To ograničava rute i može da poveća kilometražu. Da li ovo važi već u prvoj
   verziji, ili se roba pri utovaru može slobodno rasporediti?
   **Privremeno: utovar samo pozadi** (odluka korisnika 30.10.2026; lako se menja). Za
   Gojka ostaje pitanje: može li se cerada utovariti i sa strane? Ako može, pravilo utiče
   samo na 3D raspored, a ne na rute.
3. **Broj kamiona koje aplikacija pravi.** Da li je broj kamiona neograničen (aplikacija
   napravi koliko treba), ili postoji najveći broj raspoloživih kamiona? Privremeno
   neograničen.
4. **Početna tačka iz prethodne nedelje (A2).** Kada kamion počinje od poslednje isporuke
   prethodne ture, prvi put do magacina ulazi u kilometre. Za prvu verziju predlog je da
   se to zanemari (ruta počinje u prvom magacinu).
5. **Vozači (B1).** Da li je vozač samo tekst uz kamion, ili utiče na raspored?
