# Pitanja za vlasnika procesa

Za: Gojko (preko Luke)
Datum: 28.10.2026.

Aplikacija raspoređuje pošiljke na kamione i određuje redosled vožnje, tako da se upotrebi
**što manje kamiona**, a zatim pređe **što manje kilometara**. Pre nego što napravimo deo koji
to računa, treba nam nekoliko odgovora o tome kako prevoz zaista izgleda. Odgovori iz prvog
dela menjaju način računanja; bez njih bismo pogađali.

Ako neki odgovor glasi „zavisi“, napišite od čega zavisi. To nam je jednako korisno.

## A. Kako izgleda jedna vožnja (najvažnije)

**A1. Da li kamion prvo pokupi svu robu, pa tek onda isporučuje?**
Na primer: kamion obiđe Beograd, Kragujevac i Leskovac, utovari sve, pa vozi u Švedsku i
istovara. Ili se dešava da kamion usput istovari nešto pa opet utovaruje?
*Zašto pitamo:* ako se utovar i istovar mešaju, jedan kamion bi u teoriji mogao sve da preveze
tura po tura, pa „najmanje kamiona“ gubi smisao. Tada nam treba i podatak koliko dugo jedna
vožnja sme da traje.

**A2. Odakle kamion kreće i gde završava?**
- Svi iz iste baze? Koje (adresa)?
- Da li se kamion posle isporuke vraća u bazu, ili završava kod poslednjeg kupca?
- Da li neki kamioni kreću iz drugih mesta?

*Zašto pitamo:* povratak u bazu ulazi u kilometre i menja koji raspored je najbolji.

**A3. Da li postoji obavezan redosled?**
Na primer: neki magacin mora prvi ili poslednji, carina se obavlja na određenom mestu, neki
kupac mora pre drugog, ili se ide određenim trajektom.

**A4. Da li jedan kamion u istom planu vozi samo jednu turu?**
Mi pretpostavljamo da da (jedna tura po kamionu u planu).

## B. Kamioni

**B1. Spisak kamiona.** Excel sadrži samo pošiljke. Za svaki kamion nam treba:
- oznaka ili naziv;
- kapacitet u LDM (na primer 13,6 za šleper);
- unutrašnja dužina, širina i visina tovarnog prostora (za 3D prikaz; nije obavezno);
- da li je uvek dostupan.

**B2. Težina.** Za sada težina samo piše uz pošiljku i ne ograničava raspored. Da li se
dešava da kamion „stane“ po metrima, ali je pretežak? Ako da, koja je dozvoljena nosivost?

## C. Podaci iz Excel tabele

**C1. Kolona DIMENZIJE.** Mi je čitamo kao utovarne metre (LDM): „2,4m“ znači 2,4 LDM.
Da li je to tačno?

**C2. Kolona TEŽINA.** „4,500 kg“ čitamo kao četiri i po tone (zarez odvaja hiljade), a „5,3t“
kao 5,3 tone. Da li je to tačno?

**C3. Nejasni redovi.** Nekoliko redova ne možemo da pročitamo jednoznačno: nema mesta
preuzimanja, ima dva odredišta, ili poštanski broj ima previše cifara. Spisak redova
šaljemo posebno. Za svaki nam treba ispravna relacija, a za red sa dva odredišta i koliko
LDM ide na svako.

**C4. Broj pošiljke.** Da li pošiljke imaju svoj broj (nalog, referenca)? Excel ga nema, pa
aplikacija sada pravi broj od imena fajla i reda. Svoj broj bi bio bolji.

**C5. Deljenje pošiljke.** Da li se pošiljka ikad deli na dva kamiona? Mi pretpostavljamo da ne.

## D. Za kasnije (ne blokira prvi prototip)

**D1.** Da li postoje rokovi isporuke ili vremena kada kupac prima robu?
**D2.** Da li je važan redosled utovara zbog istovara (ono što se prvo istovara mora biti
pozadi)? Za sada to ne proveravamo.
**D3.** Da li kamioni smeju svim putevima, ili ima ograničenja (visina, tonaža, trajekti)?
