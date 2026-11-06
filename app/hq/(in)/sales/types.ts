// @ts-nocheck
export type Org = { id: string; parent: string | null; code: string; name: string; type: "본부" | "지사" | "영업소" | "에이전시"; active: boolean; opened: string; closed: string | null; reps: number };
export type Rep = { id: string; code: string; name: string; org: string; org_code: string; org_id: string; type: "정규" | "계약" | "외부"; joined: string; emp_no: string | null; active: boolean; stores: number };
export type Overview = { orgs: Org[]; reps: Rep[] };
export const ORG_TYPES = ["본부", "지사", "영업소", "에이전시"] as const;
export const REP_TYPES = ["정규", "계약", "외부"] as const;
