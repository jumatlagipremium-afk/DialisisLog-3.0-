import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  CheckCircle2,
  Clock,
  RotateCcw,
  Printer,
  Check,
  AlertTriangle,
  Edit3,
  Save,
  Square,
  MessageSquare,
  Info,
  CheckSquare,
  Plus,
  Trash2,
  AlertCircle
} from 'lucide-react';
import { PatientHDSession, ShiftInfo, SystemAccessRole } from '../types/dialysis.ts';
import { OFFICIAL_LOGBOOK_ITEMS } from '../data/officialPelaksanaLogbookData.ts';
import { PjVerificationStatus } from './Logbook5ButtonsView.tsx';
import { PelaksanaLogbookPrintableModal } from './PelaksanaLogbookPrintableModal.tsx';
import { ensureFullBagianData } from '../utils/logbookStandards.ts';
import {
  getNursePatientStatusesKey,
  getNursePatientNotesKey,
  getNurseClinicalDetailsKey,
  readNurseFacilityStatuses
} from '../utils/nurseVerificationHelpers.ts';
import {
  Poin3_1ClinicalData,
  Poin3_2ClinicalData,
  Poin3_5ClinicalData,
  Poin4_3ClinicalData,
  Poin4_3ComplicationKey,
  Poin4_3DynamicEntry,
  PILIHAN_KOMPLIKASI_DROPDOWN,
  getDefaultAdvisForJenis,
  createDefaultPoin4_3Entry,
  KOMPLIKASI_INTRA_HD_ITEMS,
  PatientLogbookClinicalDetails,
  normalizePoin4_3Data,
  normalizePatientClinicalDetails,
  parseClinicalNumber,
  formatPoin3_1Note,
  getPoin3_1Counts,
  isPoin3_2LogbookComplete,
  formatPoin3_2LogbookNote,
  parsePreBpInput,
  isPoin3_3LogbookComplete,
  formatPoin3_3LogbookNote,
  isPoin3_5Complete,
  formatPoin3_5Note,
  isMeaningfulAccessInput,
  isPoin3_6Complete,
  formatPoin3_6Note,
  resolveSessionAccessFromPoin3_6,
  createEmptyPoin4_3Data,
  getActivePoin4_3Complications,
  isPoin4_3Complete,
  formatPoin4_3Note,
  resolveSessionComplicationsFromPoin4_3,
  Poin6_3ClinicalData,
  isPoin6_3Complete,
  formatPoin6_3Note
} from '../utils/logbookClinicalHelpers.ts';
import { getCurrentIndonesianFullDate } from '../utils/dateHelpers.ts';

export interface PatientLogbookEditPayload {
  patientId: string;
  patientStatuses: Record<string, boolean>;
  patientNotes: Record<string, string>;
  facilityStatuses: Record<string, boolean>;
  updatedSession: PatientHDSession;
  score: number;
  grade: string;
  verifierNotes: string;
  status?: PjVerificationStatus;
  isCorrected?: boolean;
}

interface PatientLogbookVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: {
    id?: string;
    bedNumber: string;
    patientName: string;
    medicalRecord?: string;
    completed?: number;
    total?: number;
    score?: number;
    grade?: string;
    isCorrected?: boolean;
  };
  nurseName: string;
  nurseNip?: string;
  shiftInfo?: ShiftInfo;
  userRole: SystemAccessRole;
  verifierName: string;
  session?: PatientHDSession;
  verificationStatus: PjVerificationStatus;
  verifiedAt?: string;
  verifiedBy?: string;
  verifiedByRole?: string;
  verifierNotes?: string;
  initialScore?: number;
  initialGrade?: string;
  isInitiallyCorrected?: boolean;
  onSaveSession?: (session: PatientHDSession) => void;
  onSaveLogbookEdits?: (payload: PatientLogbookEditPayload) => void;
  onVerifyApprove: (
    patientIdentifier: string,
    notes: string,
    evaluation?: { score?: number; grade?: string; isCorrected?: boolean }
  ) => void;
  onVerifyRevise: (
    patientIdentifier: string,
    notes: string,
    evaluation?: { score?: number; grade?: string; isCorrected?: boolean }
  ) => void;
}

export function computeGradeFromScore(score: number): {
  grade: string;
  label: string;
  colorClass: string;
  badgeBg: string;
} {
  if (score >= 90) {
    return {
      grade: 'A',
      label: 'Sangat Baik & Mandiri',
      colorClass: 'text-emerald-700 border-emerald-300 bg-emerald-50',
      badgeBg: 'bg-emerald-600 text-white'
    };
  }
  if (score >= 80) {
    return {
      grade: 'B',
      label: 'Baik & Kompeten',
      colorClass: 'text-blue-700 border-blue-300 bg-blue-50',
      badgeBg: 'bg-blue-600 text-white'
    };
  }
  if (score >= 70) {
    return {
      grade: 'C',
      label: 'Cukup (Perlu Bimbingan Supervisi)',
      colorClass: 'text-amber-800 border-amber-300 bg-amber-50',
      badgeBg: 'bg-amber-600 text-white'
    };
  }
  return {
    grade: 'D',
    label: 'Kurang (Perlu Re-Edukasi SPO)',
    colorClass: 'text-rose-800 border-rose-300 bg-rose-50',
    badgeBg: 'bg-rose-600 text-white'
  };
}

export const PatientLogbookVerificationModal: React.FC<PatientLogbookVerificationModalProps> = ({
  isOpen,
  onClose,
  patient,
  nurseName,
  nurseNip,
  shiftInfo,
  userRole,
  verifierName,
  session,
  verificationStatus,
  verifiedAt,
  verifiedBy,
  verifiedByRole,
  verifierNotes = '',
  initialScore,
  isInitiallyCorrected = false,
  onSaveSession,
  onSaveLogbookEdits,
  onVerifyApprove,
  onVerifyRevise
}) => {
  const [activeTab, setActiveTab] = useState<'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'b6'>('b1');
  const [noteInput, setNoteInput] = useState(verifierNotes);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [innerToast, setInnerToast] = useState<string | null>(null);

  // Evaluation & Scoring state preserved for data schema compatibility
  const [score] = useState<number>(() => {
    if (typeof initialScore === 'number') return initialScore;
    if (typeof patient.score === 'number') return patient.score;
    return 95;
  });
  const [hasModifiedAnything, setHasModifiedAnything] = useState(isInitiallyCorrected);

  // Item specific correction notes toggle
  const [activeNoteEditItem, setActiveNoteEditItem] = useState<string | null>(null);

  const showInnerToast = (msg: string) => {
    setInnerToast(msg);
    setTimeout(() => {
      setInnerToast((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

  const patientKey = patient.id || patient.bedNumber;

  // Retrieve initial per-nurse patient SPO statuses
  const [patientStatuses, setPatientStatuses] = useState<Record<string, boolean>>(() => {
    try {
      const rawStat = localStorage.getItem(getNursePatientStatusesKey(nurseName));
      if (rawStat) {
        const parsed = JSON.parse(rawStat);
        if (patient.id && parsed[patient.id]) return parsed[patient.id];
        if (parsed[patient.bedNumber]) return parsed[patient.bedNumber];
      }
    } catch {
      // fallback
    }
    const defaults: Record<string, boolean> = {};
    OFFICIAL_LOGBOOK_ITEMS.forEach((it) => {
      defaults[it.code] = false;
    });
    return defaults;
  });

  // Track modified items to show "(Dikoreksi Verifikator)" badge
  const [modifiedItems, setModifiedItems] = useState<Record<string, boolean>>({});

  // Patient notes per item scoped to managing nurse
  const [patientNotes, setPatientNotes] = useState<Record<string, string>>(() => {
    try {
      const rawNotes = localStorage.getItem(getNursePatientNotesKey(nurseName));
      if (rawNotes) {
        const parsed = JSON.parse(rawNotes);
        if (patient.id && parsed[patient.id]) return parsed[patient.id];
        if (parsed[patient.bedNumber]) return parsed[patient.bedNumber];
      }
    } catch {
      // fallback
    }
    return {};
  });

  // Facility (Bagian I) Statuses scoped to the submitting nurse
  const [facilityStatuses, setFacilityStatuses] = useState<Record<string, boolean>>(() =>
    readNurseFacilityStatuses(nurseName)
  );

  // Structured Bagian 3 clinical inputs scoped to managing nurse & patient
  const [clinicalDetail, setClinicalDetail] = useState<PatientLogbookClinicalDetails>(() => {
    try {
      const rawClin = localStorage.getItem(getNurseClinicalDetailsKey(nurseName));
      if (rawClin) {
        const parsed = JSON.parse(rawClin) as Record<string, unknown>;
        if (parsed && typeof parsed === 'object') {
          const found =
            (patient.id && parsed[patient.id]) || parsed[patient.bedNumber];
          if (found) {
            return normalizePatientClinicalDetails(found);
          }
        }
      }
    } catch {
      // fallback
    }
    return normalizePatientClinicalDetails(undefined);
  });

  // Ensure full 5-bagian session data for clinical parameters (stateful for live supervisor editing)
  const [editableSession, setEditableSession] = useState<PatientHDSession>(() => {
    if (session) {
      return ensureFullBagianData(session);
    }
    return ensureFullBagianData({
      id: patient.id || 'p-temp',
      bedNumber: patient.bedNumber,
      patientName: patient.patientName,
      medicalRecordNumber: patient.medicalRecord || '452101',
      age: 56,
      gender: 'L',
      status: 'rajal',
      category: 'reguler',
      sessionStatus: 'selesai',
      isCito: false,
      vascularAccess: 'av_fistula',
      accessSite: 'AVF Radiocephalica Dextra',
      dialyzerModel: 'SAS HF 18',
      isReuse: false,
      dryWeight: 60.0,
      preWeight: 62.5,
      postWeight: 60.0,
      targetUf: 2500,
      achievedUf: 2500,
      durationPrescribed: 4.5,
      durationActual: 4.5,
      bloodFlowQb: 220,
      dialysateFlowQd: 500,
      preBp: '140/90',
      postBp: '120/80',
      hasHypotension: false,
      hasMuscleCramps: false,
      hasClotting: false,
      hasFirstUseSyndrome: false,
      hasAccessBleeding: false,
      hasConsultDpjp: false,
      underUfTolerated: false,
      nurseInCharge: nurseName,
      nurseNotes: 'HD lancar, target UF tercapai, edukasi dipahami',
      updatedAt: new Date().toISOString()
    });
  });

  if (!isOpen) return null;

  const b1Items = OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian === 1);
  const b2Items = OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian === 2);
  const b3Items = OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian === 3);
  const b4Items = OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian === 4);
  const b5Items = OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian === 5);
  const b6Items = OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian === 6);

  const b1Completed = b1Items.filter((it) => Boolean(facilityStatuses[it.code])).length;
  const getCompletedCount = (items: typeof b2Items) => {
    return items.filter((it) => Boolean(patientStatuses[it.code])).length;
  };

  const b2Completed = getCompletedCount(b2Items);
  const b3Completed = getCompletedCount(b3Items);
  const b4Completed = getCompletedCount(b4Items);
  const b5Completed = getCompletedCount(b5Items);
  const b6Completed = getCompletedCount(b6Items);
  const grandTotalSpo =
    b1Items.length +
    b2Items.length +
    b3Items.length +
    b4Items.length +
    b5Items.length +
    b6Items.length;
  const grandCompletedSpo =
    b1Completed + b2Completed + b3Completed + b4Completed + b5Completed + b6Completed;
  const grandPct = Math.round((grandCompletedSpo / grandTotalSpo) * 100);

  const gradeInfo = computeGradeFromScore(score);

  // Toggle single SPO item status
  const handleToggleItemStatus = (code: string, isBagian1: boolean) => {
    setHasModifiedAnything(true);
    setModifiedItems((prev) => ({ ...prev, [code]: true }));

    if (isBagian1) {
      setFacilityStatuses((prev) => {
        const next = { ...prev, [code]: !Boolean(prev[code]) };
        return next;
      });
      showInnerToast(`Koreksi butir SPO ${code} diperbarui.`);
    } else {
      setPatientStatuses((prev) => {
        const next = { ...prev, [code]: !Boolean(prev[code]) };
        return next;
      });
      showInnerToast(`Koreksi butir SPO ${code} diperbarui.`);
    }
  };

  // Bulk check all items in current tab
  const handleBulkCheckBagian = (targetBagian: number, markAs: boolean) => {
    setHasModifiedAnything(true);
    const targetItems = OFFICIAL_LOGBOOK_ITEMS.filter((it) => it.bagian === targetBagian);
    const newModified = { ...modifiedItems };

    if (targetBagian === 1) {
      setFacilityStatuses((prev) => {
        const next = { ...prev };
        targetItems.forEach((it) => {
          next[it.code] = markAs;
          newModified[it.code] = true;
        });
        return next;
      });
    } else {
      setPatientStatuses((prev) => {
        const next = { ...prev };
        targetItems.forEach((it) => {
          next[it.code] = markAs;
          newModified[it.code] = true;
        });
        return next;
      });
      if (targetBagian === 4) {
        if (!markAs) {
          const cleared4_3 = createEmptyPoin4_3Data();
          setClinicalDetail((prev) => ({ ...prev, poin4_3: cleared4_3 }));
          setPatientNotes((prev) => ({ ...prev, '4.3': '' }));
        } else if (!isPoin4_3Complete(clinicalDetail.poin4_3)) {
          const nihil4_3 = { ...createEmptyPoin4_3Data(), tidakAdaKomplikasi: true };
          setClinicalDetail((prev) => ({ ...prev, poin4_3: nihil4_3 }));
          setPatientNotes((prev) => ({ ...prev, '4.3': formatPoin4_3Note(nihil4_3) }));
        }
      }
    }

    setModifiedItems(newModified);
    showInnerToast(
      `Semua butir Bagian ${targetBagian} ditandai ${markAs ? 'DILAKSANAKAN' : 'Belum Lengkap'}.`
    );
  };

  const markModifiedCode = (code: string, isChecked: boolean, noteText: string) => {
    setHasModifiedAnything(true);
    setModifiedItems((prev) => ({ ...prev, [code]: true }));
    setPatientStatuses((prev) => ({ ...prev, [code]: isChecked }));
    setPatientNotes((prev) => ({ ...prev, [code]: noteText }));
  };

  const updateVerifPoin3_1 = (patch: Partial<Poin3_1ClinicalData>) => {
    const next3_1: Poin3_1ClinicalData = {
      ...clinicalDetail.poin3_1,
      ...patch,
      verbal: {
        ...clinicalDetail.poin3_1.verbal,
        ...(patch.verbal || {})
      },
      nonVerbal: {
        ...clinicalDetail.poin3_1.nonVerbal,
        ...(patch.nonVerbal || {})
      }
    };
    if (patch.status === 'RAWAT JALAN') {
      next3_1.ruangRawatInap = '';
    }
    setClinicalDetail((prev) => ({ ...prev, poin3_1: next3_1 }));
    markModifiedCode(
      '3.1',
      getPoin3_1Counts(next3_1).isComplete,
      formatPoin3_1Note(next3_1, patient.patientName, patient.medicalRecord)
    );

    if (patch.status) {
      setEditableSession((prev) =>
        ensureFullBagianData({
          ...prev,
          status: patch.status === 'RAWAT INAP' ? 'ranap' : 'rajal'
        })
      );
    }
    if (patch.kategori) {
      const cat =
        patch.kategori === 'ISOLASI HEPATITIS B'
          ? 'hepatitis_b'
          : patch.kategori === 'ISOLASI HEPATITIS C/HIV'
          ? 'hepatitis_c'
          : 'reguler';
      setEditableSession((prev) =>
        ensureFullBagianData({
          ...prev,
          category: cat
        })
      );
    }
  };

  const updateVerifPoin3_2 = (patch: Partial<Poin3_2ClinicalData>) => {
    const next3_2: Poin3_2ClinicalData = {
      ...clinicalDetail.poin3_2,
      ...patch
    };
    setClinicalDetail((prev) => ({ ...prev, poin3_2: next3_2 }));
    markModifiedCode('3.2', isPoin3_2LogbookComplete(next3_2), formatPoin3_2LogbookNote(next3_2));

    const pre = parseClinicalNumber(next3_2.bbPre);
    const post = parseClinicalNumber(next3_2.bbPost);
    const dry = parseClinicalNumber(next3_2.bbKering);
    setEditableSession((prev) =>
      ensureFullBagianData({
        ...prev,
        preWeight: pre !== null && pre > 0 ? pre : prev.preWeight,
        postWeight: post !== null && post > 0 ? post : prev.postWeight,
        dryWeight: dry !== null && dry > 0 ? dry : prev.dryWeight
      })
    );
  };

  const updateVerifPoin3_3 = (rawTdPreHd: string) => {
    const parsedBp = parsePreBpInput(rawTdPreHd);
    const next3_3 = {
      ...clinicalDetail.poin3_3,
      tdPreHd: rawTdPreHd,
      tdSistolik: parsedBp.tdSistolik,
      tdDiastolik: parsedBp.tdDiastolik
    };
    setClinicalDetail((prev) => ({ ...prev, poin3_3: next3_3 }));
    markModifiedCode('3.3', isPoin3_3LogbookComplete(next3_3), formatPoin3_3LogbookNote(next3_3));

    if (rawTdPreHd.trim()) {
      setEditableSession((prev) =>
        ensureFullBagianData({
          ...prev,
          preBp: rawTdPreHd.trim()
        })
      );
    }
  };

  const updateVerifPoin3_5 = (patch: Partial<Poin3_5ClinicalData>) => {
    const next3_5: Poin3_5ClinicalData = {
      ...clinicalDetail.poin3_5,
      ...patch
    };
    setClinicalDetail((prev) => ({ ...prev, poin3_5: next3_5 }));
    markModifiedCode('3.5', isPoin3_5Complete(next3_5), formatPoin3_5Note(next3_5));

    const dur = parseClinicalNumber(next3_5.waktuDialisis);
    const ufg = parseClinicalNumber(next3_5.targetUfg);
    const qb = parseClinicalNumber(next3_5.qb);
    const qd = parseClinicalNumber(next3_5.qd);
    setEditableSession((prev) =>
      ensureFullBagianData({
        ...prev,
        durationPrescribed: dur !== null && dur > 0 ? dur : prev.durationPrescribed,
        durationActual: dur !== null && dur > 0 ? dur : prev.durationActual,
        targetUf: ufg !== null && ufg >= 0 ? Math.round(ufg) : prev.targetUf,
        bloodFlowQb: qb !== null && qb > 0 ? Math.round(qb) : prev.bloodFlowQb,
        dialysateFlowQd: qd !== null && qd > 0 ? Math.round(qd) : prev.dialysateFlowQd
      })
    );
  };

  const updateVerifPoin3_6Toggle = (accessKey: 'cimino' | 'cdl' | 'femoral') => {
    const prev3_6 = clinicalDetail.poin3_6;
    const activeField =
      accessKey === 'cimino'
        ? 'ciminoAktif'
        : accessKey === 'cdl'
        ? 'cdlAktif'
        : 'femoralAktif';
    const currentlyActive =
      Boolean(prev3_6[activeField]) || isMeaningfulAccessInput(prev3_6[accessKey]);
    const nextActive = !currentlyActive;
    const next3_6 = {
      ...prev3_6,
      [activeField]: nextActive,
      ...(nextActive ? {} : { [accessKey]: '' })
    };
    setClinicalDetail((prev) => ({ ...prev, poin3_6: next3_6 }));
    markModifiedCode('3.6', isPoin3_6Complete(next3_6), formatPoin3_6Note(next3_6));

    const resolved = resolveSessionAccessFromPoin3_6(
      next3_6,
      editableSession.vascularAccess,
      editableSession.accessSite || 'AVF Radiocephalica'
    );
    setEditableSession((prev) =>
      ensureFullBagianData({
        ...prev,
        vascularAccess: resolved.vascularAccess,
        accessSite: resolved.accessSite
      })
    );
  };

  const updateVerifPoin3_6Text = (
    accessKey: 'cimino' | 'cdl' | 'femoral',
    textValue: string
  ) => {
    const activeField =
      accessKey === 'cimino'
        ? 'ciminoAktif'
        : accessKey === 'cdl'
        ? 'cdlAktif'
        : 'femoralAktif';
    const next3_6 = {
      ...clinicalDetail.poin3_6,
      [accessKey]: textValue,
      [activeField]: isMeaningfulAccessInput(textValue)
    };
    setClinicalDetail((prev) => ({ ...prev, poin3_6: next3_6 }));
    markModifiedCode('3.6', isPoin3_6Complete(next3_6), formatPoin3_6Note(next3_6));

    const resolved = resolveSessionAccessFromPoin3_6(
      next3_6,
      editableSession.vascularAccess,
      editableSession.accessSite || 'AVF Radiocephalica'
    );
    setEditableSession((prev) =>
      ensureFullBagianData({
        ...prev,
        vascularAccess: resolved.vascularAccess,
        accessSite: resolved.accessSite
      })
    );
  };

  const syncEditableSessionFromPoin4_3 = (next4_3: Poin4_3ClinicalData) => {
    const resolvedComp = resolveSessionComplicationsFromPoin4_3(next4_3);
    setEditableSession((prev) =>
      ensureFullBagianData({
        ...prev,
        hasHypotension: resolvedComp.hasHypotension,
        hypotensionBp: resolvedComp.hypotensionBp,
        hypotensionAction: resolvedComp.hypotensionAction,
        hasMuscleCramps: resolvedComp.hasMuscleCramps,
        muscleCrampAction: resolvedComp.muscleCrampAction,
        hasClotting: resolvedComp.hasClotting,
        clottingDetails: resolvedComp.clottingDetails,
        hasFirstUseSyndrome: resolvedComp.hasFirstUseSyndrome,
        firstUseDetails: resolvedComp.firstUseDetails,
        hasAccessBleeding: resolvedComp.hasAccessBleeding,
        accessBleedingAction: resolvedComp.accessBleedingAction,
        hasConsultDpjp:
          resolvedComp.hasPenurunanKesadaran || resolvedComp.hasFirstUseSyndrome
            ? true
            : prev.hasConsultDpjp,
        bagian4: undefined
      })
    );
  };

  const updateVerifPoin4_3NoComplication = () => {
    const nextNoComp = !clinicalDetail.poin4_3.tidakAdaKomplikasi;
    const next4_3: Poin4_3ClinicalData = nextNoComp
      ? { ...createEmptyPoin4_3Data(), tidakAdaKomplikasi: true, entries: [] }
      : { ...clinicalDetail.poin4_3, tidakAdaKomplikasi: false };
    setClinicalDetail((prev) => ({ ...prev, poin4_3: next4_3 }));
    markModifiedCode('4.3', isPoin4_3Complete(next4_3), formatPoin4_3Note(next4_3));
    syncEditableSessionFromPoin4_3(next4_3);
  };

  const addVerifPoin4_3Entry = (defaultJenis: string = 'Hipotensi') => {
    const currentEntries = clinicalDetail.poin4_3.entries ? [...clinicalDetail.poin4_3.entries] : [];
    const newEntry = createDefaultPoin4_3Entry(defaultJenis);
    const nextEntries = [...currentEntries, newEntry];
    const next4_3: Poin4_3ClinicalData = normalizePoin4_3Data({
      ...clinicalDetail.poin4_3,
      entries: nextEntries,
      tidakAdaKomplikasi: false
    });
    setClinicalDetail((prev) => ({ ...prev, poin4_3: next4_3 }));
    markModifiedCode('4.3', isPoin4_3Complete(next4_3), formatPoin4_3Note(next4_3));
    syncEditableSessionFromPoin4_3(next4_3);
  };

  const updateVerifPoin4_3Entry = (
    entryId: string,
    patch: Partial<Poin4_3DynamicEntry>
  ) => {
    const currentEntries = clinicalDetail.poin4_3.entries ? [...clinicalDetail.poin4_3.entries] : [];
    const updatedEntries = currentEntries.map((e) => {
      if (e.id !== entryId) return e;
      const updated: Poin4_3DynamicEntry = { ...e, ...patch };
      if (patch.jenis && patch.jenis !== e.jenis) {
        const prevDefault = getDefaultAdvisForJenis(e.jenis);
        if (
          !e.advisDokter ||
          e.advisDokter.trim() === '' ||
          e.advisDokter.trim() === prevDefault.trim()
        ) {
          updated.advisDokter = getDefaultAdvisForJenis(patch.jenis);
        }
      }
      return updated;
    });
    const next4_3: Poin4_3ClinicalData = normalizePoin4_3Data({
      ...clinicalDetail.poin4_3,
      entries: updatedEntries,
      tidakAdaKomplikasi: false
    });
    setClinicalDetail((prev) => ({ ...prev, poin4_3: next4_3 }));
    markModifiedCode('4.3', isPoin4_3Complete(next4_3), formatPoin4_3Note(next4_3));
    syncEditableSessionFromPoin4_3(next4_3);
  };

  const removeVerifPoin4_3Entry = (entryId: string) => {
    const filteredEntries = (clinicalDetail.poin4_3.entries || []).filter((e) => e.id !== entryId);
    const next4_3: Poin4_3ClinicalData = normalizePoin4_3Data({
      ...clinicalDetail.poin4_3,
      entries: filteredEntries,
      tidakAdaKomplikasi: filteredEntries.length === 0 ? clinicalDetail.poin4_3.tidakAdaKomplikasi : false
    });
    setClinicalDetail((prev) => ({ ...prev, poin4_3: next4_3 }));
    markModifiedCode('4.3', isPoin4_3Complete(next4_3), formatPoin4_3Note(next4_3));
    syncEditableSessionFromPoin4_3(next4_3);
  };

  const setVerifJamNowPoin4_3 = (entryId: string) => {
    const now = new Date();
    const jamNow = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    updateVerifPoin4_3Entry(entryId, { jam: jamNow });
  };

  const updateVerifPoin6_3 = (patch: Partial<Poin6_3ClinicalData>) => {
    const next6_3: Poin6_3ClinicalData = {
      ...clinicalDetail.poin6_3,
      ...patch
    };
    setClinicalDetail((prev) => ({ ...prev, poin6_3: next6_3 }));
    markModifiedCode('6.3', isPoin6_3Complete(next6_3), formatPoin6_3Note(next6_3));

    const ufgAchieved = parseClinicalNumber(next6_3.ufgTercapai);
    const ktvNum = parseClinicalNumber(next6_3.ktV);

    setEditableSession((prev) =>
      ensureFullBagianData({
        ...prev,
        postBp: next6_3.tdPostHd.trim() || prev.postBp,
        achievedUf:
          ufgAchieved !== null && ufgAchieved >= 0 ? Math.round(ufgAchieved) : prev.achievedUf,
        ktV: ktvNum !== null ? ktvNum : next6_3.ktV.trim() || prev.ktV
      })
    );
  };

  const persistClinicalDetailToStorage = () => {
    try {
      const storageKey = getNurseClinicalDetailsKey(nurseName);
      const raw = localStorage.getItem(storageKey);
      const existing = raw ? JSON.parse(raw) : {};
      const nextMap =
        existing && typeof existing === 'object' ? { ...existing } : {};
      nextMap[patientKey] = clinicalDetail;
      if (patient.id) {
        nextMap[patient.id] = clinicalDetail;
      }
      localStorage.setItem(storageKey, JSON.stringify(nextMap));
    } catch {
      // ignore
    }
  };

  // Helper to package current edits
  const buildCurrentPayload = (status?: PjVerificationStatus): PatientLogbookEditPayload => {
    return {
      patientId: patientKey,
      patientStatuses,
      patientNotes,
      facilityStatuses,
      updatedSession: editableSession,
      score,
      grade: gradeInfo.grade,
      verifierNotes: noteInput,
      status,
      isCorrected: hasModifiedAnything
    };
  };

  // Save edits without approving
  const handleSaveOnly = () => {
    persistClinicalDetailToStorage();
    const payload = buildCurrentPayload();
    if (onSaveLogbookEdits) {
      onSaveLogbookEdits(payload);
    }
    if (onSaveSession) {
      onSaveSession(editableSession);
    }
    showInnerToast('✓ Perubahan koreksi butir SPO berhasil disimpan.');
  };

  // Approve & verify patient
  const handleApprove = () => {
    persistClinicalDetailToStorage();
    const payload = buildCurrentPayload('terverifikasi');
    if (onSaveLogbookEdits) {
      onSaveLogbookEdits(payload);
    }
    if (onSaveSession) {
      onSaveSession(editableSession);
    }
    onVerifyApprove(patientKey, noteInput, {
      score,
      grade: gradeInfo.grade,
      isCorrected: hasModifiedAnything
    });
  };

  // Revise patient
  const handleRevise = () => {
    persistClinicalDetailToStorage();
    const payload = buildCurrentPayload('belum_diajukan');
    if (onSaveLogbookEdits) {
      onSaveLogbookEdits(payload);
    }
    if (onSaveSession) {
      onSaveSession(editableSession);
    }
    onVerifyRevise(patientKey, noteInput, {
      score,
      grade: gradeInfo.grade,
      isCorrected: hasModifiedAnything
    });
  };

  const activeBagianNumber =
    activeTab === 'b1'
      ? 1
      : activeTab === 'b2'
      ? 2
      : activeTab === 'b3'
      ? 3
      : activeTab === 'b4'
      ? 4
      : activeTab === 'b5'
      ? 5
      : 6;

  const activeItems =
    activeTab === 'b1'
      ? b1Items
      : activeTab === 'b2'
      ? b2Items
      : activeTab === 'b3'
      ? b3Items
      : activeTab === 'b4'
      ? b4Items
      : activeTab === 'b5'
      ? b5Items
      : b6Items;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-2.5 md:p-3 bg-slate-900/75 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-[98vw] 2xl:max-w-[1560px] border border-slate-200 overflow-hidden flex flex-col h-[97vh] max-h-[97vh]">
        {/* Compact Top Header */}
        <div className="bg-slate-900 text-white px-4 py-2.5 shrink-0 border-b border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-300 tabular-nums">
                <Edit3 className="w-3 h-3 text-blue-400 shrink-0" />
                <span className="font-semibold text-blue-300 uppercase tracking-wide">
                  Koreksi &amp; Verifikasi Logbook Per-Pasien
                </span>
                <span className="text-slate-500" aria-hidden="true">
                  &middot;
                </span>
                <span className="font-mono font-bold text-white">{patient.bedNumber}</span>
                <span className="text-slate-500" aria-hidden="true">
                  &middot;
                </span>
                <span>No. RM: {patient.medicalRecord || editableSession.medicalRecordNumber}</span>
                <span className="text-slate-500" aria-hidden="true">
                  &middot;
                </span>
                <span>
                  Hak Akses:{' '}
                  <strong className="text-slate-100 font-semibold">
                    {userRole === 'kepala_ruangan' ? 'Kepala Ruangan' : 'PJ Shift'}
                  </strong>
                </span>
              </div>

              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 pt-0.5">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-tight leading-snug">
                  {patient.patientName}
                </h2>
                <span className="text-[11px] text-slate-300">
                  Perawat: <strong className="text-white font-semibold">{nurseName}</strong>
                  {nurseNip ? ` (${nurseNip})` : ''}
                </span>
                <span className="text-[11px] font-mono font-semibold text-emerald-400 tabular-nums">
                  &middot; SPO Terpenuhi: {grandCompletedSpo}/{grandTotalSpo} ({grandPct}%)
                </span>
                {hasModifiedAnything && (
                  <span className="text-[10.5px] font-semibold text-amber-300">
                    &middot; Telah Dikoreksi Verifikator
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0"
              title="Tutup Modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Compact Verification Status & Quick Actions Bar */}
        <div className="px-4 py-1.5 bg-slate-50 border-b border-slate-200 shrink-0 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="font-semibold text-slate-500">Status Verifikasi:</span>
              {verificationStatus === 'terverifikasi' ? (
                <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Terverifikasi &amp; Disahkan</span>
                </span>
              ) : verificationStatus === 'diajukan' ? (
                <span className="inline-flex items-center gap-1 font-bold text-indigo-700">
                  <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span>Menunggu Verifikasi Supervisi</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-bold text-amber-700">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Belum Diajukan / Perlu Revisi</span>
                </span>
              )}

              {verifiedAt && (
                <span className="text-slate-500 tabular-nums">
                  &middot; Disahkan oleh <strong className="text-slate-700">{verifiedBy}</strong> (
                  {verifiedByRole}) pada {verifiedAt}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleSaveOnly}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                title="Simpan koreksi butir SPO tanpa merubah status verifikasi"
              >
                <Save className="w-3 h-3 text-blue-600 shrink-0" />
                <span>Simpan Koreksi Saja</span>
              </button>

              <button
                type="button"
                onClick={() => setIsPrintModalOpen(true)}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                title="Cetak Berkas Logbook Pasien A4"
              >
                <Printer className="w-3 h-3 text-slate-600 shrink-0" />
                <span>Cetak A4</span>
              </button>
            </div>
          </div>

          {innerToast && (
            <div className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] font-medium text-emerald-800 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>{innerToast}</span>
              </span>
              <button
                type="button"
                onClick={() => setInnerToast(null)}
                className="text-emerald-700 hover:text-emerald-900 font-bold leading-none cursor-pointer px-1"
              >
                &times;
              </button>
            </div>
          )}
        </div>

        {/* Compact Tab Navigation Bar */}
        <div className="px-4 pt-1 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-0.5 overflow-x-auto">
            {[
              {
                id: 'b1',
                label: 'Bag. I: RO',
                fullTitle: 'Bagian I: Fasilitas & RO',
                badge: `${b1Completed}/${b1Items.length}`
              },
              {
                id: 'b2',
                label: 'Bag. II: Pre-HD',
                fullTitle: 'Bagian II: Pre-HD & Mesin',
                badge: `${b2Completed}/${b2Items.length}`
              },
              {
                id: 'b3',
                label: 'Bag. III: Safety',
                fullTitle: 'Bagian III: Patient Safety',
                badge: `${b3Completed}/${b3Items.length}`
              },
              {
                id: 'b4',
                label: 'Bag. IV: Intra-HD',
                fullTitle: 'Bagian IV: Intra-HD',
                badge: `${b4Completed}/${b4Items.length}`
              },
              {
                id: 'b5',
                label: 'Bag. V: Edukasi',
                fullTitle: 'Bagian V: Edukasi KIE',
                badge: `${b5Completed}/${b5Items.length}`
              },
              {
                id: 'b6',
                label: 'Bag. VI: Post-HD',
                fullTitle: 'Bagian VI: Post-HD & CPPT',
                badge: `${b6Completed}/${b6Items.length}`
              }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                title={tab.fullTitle}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`py-1.5 px-2 border-b-2 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 tabular-nums ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`font-mono text-[10px] ${
                    activeTab === tab.id ? 'text-indigo-600 font-bold' : 'text-slate-400'
                  }`}
                >
                  ({tab.badge})
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 pb-1 shrink-0">
            <button
              type="button"
              onClick={() => handleBulkCheckBagian(activeBagianNumber, true)}
              className="px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold text-[10.5px] flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <CheckSquare className="w-3 h-3 text-emerald-700 shrink-0" />
              <span>Semua Dilaksanakan</span>
            </button>
            <button
              type="button"
              onClick={() => handleBulkCheckBagian(activeBagianNumber, false)}
              className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-semibold text-[10.5px] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Compact Scrollable SPO Checklist */}
        <div className="px-4 py-2.5 overflow-y-auto flex-1 bg-slate-50/40">
          <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 mb-1.5 gap-2 tabular-nums">
            <span className="flex items-center gap-1">
              <Info className="w-3 h-3 text-indigo-600 shrink-0" />
              <span>Klik tombol status pada tiap butir untuk mengoreksi kepatuhan SPO:</span>
            </span>
            <span className="font-mono text-[10.5px] text-slate-400">
              Bagian {activeBagianNumber} &middot; {activeItems.length} SPO
            </span>
          </div>

          <div className="space-y-1.5">
            {activeItems.map((item) => {
              const isBagian1 = activeTab === 'b1';
              const isChecked = isBagian1
                ? Boolean(facilityStatuses[item.code])
                : Boolean(patientStatuses[item.code]);
              const specificNote = isBagian1 ? undefined : patientNotes[item.code];
              const isItemModified = !!modifiedItems[item.code];

              return (
                <div
                  key={item.code}
                  className={`px-3 py-2 rounded-lg border transition-colors ${
                    isChecked
                      ? 'bg-white border-emerald-200'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                        <span className="font-mono text-[11px] font-bold text-indigo-700 tabular-nums shrink-0">
                          {item.code}
                        </span>
                        <h4 className="text-xs font-semibold text-slate-900 leading-snug">
                          {item.shortTitle || item.description}
                        </h4>
                        <span className="text-[10.5px] text-slate-400">
                          &middot; {item.category}
                        </span>
                        {isItemModified && (
                          <span className="text-[10px] font-semibold text-amber-700">
                            &middot; Dikoreksi Verifikator
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-500 leading-tight">
                        {item.simpleGuide || item.standardSpo}
                      </p>

                      {item.code === '3.1' && (
                        <div className="pt-2 space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {/* STATUS PELAYANAN */}
                            <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5">
                              <label className="block text-[10.5px] font-bold text-slate-700">
                                Status Pelayanan:
                              </label>
                              <div className="grid grid-cols-2 gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateVerifPoin3_1({
                                      status: 'RAWAT JALAN',
                                      ruangRawatInap: ''
                                    })
                                  }
                                  className={`px-2 py-1 rounded text-[11px] font-bold border transition-colors ${
                                    clinicalDetail.poin3_1.status === 'RAWAT JALAN'
                                      ? 'bg-emerald-700 text-white border-emerald-700'
                                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                                  }`}
                                >
                                  RAWAT JALAN
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateVerifPoin3_1({
                                      status: 'RAWAT INAP'
                                    })
                                  }
                                  className={`px-2 py-1 rounded text-[11px] font-bold border transition-colors ${
                                    clinicalDetail.poin3_1.status === 'RAWAT INAP'
                                      ? 'bg-indigo-700 text-white border-indigo-700'
                                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                                  }`}
                                >
                                  RAWAT INAP
                                </button>
                              </div>

                            </div>

                            {/* KATEGORI PASIEN */}
                            <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5">
                              <label className="block text-[10.5px] font-bold text-slate-700">
                                Kategori Pasien:
                              </label>
                              <div className="flex flex-col gap-1">
                                {(
                                  [
                                    'REGULER',
                                    'ISOLASI HEPATITIS B',
                                    'ISOLASI HEPATITIS C/HIV'
                                  ] as const
                                ).map((kat) => (
                                  <button
                                    key={kat}
                                    type="button"
                                    onClick={() =>
                                      updateVerifPoin3_1({
                                        kategori: kat
                                      })
                                    }
                                    className={`px-2 py-1 rounded text-[10.5px] font-bold border text-left flex items-center justify-between transition-colors ${
                                      clinicalDetail.poin3_1.kategori === kat
                                        ? 'bg-emerald-700 text-white border-emerald-700'
                                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                                    }`}
                                  >
                                    <span>{kat}</span>
                                    {clinicalDetail.poin3_1.kategori === kat && (
                                      <Check className="w-3 h-3 stroke-[3]" />
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {item.code === '3.2' && (
                        <div className="pt-1.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5 whitespace-nowrap">
                              Berat Badan Datang (kg)
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={clinicalDetail.poin3_2.bbPre}
                              onChange={(e) => updateVerifPoin3_2({ bbPre: e.target.value })}
                              placeholder="Contoh: 64.2"
                              className="w-full text-[11px] font-mono tabular-nums px-2 py-1 bg-slate-50 focus:bg-white border border-slate-300 focus:border-indigo-500 rounded-md focus:outline-hidden text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5 whitespace-nowrap">
                              Berat Badan Pulang (kg)
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={clinicalDetail.poin3_2.bbPost}
                              onChange={(e) => updateVerifPoin3_2({ bbPost: e.target.value })}
                              placeholder="Contoh: 61.6"
                              className="w-full text-[11px] font-mono tabular-nums px-2 py-1 bg-slate-50 focus:bg-white border border-slate-300 focus:border-indigo-500 rounded-md focus:outline-hidden text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5 whitespace-nowrap">
                              Berat Badan Kering (kg)
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={clinicalDetail.poin3_2.bbKering}
                              onChange={(e) => updateVerifPoin3_2({ bbKering: e.target.value })}
                              placeholder="Contoh: 61.5"
                              className="w-full text-[11px] font-mono tabular-nums px-2 py-1 bg-slate-50 focus:bg-white border border-slate-300 focus:border-indigo-500 rounded-md focus:outline-hidden text-slate-900"
                            />
                          </div>
                        </div>
                      )}

                      {item.code === '3.3' && (
                        <div className="pt-1.5 max-w-xs">
                          <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5 whitespace-nowrap">
                            Tekanan Darah Pre HD (mmHg)
                          </label>
                          <input
                            type="text"
                            value={clinicalDetail.poin3_3.tdPreHd ?? ''}
                            onChange={(e) => updateVerifPoin3_3(e.target.value)}
                            placeholder="Contoh: 140/85"
                            className="w-full text-[11px] font-mono tabular-nums px-2 py-1 bg-slate-50 focus:bg-white border border-slate-300 focus:border-indigo-500 rounded-md focus:outline-hidden text-slate-900"
                          />
                        </div>
                      )}

                      {item.code === '3.5' && (
                        <div className="pt-1.5 grid grid-cols-2 sm:grid-cols-5 gap-2">
                          <div>
                            <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5 whitespace-nowrap">
                              Waktu / Time (Jam)
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={clinicalDetail.poin3_5.waktuDialisis}
                              onChange={(e) =>
                                updateVerifPoin3_5({ waktuDialisis: e.target.value })
                              }
                              placeholder="4.5"
                              className="w-full text-[11px] font-mono tabular-nums px-2 py-1 bg-slate-50 focus:bg-white border border-slate-300 focus:border-indigo-500 rounded-md focus:outline-hidden text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5 whitespace-nowrap">
                              Target UFG (mL)
                            </label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={clinicalDetail.poin3_5.targetUfg}
                              onChange={(e) => updateVerifPoin3_5({ targetUfg: e.target.value })}
                              placeholder="2500"
                              className="w-full text-[11px] font-mono tabular-nums px-2 py-1 bg-slate-50 focus:bg-white border border-slate-300 focus:border-indigo-500 rounded-md focus:outline-hidden text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5 whitespace-nowrap">
                              QB (mL/mnt)
                            </label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={clinicalDetail.poin3_5.qb}
                              onChange={(e) => updateVerifPoin3_5({ qb: e.target.value })}
                              placeholder="220"
                              className="w-full text-[11px] font-mono tabular-nums px-2 py-1 bg-slate-50 focus:bg-white border border-slate-300 focus:border-indigo-500 rounded-md focus:outline-hidden text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5 whitespace-nowrap">
                              QD (mL/mnt)
                            </label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={clinicalDetail.poin3_5.qd}
                              onChange={(e) => updateVerifPoin3_5({ qd: e.target.value })}
                              placeholder="500"
                              className="w-full text-[11px] font-mono tabular-nums px-2 py-1 bg-slate-50 focus:bg-white border border-slate-300 focus:border-indigo-500 rounded-md focus:outline-hidden text-slate-900"
                            />
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5 whitespace-nowrap">
                              Dosis Heparin
                            </label>
                            <input
                              type="text"
                              value={clinicalDetail.poin3_5.dosisHeparin}
                              onChange={(e) =>
                                updateVerifPoin3_5({ dosisHeparin: e.target.value })
                              }
                              placeholder="2000 IU / Free"
                              className="w-full text-[11px] px-2 py-1 bg-slate-50 focus:bg-white border border-slate-300 focus:border-indigo-500 rounded-md focus:outline-hidden text-slate-900"
                            />
                          </div>
                        </div>
                      )}

                      {item.code === '3.6' && (
                        <div className="pt-1.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {(
                            [
                              {
                                key: 'cimino' as const,
                                label: 'CIMINO',
                                active:
                                  clinicalDetail.poin3_6.ciminoAktif ||
                                  isMeaningfulAccessInput(clinicalDetail.poin3_6.cimino),
                                value: clinicalDetail.poin3_6.cimino,
                                placeholder: 'Ket. CIMINO...'
                              },
                              {
                                key: 'cdl' as const,
                                label: 'CDL',
                                active:
                                  clinicalDetail.poin3_6.cdlAktif ||
                                  isMeaningfulAccessInput(clinicalDetail.poin3_6.cdl),
                                value: clinicalDetail.poin3_6.cdl,
                                placeholder: 'Ket. CDL...'
                              },
                              {
                                key: 'femoral' as const,
                                label: 'FEMORAL',
                                active:
                                  clinicalDetail.poin3_6.femoralAktif ||
                                  isMeaningfulAccessInput(clinicalDetail.poin3_6.femoral),
                                value: clinicalDetail.poin3_6.femoral,
                                placeholder: 'Ket. FEMORAL...'
                              }
                            ]
                          ).map((acc) => (
                            <div
                              key={acc.key}
                              className={`p-1.5 rounded-md border space-y-1 ${
                                acc.active
                                  ? 'bg-emerald-50/50 border-emerald-300'
                                  : 'bg-slate-50 border-slate-200'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => updateVerifPoin3_6Toggle(acc.key)}
                                className="flex items-center gap-1.5 text-[10.5px] font-bold text-slate-800 cursor-pointer"
                              >
                                <span
                                  className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                                    acc.active
                                      ? 'bg-emerald-600 border-emerald-600 text-white'
                                      : 'bg-white border-slate-300 text-transparent'
                                  }`}
                                >
                                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                                </span>
                                <span>{acc.label}</span>
                              </button>
                              <input
                                type="text"
                                value={acc.value}
                                onChange={(e) =>
                                  updateVerifPoin3_6Text(acc.key, e.target.value)
                                }
                                placeholder={acc.placeholder}
                                className="w-full text-[11px] px-2 py-0.5 bg-white border border-slate-300 focus:border-indigo-500 rounded focus:outline-hidden text-slate-900"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {item.code === '4.3' && (
                        <div className="pt-2 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-1.5 bg-slate-50 p-2 rounded-lg border border-slate-200">
                            <div>
                              <span className="text-[11px] font-bold text-slate-800">
                                Penanganan Komplikasi Intra HD
                              </span>
                              <span className="text-[10px] text-slate-500 block">
                                Pilihan dropdown komplikasi, jam kejadian, dan instruksi dokter.
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => addVerifPoin4_3Entry('Hipotensi')}
                                className="px-2.5 py-1 rounded bg-[#19588f] hover:bg-[#144775] text-white font-bold text-[10.5px] flex items-center gap-1 cursor-pointer shadow-2xs"
                              >
                                <Plus className="w-3 h-3 stroke-[2.5]" />
                                <span>+ TAMBAH KOMPLIKASI</span>
                              </button>

                              <button
                                type="button"
                                onClick={updateVerifPoin4_3NoComplication}
                                className={`px-2 py-1 rounded border text-[10.5px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                                  clinicalDetail.poin4_3.tidakAdaKomplikasi &&
                                  (!clinicalDetail.poin4_3.entries ||
                                    clinicalDetail.poin4_3.entries.length === 0)
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-bold'
                                    : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-600'
                                }`}
                              >
                                <span
                                  className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                                    clinicalDetail.poin4_3.tidakAdaKomplikasi &&
                                    (!clinicalDetail.poin4_3.entries ||
                                      clinicalDetail.poin4_3.entries.length === 0)
                                      ? 'bg-emerald-600 border-emerald-600 text-white'
                                      : 'bg-white border-slate-300 text-transparent'
                                  }`}
                                >
                                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                                </span>
                                <span>Tidak Ada Komplikasi (Nihil)</span>
                              </button>
                            </div>
                          </div>

                          {clinicalDetail.poin4_3.entries &&
                          clinicalDetail.poin4_3.entries.length > 0 && (
                            <div className="space-y-2">
                              {clinicalDetail.poin4_3.entries.map((entry, idx) => {
                                const isCritical = /kesadaran|first-use/i.test(entry.jenis);
                                const isHypo = /hipotensi/i.test(entry.jenis);

                                return (
                                  <div
                                    key={entry.id || `verif_comp_${idx}`}
                                    className={`p-2 rounded-lg border space-y-1.5 ${
                                      isCritical
                                        ? 'bg-rose-50/50 border-rose-200'
                                        : isHypo
                                        ? 'bg-amber-50/50 border-amber-200'
                                        : 'bg-slate-50 border-slate-200'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-1">
                                      <div className="flex items-center gap-1.5">
                                        <span
                                          className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold font-mono text-white ${
                                            isCritical
                                              ? 'bg-rose-600'
                                              : isHypo
                                              ? 'bg-amber-600'
                                              : 'bg-[#19588f]'
                                          }`}
                                        >
                                          {idx + 1}
                                        </span>
                                        <span className="text-[11px] font-bold text-slate-900">
                                          Komplikasi #{idx + 1}
                                        </span>
                                        {entry.jam && (
                                          <span className="text-[10px] font-mono text-slate-500">
                                            ({entry.jam} WIB)
                                          </span>
                                        )}
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => removeVerifPoin4_3Entry(entry.id)}
                                        className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-1.5 py-0.5 rounded text-[10.5px] font-semibold flex items-center gap-1 cursor-pointer"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                        <span>Hapus</span>
                                      </button>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                                      <div className="sm:col-span-4 space-y-0.5">
                                        <label className="text-[10px] font-bold text-slate-600 block">
                                          Komplikasi
                                        </label>
                                        <select
                                          value={entry.jenis}
                                          onChange={(e) =>
                                            updateVerifPoin4_3Entry(entry.id, {
                                              jenis: e.target.value
                                            })
                                          }
                                          className="w-full text-[11px] font-bold px-2 py-1 bg-white border border-slate-300 rounded focus:outline-hidden text-slate-900"
                                        >
                                          {PILIHAN_KOMPLIKASI_DROPDOWN.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                              {opt.label}
                                            </option>
                                          ))}
                                        </select>
                                      </div>

                                      <div className="sm:col-span-3 space-y-0.5">
                                        <div className="flex items-center justify-between">
                                          <label className="text-[10px] font-bold text-slate-600 block">
                                            Jam Kejadian
                                          </label>
                                          <button
                                            type="button"
                                            onClick={() => setVerifJamNowPoin4_3(entry.id)}
                                            className="text-[9.5px] text-[#19588f] hover:underline font-semibold cursor-pointer"
                                          >
                                            Sekarang
                                          </button>
                                        </div>
                                        <input
                                          type="text"
                                          value={entry.jam}
                                          onChange={(e) =>
                                            updateVerifPoin4_3Entry(entry.id, {
                                              jam: e.target.value
                                            })
                                          }
                                          placeholder="09:30"
                                          className="w-full text-[11px] font-mono px-2 py-1 bg-white border border-slate-300 rounded focus:outline-hidden text-slate-900"
                                        />
                                      </div>

                                      <div className="sm:col-span-5 space-y-0.5">
                                        <label className="text-[10px] font-bold text-slate-600 block">
                                          Kolom Advis Dokter (TBAK)
                                        </label>
                                        <input
                                          type="text"
                                          value={entry.advisDokter}
                                          onChange={(e) =>
                                            updateVerifPoin4_3Entry(entry.id, {
                                              advisDokter: e.target.value
                                            })
                                          }
                                          placeholder="Advis DPJP..."
                                          className="w-full text-[11px] px-2 py-1 bg-white border border-slate-300 rounded focus:outline-hidden text-slate-900"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}

                            </div>
                          )}
                        </div>
                      )}

                      {item.code === '6.3' && (
                        <div className="pt-1.5 space-y-1.5">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                            {/* Tekanan Darah Post HD */}
                            <div className="space-y-1">
                              <label className="block text-[10.5px] font-bold text-slate-700">
                                TD Post HD (mmHg):
                              </label>
                              <input
                                type="text"
                                value={clinicalDetail.poin6_3?.tdPostHd || ''}
                                onChange={(e) => updateVerifPoin6_3({ tdPostHd: e.target.value })}
                                placeholder="Contoh: 120/80"
                                className="w-full text-[11px] px-2 py-1 bg-white border border-slate-300 focus:border-indigo-500 rounded font-semibold text-slate-900 tabular-nums focus:outline-hidden"
                              />
                            </div>

                            {/* Nilai UFG Tercapai */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <label className="block text-[10.5px] font-bold text-slate-700">
                                  UFG Tercapai (mL):
                                </label>
                                {clinicalDetail.poin3_5?.targetUfg && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateVerifPoin6_3({
                                        ufgTercapai: String(clinicalDetail.poin3_5.targetUfg)
                                      })
                                    }
                                    className="text-[9.5px] text-indigo-600 hover:underline font-semibold cursor-pointer"
                                    title="Samakan dengan target UFG"
                                  >
                                    = Target ({clinicalDetail.poin3_5.targetUfg})
                                  </button>
                                )}
                              </div>
                              <input
                                type="text"
                                value={clinicalDetail.poin6_3?.ufgTercapai || ''}
                                onChange={(e) =>
                                  updateVerifPoin6_3({ ufgTercapai: e.target.value })
                                }
                                placeholder="Contoh: 2500"
                                className="w-full text-[11px] px-2 py-1 bg-white border border-slate-300 focus:border-indigo-500 rounded font-semibold text-slate-900 tabular-nums focus:outline-hidden"
                              />
                            </div>

                            {/* KT/V */}
                            <div className="space-y-1">
                              <label className="block text-[10.5px] font-bold text-slate-700">
                                KT/V (Adekuasi):
                              </label>
                              <input
                                type="text"
                                value={clinicalDetail.poin6_3?.ktV || ''}
                                onChange={(e) => updateVerifPoin6_3({ ktV: e.target.value })}
                                placeholder="Contoh: 1.8"
                                className="w-full text-[11px] px-2 py-1 bg-white border border-slate-300 focus:border-indigo-500 rounded font-semibold text-slate-900 tabular-nums focus:outline-hidden"
                              />
                            </div>
                          </div>

                          {(clinicalDetail.poin6_3?.tdPostHd ||
                            clinicalDetail.poin6_3?.ufgTercapai ||
                            clinicalDetail.poin6_3?.ktV) && (
                            <p className="text-[10.5px] tabular-nums text-emerald-800 font-medium pt-0.5">
                              <strong className="font-semibold text-slate-700">Evaluasi Post-HD:</strong>{' '}
                              {formatPoin6_3Note(clinicalDetail.poin6_3)}
                            </p>
                          )}
                        </div>
                      )}

                      {!isBagian1 && item.code !== '6.3' && (
                        <div>
                          {activeNoteEditItem === item.code ? (
                            <div className="flex items-center gap-1.5 pt-1">
                              <input
                                type="text"
                                value={patientNotes[item.code] || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setPatientNotes((prev) => ({ ...prev, [item.code]: val }));
                                  setHasModifiedAnything(true);
                                }}
                                placeholder={`Koreksi catatan khusus butir ${item.code}...`}
                                className="flex-1 text-[11px] px-2 py-1 bg-white border border-indigo-300 rounded-md focus:outline-hidden focus:ring-1 focus:ring-indigo-500 text-slate-800"
                              />
                              <button
                                type="button"
                                onClick={() => setActiveNoteEditItem(null)}
                                className="px-2 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold cursor-pointer whitespace-nowrap shrink-0"
                              >
                                Selesai
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2 pt-0.5">
                              {specificNote && (
                                <span className="text-[11px] text-indigo-900 bg-indigo-50/70 border border-indigo-200/70 rounded px-1.5 py-0.5 leading-tight">
                                  <strong className="font-semibold">Observasi:</strong>{' '}
                                  {specificNote}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => setActiveNoteEditItem(item.code)}
                                className="text-[10.5px] text-slate-400 hover:text-indigo-600 inline-flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <MessageSquare className="w-2.5 h-2.5 shrink-0" />
                                <span>
                                  {specificNote ? 'Edit Catatan' : '+ Catatan Butir'}
                                </span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 pt-0.5">
                      <button
                        type="button"
                        onClick={() => handleToggleItemStatus(item.code, isBagian1)}
                        className={`px-2.5 py-1 rounded-md font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          isChecked
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                        }`}
                        title="Klik untuk mengubah status kepatuhan butir SPO ini"
                      >
                        {isChecked ? (
                          <>
                            <Check className="w-3 h-3 stroke-[2.5] text-white shrink-0" />
                            <span>Dilaksanakan</span>
                          </>
                        ) : (
                          <>
                            <Square className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>Belum Lengkap</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Compact Modal Footer */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 space-y-2 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
            <label className="text-[11px] font-semibold text-slate-600 shrink-0">
              Catatan Verifikator / Revisi:
            </label>
            <input
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder={
                userRole === 'kepala_ruangan'
                  ? 'Tambahkan catatan pengesahan Kepala Ruang atau instruksi revisi...'
                  : 'Tambahkan catatan pengesahan PJ Shift atau instruksi revisi...'
              }
              className="flex-1 text-[11px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500 text-slate-800"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] text-slate-500 tabular-nums">
              Verifikator: <strong className="text-slate-800 font-semibold">{verifierName}</strong>{' '}
              ({userRole === 'kepala_ruangan' ? 'Kepala Ruang' : 'PJ Shift'}) &middot; SPO:{' '}
              <strong className="text-emerald-700 font-mono">
                {grandCompletedSpo}/{grandTotalSpo}
              </strong>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={onClose}
                className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Tutup
              </button>

              <button
                type="button"
                onClick={handleRevise}
                className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="Kembalikan logbook ke perawat pengaju untuk diperbaiki"
              >
                <RotateCcw className="w-3 h-3 shrink-0" />
                <span>Minta Revisi</span>
              </button>

              <button
                type="button"
                onClick={handleSaveOnly}
                className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <Save className="w-3 h-3 text-blue-600 shrink-0" />
                <span>Simpan Koreksi</span>
              </button>

              <button
                type="button"
                onClick={handleApprove}
                className={`px-3 py-1.5 rounded-lg font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  verificationStatus === 'terverifikasi'
                    ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
                title="Sahkan dan verifikasi logbook pasien ini"
              >
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {verificationStatus === 'terverifikasi'
                    ? 'Perbarui Verifikasi'
                    : 'Sahkan Pasien Ini'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Printable Modal Integration */}
      {isPrintModalOpen && (
        <PelaksanaLogbookPrintableModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          session={editableSession}
          shiftInfo={
            shiftInfo || {
              hospitalName: 'RS HAPPY LAND MEDICAL CENTRE',
              unitName: 'INSTALASI DIALISIS',
              date: getCurrentIndonesianFullDate(),
              shift: 'Pagi',
              shiftHours: 'Pagi, jam 07.00 - 14.00 WIB',
              pjShift: verifierName,
              kepalaRuangan: 'Twis Fertilianti PW., S.Kep., Ns.',
              dokterDpjp: 'dr. Paramitha, Sp.PD-KGH',
              dokterJaga: 'dr. Budi Setiawan',
              totalPerawatDinas: 7,
              detailPerawat: '7 Orang',
              perawatRatio: '1 : 3.4',
              tenagaPendukung: '1 Teknisi RO, 1 HK',
              pjShiftBerikutnya: 'Riska Wahyu, S.Kep., Ns.'
            }
          }
        />
      )}
    </div>
  );
};
