export type AssetCategory = 'Laptop' | 'Systems' | 'Headphones' | 'Printers' | 'Intercom' | 'CCTV' | 'Server & Network' | 'Peripheral' | 'Mobile' | string;
export type AssetStatus = 'Operational' | 'Under Maintenance' | 'Decommissioned' | 'In Storage';

export interface Asset {
  id: string;
  name: string;
  machineName?: string;
  importGroupKey?: string;
  productName?: string;
  make?: string;
  model?: string;
  serialNumber: string;
  ipAddress?: string;
  category: AssetCategory;
  status: AssetStatus;
  assignedTo?: string; // Optional employee name or ID
  location?: string;
  purchaseDate?: Date;
  nextMaintenanceDate: Date;
  isNew?: boolean;
}

export interface MaintenanceLog {
  id: string;
  assetId: string;
  issueDescription: string;
  technician: string;
  cost: number;
  status: 'Pending' | 'In Progress' | 'Completed';
  createdAt: Date;
  completedAt?: Date;
}