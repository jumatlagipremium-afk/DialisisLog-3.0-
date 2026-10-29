import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setAllPoin2_1,
  normalizePoin2_1Data,
  normalizePatientClinicalDetails,
  getPoin2_1Counts,
  formatPoin2_1Note,
  setAllPoin3_1,
  getPoin3_1Counts,
  formatPoin3_1Note,
  computeWeightMetrics,
  isPoin3_2LogbookComplete,
  formatPoin3_2Note,
  formatPoin3_2LogbookNote,
  parsePreBpInput,
  isPoin3_3LogbookComplete,
  formatPoin3_3LogbookNote,
  computePreHdVitalsMetrics,
  formatPoin3_3Note,
  isPoin3_5Complete,
  formatPoin3_5Note,
  isPoin3_6Complete,
  formatPoin3_6Note,
  resolveSessionAccessFromPoin3_6,
  KOMPLIKASI_INTRA_HD_ITEMS,
  createEmptyPoin4_3Data,
  normalizePoin4_3Data,
  isPoin4_3Complete,
  formatPoin4_3Note,
  resolveSessionComplicationsFromPoin4_3,
  PILIHAN_KOMPLIKASI_DROPDOWN,
  getDefaultAdvisForJenis,
  createDefaultPoin4_3Entry,
  normalizePoin6_3Data,
  isPoin6_3Complete,
  formatPoin6_3Note,
  createDefaultPatientClinicalDetails
} from './logbookClinicalHelpers.ts';

test('Poin 2.1: Simplified single Ceklist APD and Ceklist Cuci Tangan tracking', () => {
  const full = setAllPoin2_1(true);
  const fullCounts = getPoin2_1Counts(full);
  assert.equal(fullCounts.apdChecked, true);
  assert.equal(fullCounts.handwashChecked, true);
  assert.equal(fullCounts.checkedCount, 2);
  assert.equal(fullCounts.total, 2);
  assert.equal(fullCounts.isComplete, true);
  assert.match(formatPoin2_1Note(full), /HAND HYGIENE: DILAKSANAKAN \| PENGGUNAAN APD: DILAKSANAKAN/);

  const partial = { apd: true, cuciTangan: false };
  const partialCounts = getPoin2_1Counts(partial);
  assert.equal(partialCounts.apdChecked, true);
  assert.equal(partialCounts.handwashChecked, false);
  assert.equal(partialCounts.checkedCount, 1);
  assert.equal(partialCounts.isComplete, false);

  // Legacy nested structure normalization
  const migrated = normalizePoin2_1Data({
    apd: { apronGaun: true, maskerBedah: true, faceshieldGoogle: false, sarungTangan: true },
    cuciTangan: { langkah1: true, langkah2: true }
  });
  assert.equal(migrated.apd, false);
  assert.equal(migrated.cuciTangan, true);
});

test('Poin 3.1: Verbal & Non-Verbal patient identification checklist tracking and status/kategori', () => {
  const base = createDefaultPatientClinicalDetails('p1').poin3_1;
  const counts = getPoin3_1Counts(base);
  assert.equal(counts.verbalCount, 2);
  assert.equal(counts.nonVerbalCount, 2);
  assert.equal(counts.isComplete, true);
  assert.equal(base.status, 'RAWAT JALAN');
  assert.equal(base.kategori, 'REGULER');
  assert.match(
    formatPoin3_1Note(base, 'Tn. Bambang Sutrisno', '452101'),
    /Identifikasi Verbal \(2\/2\) & Non-Verbal \(2\/2\) DILAKSANAKAN/
  );
  assert.match(
    formatPoin3_1Note(base, 'Tn. Bambang Sutrisno', '452101'),
    /Status: RAWAT JALAN/
  );

  // Test Rawat Inap with Ruang selection
  const ranapIcu = {
    ...base,
    status: 'RAWAT INAP' as const,
    ruangRawatInap: 'ICU' as const,
    kategori: 'ISOLASI HEPATITIS B' as const
  };
  const ranapNote = formatPoin3_1Note(ranapIcu, 'Ny. Siti Rahma', '452102');
  assert.match(ranapNote, /Status: RAWAT INAP \(ICU\)/);
  assert.match(ranapNote, /Kategori: ISOLASI HEPATITIS B/);

  const cleared = setAllPoin3_1(base, false);
  const clearedCounts = getPoin3_1Counts(cleared);
  assert.equal(clearedCounts.verbalCount, 0);
  assert.equal(clearedCounts.nonVerbalCount, 0);
  assert.equal(clearedCounts.isComplete, false);
});

test('Poin 3.2: BB Datang, BB Pulang, BB Kering, and UFG metrics & overload detection', () => {
  const sample = {
    bbPre: '64.2',
    bbPost: '61.6',
    bbKering: '61.5',
    ufg: '2700'
  };
  const metrics = computeWeightMetrics(sample);

  assert.equal(metrics.idwgKg, 2.7);
  assert.equal(metrics.idwgPct, 4.4);
  assert.equal(metrics.deltaPrePostKg, 2.6);
  assert.equal(metrics.recommendedUfgMl, 2700);
  assert.equal(metrics.overloadStatus, 'moderate');
  assert.equal(metrics.isComplete, true);
  assert.equal(isPoin3_2LogbookComplete(sample), true);
  assert.equal(
    isPoin3_2LogbookComplete({ bbPre: '64.2', bbPost: '', bbKering: '61.5', ufg: '' }),
    false
  );

  const note = formatPoin3_2Note(sample);
  assert.match(note, /BB Pre: 64\.2 kg/);
  assert.match(note, /BB Post: 61\.6 kg/);
  assert.match(note, /BB Kering: 61\.5 kg/);
  assert.match(note, /UFG: 2\.700 mL/);

  const logbookNote = formatPoin3_2LogbookNote(sample);
  assert.match(logbookNote, /BB Datang: 64\.2 kg/);
  assert.match(logbookNote, /BB Pulang: 61\.6 kg/);
  assert.match(logbookNote, /BB Kering: 61\.5 kg/);
});

test('Poin 3.3: Tekanan Darah Pre HD single-column input & TTV Pre-HD MAP calculation', () => {
  const parsed = parsePreBpInput('140/85');
  assert.equal(parsed.sys, 140);
  assert.equal(parsed.dia, 85);
  assert.equal(parsed.mapMmHg, 103);
  assert.equal(parsed.alertText, null);

  const bpLogbookData = {
    tdPreHd: '140/85',
    tdSistolik: parsed.tdSistolik,
    tdDiastolik: parsed.tdDiastolik,
    posisiTd: 'Duduk' as const,
    nadi: '',
    pernapasan: '',
    suhu: '',
    spo2: ''
  };
  assert.equal(isPoin3_3LogbookComplete(bpLogbookData), true);
  assert.match(formatPoin3_3LogbookNote(bpLogbookData), /TD Pre HD: 140\/85 mmHg \(MAP 103 mmHg\)/);

  const normalVitals = computePreHdVitalsMetrics({
    tdSistolik: '145',
    tdDiastolik: '85',
    posisiTd: 'Duduk',
    nadi: '80',
    pernapasan: '20',
    suhu: '36.6',
    spo2: '98'
  });

  assert.equal(normalVitals.mapMmHg, 105);
  assert.equal(normalVitals.severity, 'normal');
  assert.equal(normalVitals.isComplete, true);

  const criticalVitals = computePreHdVitalsMetrics({
    tdSistolik: '84',
    tdDiastolik: '55',
    posisiTd: 'Berbaring',
    nadi: '115',
    pernapasan: '26',
    suhu: '38.1',
    spo2: '91'
  });

  assert.equal(criticalVitals.severity, 'critical');
  assert.ok(criticalVitals.alerts.length >= 3);
  assert.match(
    formatPoin3_3Note({
      tdSistolik: '145',
      tdDiastolik: '85',
      posisiTd: 'Duduk',
      nadi: '80',
      pernapasan: '20',
      suhu: '36.6',
      spo2: '98'
    }),
    /TD Pre: 145\/85 mmHg \(Duduk, MAP 105\)/
  );
});

test('Poin 3.5: Waktu Dialisis/Time, Target UFG, QB, QD, and Dosis Heparin tracking', () => {
  const incomplete = {
    waktuDialisis: '4.5',
    targetUfg: '2500',
    qb: '220',
    qd: '500',
    dosisHeparin: ''
  };
  assert.equal(isPoin3_5Complete(incomplete), false);

  const complete = {
    waktuDialisis: '4.5',
    targetUfg: '2500',
    qb: '220',
    qd: '500',
    dosisHeparin: '2000 IU'
  };
  assert.equal(isPoin3_5Complete(complete), true);
  const note = formatPoin3_5Note(complete);
  assert.match(note, /Time: 4\.5 jam/);
  assert.match(note, /Target UFG: 2\.500 mL/);
  assert.match(note, /QB: 220 mL\/mnt/);
  assert.match(note, /QD: 500 mL\/mnt/);
  assert.match(note, /Dosis Heparin: 2000 IU/);
});

test('Poin 3.6: Vascular access CIMINO, CDL, and FEMORAL tracking & session mapping', () => {
  const empty3_6 = createDefaultPatientClinicalDetails('new').poin3_6;
  assert.equal(isPoin3_6Complete(empty3_6), false);
  assert.equal(formatPoin3_6Note(empty3_6), '');

  const ciminoOnly = {
    ciminoAktif: true,
    cimino: 'Sinistra, thrill (+) kuat',
    cdlAktif: false,
    cdl: '-',
    femoralAktif: false,
    femoral: '-'
  };
  assert.equal(isPoin3_6Complete(ciminoOnly), true);
  assert.match(formatPoin3_6Note(ciminoOnly), /CIMINO: Sinistra, thrill \(\+\) kuat/);
  const mappedCimino = resolveSessionAccessFromPoin3_6(ciminoOnly);
  assert.equal(mappedCimino.vascularAccess, 'av_fistula');
  assert.match(mappedCimino.accessSite, /CIMINO/);

  const femoralOnly = {
    ciminoAktif: false,
    cimino: '',
    cdlAktif: false,
    cdl: '',
    femoralAktif: true,
    femoral: 'Femoralis Dextra, lancar'
  };
  assert.equal(isPoin3_6Complete(femoralOnly), true);
  assert.match(formatPoin3_6Note(femoralOnly), /FEMORAL: Femoralis Dextra, lancar/);
  const mappedFemoral = resolveSessionAccessFromPoin3_6(femoralOnly);
  assert.equal(mappedFemoral.vascularAccess, 'cdl_non_tunnel');
  assert.match(mappedFemoral.accessSite, /FEMORAL \(Femoralis Dextra, lancar\)/);
  assert.equal(mappedFemoral.accessTypeLabel, 'FEMORAL');
});

test('Default new logbook clinical details & legacy normalization start completely unchecked', () => {
  const fresh = createDefaultPatientClinicalDetails('new');
  const p21Counts = getPoin2_1Counts(fresh.poin2_1);
  assert.equal(p21Counts.apdChecked, false);
  assert.equal(p21Counts.handwashChecked, false);
  assert.equal(p21Counts.checkedCount, 0);
  assert.equal(p21Counts.isComplete, false);
  assert.match(
    formatPoin2_1Note(fresh.poin2_1),
    /HAND HYGIENE: Belum Dilaksanakan \| PENGGUNAAN APD: Belum Dilaksanakan/
  );

  const p31Counts = getPoin3_1Counts(fresh.poin3_1);
  assert.equal(p31Counts.verbalCount, 0);
  assert.equal(p31Counts.nonVerbalCount, 0);
  assert.equal(p31Counts.isComplete, false);
  assert.equal(isPoin3_2LogbookComplete(fresh.poin3_2), false);
  assert.equal(isPoin3_3LogbookComplete(fresh.poin3_3), false);
  assert.equal(isPoin3_5Complete(fresh.poin3_5), false);
  assert.equal(isPoin3_6Complete(fresh.poin3_6), false);
  assert.equal(isPoin4_3Complete(fresh.poin4_3), false);

  // Legacy stored object missing poin3_5, poin3_6 & poin4_3
  const normalizedLegacy = normalizePatientClinicalDetails({
    poin2_1: { apd: true, cuciTangan: true },
    poin3_3: { tdSistolik: '150', tdDiastolik: '90' }
  });
  assert.equal(normalizedLegacy.poin3_3.tdPreHd, '150/90');
  assert.equal(normalizedLegacy.poin3_5.waktuDialisis, '');
  assert.equal(normalizedLegacy.poin3_6.ciminoAktif, false);
  assert.equal(normalizedLegacy.poin4_3.tidakAdaKomplikasi, false);
  assert.equal(normalizedLegacy.poin4_3.hipotensiAktif, false);

  const fallbackEmpty = normalizePoin2_1Data(undefined);
  assert.equal(fallbackEmpty.apd, false);
  assert.equal(fallbackEmpty.cuciTangan, false);
});

test('Poin 4.3: 10 Komplikasi HD inputs including Clotting, First-Use Syndrome / Alergi, and Akses Bleeding / Hematom Post-HD', () => {
  assert.deepEqual(
    KOMPLIKASI_INTRA_HD_ITEMS.map((it) => it.label),
    [
      'Hipertensi',
      'Hipotensi',
      'Kram Otot',
      'Hipoglikemi',
      'Mual',
      'Muntah',
      'Penurunan Kesadaran',
      'Clotting',
      'First-Use Syndrome / Alergi',
      'Akses Bleeding / Hematom Post-HD'
    ]
  );

  const empty4_3 = createEmptyPoin4_3Data();
  assert.equal(isPoin4_3Complete(empty4_3), false);
  assert.equal(formatPoin4_3Note(empty4_3), '');

  const nihil4_3 = normalizePoin4_3Data({ tidakAdaKomplikasi: true });
  assert.equal(isPoin4_3Complete(nihil4_3), true);
  assert.match(formatPoin4_3Note(nihil4_3), /Tidak Ada Komplikasi/);

  // Entering active complications overrides tidakAdaKomplikasi and maps cleanly
  const multiComp = normalizePoin4_3Data({
    tidakAdaKomplikasi: true,
    hipertensi: 'TD 190/100 mmHg, Amlodipin',
    hipotensi: 'TD 85/50 mmHg, bolus NaCl 100 mL',
    kramOtot: 'Betis kanan, masase',
    hipoglikemi: 'GDS 58 mg/dL, D40% 25 mL',
    mual: 'Ondansetron 4 mg IV',
    muntah: 'Muntah 1x 50 mL',
    penurunanKesadaran: 'Somnolen GCS E3V4M5, O2 3 lpm',
    clotting: 'Clotting dialyzer, bilas NaCl 100 mL',
    firstUseSyndrome: 'Sesak & urtikaria jam ke-1, advis DPJP',
    aksesBleeding: 'Rembes kanulasi AVF, balut tekan 15 menit'
  });

  assert.equal(multiComp.tidakAdaKomplikasi, false);
  assert.equal(isPoin4_3Complete(multiComp), true);
  const formattedNote = formatPoin4_3Note(multiComp);
  assert.match(formattedNote, /Hipertensi.*TD 190\/100 mmHg/);
  assert.match(formattedNote, /Hipotensi.*TD 85\/50 mmHg/);
  assert.match(formattedNote, /Kram Otot.*Betis kanan/);
  assert.match(formattedNote, /Hipoglikemi.*GDS 58 mg\/dL/);
  assert.match(formattedNote, /Mual.*Ondansetron 4 mg IV/);
  assert.match(formattedNote, /Muntah.*Muntah 1x 50 mL/);
  assert.match(formattedNote, /Penurunan Kesadaran.*Somnolen/);
  assert.match(formattedNote, /Clotting.*Clotting dialyzer/);
  assert.match(formattedNote, /First-Use Syndrome.*Sesak & urtikaria/);
  assert.match(formattedNote, /Akses Bleeding.*Rembes kanulasi AVF/);

  const sessionComp = resolveSessionComplicationsFromPoin4_3(multiComp);
  assert.equal(sessionComp.hasAnyInput, true);
  assert.equal(sessionComp.activeCount, 10);
  assert.equal(sessionComp.hasHypotension, true);
  assert.equal(sessionComp.hypotensionBp, '85/50');
  assert.match(sessionComp.hypotensionAction || '', /bolus NaCl 100 mL/);
  assert.equal(sessionComp.hasMuscleCramps, true);
  assert.match(sessionComp.muscleCrampAction || '', /Betis kanan/);
  assert.equal(sessionComp.hasClotting, true);
  assert.match(sessionComp.clottingDetails || '', /Clotting dialyzer/);
  assert.equal(sessionComp.hasFirstUseSyndrome, true);
  assert.match(sessionComp.firstUseDetails || '', /Sesak & urtikaria/);
  assert.equal(sessionComp.hasAccessBleeding, true);
  assert.match(sessionComp.accessBleedingAction || '', /Rembes kanulasi AVF/);
  assert.equal(sessionComp.hasPenurunanKesadaran, true);
});

test('Poin 4.3: Dynamic Dropdown model with Jam Kejadian and Kolom Advis Dokter', () => {
  // Test PILIHAN_KOMPLIKASI_DROPDOWN presence & defaults
  assert.equal(PILIHAN_KOMPLIKASI_DROPDOWN.length >= 10, true);
  const defaultHypoAdvis = getDefaultAdvisForJenis('Hipotensi');
  assert.match(defaultHypoAdvis, /Trendelenburg|NaCl 0.9%/);

  // Create default entry
  const entry = createDefaultPoin4_3Entry('Hipotensi', '09:30');
  assert.equal(entry.jenis, 'Hipotensi');
  assert.equal(entry.jam, '09:30');
  assert.match(entry.advisDokter, /Trendelenburg/);

  // Normalize data with dynamic entries
  const withEntries = normalizePoin4_3Data({
    entries: [
      {
        id: 'c1',
        jenis: 'Hipotensi',
        jam: '09:30',
        advisDokter: 'Bolus NaCl 0.9% 100 mL, turunkan UF rate'
      },
      {
        id: 'c2',
        jenis: 'Kram Otot',
        jam: '11:15',
        advisDokter: 'Masase lokal & kompres hangat'
      }
    ]
  });

  assert.equal(isPoin4_3Complete(withEntries), true);
  assert.equal(withEntries.entries?.length, 2);
  const formatted = formatPoin4_3Note(withEntries);
  assert.match(formatted, /Hipotensi \(Jam 09:30, Advis: Bolus NaCl 0\.9% 100 mL/);
  assert.match(formatted, /Kram Otot \(Jam 11:15, Advis: Masase lokal/);

  // Session complication resolution maps both dynamic entries correctly
  const resolved = resolveSessionComplicationsFromPoin4_3(withEntries);
  assert.equal(resolved.hasAnyInput, true);
  assert.equal(resolved.hasHypotension, true);
  assert.match(resolved.hypotensionAction || '', /09:30/);
  assert.equal(resolved.hasMuscleCramps, true);
  assert.match(resolved.muscleCrampAction || '', /11:15/);
  assert.equal(resolved.complicationNames, 'Hipotensi, Kram Otot');
  assert.equal(
    resolved.doctorAdviceSummary,
    'Bolus NaCl 0.9% 100 mL, turunkan UF rate; Masase lokal & kompres hangat'
  );
});

test('Logbook Bagian 6 contains exact 5 Post-HD SPO items (6.1-6.5) across 29 total SPO', async () => {
  const { OFFICIAL_LOGBOOK_ITEMS } = await import('../data/officialPelaksanaLogbookData.ts');

  const bagian6Items = OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian === 6);
  assert.equal(bagian6Items.length, 5);
  assert.deepEqual(
    bagian6Items.map((it) => ({ code: it.code, description: it.description })),
    [
      { code: '6.1', description: 'Terminasi HD Aman (Washback)' },
      { code: '6.2', description: 'Hemostasis & Balut Tekan Akses' },
      { code: '6.3', description: 'Evaluasi TTV & Berat Badan Post-HD' },
      { code: '6.4', description: 'Disinfeksi Mesin HD (Heat / Chemical)' },
      { code: '6.5', description: 'Dokumentasi Asuhan & Rekam Medis (CPPT)' }
    ]
  );

  const facilityItems = OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian === 1);
  const patientSpoItems = OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian >= 2 && it.bagian <= 6);
  assert.equal(facilityItems.length, 3);
  assert.equal(patientSpoItems.length, 26);
  assert.equal(OFFICIAL_LOGBOOK_ITEMS.length, 29);
});

test('Poin 6.3: Evaluasi TTV & Berat Badan Post-HD (TD Post HD, UFG Tercapai, KT/V)', () => {
  const empty = normalizePoin6_3Data(null);
  assert.equal(empty.tdPostHd, '');
  assert.equal(empty.ufgTercapai, '');
  assert.equal(empty.ktV, '');
  assert.equal(isPoin6_3Complete(empty), false);
  assert.equal(formatPoin6_3Note(empty), 'Evaluasi Post-HD: TTV & UFG Tercapai stabil');

  const filled = normalizePoin6_3Data({
    tdPostHd: '120/80',
    ufgTercapai: '2500',
    ktV: '1.8'
  });
  assert.equal(filled.tdPostHd, '120/80');
  assert.equal(filled.ufgTercapai, '2500');
  assert.equal(filled.ktV, '1.8');
  assert.equal(isPoin6_3Complete(filled), true);
  assert.equal(
    formatPoin6_3Note(filled),
    'Evaluasi Post-HD: TD Post: 120/80 mmHg | UFG Tercapai: 2500 mL | Kt/V: 1.8'
  );

  const partial = normalizePoin6_3Data({
    tdPostHd: '130/80'
  });
  assert.equal(isPoin6_3Complete(partial), true);
  assert.equal(formatPoin6_3Note(partial), 'Evaluasi Post-HD: TD Post: 130/80 mmHg');

  // Verify integration in normalizePatientClinicalDetails
  const fullPat = normalizePatientClinicalDetails({
    poin6_3: { tdPostHd: '115/75', ufgTercapai: '2800', ktV: '1.9' }
  });
  assert.equal(fullPat.poin6_3.tdPostHd, '115/75');
  assert.equal(fullPat.poin6_3.ufgTercapai, '2800');
  assert.equal(fullPat.poin6_3.ktV, '1.9');
});

