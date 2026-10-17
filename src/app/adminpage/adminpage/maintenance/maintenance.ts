import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { Asset, MaintenanceLog } from '../../../service/asset.model';
import { AssetService } from '../../../service/asset.service';

type MaintenanceFilter = 'All' | 'Overdue' | 'Due soon' | 'Active' | 'Completed';
type MaintenanceView = 'work-orders' | 'schedule' | 'history';

@Component({
  selector: 'app-maintenance',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './maintenance.html',
  styleUrl: './maintenance.css',
})
export class Maintenance {
  private readonly assetService = inject(AssetService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly assets = this.assetService.assets;
  readonly logs = this.assetService.maintenanceLogs;
  readonly searchTerm = signal('');
  readonly activeFilter = signal<MaintenanceFilter>('All');
  readonly isFormOpen = signal(false);
  readonly formError = signal('');
  private readonly viewParam = toSignal(this.route.queryParamMap.pipe(map((params) => params.get('view'))), { initialValue: this.route.snapshot.queryParamMap.get('view') });
  readonly activeView = computed<MaintenanceView>(() => {
    const view = this.viewParam();
    return view === 'schedule' || view === 'history' ? view : 'work-orders';
  });
  readonly filters = computed<MaintenanceFilter[]>(() => {
    if (this.activeView() === 'history') {
      return ['All', 'Completed'];
    }
    if (this.activeView() === 'work-orders') {
      return ['All', 'Active'];
    }
    return ['All', 'Overdue', 'Due soon', 'Active', 'Completed'];
  });
  readonly selectedFilter = computed<MaintenanceFilter>(() => {
    const filter = this.activeFilter();
    return this.filters().includes(filter) ? filter : 'All';
  });
  readonly viewTitle = computed(() => ({
    'work-orders': 'Work orders',
    schedule: 'Maintenance schedule',
    history: 'Service history',
  })[this.activeView()]);
  readonly viewDescription = computed(() => ({
    'work-orders': 'Track pending and in-progress repairs assigned to your service teams.',
    schedule: 'Review every asset’s next service date and plan preventive maintenance.',
    history: 'Review completed maintenance work and the people who performed it.',
  })[this.activeView()]);

  newWorkOrder = {
    assetId: '',
    issueDescription: '',
    technician: '',
    cost: 0,
    status: 'Pending' as MaintenanceLog['status'],
  };

  readonly overdueAssets = computed(() => this.assets().filter((asset) => this.isOverdue(asset)));
  readonly dueSoonAssets = computed(() => this.assets().filter((asset) => this.isDueSoon(asset)));
  readonly activeLogs = computed(() => this.logs().filter((log) => log.status !== 'Completed'));
  readonly completedLogs = computed(() => this.logs().filter((log) => log.status === 'Completed'));
  readonly historyItems = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    return this.completedLogs().filter((log) => {
      const asset = this.assets().find((entry) => entry.id === log.assetId);
      return !search || [asset?.name, asset?.machineName, asset?.serialNumber, asset?.category, log.technician, log.issueDescription]
        .some((value) => value?.toLowerCase().includes(search));
    });
  });
  readonly maintenanceItems = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const filter = this.selectedFilter();

    const items = this.assets().filter((asset) => {
      const log = this.latestLogFor(asset.id);
      const matchesSearch = !search || [asset.name, asset.machineName, asset.serialNumber, asset.category, log?.technician, log?.issueDescription]
        .some((value) => value?.toLowerCase().includes(search));
      const matchesFilter = filter === 'All'
        || (filter === 'Overdue' && this.isOverdue(asset))
        || (filter === 'Due soon' && this.isDueSoon(asset))
        || (filter === 'Active' && log?.status !== undefined && log.status !== 'Completed')
        || (filter === 'Completed' && log?.status === 'Completed');
      return matchesSearch && matchesFilter;
    });

    if (this.activeView() === 'work-orders') {
      return items.filter((asset) => {
        const log = this.latestLogFor(asset.id);
        return log && log.status !== 'Completed';
      });
    }
    return items;
  });

  openWorkOrder(asset?: Asset): void {
    this.newWorkOrder = {
      assetId: asset?.id || '',
      issueDescription: '',
      technician: '',
      cost: 0,
      status: 'Pending',
    };
    this.formError.set('');
    this.isFormOpen.set(true);
  }

  closeWorkOrder(): void {
    this.isFormOpen.set(false);
    this.formError.set('');
  }

  createWorkOrder(): void {
    if (!this.newWorkOrder.assetId || !this.newWorkOrder.issueDescription.trim() || !this.newWorkOrder.technician.trim()) {
      this.formError.set('Asset, maintenance details, and technician are required.');
      return;
    }

    const cost = Number(this.newWorkOrder.cost);
    if (!Number.isFinite(cost) || cost < 0) {
      this.formError.set('Estimated cost must be a valid positive amount.');
      return;
    }

    const wasCreated = this.assetService.scheduleMaintenance({
      assetId: this.newWorkOrder.assetId,
      issueDescription: this.newWorkOrder.issueDescription.trim(),
      technician: this.newWorkOrder.technician.trim(),
      cost,
      status: this.newWorkOrder.status,
    });
    if (!wasCreated) {
      this.formError.set('This asset already has an open work order. Complete it before creating another one.');
      return;
    }
    this.closeWorkOrder();
  }

  completeWorkOrder(log: MaintenanceLog): void {
    this.assetService.completeMaintenance(log.id);
  }

  selectFilter(filter: MaintenanceFilter): void {
    this.activeFilter.set(filter);
  }

  selectView(view: MaintenanceView): void {
    this.router.navigate(['/adminpage/maintenance'], {
      queryParams: view === 'work-orders' ? {} : { view },
    });
  }

  latestLogFor(assetId: string): MaintenanceLog | undefined {
    return this.logs().find((log) => log.assetId === assetId);
  }

  assetName(assetId: string): string {
    const asset = this.assets().find((entry) => entry.id === assetId);
    return asset?.machineName || asset?.name || 'Unknown asset';
  }

  assetSerial(assetId: string): string {
    return this.assets().find((entry) => entry.id === assetId)?.serialNumber || 'Unknown serial';
  }

  isOverdue(asset: Asset): boolean {
    return this.dateOnly(asset.nextMaintenanceDate) < this.today();
  }

  isDueSoon(asset: Asset): boolean {
    const dueDate = this.dateOnly(asset.nextMaintenanceDate);
    const today = this.today();
    const inThirtyDays = new Date(today);
    inThirtyDays.setDate(today.getDate() + 30);
    return dueDate >= today && dueDate <= inThirtyDays;
  }

  dueLabel(asset: Asset): string {
    if (this.isOverdue(asset)) {
      return 'Overdue';
    }
    if (this.isDueSoon(asset)) {
      return 'Due soon';
    }
    return 'Scheduled';
  }

  private today(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  private dateOnly(value: Date): Date {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }
}
