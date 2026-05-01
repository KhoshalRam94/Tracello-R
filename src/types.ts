
export interface UserSession {
  username: string;
  email?: string;
  role: 'Production' | 'QC' | 'Admin' | 'Other';
  displayName: string;
}

export interface CustomField {
  label: string;
  required: boolean;
}

export interface Product {
  id: string;
  name: string;
  customFields: string[]; // Keep for legacy if needed, but we prefer fieldConfigs
  fieldConfigs?: CustomField[];
  qcTemplate?: string;
  cycleTime?: number; // In seconds
  efficiency?: number; // In percentage (0-100)
}

export interface PrintRecord {
  id: string;
  category: 'Child Part / Raw Material' | 'Finished Good' | 'Container';
  productName: string;
  serialNumber: string;
  timestamp: number;
}

export interface InspectionRecord {
  id: string;
  productName: string;
  orderNo: string;
  frameNo: string;
  dynamicFields: Record<string, string>;
  inspector: string;
  authEmail?: string;
  timestamp: number;
  qcStatus?: 'Pending' | 'In Progress' | 'Completed';
  shift?: 'A' | 'B' | 'C';
}

export interface QCReport {
  id: string;
  template: string;
  docId: string;
  orderNo: string;
  customerName?: string;
  frameNo: string;
  inspector: string;
  date: string;
  startTime?: string;
  endTime?: string;
  sections: QCSection[];
  notes?: string;
  timestamp: number;
}

export interface QCSection {
  title: string;
  items: QCItem[];
}

export interface QCItem {
  id: string;
  text: string;
  status: 'OK' | 'NOK' | 'NA';
  remarks?: string;
}

export interface QCTemplate {
  id: string;
  name: string;
  sections: QCSection[];
}

export interface DashboardStats {
  totalProduced: number;
  totalQCReports: number;
  anomaliesDetected: number;
  efficiency: number;
}

export interface UserAccount {
  id: string; // The login username
  password: string;
  role: UserSession['role'];
  displayName: string;
  email?: string;
}

export interface DowntimeRecord {
  id: string;
  hourInterval: string;
  duration: number; // in minutes
  category: 'Mechanical' | 'Electrical' | 'Tooling' | 'Material' | 'Utility' | 'Other'; // New: For Pareto analysis
  reason: string;
  maintenancePersonnel: string;
  operator: string;
  timestamp: number;
}
