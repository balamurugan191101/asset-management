import {Component, inject, signal, computed} from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import { AssetService } from '../../../service/asset.service';
import { Service } from '../../../service/service';

export interface MetricCard {
  title: string;
  value: number | string;
  icon?: string;
  trend?: string;
  type: 'neutral' | 'success' | 'warning' | 'danger';
}

export interface ActivityLog {
  id: string;
  assetName: string;
  action: string;
  performedBy: string;
  timestamp: Date;
}

@Component({
  selector: 'app-home',
  standalone: false,
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  private assetService = inject(AssetService);
  private userService = inject(Service);

  isCreateUserModalOpen = false;
  isCreateAssetModalOpen = false;

  readonly overdueMaintenance = computed(() => {
    const today = new Date();
    return this.assetService.assets().filter(a => new Date(a.nextMaintenanceDate) < today);
  });

  readonly totalUsers = toSignal(
    this.userService.getUsers().pipe(
      map(users => users.length),
      catchError(() => of(0))
    ),
    { initialValue: 0 }
  );

  readonly metrics = computed<MetricCard[]>(() => [
    { title: 'Total IT Assets', value: this.assetService.totalAssetsCount(), type: 'neutral' },
    { title: 'Operational Assets', value: this.assetService.operationalCount(), type: 'success' },
    { title: 'Under Maintenance', value: this.assetService.underMaintenanceCount(), type: 'warning' },
    { title: 'Backup Assets', value: this.assetService.backupCount(), type: 'danger' },
    { title: 'Total Users', value: this.totalUsers(), type: 'neutral' }
  ]);

  readonly recentActivity = signal<ActivityLog[]>([
    { id: '1', assetName: 'Rack Server R740', action: 'Replaced Power Supply', performedBy: 'John Doe (Tech)', timestamp: new Date() },
    { id: '2', assetName: 'MacBook Pro 16"', action: 'Battery Replacement Completed', performedBy: 'Sarah Smith (Admin)', timestamp: new Date(Date.now() - 3600000 * 4) },
    { id: '3', assetName: 'Cisco Catalyst Switch', action: 'Firmware Upgraded to v17.3', performedBy: 'John Doe (Tech)', timestamp: new Date(Date.now() - 3600000 * 24) }
  ]);

  openCreateUserModal(): void {
    this.isCreateUserModalOpen = true;
  }

  closeCreateUserModal(): void {
    this.isCreateUserModalOpen = false;
  }

  openCreateAssetModal(): void {
    this.isCreateAssetModalOpen = true;
  }

  closeCreateAssetModal(): void {
    this.isCreateAssetModalOpen = false;
  }
}
