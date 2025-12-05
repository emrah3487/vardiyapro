
export interface Staff {
  id: string;
  name: string;
  title: string;
  team: number; // 1, 2, or 3 for shift rotation groups, 4 for Santral
}

export type ShiftType = 'Gündüz' | 'Gece' | 'Off' | 'Rapor' | 'İzin';

export interface ShiftAssignment {
  staffId: string;
  type: ShiftType;
  isOvertime?: boolean; // To mark weekend extra shifts
  label?: string; // e.g. "1. Gündüz", "2. Gece"
  isSantralDuty?: boolean; // To distinguish Ömer's extra santral shift
  isSubstitute?: boolean; // If this assignment is covering for someone else
  substituteFor?: string; // Name of the person being covered
}

export interface RosterDay {
  date: string; // ISO Date string YYYY-MM-DD
  assignments: ShiftAssignment[];
}

export interface RosterHistoryItem {
  id: string;
  name: string; // e.g. "Kasım 2025"
  createdAt: string;
  roster: RosterDay[];
  startDate: string; // Added to restore settings
  dayCount: number; // Added to restore settings
}

export interface LeaveRecord {
  id: string;
  staffId: string;
  startDate: string; // YYYY-MM-DD
  dayCount: number;
  type: 'Rapor' | 'İzin';
  substituteStaffIds?: string[]; // Changed to array for multiple substitutes
}

export interface ReportStat {
  staffId: string;
  staffName: string;
  totalShifts: number;
  dayShifts: number;
  nightShifts: number;
  weekendShifts: number;
  overtimeCount: number; // New: Track specific overtime count
}

export enum RuleType {
  NO_CONSECUTIVE_NIGHT = 'NO_CONSECUTIVE_NIGHT',
  MAX_SHIFTS_PER_WEEK = 'MAX_SHIFTS_PER_WEEK',
  MIN_REST_HOURS = 'MIN_REST_HOURS',
}

export interface Rule {
  id: string;
  type: RuleType;
  description: string;
  isActive: boolean;
}
