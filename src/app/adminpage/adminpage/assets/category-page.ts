import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { Asset, AssetStatus } from '../../../service/asset.model';
import { AssetService } from '../../../service/asset.service';

@Component({
  selector: 'app-asset-category-page',
  standalone: false,
  templateUrl: './category-page.html',
  styleUrl: './category-page.css',
})
export class AssetCategoryPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly assetService = inject(AssetService);

  readonly statuses: AssetStatus[] = ['Operational', 'Under Maintenance', 'Decommissioned', 'In Storage'];
  readonly searchTerm = signal('');
  readonly categorySlug = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('category') || 'assets')),
    { initialValue: this.route.snapshot.paramMap.get('category') || 'assets' }
  );
  readonly categoryName = computed(() => this.toTitle(this.categorySlug()));
  readonly categoryAssets = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const category = this.categorySlug();

    return this.assetService.assets().filter((asset) => {
      const matchesCategory = this.toSlug(asset.category) === category;
      const matchesSearch = !search || [asset.name, asset.machineName, asset.productName, asset.make, asset.model, asset.serialNumber, asset.assignedTo, asset.ipAddress]
        .some((value) => value?.toLowerCase().includes(search));
      return matchesCategory && matchesSearch;
    });
  });

  goToInventory(): void {
    this.router.navigate(['/adminpage/inventory']);
  }

  updateStatus(asset: Asset, event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.assetService.updateAssetStatus(asset.id, select.value as AssetStatus);
  }

  private toSlug(value: string): string {
    return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  private toTitle(value: string): string {
    return value.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
  }
}
