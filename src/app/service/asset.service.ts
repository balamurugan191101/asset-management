import { Injectable, signal, computed, inject, WritableSignal } from '@angular/core';
import { Asset, AssetCategory, AssetStatus, MaintenanceLog } from './asset.model';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environment/env';

@Injectable({
  providedIn: 'root'
})
export class AssetService {

  private readonly http = inject(HttpClient);
  private readonly api = environment.apiurl;

  // Single primary signal for all asset state operations
  readonly assets: WritableSignal<Asset[]> = signal<Asset[]>([]);

  private readonly categoriesSignal = signal<AssetCategory[]>([
    'Laptop', 'Systems', 'Headphones', 'Printers', 'Intercom',
    'CCTV', 'Server & Network', 'Peripheral', 'Mobile'
  ]);

  readonly categories = this.categoriesSignal.asReadonly();

  private readonly maintenanceLogsSignal = signal<MaintenanceLog[]>([
    {
      id: 'MNT-1000', assetId: 'AST-101', issueDescription: 'Completed quarterly hardware inspection and battery health check.',
      technician: 'John Doe', cost: 0, status: 'Completed', createdAt: new Date('2026-02-10'), completedAt: new Date('2026-02-10'),
    },
    {
      id: 'MNT-1001', assetId: 'AST-204', issueDescription: 'Inspect power supply and replace the failed unit.',
      technician: 'Infrastructure team', cost: 0, status: 'In Progress', createdAt: new Date('2026-08-02'),
    },
    {
      id: 'MNT-1002', assetId: 'AST-305', issueDescription: 'Run a scheduled firmware and network health review.',
      technician: 'Network team', cost: 0, status: 'Pending', createdAt: new Date('2026-08-03'),
    },
  ]);

  readonly maintenanceLogs = this.maintenanceLogsSignal.asReadonly();

  // Computed signals pointing to the active `assets` signal
  readonly totalAssetsCount = computed(() => this.assets().length);
  readonly operationalCount = computed(() =>
    this.assets().filter(a => a.status === 'Operational').length
  );
  readonly underMaintenanceCount = computed(() =>
    this.assets().filter(a => a.status === 'Under Maintenance').length
  );
  readonly backupCount = computed(() =>
    this.assets().filter(a => a.status === 'In Storage').length
  );
  readonly decommissionedCount = computed(() =>
    this.assets().filter(a => a.status === 'Decommissioned').length
  );

  constructor() {
    // Fetch initial asset inventory from API on initialization
    this.loadAssets();
  }

  // CRUD & Operations
  addCategory(category: AssetCategory): void {
    this.categoriesSignal.update(categories => categories.includes(category) ? categories : [...categories, category]);
  }

  addAsset(assetData: Omit<Asset, 'id'>): void {
    this.http.post<Asset>(`${this.api}assets`, assetData).subscribe({
      next: (newAsset) => this.assets.update((list) => [newAsset, ...list]),
      error: (err) => console.error('Failed to create asset:', err)
    });
  }

  updateAssetStatus(id: number | string, status: AssetStatus): boolean {
    this.http.patch(`${this.api}assets/${id}/status`, { status }).subscribe({
      next: () => {
        this.assets.update((list) =>
          list.map((item) => (item.id === id ? { ...item, status } : item))
        );
      },
      error: (err) => console.error('Failed to update asset status:', err)
    });
    return true;
  }

  scheduleMaintenance(log: Omit<MaintenanceLog, 'id' | 'createdAt' | 'completedAt'>): boolean {
    const hasOpenWorkOrder = this.maintenanceLogsSignal().some((entry) =>
      entry.assetId === log.assetId && entry.status !== 'Completed'
    );
    if (hasOpenWorkOrder) {
      return false;
    }

    const maintenanceLog: MaintenanceLog = {
      ...log,
      id: `MNT-${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`,
      createdAt: new Date(),
    };
    this.maintenanceLogsSignal.update((logs) => [maintenanceLog, ...logs]);
    this.updateAssetStatus(log.assetId, 'Under Maintenance');
    return true;
  }

  completeMaintenance(id: string): void {
    const log = this.maintenanceLogsSignal().find((entry) => entry.id === id);
    if (!log || log.status === 'Completed') {
      return;
    }

    this.maintenanceLogsSignal.update((logs) => logs.map((entry) =>
      entry.id === id ? { ...entry, status: 'Completed', completedAt: new Date() } : entry
    ));
    const hasOtherOpenWorkOrder = this.maintenanceLogsSignal().some((entry) =>
      entry.assetId === log.assetId && entry.id !== id && entry.status !== 'Completed'
    );
    if (!hasOtherOpenWorkOrder) {
      this.assets.update((assets) => assets.map((asset) => asset.id === log.assetId
        ? { ...asset, status: 'Operational', nextMaintenanceDate: this.nextMaintenanceDate() }
        : asset
      ));
    }
  }

  loadAssets(page?: number, limit?: number): void {
    const params: Record<string, string> = {};
    if (page) params['page'] = page.toString();
    if (limit) params['limit'] = limit.toString();

    this.http.get<Asset[]>(`${this.api}assets`, { params }).subscribe({
      next: (data) => this.assets.set(data),
      error: (err) => console.error('Failed to load assets from server:', err)
    });
  }

  bulkAddAssets(assetsData: Partial<Asset>[], onSuccess?: () => void): void {
    const CHUNK_SIZE = 200;

    if (assetsData.length <= CHUNK_SIZE) {
      this.http.post<{ message: string }>(`${this.api}assets/bulk`, assetsData).subscribe({
        next: () => {
          this.loadAssets();
          if (onSuccess) onSuccess();
        },
        error: (err: unknown) => console.error('Failed bulk asset import:', err)
      });
      return;
    }

    let completed = 0;
    const totalChunks = Math.ceil(assetsData.length / CHUNK_SIZE);

    for (let i = 0; i < assetsData.length; i += CHUNK_SIZE) {
      const chunk = assetsData.slice(i, i + CHUNK_SIZE);
      this.http.post<{ message: string }>(`${this.api}assets/bulk`, chunk).subscribe({
        next: () => {
          completed++;
          if (completed === totalChunks) {
            this.loadAssets();
            if (onSuccess) onSuccess();
          }
        },
        error: (err: unknown) => console.error('Failed batch chunk import:', err)
      });
    }
  }

  deleteAsset(id: number | string): void {
    this.http.delete(`${this.api}assets/${id}`).subscribe({
      next: () => {
        this.assets.update((list) => list.filter((item) => item.id !== id));
      },
      error: (err) => console.error('Failed to delete asset:', err)
    });
  }

  private nextMaintenanceDate(): Date {
    const date = new Date();
    date.setMonth(date.getMonth() + 6);
    return date;
  }


 updateGroupStatus(machineName: string, status: AssetStatus): void {
  // Find all assets matching this machine name
  const groupAssets = this.assets().filter(
    (item) => item.machineName === machineName || item.name === machineName
  );

  // Update local state immediately for all assets in the group
  this.assets.update((list) =>
    list.map((item) =>
      item.machineName === machineName || item.name === machineName
        ? { ...item, status }
        : item
    )
  );

  // Send update request for each asset ID in the group
  groupAssets.forEach((asset) => {
    this.http.patch(`${this.api}assets/${asset.id}/status`, { status }).subscribe({
      error: (err) => console.error(`Failed to update status for asset ${asset.id}:`, err)
    });
  });
}



}