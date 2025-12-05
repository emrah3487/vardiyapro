
import { Staff, RosterDay, ShiftAssignment, ReportStat, ShiftType, LeaveRecord } from '../types';

// Reference configuration from the original system
const REF_DATE_STR = "2025-11-20"; // Thursday
const CYCLE_LENGTH = 6;

// Starting indices relative to the reference date for the 6-day cycle
// Cycle: 0:1.Gündüz, 1:2.Gündüz, 2:1.Gece, 3:2.Gece, 4:1.Off, 5:2.Off
const TEAM_OFFSETS: { [key: number]: number } = {
  1: 5, // Starts at 2. Off
  2: 1, // Starts at 2. Gündüz
  3: 3  // Starts at 2. Gece
};

const CYCLE_LABELS = [
  "1. Gündüz", 
  "2. Gündüz", 
  "1. Gece", 
  "2. Gece", 
  "1. Off", 
  "2. Off"
];

const getShiftFromCycleIndex = (idx: number): 'Gündüz' | 'Gece' | 'Off' => {
  if (idx === 0 || idx === 1) return 'Gündüz';
  if (idx === 2 || idx === 3) return 'Gece';
  return 'Off';
};

/**
 * Calculates the standard cycle shift for a staff member on a specific date.
 * Used to restore original shifts when removing overtime.
 */
export const getStandardCycleShift = (staff: Staff, dateStr: string): { type: ShiftType, label: string } | null => {
  if (staff.team > 3) return null; // Only for standard rotation teams (1, 2, 3)

  const targetDate = new Date(dateStr);
  const refDate = new Date(REF_DATE_STR);
  
  const diffTime = targetDate.getTime() - refDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  const startOffset = TEAM_OFFSETS[staff.team];
  let idx = (startOffset + diffDays) % CYCLE_LENGTH;
  if (idx < 0) idx += CYCLE_LENGTH;

  return {
    type: getShiftFromCycleIndex(idx),
    label: CYCLE_LABELS[idx]
  };
};

/**
 * Checks if a staff member is on leave for a specific date
 */
const getLeaveForDate = (staffId: string, dateStr: string, leaves: LeaveRecord[]): LeaveRecord | undefined => {
  const targetDate = new Date(dateStr);
  return leaves.find(l => {
    if (l.staffId !== staffId) return false;
    const start = new Date(l.startDate);
    const end = new Date(start);
    end.setDate(end.getDate() + (l.dayCount - 1)); // Inclusive
    return targetDate >= start && targetDate <= end;
  });
};

export const generateInitialRoster = (
  startDate: string,
  daysCount: number,
  staffList: Staff[],
  overtimePoolIds: string[] = [], // IDs of staff eligible for weekend overtime
  leaves: LeaveRecord[] = [] // List of active leaves
): RosterDay[] => {
  const roster: RosterDay[] = [];
  const start = new Date(startDate);
  const refDate = new Date(REF_DATE_STR);

  // Helper to find specific staff
  const suleyman = staffList.find(s => s.name === "Süleyman Çevik");
  const sefa = staffList.find(s => s.name === "Sefa Günaydın");
  const omer = staffList.find(s => s.name === "Ömer Selim");

  // Track overtime counts dynamically to ensure fairness during generation
  const currentOvertimeCounts: { [id: string]: number } = {};
  const lastOvertimeDayIndex: { [id: string]: number } = {};
  
  // Track substitute usage counts to ensure rotation among selected subs
  const currentSubstituteCounts: { [id: string]: number } = {};
  const lastSubstituteDayIndex: { [id: string]: number } = {};

  staffList.forEach(s => {
    currentOvertimeCounts[s.id] = 0;
    lastOvertimeDayIndex[s.id] = -999;
    currentSubstituteCounts[s.id] = 0;
    lastSubstituteDayIndex[s.id] = -999;
  });

  for (let i = 0; i < daysCount; i++) {
    const currentDate = new Date(start);
    currentDate.setDate(start.getDate() + i);
    const dateStr = currentDate.toISOString().split('T')[0];
    const dayOfWeek = currentDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

    // Calculate days difference from reference date
    const diffTime = currentDate.getTime() - refDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    let assignments: ShiftAssignment[] = [];
    const staffCycleIndices: { [id: string]: number } = {};
    
    // Look back at yesterday for rest rules (Used for Overtime & Substitutes)
    let workedNightYesterdayIds: string[] = [];
    // Helper to check ALL assignments from yesterday (to catch duplicates or split shifts)
    const checkYesterdayNight = (sId: string): boolean => {
      if (roster.length === 0) return false;
      const yesterday = roster[roster.length - 1];
      return yesterday.assignments.some(a => a.staffId === sId && a.type === 'Gece');
    };

    if (roster.length > 0) {
       const yesterday = roster[roster.length - 1];
       workedNightYesterdayIds = yesterday.assignments
         .filter(a => a.type === 'Gece')
         .map(a => a.staffId);
    }

    // 1. Assign Standard Teams (1, 2, 3) - The Base Cycle
    staffList.forEach(staff => {
      if (staff.team >= 1 && staff.team <= 3) {
        const startOffset = TEAM_OFFSETS[staff.team];
        let idx = (startOffset + diffDays) % CYCLE_LENGTH;
        if (idx < 0) idx += CYCLE_LENGTH;

        staffCycleIndices[staff.id] = idx;
        const shiftType = getShiftFromCycleIndex(idx);
        const label = CYCLE_LABELS[idx]; 
        
        // CHECK FOR LEAVE
        const leave = getLeaveForDate(staff.id, dateStr, leaves);

        if (leave) {
          // Staff is on leave
          assignments.push({
            staffId: staff.id,
            type: leave.type, // 'Rapor' or 'İzin'
            label: `${label} (${leave.type})`
          });

          // Handle Substitute(s)
          // Logic: Find the best fit from selected substitutes with FAIR ROTATION
          if (leave.substituteStaffIds && leave.substituteStaffIds.length > 0 && shiftType !== 'Off') {
             
             // Get actual staff objects for the selected IDs
             const potentialSubs = leave.substituteStaffIds
                .map(id => staffList.find(s => s.id === id))
                .filter(Boolean) as Staff[];

             // Score candidates based on rules
             const scoredSubs = potentialSubs.map(sub => {
                let score = 0;
                let subIdx = -1;
                
                // Calculate substitute's current cycle
                if (sub.team >= 1 && sub.team <= 3) {
                   const subOffset = TEAM_OFFSETS[sub.team];
                   subIdx = (subOffset + diffDays) % CYCLE_LENGTH;
                   if (subIdx < 0) subIdx += CYCLE_LENGTH;
                }

                // Rule: Rest (Cannot work Day if worked Night yesterday)
                if (checkYesterdayNight(sub.id) && shiftType === 'Gündüz') {
                   return { sub, score: -100 }; // Disqualified
                }

                // Rule: Target Shift is DAY
                if (shiftType === 'Gündüz') {
                   if (subIdx === 2) score += 50; // 1. Gece -> 24h Opportunity (Best)
                   else if (subIdx === 5) score += 30; // 2. Off (Good)
                   else if (subIdx === 4) score += 10; // 1. Off (Okay)
                   else if (subIdx === 0 || subIdx === 1) score -= 50; // Already working Day (Conflict)
                } 
                // Rule: Target Shift is NIGHT
                else if (shiftType === 'Gece') {
                   if (subIdx === 4) score += 50; // 1. Off -> Suitable for Night (Best - New Rule)
                   else if (subIdx === 1) score += 40; // 2. Gündüz -> Allow (Long Shift / Uzun Mesai)
                   else if (subIdx === 5) score -= 100; // 2. Off -> FORBIDDEN (Next day is 1. Gündüz)
                   else if (subIdx === 2 || subIdx === 3) score -= 50; // Already working Night (Conflict)
                }

                return { sub, score };
             });

             // Sort by score descending AND Fairness (Sequential)
             scoredSubs.sort((a, b) => {
                // 1. Score (Desc) - Must meet physical requirements first
                if (b.score !== a.score) return b.score - a.score;
                
                // 2. Count (Asc) - Pick person with FEWER shifts first
                const countDiff = currentSubstituteCounts[a.sub.id] - currentSubstituteCounts[b.sub.id];
                if (countDiff !== 0) return countDiff;

                // 3. Last Day (Asc) - Pick person who worked longest ago
                const lastDiff = lastSubstituteDayIndex[a.sub.id] - lastSubstituteDayIndex[b.sub.id];
                if (lastDiff !== 0) return lastDiff;
                
                // 4. Stable sort by ID
                return a.sub.id.localeCompare(b.sub.id);
             });

             const bestCandidate = scoredSubs[0];

             // Assign if score is acceptable (not disqualified)
             if (bestCandidate && bestCandidate.score > -50) {
               assignments.push({
                 staffId: bestCandidate.sub.id,
                 type: shiftType, // Takes the original shift (Gündüz/Gece)
                 label: ``, 
                 isSubstitute: true,
                 isOvertime: true, // Mark as overtime for stats
                 substituteFor: staff.name
               });
               
               // Update Fairness Counters
               currentSubstituteCounts[bestCandidate.sub.id]++;
               lastSubstituteDayIndex[bestCandidate.sub.id] = i;

             } else {
               // No suitable substitute found
               assignments.push({
                 staffId: 'Unassigned', // Placeholder
                 type: shiftType,
                 label: 'Yedek Bulunamadı',
                 isSubstitute: true
               });
             }
          }
        } else {
          // Standard assignment
          assignments.push({
            staffId: staff.id,
            type: shiftType,
            label: label
          });
        }
      }
    });

    // 2. Assign Santral (Switchboard) - STRICT SLOT-BASED LOGIC WITH LEAVE AWARENESS
    let santralDayStaffId: string | null = null;
    let santralNightStaffId: string | null = null;
    let santralDayLabel = "";
    let santralNightLabel = "";

    // Helper: Check if a santral candidate is available (not on leave)
    const isAvailable = (sId: string | undefined) => {
      if (!sId) return false;
      return !getLeaveForDate(sId, dateStr, leaves);
    };

    // CHECK YESTERDAY FOR REST RULES (Specifically for Ömer)
    // We strictly check ALL assignments from yesterday to see if Ömer worked 'Gece'
    let omerWorkedNightYesterday = false;
    if (omer) {
      omerWorkedNightYesterday = checkYesterdayNight(omer.id);
    }

    // --- STEP A: SÜLEYMAN CHECK (Highest Priority) ---
    if (suleyman && isAvailable(suleyman.id)) {
      if (dayOfWeek === 6) { 
        // Saturday: 24 Hours
        santralDayStaffId = suleyman.id;
        santralDayLabel = "24 Saat";
        santralNightStaffId = suleyman.id;
        santralNightLabel = "24 Saat";
      } else if (dayOfWeek >= 2 && dayOfWeek <= 5) { 
        // Tue, Wed, Thu, Fri: Day only
        santralDayStaffId = suleyman.id;
        santralDayLabel = "Gündüz";
      }
      // Sun(0), Mon(1): Off
    }

    // --- STEP B: ÖMER CHECK (Medium Priority - Covers Gaps & Replaces if conditions met) ---
    if (omer && isAvailable(omer.id) && staffCycleIndices[omer.id] !== undefined) {
      const omerIdx = staffCycleIndices[omer.id];
      
      // DAY SHIFT CHECK
      if (!santralDayStaffId) {
        // Rule: Can only take Day shift if he did NOT work Night yesterday
        if (!omerWorkedNightYesterday) {
          // Sub-Rule 1: Ömer is on "2. Off" (Index 5) -> Takes Santral Day
          if (omerIdx === 5) {
            santralDayStaffId = omer.id;
            santralDayLabel = "Santral Nöbeti (Gündüz)";
          }
          // Sub-Rule 2: Süleyman is Absent (Off OR Leave) AND Ömer is on Standard Day (0 or 1) -> Takes Santral Day
          else if ((dayOfWeek === 0 || dayOfWeek === 1 || !isAvailable(suleyman?.id)) && (omerIdx === 0 || omerIdx === 1)) {
            santralDayStaffId = omer.id;
            santralDayLabel = `Santral Nöbeti (Gündüz)`;
          }
        }
      }

      // NIGHT SHIFT CHECK
      // Rule: Ömer takes Night Santral if he is on "1. Off" (Index 4)
      if (!santralNightStaffId && omerIdx === 4) {
        santralNightStaffId = omer.id;
        santralNightLabel = "Santral Nöbeti (Gece)";
      }
      // Sub-Rule: Ömer takes Night Santral if he is on Standard Night (Index 2 or 3) AND Süleyman/Sefa logic allows
      // BUT he must NOT take it if he is on Standard Day (0 or 1)
      else if (!santralNightStaffId && (omerIdx === 2 || omerIdx === 3)) {
         santralNightStaffId = omer.id;
         santralNightLabel = "Santral Nöbeti (Gece)";
      }
    }

    // --- STEP C: SEFA CHECK (Lowest Priority - Fills Remainder) ---
    if (sefa && isAvailable(sefa.id)) {
      if (!santralDayStaffId) {
        santralDayStaffId = sefa.id;
        santralDayLabel = "Gündüz";
        // If filling both slots on Sun/Mon, it's often 24h
        if (!santralNightStaffId && (dayOfWeek === 0 || dayOfWeek === 1)) {
          santralDayLabel = "24 Saat (Gündüz)";
        }
      }
      
      if (!santralNightStaffId) {
        santralNightStaffId = sefa.id;
        santralNightLabel = "Gece";
        if (santralDayStaffId === sefa.id && (dayOfWeek === 0 || dayOfWeek === 1)) {
          santralNightLabel = "24 Saat (Gece)";
        }
      }
    }

    // --- STEP D: COMMIT SANTRAL ASSIGNMENTS ---

    // Day Shift
    if (santralDayStaffId) {
      const isOmer = omer && santralDayStaffId === omer.id;
      // Mark as overtime if it's Ömer on his OFF day
      let isOvertime = false;
      if (isOmer && staffCycleIndices[omer.id] === 5) isOvertime = true;

      assignments.push({
        staffId: santralDayStaffId,
        type: 'Gündüz',
        label: santralDayLabel,
        isSantralDuty: isOmer,
        isOvertime: isOvertime
      });
    }

    // Night Shift
    if (santralNightStaffId) {
      const isOmer = omer && santralNightStaffId === omer.id;
      // Mark as overtime if it's Ömer on his OFF day
      let isOvertime = false;
      if (isOmer && staffCycleIndices[omer.id] === 4) isOvertime = true;

      assignments.push({
        staffId: santralNightStaffId,
        type: 'Gece',
        label: santralNightLabel,
        isSantralDuty: isOmer,
        isOvertime: isOvertime
      });
    }

    // If a Santral Staff is ON LEAVE, mark them as such in the roster
    [suleyman, sefa, omer].forEach(s => {
      if (!s) return;
      const l = getLeaveForDate(s.id, dateStr, leaves);
      if (l) {
        // Only push if not already assigned (Ömer might have a general shift)
        const exists = assignments.some(a => a.staffId === s.id && (a.type === 'Rapor' || a.type === 'İzin'));
        if (!exists) {
           assignments.push({ staffId: s.id, type: l.type, label: l.type });
        }
      } else {
         // Assign 'Off' for Santral Staff not working and not on leave
         if (s.team === 4 && s.id !== santralDayStaffId && s.id !== santralNightStaffId) {
            assignments.push({ staffId: s.id, type: 'Off', label: 'Off' });
         }
      }
    });


    // 3. WEEKEND OVERTIME (MESAİ) LOGIC
    if ((dayOfWeek === 0 || dayOfWeek === 6) && overtimePoolIds.length > 0) {
       
       // Find eligible candidates
       const candidates = staffList.filter(s => {
          // Must be in pool
          if (!overtimePoolIds.includes(s.id)) return false;
          
          // Rule: Cannot work Day if worked Night yesterday
          if (checkYesterdayNight(s.id)) return false;
          
          // Rule: Already working Day?
          if (assignments.some(a => a.staffId === s.id && a.type === 'Gündüz')) return false;

          // Rule: Check if on Leave (Cannot work OT if on Leave)
          if (getLeaveForDate(s.id, dateStr, leaves)) return false;

          // Special 24h Rule: "1. Gece" (Index 2) -> 24h
          const sIdx = staffCycleIndices[s.id];
          const isFirstNight = sIdx === 2; // "1. Gece"

          const isWorkingNight = assignments.some(a => a.staffId === s.id && a.type === 'Gece');
          // Only allow double shift if it's 1. Gece
          if (isWorkingNight && !isFirstNight) return false;

          return true;
       });

       candidates.sort((a, b) => {
          // PRIORITY 1: FAIRNESS (Count)
          const countDiff = currentOvertimeCounts[a.id] - currentOvertimeCounts[b.id];
          if (countDiff !== 0) return countDiff;

          // PRIORITY 2: ROTATION (Last Date)
          const lastDiff = lastOvertimeDayIndex[a.id] - lastOvertimeDayIndex[b.id];
          if (lastDiff !== 0) return lastDiff;

          // PRIORITY 3: SHIFT ADVANTAGE (24h)
          const idxA = staffCycleIndices[a.id];
          const idxB = staffCycleIndices[b.id];
          
          if (idxA === 2 && idxB !== 2) return -1; // A is 1. Gece (Preferred)
          if (idxB === 2 && idxA !== 2) return 1;

          if (idxA === 5 && idxB !== 5) return -1; // A is 2. Off (Preferred)
          if (idxB === 5 && idxA !== 5) return 1;

          return a.id.localeCompare(b.id);
       });

       if (candidates.length > 0) {
          const winner = candidates[0];
          
          // Assign Overtime
          // First, REMOVE their 'Off' shift if it exists
          const offIndex = assignments.findIndex(a => a.staffId === winner.id && a.type === 'Off');
          if (offIndex !== -1) {
             assignments.splice(offIndex, 1);
          }

          const sIdx = staffCycleIndices[winner.id];
          const is24h = sIdx === 2;

          assignments.push({
             staffId: winner.id,
             type: 'Gündüz',
             label: is24h ? '24 Saat Nöbet' : 'Mesai (Gündüz)',
             isOvertime: true
          });

          // Update Trackers
          currentOvertimeCounts[winner.id]++;
          lastOvertimeDayIndex[winner.id] = i;
       }
    }

    roster.push({ date: dateStr, assignments });
  }

  return roster;
};

/**
 * Calculates statistics for the roster
 */
export const calculateStats = (roster: RosterDay[], staffList: Staff[]): ReportStat[] => {
  const stats: { [id: string]: ReportStat } = {};

  // Initialize
  staffList.forEach(s => {
    stats[s.id] = {
      staffId: s.id,
      staffName: s.name,
      totalShifts: 0,
      dayShifts: 0,
      nightShifts: 0,
      weekendShifts: 0,
      overtimeCount: 0
    };
  });

  roster.forEach(day => {
    const date = new Date(day.date);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    
    // TRACK UNIQUE SHIFTS PER DAY
    // A staff might have multiple assignment entries if logic is complex (though we try to avoid it)
    // We only want to count 1 Day shift and 1 Night shift max per person per day
    const seenStaffTypes: {[id: string]: Set<string>} = {};

    day.assignments.forEach(assign => {
      if (assign.type === 'Off' || assign.type === 'Rapor' || assign.type === 'İzin') return;

      const sId = assign.staffId;
      if (!stats[sId]) return;

      if (!seenStaffTypes[sId]) seenStaffTypes[sId] = new Set();
      
      // Avoid double counting same shift type (e.g. 2 'Gece' entries)
      if (seenStaffTypes[sId].has(assign.type)) return;
      seenStaffTypes[sId].add(assign.type);

      // Increment Counts
      stats[sId].totalShifts++;
      
      if (isWeekend) stats[sId].weekendShifts++;

      if (assign.type === 'Gündüz') stats[sId].dayShifts++;
      if (assign.type === 'Gece') stats[sId].nightShifts++;

      // Overtime Logic
      if (assign.isOvertime) {
        stats[sId].overtimeCount++;
      }
    });
  });

  return Object.values(stats);
};
