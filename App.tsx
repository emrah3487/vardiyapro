import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Scale, Moon, Trash2, RefreshCw, Maximize2, Download,
  Sliders, UserPlus, Stethoscope, Users2, BarChart2, ShieldCheck,
  Table2, TrendingUp, AlertTriangle, Loader2, Plus, X,
  CalendarDays, CheckCircle2, User, Save, Phone, Info, Briefcase, Edit, History, Archive, ArrowRight, Printer, Pencil, Lock, Upload, LogOut, Key, CalendarClock
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Staff, RosterDay, Rule, RuleType, ReportStat, ShiftAssignment, RosterHistoryItem, LeaveRecord, ShiftType } from './types';
import { generateInitialRoster, calculateStats, getStandardCycleShift } from './services/scheduler';

import ExcelJS from 'exceljs';
import saveAs from 'file-saver';

// --- INITIAL DATA ---
const INITIAL_STAFF: Staff[] = [
  // 1. Grup
  { id: '1', name: 'Zafer Yılmaz', title: 'Personel', team: 1 },
  { id: '2', name: 'Ömer Selim', title: 'Personel', team: 1 },
  { id: '3', name: 'Mehmet Selim', title: 'Personel', team: 1 },

  // 2. Grup
  { id: '4', name: 'Emrah ATEŞ', title: 'Personel', team: 2 },
  { id: '5', name: 'Mehmet Can', title: 'Personel', team: 2 },
  { id: '6', name: 'Musa Menteş', title: 'Personel', team: 2 },

  // 3. Grup
  { id: '7', name: 'Tarık Gökmen', title: 'Personel', team: 3 },
  { id: '8', name: 'Baykal Saylık', title: 'Personel', team: 3 },
  { id: '9', name: 'Cihan Mersin', title: 'Personel', team: 3 },

  // Santral / Diğer
  { id: '10', name: 'Süleyman Çevik', title: 'Santral', team: 4 },
  { id: '11', name: 'Sefa Günaydın', title: 'Santral', team: 4 },
];

const INITIAL_RULES: Rule[] = [
  { id: '1', type: RuleType.NO_CONSECUTIVE_NIGHT, description: 'Ardışık gece nöbeti yasak', isActive: true },
  { id: '2', type: RuleType.MIN_REST_HOURS, description: 'Nöbet çıkışı (Gece -> Gündüz) yasak', isActive: true },
  { id: '3', type: RuleType.MAX_SHIFTS_PER_WEEK, description: 'Hafta sonu mesai adaletli dağıtılır', isActive: true },
];

const App: React.FC = () => {
  // --- AUTH STATE ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [loginError, setLoginError] = useState(false);

  // Dynamic Admin PIN from LocalStorage (Default: 1234)
  const [adminPin, setAdminPin] = useState(() => {
    return localStorage.getItem('vardiya_pro_pin') || "1234";
  });

  // --- APP STATE ---
  const [staff, setStaff] = useState<Staff[]>(() => {
    try {
      const savedStaff = localStorage.getItem('vardiya_pro_staff');
      return savedStaff ? JSON.parse(savedStaff) : INITIAL_STAFF;
    } catch (e) {
      console.error("Failed to load staff from local storage", e);
      return INITIAL_STAFF;
    }
  });

  const [roster, setRoster] = useState<RosterDay[]>([]);

  // Initial load only
  const [history, setHistory] = useState<RosterHistoryItem[]>(() => {
    try {
      const savedHistory = localStorage.getItem('vardiya_pro_history');
      return savedHistory ? JSON.parse(savedHistory) : [];
    } catch (e) {
      return [];
    }
  });

  const [leaves, setLeaves] = useState<LeaveRecord[]>(() => {
    try {
      const savedLeaves = localStorage.getItem('vardiya_pro_leaves');
      return savedLeaves ? JSON.parse(savedLeaves) : [];
    } catch {
      return [];
    }
  });

  const [rules, setRules] = useState<Rule[]>(INITIAL_RULES);
  const [activeTab, setActiveTab] = useState<string>('genel');

  // Start Date defaults to the 1st day of the current month
  const [startDate, setStartDate] = useState<string>(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  });

  const [dayCount, setDayCount] = useState<number>(30);
  const [isGenerating, setIsGenerating] = useState(false);


  // Overtime Pool defaults to specific requested staff
  const [overtimePool, setOvertimePool] = useState<string[]>(() => {
    const defaultPoolNames = ["Zafer Yılmaz", "Tarık Gökmen", "Mehmet Can", "Baykal Saylık"];
    return INITIAL_STAFF.filter(s => defaultPoolNames.includes(s.name)).map(s => s.id);
  });

  // Edit Shift Modal State
  const [editingShift, setEditingShift] = useState<{ date: string, currentStaffId: string } | null>(null);
  const [selectedSubstitute, setSelectedSubstitute] = useState<string>('');

  // Edit Staff Modal State
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [editStaffForm, setEditStaffForm] = useState({ name: '', title: '', team: 1 });

  // Change Password Modal State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ oldPin: '', newPin: '', confirmPin: '' });

  // Leave Form State
  const [leaveForm, setLeaveForm] = useState({
    staffId: '',
    startDate: new Date().toISOString().split('T')[0],
    dayCount: 1,
    type: 'Rapor' as 'Rapor' | 'İzin',
    substituteStaffIds: [] as string[]
  });

  // Staff Form State (Add New)
  const [staffForm, setStaffForm] = useState({
    name: '',
    title: 'Personel',
    team: 1
  });

  // Ref for file input
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- EFFECTS ---
  useEffect(() => {
    // Session Auth Check (Optional: keeps user logged in during refresh)
    const sessionAuth = sessionStorage.getItem('vardiya_pro_auth');
    if (sessionAuth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('vardiya_pro_staff', JSON.stringify(staff));
  }, [staff]);

  useEffect(() => {
    localStorage.setItem('vardiya_pro_leaves', JSON.stringify(leaves));
  }, [leaves]);

  const stats: ReportStat[] = useMemo(() => calculateStats(roster, staff), [roster, staff]);

  // --- AUTH HANDLERS ---
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === adminPin) {
      setIsAuthenticated(true);
      sessionStorage.setItem('vardiya_pro_auth', 'true');
      setLoginError(false);
    } else {
      setLoginError(true);
      setPinInput("");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('vardiya_pro_auth');
    setPinInput("");
  };

  const handleChangePassword = () => {
    if (passwordForm.oldPin !== adminPin) {
      return alert("Eski şifre yanlış!");
    }
    if (passwordForm.newPin.length < 4) {
      return alert("Yeni şifre en az 4 karakter olmalıdır.");
    }
    if (passwordForm.newPin !== passwordForm.confirmPin) {
      return alert("Yeni şifreler uyuşmuyor!");
    }

    setAdminPin(passwordForm.newPin);
    localStorage.setItem('vardiya_pro_pin', passwordForm.newPin);
    alert("Şifre başarıyla değiştirildi.");
    setShowPasswordModal(false);
    setPasswordForm({ oldPin: '', newPin: '', confirmPin: '' });
  };

  // --- BACKUP HANDLERS ---
  const handleBackupDownload = () => {
    const backupData = {
      staff,
      leaves,
      history,
      roster, // Current active roster
      date: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
    saveAs(blob, `VardiyaPro_Yedek_${new Date().toLocaleDateString('tr-TR')}.json`);
  };

  const handleBackupRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);

        if (json.staff && json.leaves) {
          if (confirm("Bu yedek yüklendiğinde mevcut tüm veriler silinecek ve yedeğin üzerine yazılacaktır. Devam etmek istiyor musunuz?")) {
            setStaff(json.staff);
            setLeaves(json.leaves);
            // Manually save history to local storage
            const loadedHistory = json.history || [];
            setHistory(loadedHistory);
            localStorage.setItem('vardiya_pro_history', JSON.stringify(loadedHistory));

            if (json.roster) setRoster(json.roster);
            alert("Yedek başarıyla yüklendi!");
          }
        } else {
          alert("Geçersiz yedek dosyası formatı.");
        }
      } catch (err) {
        console.error(err);
        alert("Dosya okunamadı. Hatalı JSON formatı.");
      }
    };
    reader.readAsText(file);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // --- HANDLERS ---
  const handleGenerateRoster = () => {
    setIsGenerating(true);

    setTimeout(() => {
      // Pass 'leaves' to the generator
      const newRoster = generateInitialRoster(startDate, dayCount, staff, overtimePool, leaves);
      setRoster(newRoster);
      setIsGenerating(false);
    }, 600);
  };



  const handleExportExcel = async () => {
    if (roster.length === 0) return;

    try {
      // Determine Context: General or Santral
      const isSantralExport = activeTab === 'santral';
      const sheetName = isSantralExport ? 'Santral Nöbet Listesi' : 'Genel Vardiya Listesi';
      const fileName = isSantralExport ? 'Santral_Listesi.xlsx' : 'Vardiya_Listesi_Genel.xlsx';

      // Create Workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(sheetName);

      // --- PAGE SETUP FOR A4 PRINTING ---
      worksheet.pageSetup = {
        paperSize: 9, // A4
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,  // Fit to 1 page wide
        fitToHeight: 1, // Fit to 1 page tall (Might shrink text if roster is very long)
        horizontalCentered: true,
        verticalCentered: false,
        margins: {
          left: 0.5, right: 0.5,
          top: 0.5, bottom: 0.5,
          header: 0.3, footer: 0.3
        }
      };

      // Set Columns (Slightly narrower to help fit on page)
      worksheet.columns = [
        { header: 'Tarih', key: 'date', width: 18 },
        { header: 'Gün', key: 'day', width: 12 },
        { header: 'Gündüz (07:30-19:30)', key: 'gunduz', width: 30 },
        { header: 'Gece (19:30-07:30)', key: 'gece', width: 30 },
        { header: 'Durum (Off/Rapor/İzin)', key: 'off', width: 30 }
      ];

      // Style Header
      worksheet.getRow(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isSantralExport ? 'FF7E22CE' : 'FF0EA5E9' } // Purple for Santral, Blue for General
      };
      worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

      // Helper for assignment string
      const getAssignments = (day: RosterDay, type: ShiftType) => {
        return day.assignments
          .filter(a => {
            // Basic Type Check
            if (a.type !== type) return false;

            const s = staff.find(st => st.id === a.staffId);
            if (!s) return false;

            // --- SEPARATE EXPORT LOGIC ---
            if (isSantralExport) {
              // SANTRAL MODE: Show Team 4 OR Ömer's Santral Shifts
              if (s.team === 4) return true;
              if (s.name === 'Ömer Selim' && a.isSantralDuty) return true;
              return false;
            } else {
              // GENERAL MODE: Show Teams 1-3 BUT Hide Team 4 and Ömer's Santral Shifts
              if (s.team === 4) return false;
              if (s.name === 'Ömer Selim' && a.isSantralDuty) return false;
              return true;
            }
          })
          .map(a => {
            const s = staff.find(st => st.id === a.staffId);
            if (!s) return null;
            let text = s.name;
            if (a.isOvertime) text += " (Mesai)";
            if (a.isSubstitute) text += ` (Yedek)`;
            if (a.isSantralDuty) text += " (Santral)";
            return {
              text,
              isOvertime: a.isOvertime,
              isSantralDuty: a.isSantralDuty,
              isSubstitute: a.isSubstitute,
              label: a.label
            };
          })
          .filter(Boolean);
      };

      // Populate Rows
      roster.forEach(day => {
        const date = new Date(day.date);
        const dayName = date.toLocaleDateString('tr-TR', { weekday: 'long' });
        const dateStr = date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;

        const gunduzData = getAssignments(day, 'Gündüz');
        const geceData = getAssignments(day, 'Gece');
        const offData = [
          ...getAssignments(day, 'Off') || [],
          ...getAssignments(day, 'Rapor') || [],
          ...getAssignments(day, 'İzin') || []
        ];

        const rowValues = [
          dateStr,
          dayName,
          gunduzData?.map(d => d?.text).join('\n') || '', // Use newline for multiple people
          geceData?.map(d => d?.text).join('\n') || '',
          offData?.map(d => d?.text).join('\n') || ''
        ];

        const row = worksheet.addRow(rowValues);

        // Row Styling
        row.alignment = { vertical: 'top', wrapText: true };

        // Color coding cells based on content
        // Gündüz Cell (Col 3)
        const gunduzCell = row.getCell(3);
        if (gunduzData && gunduzData.length > 0) {
          if (gunduzData.some(d => d?.isOvertime && d?.label?.includes('24'))) {
            gunduzCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }; // Red-ish for 24h
          } else if (gunduzData.some(d => d?.isOvertime)) {
            gunduzCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDD5' } }; // Orange-ish for Mesai
          } else {
            gunduzCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }; // Blue-ish
          }
        }

        // Gece Cell (Col 4)
        const geceCell = row.getCell(4);
        if (geceData && geceData.length > 0) {
          geceCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } }; // Indigo-ish
        }

        // Off Cell (Col 5)
        const offCell = row.getCell(5);
        if (offData && offData.some(d => d?.text.includes('Rapor') || d?.text.includes('İzin'))) {
          offCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1F2' } }; // Rose-ish
        }

        // Weekend Highlight for Date Columns
        if (isWeekend) {
          row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
          row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
          row.getCell(1).font = { bold: true };
          row.getCell(2).font = { bold: true };
        }

        // Borders
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
          };
        });
      });

      // Generate File
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, fileName);

    } catch (error) {
      console.error("Excel Export Error:", error);
      alert("Excel oluşturulurken bir hata oluştu.");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleReset = () => {
    if (confirm('Tüm veriler sıfırlanacak. Emin misiniz?')) {
      localStorage.removeItem('vardiya_pro_staff');
      localStorage.removeItem('vardiya_pro_leaves');
      // We also clear history
      localStorage.removeItem('vardiya_pro_history');
      setHistory([]);

      // Reset to defaults
      setStaff(INITIAL_STAFF);
      setRoster([]);
      setLeaves([]);
      // Reset pool
      const defaultPoolNames = ["Zafer Yılmaz", "Tarık Gökmen", "Mehmet Can", "Baykal Saylık"];
      setOvertimePool(INITIAL_STAFF.filter(s => defaultPoolNames.includes(s.name)).map(s => s.id));
      setActiveTab('genel');
    }
  };

  // STAFF MANAGEMENT
  const handleAddStaff = () => {
    if (!staffForm.name) return alert("İsim giriniz");
    const newStaff: Staff = {
      id: Date.now().toString(),
      name: staffForm.name,
      title: staffForm.title,
      team: Number(staffForm.team)
    };
    setStaff([...staff, newStaff]);
    setStaffForm({ name: '', title: 'Personel', team: 1 });
  };

  const handleDeleteStaff = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening edit modal
    if (confirm("Bu personel silinecek. Emin misiniz?")) {
      setStaff(staff.filter(s => s.id !== id));
      setOvertimePool(overtimePool.filter(oid => oid !== id));
    }
  };

  const handleEditStaffClick = (s: Staff) => {
    setEditingStaff(s);
    setEditStaffForm({
      name: s.name,
      title: s.title,
      team: s.team
    });
  };

  const handleUpdateStaff = () => {
    if (!editingStaff) return;
    if (!editStaffForm.name) return alert("İsim boş olamaz");

    setStaff(prevStaff => prevStaff.map(s =>
      s.id === editingStaff.id
        ? { ...s, name: editStaffForm.name, title: editStaffForm.title, team: editStaffForm.team }
        : s
    ));

    setEditingStaff(null);
  };

  // HISTORY & ARCHIVE HANDLERS
  const handleArchiveAndNext = () => {
    if (roster.length === 0) {
      alert("Arşivlenecek liste yok. Lütfen önce listeyi oluşturun.");
      return;
    }

    const currentMonthName = new Date(startDate).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
    const name = prompt("Bu listeyi arşivleyip yeni aya geçmek üzeresiniz. Arşiv adı:", currentMonthName);

    if (name === null) return; // User cancelled

    const newItem: RosterHistoryItem = {
      id: Date.now().toString(),
      name: name || currentMonthName,
      createdAt: new Date().toISOString(),
      roster: roster,
      startDate: startDate,
      dayCount: dayCount
    };

    try {
      // 1. Get latest from storage
      const stored = localStorage.getItem('vardiya_pro_history');
      const currentHistory = stored ? JSON.parse(stored) : [];

      // 2. Prepend new item (Archive)
      const newHistory = [newItem, ...currentHistory];

      // 3. Save to storage
      localStorage.setItem('vardiya_pro_history', JSON.stringify(newHistory));
      setHistory(newHistory);

      // 4. Calculate NEXT Month's Start Date
      const currentStart = new Date(startDate);
      const nextStart = new Date(currentStart);
      nextStart.setDate(currentStart.getDate() + dayCount); // Jump forward by duration

      const nextStartStr = nextStart.toISOString().split('T')[0];

      // 5. Update UI for Next Month
      setStartDate(nextStartStr);
      setRoster([]); // Clear current roster to force generation of new one

      alert(`"${newItem.name}" başarıyla arşivlendi.\n\nYeni dönem tarihi (${new Date(nextStartStr).toLocaleDateString('tr-TR')}) ayarlandı.\nLütfen "Listeyi Oluştur" butonuna basarak yeni listeyi hazırlayın.`);

    } catch (error) {
      console.error("Archive failed", error);
      alert("Arşivleme başarısız. Tarayıcı hafızası dolu olabilir.");
    }
  };

  const handleLoadHistory = (item: RosterHistoryItem) => {
    if (confirm(`"${item.name}" listesi yüklenecek ve şu anki ekran değişecek.\n(Eğer mevcut çalışmanızı kaydetmediyseniz kaybolabilir.)\nDevam edilsin mi?`)) {
      setRoster(item.roster);
      if (item.startDate) setStartDate(item.startDate);
      if (item.dayCount) setDayCount(item.dayCount);
    }
  };

  const handleDeleteHistory = (id: string) => {
    if (confirm("Bu kayıt silinecek. Emin misiniz?")) {
      try {
        const stored = localStorage.getItem('vardiya_pro_history');
        const currentHistory = stored ? JSON.parse(stored) : [];
        const newHistory = currentHistory.filter((h: RosterHistoryItem) => h.id !== id);

        localStorage.setItem('vardiya_pro_history', JSON.stringify(newHistory));
        setHistory(newHistory);
      } catch (e) {
        console.error(e);
      }
    }
  };

  // OVERTIME EDITING
  const handleOvertimeClick = (dateStr: string, assignment: ShiftAssignment) => {
    if (assignment.isOvertime || assignment.isSubstitute) {
      setEditingShift({ date: dateStr, currentStaffId: assignment.staffId });
      setSelectedSubstitute('');
    }
  };

  const handleOvertimeSwap = () => {
    if (!editingShift || !selectedSubstitute) return;

    setRoster(prevRoster => {
      return prevRoster.map(day => {
        if (day.date === editingShift.date) {
          const newAssignments = [...day.assignments];

          // 1. Remove the old staff from Overtime
          // And restore their original 'Off' status if they had one
          const oldAssignIndex = newAssignments.findIndex(a => a.staffId === editingShift.currentStaffId && (a.isOvertime || a.isSubstitute));
          const oldAssign = newAssignments[oldAssignIndex];

          if (oldAssignIndex !== -1) {
            newAssignments.splice(oldAssignIndex, 1); // Remove OT assignment

            // Restore original shift (Off) for the old staff
            const oldStaff = staff.find(s => s.id === editingShift.currentStaffId);
            if (oldStaff) {
              const original = getStandardCycleShift(oldStaff, day.date);
              if (original) {
                // Only add if not already present (e.g. if they worked night and are still in list)
                const exists = newAssignments.some(a => a.staffId === oldStaff.id);
                if (!exists) {
                  newAssignments.push({
                    staffId: oldStaff.id,
                    type: original.type,
                    label: original.label
                  });
                }
              }
            }
          }

          // 2. Add the new staff to Overtime
          // Remove their 'Off' shift if it exists
          const newStaffOffIndex = newAssignments.findIndex(a => a.staffId === selectedSubstitute && a.type === 'Off');
          if (newStaffOffIndex !== -1) {
            newAssignments.splice(newStaffOffIndex, 1);
          }

          // Add new OT assignment
          newAssignments.push({
            staffId: selectedSubstitute,
            type: oldAssign ? oldAssign.type : 'Gündüz', // Keep original type
            label: oldAssign ? oldAssign.label : 'Mesai (Gündüz)', // Keep original label (e.g. 24h)
            isOvertime: oldAssign ? oldAssign.isOvertime : true,
            isSubstitute: oldAssign ? oldAssign.isSubstitute : false,
            substituteFor: oldAssign ? oldAssign.substituteFor : undefined
          });

          return { ...day, assignments: newAssignments };
        }
        return day;
      });
    });

    setEditingShift(null);
  };

  // --- RENDER HELPERS ---
  const renderRosterCell = (day: RosterDay, type: ShiftType, isSantralTable = false) => {
    // Filter assignments for this cell
    const cellAssignments = day.assignments.filter(a => {
      // Basic type check
      if (a.type !== type) return false;

      const s = staff.find(st => st.id === a.staffId);
      if (!s) return false;

      // VISIBILITY FIX: If viewing 'Off' or 'Rapor/Izin' columns,
      // check if this person is already working Gündüz or Gece this day.
      // If so, hide them from the 'Off' column to prevent duplicates.
      if (!isSantralTable && (type === 'Off' || type === 'Rapor' || type === 'İzin')) {
        const isWorking = day.assignments.some(otherA =>
          otherA.staffId === s.id &&
          (otherA.type === 'Gündüz' || otherA.type === 'Gece')
        );
        if (isWorking) return false;
      }

      // Logic for splitting tables
      if (isSantralTable) {
        // Show Santral Team (4) OR Ömer's specific Santral shifts
        if (s.team === 4) return true;
        if (s.name === 'Ömer Selim' && a.isSantralDuty) return true;
        return false;
      } else {
        // Show Main Teams (1, 2, 3) BUT hide Ömer's specific Santral shifts
        // Also hide Santral Team (4)
        if (s.team === 4) return false;
        if (s.name === 'Ömer Selim' && a.isSantralDuty) return false;
        return true;
      }
    });

    return (
      <div className="space-y-1 min-h-[40px] print:min-h-0">
        {cellAssignments.map((assign, idx) => {
          const s = staff.find(st => st.id === assign.staffId);
          if (!s) return null;

          let bgColor = 'bg-slate-100 text-slate-700';
          let borderColor = 'border-transparent';
          let icon = null;

          if (type === 'Gündüz') {
            bgColor = 'bg-blue-50 text-blue-700 border-blue-100 print:bg-blue-50';
            if (assign.isOvertime) {
              bgColor = 'bg-amber-100 text-amber-800 border-amber-200 print:bg-amber-100'; // Overtime
              if (assign.label?.includes('24')) bgColor = 'bg-red-100 text-red-800 border-red-200 print:bg-red-100'; // 24h
            }
            if (assign.isSubstitute) bgColor = 'bg-purple-50 text-purple-700 border-purple-100 print:bg-purple-50';
          } else if (type === 'Gece') {
            bgColor = 'bg-indigo-50 text-indigo-700 border-indigo-100 print:bg-indigo-50';
            if (assign.isSubstitute) bgColor = 'bg-purple-50 text-purple-700 border-purple-100 print:bg-purple-50';
          } else if (type === 'Off') {
            bgColor = 'bg-slate-50 text-slate-400 border-slate-100 print:bg-slate-50';
          } else if (type === 'Rapor' || type === 'İzin') {
            bgColor = 'bg-rose-50 text-rose-700 border-rose-100 print:bg-rose-50';
          }

          // Special marking for Ömer in General list if he is also working Santral that day
          let omerSantralNote = null;
          if (!isSantralTable && s.name === 'Ömer Selim') {
            // Check if he has a santral assignment this day
            const santralAssign = day.assignments.find(a => a.staffId === s.id && a.isSantralDuty);
            if (santralAssign) {
              omerSantralNote = (
                <span className="ml-1 inline-flex items-center px-1 rounded-full bg-purple-100 text-purple-700 text-[9px] border border-purple-200 print:border-slate-800 print:text-black">
                  (Santral)
                </span>
              );
            }
          }

          const isClickable = !isSantralTable && (assign.isOvertime || assign.isSubstitute);

          return (
            <div
              key={idx}
              onClick={() => isClickable && handleOvertimeClick(day.date, assign)}
              className={`
                text-xs p-1.5 rounded border ${bgColor} flex flex-col relative group
                ${isClickable ? 'cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-indigo-400' : ''}
                print:border-0 print:p-0 print:text-black print:text-xs print:break-inside-avoid
              `}
              style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
            >
              <div className="font-semibold flex items-center justify-between print:justify-start print:gap-1">
                <span>{s.name} {omerSantralNote}</span>
                {isClickable && <Edit className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity print:hidden" />}
              </div>

              <div className="flex justify-between items-center mt-0.5 opacity-80 text-[10px] print:text-[10px] print:opacity-100">
                <span>{assign.label}</span>
              </div>

              {assign.substituteFor && (
                <div className="text-[9px] italic mt-0.5 opacity-70 print:opacity-100">
                  ({assign.substituteFor} yerine)
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // --- LOGIN SCREEN ---
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 mx-auto mb-6">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">VardiyaPro Giriş</h1>
          <p className="text-slate-500 mb-6 text-sm">Lütfen yönetici PIN kodunu giriniz.</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              maxLength={4}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              className="w-full text-center text-3xl tracking-[1em] font-bold p-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-0 text-slate-800"
              placeholder="••••"
            />
            {loginError && <p className="text-red-500 text-xs font-medium">Hatalı PIN kodu.</p>}
            <button
              type="submit"
              className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl transition-all shadow-lg active:scale-[0.98]"
            >
              Giriş Yap
            </button>
          </form>
          <p className="mt-8 text-xs text-slate-400">Güvenli Vardiya Yönetim Sistemi</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-12 print:bg-white print:pb-0 flex flex-col">
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm print:hidden">
        <div className="max-w-[1600px] mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200 text-white">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-heading font-bold text-xl text-slate-800 tracking-tight">VardiyaPro</h1>
              <div className="flex flex-col">
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider leading-none">Akıllı Vardiya Sistemi</p>
                <p className="text-[9px] text-slate-400 mt-0.5 font-medium">by <span className="text-emerald-600">Emrah Ateş</span></p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 border-r border-slate-200 pr-2 mr-1">
              <button onClick={handleBackupDownload} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Yedek İndir">
                <Download className="w-5 h-5" />
              </button>
              <label className="p-2 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors cursor-pointer" title="Yedek Yükle">
                <Upload className="w-5 h-5" />
                <input type="file" ref={fileInputRef} onChange={handleBackupRestore} accept=".json" className="hidden" />
              </label>
              <button onClick={() => setShowPasswordModal(true)} className="p-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Şifre Değiştir">
                <Key className="w-5 h-5" />
              </button>
            </div>
            <button onClick={handleReset} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Sıfırla">
              <Trash2 className="w-5 h-5" />
            </button>
            <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors ml-2" title="Çıkış">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* PRINT HEADER (Only visible when printing) */}
      <div className="hidden print:block mb-4 text-center border-b border-black pb-4">
        <h1 className="text-2xl font-bold text-black">VardiyaPro - Nöbet Listesi</h1>
        <p className="text-sm text-black">Oluşturulma Tarihi: {new Date().toLocaleDateString('tr-TR')}</p>
      </div>

      {/* MAIN CONTENT */}
      <main className="max-w-[1600px] mx-auto p-4 sm:p-6 print:p-0 print:max-w-none flex-grow w-full">

        {/* TABS */}
        <div className="flex flex-wrap gap-2 mb-6 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm w-fit print:hidden">
          {[
            { id: 'genel', icon: Sliders, label: 'Genel' },
            { id: 'mesai', icon: UserPlus, label: 'Mesai' },
            { id: 'izin', icon: Stethoscope, label: 'İzin & Rapor' },
            { id: 'personel', icon: Users2, label: 'Personel' },
            { id: 'santral', icon: Phone, label: 'Santral' },
            { id: 'rapor', icon: BarChart2, label: 'Rapor' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                 ${activeTab === tab.id
                  ? 'bg-slate-800 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}
               `}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* CONTENT AREAS */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 print:block">

          {/* LEFT PANEL / CONTROLS - Depends on Tab */}
          <div className={`
              ${activeTab === 'santral' ? 'xl:col-span-12' : 'xl:col-span-3'} 
              space-y-6 animate-slide-up print:hidden
           `}>

            {/* GENEL TAB */}
            {activeTab === 'genel' && (
              <>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                  <h3 className="font-heading font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-emerald-600" /> Parametreler
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Başlangıç Tarihi</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Gün Sayısı</label>
                      <input
                        type="number"
                        value={dayCount}
                        onChange={(e) => setDayCount(Number(e.target.value))}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 text-slate-900"
                      />
                    </div>
                    <button
                      onClick={handleGenerateRoster}
                      disabled={isGenerating}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 rounded-lg shadow-lg shadow-emerald-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      Listeyi Oluştur
                    </button>

                    {/* Archive & Next Month Button */}
                    <button
                      onClick={handleArchiveAndNext}
                      disabled={roster.length === 0}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
                      title="Listeyi arşivler ve otomatik olarak bir sonraki ayın tarihini ayarlar"
                    >
                      <CalendarClock className="w-4 h-4" />
                      Dönemi Bitir & Yeni Ay
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={handleExportExcel}
                        disabled={roster.length === 0}
                        className="w-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium py-2.5 rounded-lg transition-all flex items-center justify-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Excel
                      </button>
                      <button
                        onClick={handlePrint}
                        disabled={roster.length === 0}
                        className="w-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium py-2.5 rounded-lg transition-all flex items-center justify-center gap-2"
                      >
                        <Printer className="w-4 h-4" />
                        Yazdır
                      </button>
                    </div>
                  </div>
                </div>

                {/* HISTORY LIST */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                  <h3 className="font-heading font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <History className="w-4 h-4 text-purple-600" /> Geçmiş Kayıtlar
                  </h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                    {history.length === 0 ? (
                      <div className="text-center text-slate-400 text-xs py-4">Kayıt bulunamadı.</div>
                    ) : (
                      history.map(item => (
                        <div key={item.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100 hover:border-purple-200 transition-colors">
                          <div>
                            <div className="font-medium text-sm text-slate-800">{item.name}</div>
                            <div className="text-[10px] text-slate-400">
                              {new Date(item.createdAt).toLocaleDateString()} - {item.startDate ? new Date(item.startDate).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => handleLoadHistory(item)} className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-white rounded shadow-sm" title="Yükle">
                              <ArrowRight className="w-3 h-3" />
                            </button>
                            <button onClick={() => handleDeleteHistory(item.id)} className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-white rounded shadow-sm" title="Sil">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}

            {/* MESAI TAB */}
            {activeTab === 'mesai' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="font-heading font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-amber-500" /> Mesai Havuzu
                </h3>
                <p className="text-xs text-slate-500 mb-3">Hafta sonu gündüz mesaisine yazılabilecek personelleri seçin.</p>
                <div className="space-y-1 max-h-[400px] overflow-y-auto">
                  {staff.filter(s => s.team <= 3).map(s => (
                    <label key={s.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={overtimePool.includes(s.id)}
                        onChange={(e) => {
                          if (e.target.checked) setOvertimePool([...overtimePool, s.id]);
                          else setOvertimePool(overtimePool.filter(id => id !== s.id));
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 accent-amber-600 bg-white"
                      />
                      <span className="text-sm text-slate-900 group-hover:text-amber-700">{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* IZIN TAB */}
            {activeTab === 'izin' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="font-heading font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-rose-500" /> İzin & Rapor Ekle
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Personel</label>
                    <select
                      className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-white text-slate-800"
                      value={leaveForm.staffId}
                      onChange={e => setLeaveForm({ ...leaveForm, staffId: e.target.value })}
                    >
                      <option value="">Seçiniz...</option>
                      {[1, 2, 3, 4].map(teamId => {
                        const teamName = teamId === 4 ? 'Santral Ekibi' : `${teamId}. Grup`;
                        return (
                          <optgroup key={teamId} label={teamName}>
                            {staff.filter(s => s.team === teamId).map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </optgroup>
                        )
                      })}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Başlangıç</label>
                      <input type="date" className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-white text-slate-800"
                        value={leaveForm.startDate}
                        onChange={e => setLeaveForm({ ...leaveForm, startDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Gün</label>
                      <input type="number" min="1" className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-white text-slate-800"
                        value={leaveForm.dayCount}
                        onChange={e => setLeaveForm({ ...leaveForm, dayCount: parseInt(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Tür</label>
                    <select
                      className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-white text-slate-800"
                      value={leaveForm.type}
                      onChange={e => setLeaveForm({ ...leaveForm, type: e.target.value as any })}
                    >
                      <option value="Rapor">Raporlu</option>
                      <option value="İzin">İzinli</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Yedekler (Opsiyonel)</label>
                    <div className="border border-slate-200 rounded-lg p-2 max-h-32 overflow-y-auto bg-slate-50 space-y-1">
                      {[1, 2, 3, 4].map(teamId => {
                        const teamStaff = staff.filter(s => s.team === teamId && s.id !== leaveForm.staffId);
                        if (teamStaff.length === 0) return null;
                        return (
                          <div key={teamId} className="mb-2">
                            <div className="text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">
                              {teamId === 4 ? 'Santral' : `${teamId}. Grup`}
                            </div>
                            {teamStaff.map(s => (
                              <label key={s.id} className="flex items-center gap-2 mb-1 p-1 hover:bg-slate-100 rounded">
                                <input type="checkbox"
                                  checked={leaveForm.substituteStaffIds.includes(s.id)}
                                  onChange={e => {
                                    const newSubs = e.target.checked
                                      ? [...leaveForm.substituteStaffIds, s.id]
                                      : leaveForm.substituteStaffIds.filter(id => id !== s.id);
                                    setLeaveForm({ ...leaveForm, substituteStaffIds: newSubs });
                                  }}
                                  className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 accent-rose-600 bg-white"
                                />
                                <span className="text-xs text-slate-900">{s.name}</span>
                              </label>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (!leaveForm.staffId) return alert("Personel seçin");
                      const newLeave: LeaveRecord = {
                        id: Date.now().toString(),
                        ...leaveForm
                      };
                      setLeaves([...leaves, newLeave]);
                      // Reset form slightly
                      setLeaveForm({ ...leaveForm, substituteStaffIds: [] });
                    }}
                    className="w-full bg-rose-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-rose-700"
                  >
                    Ekle
                  </button>
                </div>

                {/* Leave List */}
                <div className="mt-6 border-t pt-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Mevcut İzinler</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {leaves.map(l => {
                      const s = staff.find(st => st.id === l.staffId);
                      return (
                        <div key={l.id} className="flex justify-between items-start bg-slate-50 p-2 rounded border border-slate-100 text-xs">
                          <div>
                            <div className="font-semibold">{s?.name}</div>
                            <div className="text-slate-500">{l.startDate} ({l.dayCount} gün) - {l.type}</div>
                            {l.substituteStaffIds && l.substituteStaffIds.length > 0 && (
                              <div className="text-[10px] text-purple-600 mt-1">
                                Yedekler: {l.substituteStaffIds.map(id => staff.find(sub => sub.id === id)?.name).join(', ')}
                              </div>
                            )}
                          </div>
                          <button onClick={() => setLeaves(leaves.filter(item => item.id !== l.id))} className="text-slate-400 hover:text-red-500">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* PERSONEL TAB */}
            {activeTab === 'personel' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="font-heading font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <Users2 className="w-4 h-4 text-blue-600" /> Personel Yönetimi
                </h3>

                {/* ADD STAFF FORM */}
                <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Personel Ekle</h4>
                  <input
                    type="text"
                    placeholder="Ad Soyad"
                    className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-white text-slate-800"
                    value={staffForm.name}
                    onChange={e => setStaffForm({ ...staffForm, name: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Unvan"
                      className="flex-1 border border-slate-200 rounded-lg p-2 text-sm bg-white text-slate-800"
                      value={staffForm.title}
                      onChange={e => setStaffForm({ ...staffForm, title: e.target.value })}
                    />
                    <select
                      className="w-24 border border-slate-200 rounded-lg p-2 text-sm bg-white text-slate-800"
                      value={staffForm.team}
                      onChange={e => setStaffForm({ ...staffForm, team: parseInt(e.target.value) })}
                    >
                      <option value="1">1. Grup</option>
                      <option value="2">2. Grup</option>
                      <option value="3">3. Grup</option>
                      <option value="4">Santral</option>
                    </select>
                  </div>
                  <button
                    onClick={handleAddStaff}
                    className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700"
                  >
                    Kaydet
                  </button>
                </div>

                {/* STAFF LIST */}
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {[1, 2, 3, 4].map(teamId => (
                    <div key={teamId}>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 mt-3 pl-1">
                        {teamId === 4 ? 'Santral Ekibi' : `${teamId}. Grup`}
                      </div>
                      {staff.filter(s => s.team === teamId).map(s => (
                        <div
                          key={s.id}
                          onClick={() => handleEditStaffClick(s)}
                          className="flex justify-between items-center gap-3 p-3 bg-white border border-slate-100 rounded-lg shadow-sm group hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                              {s.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                                {s.name}
                                <Pencil className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                              <div className="text-xs text-slate-500">{s.title}</div>
                            </div>
                          </div>
                          <button
                            onClick={(e) => handleDeleteStaff(s.id, e)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                            title="Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* RAPOR TAB */}
            {activeTab === 'rapor' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="font-heading font-semibold text-slate-800 mb-4">Vardiya İstatistikleri</h3>
                <div className="space-y-4">
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <div className="text-xs text-blue-600 mb-1">Toplam Gün</div>
                    <div className="text-2xl font-bold text-blue-800">{roster.length}</div>
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* RIGHT PANEL / ROSTER VIEW */}
          <div className={`
             ${activeTab === 'santral' ? 'hidden' : 'xl:col-span-9'}
             print:col-span-12 print:w-full print:block
           `}>
            {activeTab !== 'rapor' && activeTab !== 'personel' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[600px] print:border-0 print:shadow-none">
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center print:hidden">
                  <h2 className="font-heading font-bold text-lg text-slate-800 flex items-center gap-2">
                    <Table2 className="w-5 h-5 text-slate-400" /> Vardiya Listesi
                  </h2>
                </div>

                <div className="overflow-auto flex-1 custom-scrollbar print:overflow-visible">
                  {roster.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400 print:hidden">
                      <CalendarDays className="w-12 h-12 mb-3 opacity-20" />
                      <p>Liste henüz oluşturulmadı.</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm text-left border-collapse print:text-xs">
                      <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 z-10 shadow-sm print:static print:bg-white print:text-black print:border-b-2 print:border-black">
                        <tr>
                          <th className="px-4 py-3 font-bold border-b border-slate-200 w-32 print:border-black">Tarih</th>
                          <th className="px-4 py-3 font-bold border-b border-slate-200 w-1/3 text-blue-700 print:text-black print:border-black">Gündüz (07:30-19:30)</th>
                          <th className="px-4 py-3 font-bold border-b border-slate-200 w-1/3 text-indigo-700 print:text-black print:border-black">Gece (19:30-07:30)</th>
                          <th className="px-4 py-3 font-bold border-b border-slate-200 w-1/3 text-slate-600 print:text-black print:border-black">Off / Rapor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 print:divide-slate-300">
                        {roster.map((day, idx) => {
                          const date = new Date(day.date);
                          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                          return (
                            <tr key={idx} className={`${isWeekend ? 'bg-orange-50/30 print:bg-transparent' : ''} print:break-inside-avoid`}>
                              <td className="px-4 py-3 border-b border-slate-100 align-top print:border-slate-300">
                                <div className="font-medium text-slate-700 print:text-black">{date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}</div>
                                <div className="text-xs text-slate-400 font-medium uppercase print:text-slate-600">{date.toLocaleDateString('tr-TR', { weekday: 'long' })}</div>
                              </td>
                              <td className="px-4 py-2 border-b border-slate-100 align-top print:border-slate-300">
                                {renderRosterCell(day, 'Gündüz', false)}
                              </td>
                              <td className="px-4 py-2 border-b border-slate-100 align-top print:border-slate-300">
                                {renderRosterCell(day, 'Gece', false)}
                              </td>
                              <td className="px-4 py-2 border-b border-slate-100 align-top print:border-slate-300">
                                {/* Merge Off, Rapor, Izin into one column for cleaner view */}
                                <div className="space-y-2">
                                  {renderRosterCell(day, 'Off', false)}
                                  {renderRosterCell(day, 'Rapor', false)}
                                  {renderRosterCell(day, 'İzin', false)}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* STATS VIEW IN RAPOR TAB */}
            {activeTab === 'rapor' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 overflow-hidden">
                <h3 className="font-heading font-bold text-lg mb-6">Detaylı İstatistikler</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 rounded-l-lg">Personel</th>
                        <th className="px-4 py-3 text-center">Toplam</th>
                        <th className="px-4 py-3 text-center text-blue-600">Gündüz</th>
                        <th className="px-4 py-3 text-center text-indigo-600">Gece</th>
                        <th className="px-4 py-3 text-center text-orange-600">Hafta Sonu</th>
                        <th className="px-4 py-3 text-center text-purple-600 rounded-r-lg">Mesai</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stats.map(s => (
                        <tr key={s.staffId} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium">{s.staffName}</td>
                          <td className="px-4 py-3 text-center font-bold">{s.totalShifts}</td>
                          <td className="px-4 py-3 text-center">{s.dayShifts}</td>
                          <td className="px-4 py-3 text-center">{s.nightShifts}</td>
                          <td className="px-4 py-3 text-center font-medium text-orange-600">{s.weekendShifts}</td>
                          <td className="px-4 py-3 text-center font-bold text-purple-600">{s.overtimeCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* SANTRAL TAB VIEW (FULL WIDTH) */}
          {activeTab === 'santral' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-slide-up print:block">
              {/* Santral Rules Sidebar */}
              <div className="lg:col-span-3 space-y-4 print:hidden">
                <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-100 rounded-xl p-5">
                  <h3 className="font-heading font-semibold text-purple-900 mb-3 flex items-center gap-2">
                    <Info className="w-4 h-4" /> Santral Kuralları
                  </h3>
                  <div className="space-y-3 text-xs text-purple-800">
                    <div className="bg-white/60 p-2 rounded">
                      <strong>Süleyman Çevik:</strong><br />
                      • Salı-Cuma: Gündüz<br />
                      • Cmt: 24 Saat<br />
                      • Paz-Pzt: Off
                    </div>
                    <div className="bg-white/60 p-2 rounded">
                      <strong>Ömer Selim:</strong><br />
                      • 1. Off Günü: Gece Santral<br />
                      • 2. Off Günü: Gündüz Santral (Süleyman yoksa)<br />
                      • Diğer: Güvenlik
                    </div>
                    <div className="bg-white/60 p-2 rounded">
                      <strong>Sefa Günaydın:</strong><br />
                      • Boşlukları doldurur<br />
                      • Ömer Santraldeyse Sefa Off
                    </div>
                  </div>
                </div>

                {/* Excel Export Button for Santral */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                  <h3 className="font-heading font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <Download className="w-4 h-4 text-emerald-600" /> Dışa Aktar
                  </h3>
                  <button
                    onClick={handleExportExcel}
                    disabled={roster.length === 0}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 rounded-lg shadow-lg shadow-emerald-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Santral Listesini İndir
                  </button>
                  <button
                    onClick={handlePrint}
                    disabled={roster.length === 0}
                    className="w-full mt-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium py-2.5 rounded-lg transition-all flex items-center justify-center gap-2"
                  >
                    <Printer className="w-4 h-4" />
                    Yazdır
                  </button>
                </div>

              </div>

              {/* Santral Roster */}
              <div className="lg:col-span-9 print:w-full">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:border-0 print:shadow-none">
                  <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center print:hidden">
                    <h2 className="font-heading font-bold text-lg text-slate-800 flex items-center gap-2">
                      <Phone className="w-5 h-5 text-purple-600" /> Santral Nöbet Listesi
                    </h2>
                  </div>
                  <div className="overflow-auto custom-scrollbar print:overflow-visible">
                    <table className="w-full text-sm text-left border-collapse print:text-xs">
                      <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 z-10 print:static print:bg-white print:text-black print:border-b-2 print:border-black">
                        <tr>
                          <th className="px-4 py-3 font-bold border-b w-32 print:border-black">Tarih</th>
                          <th className="px-4 py-3 font-bold border-b text-purple-700 print:text-black print:border-black">Gündüz (07:30-19:30)</th>
                          <th className="px-4 py-3 font-bold border-b text-indigo-700 print:text-black print:border-black">Gece (19:30-07:30)</th>
                          <th className="px-4 py-3 font-bold border-b text-slate-600 print:text-black print:border-black">Durum</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 print:divide-slate-300">
                        {roster.map((day, idx) => {
                          const date = new Date(day.date);
                          return (
                            <tr key={idx} className="print:break-inside-avoid">
                              <td className="px-4 py-3 border-b border-slate-100 align-top print:border-slate-300">
                                <div className="font-medium text-slate-700 print:text-black">{date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}</div>
                                <div className="text-xs text-slate-400 font-medium uppercase print:text-slate-600">{date.toLocaleDateString('tr-TR', { weekday: 'short' })}</div>
                              </td>
                              <td className="px-4 py-2 border-b border-slate-100 align-top print:border-slate-300">
                                {renderRosterCell(day, 'Gündüz', true)}
                              </td>
                              <td className="px-4 py-2 border-b border-slate-100 align-top print:border-slate-300">
                                {renderRosterCell(day, 'Gece', true)}
                              </td>
                              <td className="px-4 py-2 border-b border-slate-100 align-top print:border-slate-300">
                                {renderRosterCell(day, 'Off', true)}
                                {renderRosterCell(day, 'Rapor', true)}
                                {renderRosterCell(day, 'İzin', true)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* FOOTER - NEW ADDITION */}
      <footer className="mt-auto py-8 border-t border-slate-200 bg-white/50 print:hidden">
        <div className="max-w-[1600px] mx-auto px-4 text-center">
          <p className="text-xs text-slate-400 mb-1">
            &copy; {new Date().getFullYear()} VardiyaPro. Tüm hakları saklıdır.
          </p>
          <p className="mt-1 font-medium text-emerald-600 text-xs">by Emrah Ateş</p>
        </div>
      </footer>

      {/* EDIT OVERTIME MODAL */}
      {editingShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm print:hidden">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-slide-up">
            <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
              <h3 className="font-heading font-bold text-slate-800">Vardiya Değiştir</h3>
              <button onClick={() => setEditingShift(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-slate-600">
                <strong>{staff.find(s => s.id === editingShift.currentStaffId)?.name}</strong> yerine kimi atamak istiyorsunuz?
              </p>
              <select
                className="w-full border rounded-lg p-2 text-sm bg-white text-slate-800"
                value={selectedSubstitute}
                onChange={(e) => setSelectedSubstitute(e.target.value)}
              >
                <option value="">Seçiniz...</option>
                {/* Only show staff eligible for pool AND currently Off or Available logic could be better but list all for now */}
                {staff.filter(s => s.team <= 3 && s.id !== editingShift.currentStaffId).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <div className="text-xs text-slate-400 italic">
                Not: Yeni seçilen personelin o günkü "Off" kaydı silinecek ve eski personelin orijinal vardiyası geri yüklenecektir.
              </div>
              <button
                onClick={handleOvertimeSwap}
                disabled={!selectedSubstitute}
                className="w-full bg-emerald-600 text-white py-2 rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                Değiştir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT STAFF MODAL */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm print:hidden">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-slide-up">
            <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
              <h3 className="font-heading font-bold text-slate-800">Personel Düzenle</h3>
              <button onClick={() => setEditingStaff(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Ad Soyad</label>
                <input
                  type="text"
                  className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-white text-slate-800"
                  value={editStaffForm.name}
                  onChange={e => setEditStaffForm({ ...editStaffForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Unvan</label>
                <input
                  type="text"
                  className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-white text-slate-800"
                  value={editStaffForm.title}
                  onChange={e => setEditStaffForm({ ...editStaffForm, title: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Ekip</label>
                <select
                  className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-white text-slate-800"
                  value={editStaffForm.team}
                  onChange={e => setEditStaffForm({ ...editStaffForm, team: parseInt(e.target.value) })}
                >
                  <option value="1">1. Grup</option>
                  <option value="2">2. Grup</option>
                  <option value="3">3. Grup</option>
                  <option value="4">Santral</option>
                </select>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  onClick={() => setEditingStaff(null)}
                  className="flex-1 bg-white border border-slate-200 text-slate-700 py-2 rounded-lg font-medium hover:bg-slate-50"
                >
                  İptal
                </button>
                <button
                  onClick={handleUpdateStaff}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700"
                >
                  Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CHANGE PASSWORD MODAL */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm print:hidden">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-slide-up">
            <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
              <h3 className="font-heading font-bold text-slate-800">Şifre Değiştir</h3>
              <button onClick={() => setShowPasswordModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Eski Şifre</label>
                <input
                  type="password"
                  className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-white text-slate-800"
                  value={passwordForm.oldPin}
                  onChange={e => setPasswordForm({ ...passwordForm, oldPin: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Yeni Şifre</label>
                <input
                  type="password"
                  className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-white text-slate-800"
                  value={passwordForm.newPin}
                  onChange={e => setPasswordForm({ ...passwordForm, newPin: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Yeni Şifre (Tekrar)</label>
                <input
                  type="password"
                  className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-white text-slate-800"
                  value={passwordForm.confirmPin}
                  onChange={e => setPasswordForm({ ...passwordForm, confirmPin: e.target.value })}
                />
              </div>

              <div className="pt-2">
                <button
                  onClick={handleChangePassword}
                  className="w-full bg-emerald-600 text-white py-2 rounded-lg font-medium hover:bg-emerald-700"
                >
                  Değiştir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;