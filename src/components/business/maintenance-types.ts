// Shared types for the maintenance/PPM feature

export type AssetCategory =
  | 'fire_safety' | 'emergency_lighting' | 'fire_suppression' | 'fire_doors' | 'smoke_ventilation'
  | 'electrical' | 'lightning_protection' | 'ups_systems' | 'solar_panels' | 'ev_charging'
  | 'hvac' | 'boilers' | 'air_handling' | 'ventilation' | 'heat_pumps' | 'chiller_systems'
  | 'plumbing' | 'water_hygiene' | 'water_treatment' | 'drainage' | 'rainwater_harvesting'
  | 'gas' | 'gas_detection'
  | 'security' | 'access_control' | 'cctv' | 'intruder_alarms' | 'intercoms'
  | 'lifts_lifting' | 'escalators' | 'loading_bays'
  | 'roofing' | 'glazing' | 'doors_windows' | 'cladding' | 'structural'
  | 'grounds' | 'car_parks' | 'drainage_external' | 'pest_control'
  | 'asbestos' | 'legionella' | 'air_quality' | 'waste_management' | 'other';

export type ServiceFrequency =
  | 'weekly' | 'bi_weekly' | 'monthly' | 'bi_monthly' | 'quarterly'
  | 'six_monthly' | 'annual' | '2_yearly' | '3_yearly' | '4_yearly'
  | '5_yearly' | '6_yearly' | '7_yearly' | '8_yearly' | '9_yearly' | '10_yearly';

export type ServiceContractStatus = 'draft' | 'active' | 'expired' | 'cancelled';
export type ServiceVisitStatus = 'scheduled' | 'confirmed' | 'completed' | 'overdue' | 'cancelled';
export type ServiceDocumentType = 'certificate' | 'report' | 'invoice' | 'photo' | 'other';

export interface Site {
  id: string;
  company_id: string;
  name: string;
  address: string;
  postcode: string;
  is_active: boolean;
  created_at: string;
}

export interface Asset {
  id: string;
  site_id: string;
  company_id: string;
  name: string;
  category: AssetCategory;
  description: string | null;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  install_date: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ServiceContract {
  id: string;
  company_id: string;
  contractor_id: string;
  site_id: string | null;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  annual_value: number | null;
  status: ServiceContractStatus;
  created_at: string;
}

export interface ServiceSchedule {
  id: string;
  contract_id: string;
  asset_id: string;
  frequency: ServiceFrequency;
  last_completed_at: string | null;
  next_due_at: string;
  notice_days: number;
  is_active: boolean;
  created_at: string;
}

export interface ServiceVisit {
  id: string;
  schedule_id: string;
  asset_id: string;
  contractor_id: string;
  company_id: string;
  scheduled_window_start: string;
  scheduled_window_end: string;
  confirmed_date: string | null;
  completed_at: string | null;
  status: ServiceVisitStatus;
  notes: string | null;
  created_at: string;
}

export interface ServiceDocument {
  id: string;
  visit_id: string;
  uploaded_by: string;
  document_name: string;
  document_url: string;
  document_type: ServiceDocumentType;
  created_at: string;
}

// Display helpers
export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  fire_safety: 'Fire Safety', emergency_lighting: 'Emergency Lighting',
  fire_suppression: 'Fire Suppression', fire_doors: 'Fire Doors', smoke_ventilation: 'Smoke Ventilation',
  electrical: 'Electrical', lightning_protection: 'Lightning Protection',
  ups_systems: 'UPS Systems', solar_panels: 'Solar Panels', ev_charging: 'EV Charging',
  hvac: 'HVAC', boilers: 'Boilers', air_handling: 'Air Handling',
  ventilation: 'Ventilation', heat_pumps: 'Heat Pumps', chiller_systems: 'Chiller Systems',
  plumbing: 'Plumbing', water_hygiene: 'Water Hygiene', water_treatment: 'Water Treatment',
  drainage: 'Drainage', rainwater_harvesting: 'Rainwater Harvesting',
  gas: 'Gas', gas_detection: 'Gas Detection',
  security: 'Security', access_control: 'Access Control', cctv: 'CCTV',
  intruder_alarms: 'Intruder Alarms', intercoms: 'Intercoms',
  lifts_lifting: 'Lifts & Lifting', escalators: 'Escalators', loading_bays: 'Loading Bays',
  roofing: 'Roofing', glazing: 'Glazing', doors_windows: 'Doors & Windows',
  cladding: 'Cladding', structural: 'Structural',
  grounds: 'Grounds', car_parks: 'Car Parks', drainage_external: 'External Drainage',
  pest_control: 'Pest Control', asbestos: 'Asbestos', legionella: 'Legionella',
  air_quality: 'Air Quality', waste_management: 'Waste Management', other: 'Other',
};

export const ASSET_CATEGORY_GROUPS: { label: string; categories: AssetCategory[] }[] = [
  { label: 'Fire & Life Safety', categories: ['fire_safety', 'emergency_lighting', 'fire_suppression', 'fire_doors', 'smoke_ventilation'] },
  { label: 'Electrical', categories: ['electrical', 'lightning_protection', 'ups_systems', 'solar_panels', 'ev_charging'] },
  { label: 'Mechanical', categories: ['hvac', 'boilers', 'air_handling', 'ventilation', 'heat_pumps', 'chiller_systems'] },
  { label: 'Plumbing & Water', categories: ['plumbing', 'water_hygiene', 'water_treatment', 'drainage', 'rainwater_harvesting'] },
  { label: 'Gas', categories: ['gas', 'gas_detection'] },
  { label: 'Security & Access', categories: ['security', 'access_control', 'cctv', 'intruder_alarms', 'intercoms'] },
  { label: 'Vertical Transport', categories: ['lifts_lifting', 'escalators', 'loading_bays'] },
  { label: 'Building Fabric', categories: ['roofing', 'glazing', 'doors_windows', 'cladding', 'structural'] },
  { label: 'Grounds & External', categories: ['grounds', 'car_parks', 'drainage_external', 'pest_control'] },
  { label: 'Compliance & Other', categories: ['asbestos', 'legionella', 'air_quality', 'waste_management', 'other'] },
];

export const FREQUENCY_LABELS: Record<ServiceFrequency, string> = {
  weekly: 'Weekly', bi_weekly: 'Bi-weekly', monthly: 'Monthly', bi_monthly: 'Bi-monthly',
  quarterly: 'Quarterly', six_monthly: '6-monthly', annual: 'Annual',
  '2_yearly': '2-yearly', '3_yearly': '3-yearly', '4_yearly': '4-yearly',
  '5_yearly': '5-yearly', '6_yearly': '6-yearly', '7_yearly': '7-yearly',
  '8_yearly': '8-yearly', '9_yearly': '9-yearly', '10_yearly': '10-yearly',
};

export const FREQUENCY_DAYS: Record<ServiceFrequency, number> = {
  weekly: 7, bi_weekly: 14, monthly: 30, bi_monthly: 61, quarterly: 91,
  six_monthly: 183, annual: 365, '2_yearly': 730, '3_yearly': 1095,
  '4_yearly': 1460, '5_yearly': 1825, '6_yearly': 2190, '7_yearly': 2555,
  '8_yearly': 2920, '9_yearly': 3285, '10_yearly': 3650,
};

export const VISIT_STATUS_CONFIG: Record<ServiceVisitStatus, { label: string; colour: string }> = {
  scheduled: { label: 'Scheduled', colour: 'bg-blue-100 text-blue-800 border-blue-200' },
  confirmed: { label: 'Confirmed', colour: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  completed: { label: 'Completed', colour: 'bg-green-100 text-green-800 border-green-200' },
  overdue: { label: 'Overdue', colour: 'bg-red-100 text-red-800 border-red-200' },
  cancelled: { label: 'Cancelled', colour: 'bg-gray-100 text-gray-700 border-gray-200' },
};

export const CONTRACT_STATUS_CONFIG: Record<ServiceContractStatus, { label: string; colour: string }> = {
  draft: { label: 'Draft', colour: 'bg-gray-100 text-gray-700 border-gray-200' },
  active: { label: 'Active', colour: 'bg-green-100 text-green-800 border-green-200' },
  expired: { label: 'Expired', colour: 'bg-red-100 text-red-800 border-red-200' },
  cancelled: { label: 'Cancelled', colour: 'bg-gray-100 text-gray-700 border-gray-200' },
};