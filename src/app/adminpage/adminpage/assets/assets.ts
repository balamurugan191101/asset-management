import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import * as XLSX from 'xlsx';
import { Asset, AssetCategory, AssetStatus } from '../../../service/asset.model';
import { AssetService } from '../../../service/asset.service';

interface AssetGroup {
  key: string;
  assets: Asset[];
}

interface ImportedAssetGroup {
  key: string;
  assets: (Omit<Asset, 'id'> & { isNew: boolean })[];
}

@Component({
  selector: 'app-assets',
  standalone: false,
  templateUrl: './assets.html',
  styleUrl: './assets.css',
})

export class Assets {
  private readonly assetService = inject(AssetService);
  private fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  readonly formOnly = input(false);
  readonly formClosed = output<void>();

  ngOnInit(): void {
    if (this.formOnly() || this.route.snapshot.queryParamMap.get('register') === 'true') {
      this.openForm();
    }
  }

  readonly categories = this.assetService.categories;
  readonly categoryPages = computed(() => this.categories().map((category) => ({
    label: category,
    slug: this.toSlug(category),
    icon: this.categoryIcon(category),
  })));
  readonly showAllCategories = signal(false);
  readonly visibleCategoryPages = computed(() => this.showAllCategories() ? this.categoryPages() : this.categoryPages().slice(0, 4));
  readonly viewModes = [
    { name: 'List', icon: 'fa-list' },
    { name: 'Card', icon: 'fa-grip' },
  ] as const;
  readonly viewMode = signal<(typeof this.viewModes)[number]['name']>('List');
  readonly layoutMenuOpen = signal(false);
  readonly statuses: AssetStatus[] = ['Operational', 'Under Maintenance', 'Decommissioned', 'In Storage'];
  readonly searchTerm = signal(this.route.snapshot.queryParamMap.get('search') || '');
  readonly categoryFilter = signal<AssetCategory | 'All'>(this.categoryFromQuery());
  readonly statusFilter = signal<AssetStatus | 'All'>('All');
  readonly isFormOpen = signal(false);
  readonly pendingDelete = signal<Asset | null>(null);
  readonly importPreview = signal<Omit<Asset, 'id'>[]>([]);
  readonly formError = signal('');
  readonly statusError = signal('');
  readonly isCategoryFormOpen = signal(false);
  readonly categoryPageError = signal('');
  readonly formCategory = signal<AssetCategory>('Laptop');
  newCategoryName = '';

  readonly assets = this.assetService.assets;
  readonly filteredAssets = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const category = this.categoryFilter();
    const status = this.statusFilter();

    return this.assets().filter((asset) => {
      const matchesSearch = !search || [asset.name, asset.machineName, asset.productName, asset.make, asset.model, asset.serialNumber, asset.assignedTo, asset.ipAddress, asset.location]
        .some((value) => value?.toLowerCase().includes(search));
      return matchesSearch && (category === 'All' || asset.category === category)
        && (status === 'All' || asset.status === status);
    });
  });

  readonly assetGroups = computed<AssetGroup[]>(() => {
    const groupsMap = new Map<string, Asset[]>();

    this.filteredAssets().forEach((asset) => {
      const key = asset.importGroupKey || asset.machineName?.trim() || asset.name;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, []);
      }
      groupsMap.get(key)!.push(asset);
    });

    const formattedGroups = Array.from(groupsMap.entries()).map(([key, assets]) => ({
      key,
      assets: this.sortAssetsWithCpuFirst(assets)
    }));

    // Sort groups numerically by Machine Name number (e.g., 50 before 51)
    return formattedGroups.sort((a, b) => this.extractMachineNumber(a.key) - this.extractMachineNumber(b.key));
  });

  // 2. UPDATE YOUR EXISTING importGroups SIGNAL HERE
  readonly importGroups = computed<ImportedAssetGroup[]>(() => {
    // Compare against the full, unfiltered asset list so "new" reflects what's
    // actually in the backend, not just what the current filters show.
    const currentAssets = this.assets();
    const groupsMap = new Map<string, (Omit<Asset, 'id'> & { isNew: boolean })[]>();

    this.importPreview().forEach((asset) => {
      const key = asset.importGroupKey || asset.machineName?.trim() || asset.name;
      const isNew = !currentAssets.some((existing) => this.isDataMatching(existing, asset));
      if (!groupsMap.has(key)) {
        groupsMap.set(key, []);
      }
      groupsMap.get(key)!.push({ ...asset, isNew });
    });

    const formattedGroups = Array.from(groupsMap.entries()).map(([key, assets]) => ({
      key,
      assets: this.sortAssetsWithCpuFirst(assets)
    }));

    return formattedGroups.sort((a, b) =>
      this.extractMachineNumber(a.key) - this.extractMachineNumber(b.key)
    );
  });

  /** True only when every asset in the group is new, i.e. the whole machine/group is not in inventory yet. */
  isNewImportGroup(group: ImportedAssetGroup): boolean {
    return group.assets.length > 0 && group.assets.every((asset) => asset.isNew);
  }


  readonly summary = computed(() => {
    const category = this.categoryFilter();
    const selectedAssets = this.assets().filter((asset) => category === 'All' || asset.category === category);

    return {
      total: selectedAssets.length,
      operational: selectedAssets.filter((asset) => asset.status === 'Operational').length,
      maintenance: selectedAssets.filter((asset) => asset.status === 'Under Maintenance').length,
      storage: selectedAssets.filter((asset) => asset.status === 'In Storage').length,
    };
  });

  readonly newAsset: Omit<Asset, 'id'> = this.createEmptyAsset();
  readonly formProfile = computed(() => {
    const category = this.formCategory();
    const profiles: Record<string, { assetLabel: string; assetPlaceholder: string; productLabel: string; productPlaceholder: string; makeLabel: string; makePlaceholder: string; modelLabel: string; modelPlaceholder: string; serialLabel: string; serialPlaceholder: string; ipPlaceholder: string; assignedPlaceholder: string; locationPlaceholder: string; showIpAddress: boolean; showAssignedTo: boolean }> = {
      Laptop: { assetLabel: 'Laptop name', assetPlaceholder: 'e.g. Finance laptop', productLabel: 'Product name', productPlaceholder: 'e.g. ThinkPad X1 Carbon', makeLabel: 'Make', makePlaceholder: 'e.g. Lenovo', modelLabel: 'Model', modelPlaceholder: 'e.g. 21CB', serialLabel: 'Serial number', serialPlaceholder: 'e.g. DL-99401', ipPlaceholder: 'e.g. 192.168.1.36', assignedPlaceholder: 'e.g. John Doe', locationPlaceholder: 'e.g. Floor 2 - Desk 40', showIpAddress: true, showAssignedTo: true },
      Systems: { assetLabel: 'System name', assetPlaceholder: 'e.g. HR workstation', productLabel: 'System type', productPlaceholder: 'e.g. All-in-one PC', makeLabel: 'Manufacturer', makePlaceholder: 'e.g. Dell', modelLabel: 'System model', modelPlaceholder: 'e.g. OptiPlex 7010', serialLabel: 'Asset serial number', serialPlaceholder: 'e.g. SYS-20401', ipPlaceholder: 'e.g. 192.168.1.42', assignedPlaceholder: 'e.g. John Doe', locationPlaceholder: 'e.g. HR office', showIpAddress: true, showAssignedTo: true },
      Headphones: { assetLabel: 'Headset name', assetPlaceholder: 'e.g. Call centre headset', productLabel: 'Headset type', productPlaceholder: 'e.g. USB headset', makeLabel: 'Brand', makePlaceholder: 'e.g. Jabra', modelLabel: 'Headset model', modelPlaceholder: 'e.g. Evolve2 40', serialLabel: 'Serial number', serialPlaceholder: 'e.g. HP-10482', ipPlaceholder: '', assignedPlaceholder: 'e.g. John Doe', locationPlaceholder: 'e.g. Support desk', showIpAddress: false, showAssignedTo: true },
      Printers: { assetLabel: 'Printer name', assetPlaceholder: 'e.g. Accounts printer', productLabel: 'Printer type', productPlaceholder: 'e.g. Laser printer', makeLabel: 'Manufacturer', makePlaceholder: 'e.g. HP', modelLabel: 'Printer model', modelPlaceholder: 'e.g. LaserJet Pro', serialLabel: 'Serial number', serialPlaceholder: 'e.g. PR-22014', ipPlaceholder: 'e.g. 192.168.1.60', assignedPlaceholder: 'e.g. Accounts team', locationPlaceholder: 'e.g. Accounts office', showIpAddress: true, showAssignedTo: true },
      Intercom: { assetLabel: 'Intercom name', assetPlaceholder: 'e.g. Reception intercom', productLabel: 'Intercom type', productPlaceholder: 'e.g. IP intercom', makeLabel: 'Manufacturer', makePlaceholder: 'e.g. Aiphone', modelLabel: 'Intercom model', modelPlaceholder: 'e.g. IX-DV', serialLabel: 'Serial number', serialPlaceholder: 'e.g. IC-30018', ipPlaceholder: 'e.g. 192.168.1.80', assignedPlaceholder: '', locationPlaceholder: 'e.g. Main reception', showIpAddress: true, showAssignedTo: false },
      CCTV: { assetLabel: 'Camera name', assetPlaceholder: 'e.g. Main entrance camera', productLabel: 'Camera type', productPlaceholder: 'e.g. IP dome camera', makeLabel: 'Manufacturer', makePlaceholder: 'e.g. Hikvision', modelLabel: 'Camera model', modelPlaceholder: 'e.g. DS-2CD2143G2', serialLabel: 'Camera serial number', serialPlaceholder: 'e.g. CCTV-10021', ipPlaceholder: 'e.g. 192.168.1.70', assignedPlaceholder: '', locationPlaceholder: 'e.g. Main entrance', showIpAddress: true, showAssignedTo: false },
      'Server & Network': { assetLabel: 'Server or network device', assetPlaceholder: 'e.g. Core switch or file server', productLabel: 'Device type', productPlaceholder: 'e.g. Rack server or managed switch', makeLabel: 'Manufacturer', makePlaceholder: 'e.g. Dell or Cisco', modelLabel: 'Device model', modelPlaceholder: 'e.g. PowerEdge R740 or Catalyst 9300', serialLabel: 'Serial number', serialPlaceholder: 'e.g. SV-33012', ipPlaceholder: 'e.g. 10.0.0.20', assignedPlaceholder: '', locationPlaceholder: 'e.g. Data Center A', showIpAddress: true, showAssignedTo: false },
      Peripheral: { assetLabel: 'Peripheral name', assetPlaceholder: 'e.g. USB keyboard', productLabel: 'Peripheral type', productPlaceholder: 'e.g. Wireless keyboard', makeLabel: 'Brand', makePlaceholder: 'e.g. Logitech', modelLabel: 'Model', modelPlaceholder: 'e.g. MX Keys', serialLabel: 'Serial number', serialPlaceholder: 'e.g. PF-55120', ipPlaceholder: '', assignedPlaceholder: 'e.g. John Doe', locationPlaceholder: 'e.g. Floor 2 - Desk 40', showIpAddress: false, showAssignedTo: true },
      Mobile: { assetLabel: 'Mobile device name', assetPlaceholder: 'e.g. Sales phone', productLabel: 'Device type', productPlaceholder: 'e.g. Smartphone', makeLabel: 'Make', makePlaceholder: 'e.g. Samsung', modelLabel: 'Model', modelPlaceholder: 'e.g. Galaxy S24', serialLabel: 'IMEI or serial number', serialPlaceholder: 'e.g. 356789012345678', ipPlaceholder: 'e.g. 192.168.1.90', assignedPlaceholder: 'e.g. John Doe', locationPlaceholder: 'e.g. Sales department', showIpAddress: true, showAssignedTo: true },
    };
    return profiles[category] || { assetLabel: `${category} name`, assetPlaceholder: `e.g. ${category} asset`, productLabel: `${category} type`, productPlaceholder: `e.g. ${category} type`, makeLabel: `${category} manufacturer`, makePlaceholder: 'e.g. Manufacturer', modelLabel: `${category} model`, modelPlaceholder: `e.g. ${category} model`, serialLabel: `${category} serial number`, serialPlaceholder: 'e.g. Asset-001', ipPlaceholder: '', assignedPlaceholder: '', locationPlaceholder: `e.g. ${category} area`, showIpAddress: false, showAssignedTo: false };
  });

  openForm(): void {
    this.formError.set('');
    Object.assign(this.newAsset, this.createEmptyAsset());
    const selectedCategory = this.categoryFilter();
    if (selectedCategory !== 'All') {
      this.newAsset.category = selectedCategory;
    }
    this.formCategory.set(this.newAsset.category);
    this.isFormOpen.set(true);
  }

  closeForm(): void {
    this.isFormOpen.set(false);
    this.formError.set('');
    if (this.formOnly()) {
      this.formClosed.emit();
    }
  }

  registerAsset(): void {
    const machineName = this.newAsset.machineName?.trim() || this.newAsset.name.trim();
    const category = this.newAsset.category?.trim();
    if (!machineName || !this.newAsset.serialNumber.trim() || !category) {
      this.formError.set('Asset name, serial number, and category are required.');
      return;
    }

    this.assetService.addAsset({ ...this.newAsset, name: machineName, machineName, category });
    this.closeForm();
  }

  openImport(input: HTMLInputElement): void {
    input.click();
  }

  private extractMachineNumber(machineName: string): number {
    const match = machineName?.match(/^\d+/);
    return match ? parseInt(match[0], 10) : Number.MAX_SAFE_INTEGER;
  }

  private sortAssetsWithCpuFirst<T extends { productName?: string; category?: string; name?: string }>(assets: T[]): T[] {
    const getOrder = (item: T): number => {
      const label = `${item.productName || ''} ${item.category || ''} ${item.name || ''}`.toLowerCase();
      if (label.includes('cpu')) return 1;
      if (label.includes('monitor')) return 2;
      if (label.includes('keyboard')) return 3;
      if (label.includes('mouse')) return 4;
      return 5;
    };

    return [...assets].sort((a, b) => getOrder(a) - getOrder(b));
  }


importAssets(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    if (!(reader.result instanceof ArrayBuffer)) {
      input.value = '';
      return;
    }

    const workbook = XLSX.read(reader.result, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    // 1. Unroll merged cell ranges across all covered cells
    if (sheet['!merges']) {
      sheet['!merges'].forEach((range) => {
        const parentAddress = XLSX.utils.encode_cell({ r: range.s.r, c: range.s.c });
        const parentCell = sheet[parentAddress];
        if (parentCell) {
          for (let R = range.s.r; R <= range.e.r; ++R) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
              const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
              if (!sheet[cellAddress]) {
                sheet[cellAddress] = { ...parentCell };
              }
            }
          }
        }
      });
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    if (rows.length < 2) {
      input.value = '';
      return;
    }

    const headers = rows[0].map((h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, ''));
    
    let activeSNo = '';
    let activeMachineName = '';
    let activeUserName = '';
    let activeGroupKey = '';

    const importedAssets = rows.slice(1).map((row, index) => {
      const isBlankRow = row.every((cell) => String(cell ?? '').trim() === '');
      if (isBlankRow) return null;

      const value = (names: string[]) => {
        const col = headers.findIndex((h) => names.includes(h));
        return col >= 0 ? String(row[col] ?? '').trim() : '';
      };

      // Extract current row values
      const rawSNo = value(['sno', 'group', 'groupnumber']);
      const rawMachineName = this.sanitizeMachineName(value(['machinename', 'asset', 'name']));
      const rawUserName = value(['username', 'assignedto']);

      const productName = value(['productname']);
      const serialNumber = value(['serialnumber', 'serial']);
      const make = value(['make']);
      const model = value(['model']);
      const ipAddress = value(['ip', 'ipaddress']);

      // Group Boundary Checks
      const isNewSNo = Boolean(rawSNo && rawSNo !== activeSNo);
      const isNewMachine = Boolean(rawMachineName && rawMachineName !== activeMachineName);
      const isNewUser = Boolean(rawUserName && rawUserName !== activeUserName);

      // A new group starts if S.No changes OR an explicit User/Machine change is detected
      const isNewGroup = isNewSNo || (isNewUser && (rawMachineName || rawSNo)) || (isNewMachine && rawUserName);

      if (isNewGroup) {
        activeSNo = rawSNo || activeSNo;
        activeMachineName = rawMachineName || activeMachineName;
        activeUserName = rawUserName || activeUserName;

        // Compound key guarantees uniqueness across merged WORKGROUP groups
        const baseKey = activeSNo || activeMachineName || `Group-${index + 1}`;
        activeGroupKey = `${baseKey}-${activeUserName || 'UNASSIGNED'}`;
      } else {
        // Inherit running context for sub-rows (e.g., precision 5550 under Headphone)
        activeMachineName = rawMachineName || activeMachineName;
        activeUserName = rawUserName || activeUserName;
        activeSNo = rawSNo || activeSNo;
      }

      const rowCategory = this.inferImportedCategory(`${productName} ${activeMachineName}`);
      const today = new Date();

      return {
        name: activeMachineName || `Imported asset ${index + 1}`,
        machineName: activeMachineName,
        importGroupKey: activeGroupKey, // Guaranteed unique key per S.No + User
        productName: productName || 'N/A',
        make: make || 'N/A',
        model: model || 'N/A',
        serialNumber: serialNumber || 'N/A',
        assignedTo: activeUserName || 'N/A',
        ipAddress: ipAddress || 'N/A',
        category: rowCategory,
        status: 'Operational' as AssetStatus,
        nextMaintenanceDate: new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()),
      };
    }).filter((asset): asset is NonNullable<typeof asset> => asset !== null);

    this.importPreview.set(importedAssets);
    input.value = '';
  };
  reader.readAsArrayBuffer(file);
}
  /**
   * Helper to strip leading digits and optional spaces/hyphens
   */
  private sanitizeMachineName(rawName?: string): string {
    if (!rawName) return '';
    return rawName.trim().replace(/^\d+[\s\-_]*/, '');
  }

  /**
   * Compares imported items against backend data to update matches or insert new assets.
   */
  confirmImport(): void {
    // Use complete asset list from state, NOT filtered view
    const currentAssets = this.assets(); // or this.assetsSignal()
    const pendingImports = this.importPreview();

    if (!pendingImports.length) return;

    const upsertPayload: (Asset | Omit<Asset, 'id'>)[] = [];

    pendingImports.forEach((importedItem) => {
      const existingAsset = currentAssets.find((existing) =>
        this.isDataMatching(existing, importedItem)
      );

      const fallbackName = importedItem.name || importedItem.machineName || 'Unnamed Asset';

      if (existingAsset) {
        // MATCH FOUND: Send with existing ID so backend updates row instead of inserting new row
        upsertPayload.push({
          ...existingAsset,
          ...importedItem,
          id: existingAsset.id,
          name: importedItem.name || existingAsset.name || fallbackName,
          ipAddress: this.isValidIp(importedItem.ipAddress) ? importedItem.ipAddress : existingAsset.ipAddress
        });
      } else {
        // NO MATCH: New record
        upsertPayload.push({
          ...importedItem,
          name: fallbackName,
          serialNumber: importedItem.serialNumber || 'N/A',
          category: importedItem.category || 'General',
          status: importedItem.status || 'Operational',
          ipAddress: this.isValidIp(importedItem.ipAddress) ? importedItem.ipAddress : undefined
        } as Omit<Asset, 'id'>);
      }
    });

    this.assetService.bulkAddAssets(upsertPayload, () => {
      this.importPreview.set([]);
    });
  }

  private isDataMatching(existing: Asset, imported: Partial<Asset>): boolean {
    // Handle both snake_case and camelCase property names from DB
    const existingSerial = (existing.serialNumber || (existing as any).serial_number || '').trim().toLowerCase();
    const importedSerial = (imported.serialNumber || (imported as any).serial_number || '').trim().toLowerCase();

    // Match by Serial Number if valid and not N/A
    if (existingSerial && importedSerial && existingSerial !== 'n/a' && existingSerial === importedSerial) {
      return true;
    }

    // Fallback: Match by Machine Name + Product Name
    const existingMachine = (existing.machineName || (existing as any).machine_name || '').trim().toLowerCase();
    const importedMachine = (imported.machineName || (imported as any).machine_name || '').trim().toLowerCase();

    const existingProduct = (existing.productName || (existing as any).product_name || existing.name || '').trim().toLowerCase();
    const importedProduct = (imported.productName || (imported as any).product_name || imported.name || '').trim().toLowerCase();

    return Boolean(existingMachine && importedMachine && existingMachine === importedMachine && existingProduct === importedProduct);
  }


  cancelImport(): void {
    this.importPreview.set([]);
  }


  isValidIp(ip?: string | null): boolean {
    if (!ip) return false;

    // Standard IPv4 Regular Expression
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4Regex.test(ip.trim());
  }

  // exportAssets(): void {
  //   const headers = ['S.No', 'Machine Name', 'Product Name', 'Make', 'Model', 'Serial Number', 'User Name', 'IP'];
  //   const rows = this.filteredAssets().map((asset, index) => [
  //     String(index + 1), asset.machineName || asset.name, asset.productName || '', asset.make || '',
  //     asset.model || '', asset.serialNumber, asset.assignedTo || '', asset.ipAddress || ''
  //   ]);
  //   const csv = [headers, ...rows]
  //     .map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(','))
  //     .join('\n');
  //   const link = document.createElement('a');
  //   link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  //   link.download = 'asset-inventory.csv';
  //   link.click();
  //   URL.revokeObjectURL(link.href);
  // }

  // updateStatus(asset: Asset, event: Event): void {
  //   const select = event.target as HTMLSelectElement;
  //   const wasUpdated = this.assetService.updateAssetStatus(asset.id, select.value as AssetStatus);
  //   if (!wasUpdated) {
  //     this.statusError.set('This asset has an open work order and cannot be marked operational yet.');
  //     select.value = asset.status;
  //     return;
  //   }
  //   this.statusError.set('');
  // }





  exportAssets(): void {
    const headers = ['S.No', 'Machine Name', 'Product Name', 'Make', 'Model', 'Serial Number', 'User Name', 'ip'];
    const data: (string | number)[][] = [headers];
    const merges: XLSX.Range[] = [];

    let currentRow = 1; // Row 0 is the header

    this.assetGroups().forEach((group, groupIndex) => {
      const assetCount = group.assets.length;
      const firstAsset = group.assets[0];

      // Build row data for each sub-asset in the group
      group.assets.forEach((asset) => {
        data.push([
          groupIndex + 1,                                            // Column A: S.No
          asset.machineName || asset.name || '',                      // Column B: Machine Name
          asset.productName || '',                                   // Column C: Product Name
          asset.make || '',                                          // Column D: Make
          asset.model || '',                                         // Column E: Model
          asset.serialNumber || '',                                  // Column F: Serial Number
          firstAsset.assignedTo || '',                               // Column G: User Name
          this.isValidIp(firstAsset.ipAddress) ? firstAsset.ipAddress! : '' // Column H: ip
        ]);
      });

      // Add merge ranges for grouped columns if the group contains more than 1 row
      if (assetCount > 1) {
        const startRow = currentRow;
        const endRow = currentRow + assetCount - 1;

        // Merge S.No (Col A)
        merges.push({ s: { r: startRow, c: 0 }, e: { r: endRow, c: 0 } });
        // Merge Machine Name (Col B)
        merges.push({ s: { r: startRow, c: 1 }, e: { r: endRow, c: 1 } });
        // Merge User Name (Col G)
        merges.push({ s: { r: startRow, c: 6 }, e: { r: endRow, c: 6 } });
        // Merge ip (Col H)
        merges.push({ s: { r: startRow, c: 7 }, e: { r: endRow, c: 7 } });
      }

      currentRow += assetCount;
    });

    // Create worksheet and attach merge metadata
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    worksheet['!merges'] = merges;

    // Auto-fit column widths
    worksheet['!cols'] = [
      { wch: 8 },  // S.No
      { wch: 22 }, // Machine Name
      { wch: 18 }, // Product Name
      { wch: 15 }, // Make
      { wch: 18 }, // Model
      { wch: 28 }, // Serial Number
      { wch: 20 }, // User Name
      { wch: 15 }  // ip
    ];

    // Create workbook and trigger file download
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Asset Inventory');

    const fileName = `asset-inventory-${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }


  updateStatus(group: { key: string; assets: Asset[] }, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const newStatus = select.value as AssetStatus;
    const machineName = group.assets[0].machineName || group.assets[0].name;

    // Check if any asset in the group has an active open work order before marking Operational
    if (newStatus === 'Operational') {
      const hasOpenWorkOrder = group.assets.some((asset) =>
        this.assetService.maintenanceLogs().some(
          (log) => log.assetId === asset.id && log.status !== 'Completed'
        )
      );

      if (hasOpenWorkOrder) {
        this.statusError.set('An asset in this group has an open work order and cannot be marked operational yet.');
        select.value = group.assets[0].status; // Revert select value
        return;
      }
    }

    this.statusError.set('');
    this.assetService.updateGroupStatus(machineName, newStatus);
  }

  askToDelete(asset: Asset): void {
    this.pendingDelete.set(asset);
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  deleteAsset(): void {
    const asset = this.pendingDelete();
    if (asset) {
      this.assetService.deleteAsset(asset.id);
      this.pendingDelete.set(null);
    }
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.categoryFilter.set('All');
    this.statusFilter.set('All');
  }

  selectLayout(mode: (typeof this.viewModes)[number]['name']): void {
    this.viewMode.set(mode);
    this.layoutMenuOpen.set(false);
  }

  selectCategory(category: AssetCategory | 'All'): void {
    this.categoryFilter.set(category);
    if (this.isFormOpen() && category !== 'All') {
      this.newAsset.category = category;
      this.formCategory.set(category);
    }
  }

  selectFormCategory(category: AssetCategory): void {
    this.newAsset.category = category;
    this.formCategory.set(category);
  }

  networkFieldLabel(): string {
    const category = this.formCategory();
    return category === 'Intercom' ? 'Intercom number' : category === 'Mobile' ? 'Mobile number' : 'IP address';
  }

  networkFieldPlaceholder(): string {
    const category = this.formCategory();
    return category === 'Intercom' ? 'e.g. 101 or +1 555 0100' : category === 'Mobile' ? 'e.g. +1 555 0100' : this.formProfile().ipPlaceholder;
  }

  toggleCategories(): void {
    this.showAllCategories.update((showAll) => !showAll);
  }

  toggleCellExpansion(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.closest('button, select, a, input, textarea')) {
      return;
    }

    target.closest('td')?.classList.toggle('expanded-cell');
  }

  openCategoryForm(): void {
    this.newCategoryName = '';
    this.categoryPageError.set('');
    this.isCategoryFormOpen.set(true);
  }

  closeCategoryForm(): void {
    this.isCategoryFormOpen.set(false);
    this.categoryPageError.set('');
  }

  createCategoryPage(): void {
    const label = this.newCategoryName.trim();
    const slug = this.toSlug(label);
    if (!slug) {
      this.categoryPageError.set('Enter a category name.');
      return;
    }

    if (this.categories().some((category) => this.toSlug(category) === slug)) {
      this.categoryPageError.set('That category already exists.');
      return;
    }

    this.assetService.addCategory(label);
    this.categoryFilter.set(label);
    this.formCategory.set(label);
    this.closeCategoryForm();
  }


  // Signal to keep track of selected group keys or machine names
  selectedGroupKeys = signal<Set<string>>(new Set());

  isGroupSelected(group: { key: string }): boolean {
    return this.selectedGroupKeys().has(group.key);
  }

  toggleGroupSelection(group: { key: string }, event: Event): void {
    const isChecked = (event.target as HTMLInputElement).checked;
    this.selectedGroupKeys.update((keys) => {
      const updated = new Set(keys);
      if (isChecked) {
        updated.add(group.key);
      } else {
        updated.delete(group.key);
      }
      return updated;
    });
  }

  toggleAllGroupSelection(event: Event): void {
    const isChecked = (event.target as HTMLInputElement).checked;
    if (isChecked) {
      const allKeys = new Set(this.assetGroups().map((g) => g.key));
      this.selectedGroupKeys.set(allKeys);
    } else {
      this.selectedGroupKeys.set(new Set());
    }
  }

  private toSlug(value: string): string {
    return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  private categoryFromQuery(): AssetCategory | 'All' {
    const slug = this.route.snapshot.queryParamMap.get('category');
    return this.categories().find((category) => this.toSlug(category) === slug) || 'All';
  }

  private categoryIcon(category: AssetCategory): string {
    const icons: Record<string, string> = {
      laptop: 'fa-laptop',
      systems: 'fa-computer',
      headphones: 'fa-headphones',
      printers: 'fa-print',
      intercom: 'fa-phone-volume',
      cctv: 'fa-video',
      'server-&-network': 'fa-server',
      peripheral: 'fa-keyboard',
      mobile: 'fa-mobile-screen-button',
    };
    return icons[this.toSlug(category)] || 'fa-layer-group';
  }

  private inferImportedCategory(input: string): AssetCategory {
    const value = input.toLowerCase();
    if (/(laptop|notebook|macbook)/.test(value)) {
      return 'Laptop';
    }
    if (/(cpu|desktop|system|optiplex|computer|workstation)/.test(value)) {
      return 'Systems';
    }
    if (/(monitor|display|keyboard|mouse|printer|scanner|peripheral)/.test(value)) {
      return 'Peripheral';
    }
    if (/(headphone|headset|earphone)/.test(value)) {
      return 'Headphones';
    }
    if (/(intercom|door phone)/.test(value)) {
      return 'Intercom';
    }
    if (/(cctv|camera)/.test(value)) {
      return 'CCTV';
    }
    if (/(server|router|switch|firewall|network)/.test(value)) {
      return 'Server & Network';
    }
    if (/(mobile|phone|tablet|iphone|android)/.test(value)) {
      return 'Mobile';
    }
    return 'Peripheral';
  }

  private createEmptyAsset(): Omit<Asset, 'id'> {
    const today = new Date();
    return {
      name: '',
      machineName: '',
      productName: '',
      make: '',
      model: '',
      serialNumber: '',
      ipAddress: '',
      category: 'Laptop',
      status: 'Operational',
      assignedTo: '',
      location: '',
      nextMaintenanceDate: new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()),
    };
  }



  isEditModalOpen = signal<boolean>(false);
  editingGroupName = signal<string>('');

  // Group-level form with sub-assets array
  groupEditForm: FormGroup = this.fb.group({
    machineName: ['', Validators.required],
    assignedTo: [''],
    ipAddress: [''],
    status: ['Operational', Validators.required],
    assets: this.fb.array([])
  });

  get subAssets(): FormArray {
    return this.groupEditForm.get('assets') as FormArray;
  }

  openEditForm(group: { key: string; assets: Asset[] }): void {
    const firstAsset = group.assets[0];
    this.editingGroupName.set(group.key);

    // Set shared group level fields
    this.groupEditForm.patchValue({
      machineName: firstAsset.machineName || firstAsset.name || '',
      assignedTo: firstAsset.assignedTo || '',
      ipAddress: firstAsset.ipAddress || '',
      status: firstAsset.status || 'Operational'
    });

    // Clear and populate sub-asset form controls
    this.subAssets.clear();
    group.assets.forEach((asset) => {
      this.subAssets.push(
        this.fb.group({
          id: [asset.id],
          productName: [asset.productName || '', Validators.required],
          make: [asset.make || ''],
          model: [asset.model || ''],
          serialNumber: [asset.serialNumber || '']
        })
      );
    });

    this.isEditModalOpen.set(true);
  }

  closeEditModal(): void {
    this.isEditModalOpen.set(false);
    this.subAssets.clear();
    this.groupEditForm.reset();
  }

  onSaveGroup(): void {
    if (this.groupEditForm.valid) {
      const formValue = this.groupEditForm.value;
      console.log('Group Updated Data:', formValue);

      // Update logic via assetService goes here

      this.closeEditModal();
    }
  }


  // Computed signal enabling delete button only when > 3 groups are selected
readonly canBulkDelete = computed(() => this.selectedGroupKeys().size > 3);

// Method to delete all assets belonging to selected groups
deleteSelectedGroups(): void {
  if (!this.canBulkDelete()) return;

  const selectedKeys = this.selectedGroupKeys();
  const assetsToDelete = this.assets().filter((asset) => {
    const key = asset.importGroupKey || asset.machineName?.trim() || asset.name;
    return selectedKeys.has(key);
  });

  if (confirm(`Are you sure you want to delete ${selectedKeys.size} asset groups (${assetsToDelete.length} total items)?`)) {
    assetsToDelete.forEach((asset) => this.assetService.deleteAsset(asset.id));
    this.selectedGroupKeys.set(new Set()); // Reset selection
  }
}


// Signal or state variable to control modal visibility
readonly showBulkDeleteModal = signal(false);

// Triggered when user clicks the trash icon button in the toolbar
openBulkDeleteModal(): void {
  if (!this.canBulkDelete()) return;
  this.showBulkDeleteModal.set(true);
}

// Triggered when user clicks "Cancel" inside the modal
closeBulkDeleteModal(): void {
  this.showBulkDeleteModal.set(false);
}

// Triggered when user clicks "Delete asset groups" inside the modal
confirmDeleteSelectedGroups(): void {
  const selectedKeys = this.selectedGroupKeys();
  const assetsToDelete = this.assets().filter((asset) => {
    const key = asset.importGroupKey || asset.machineName?.trim() || asset.name;
    return selectedKeys.has(key);
  });

  assetsToDelete.forEach((asset) => this.assetService.deleteAsset(asset.id));
  
  // Clear selection and close modal
  this.selectedGroupKeys.set(new Set());
  this.showBulkDeleteModal.set(false);
}

}