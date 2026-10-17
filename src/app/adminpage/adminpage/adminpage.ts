import { isPlatformBrowser } from '@angular/common';
import { Component, ElementRef, Inject, PLATFORM_ID } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-adminpage',
  standalone: false,
  templateUrl: './adminpage.html',
  styleUrl: './adminpage.css',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'closeDropdown()',
  },
})
export class Adminpage {
  companyname: string | null = null;
  userid: string | null = null;
  username = 'Administrator';
  userimgpath = '';
  imageurl = false;
  showMobileSearch = false;
  searchTerm = '';
  isNavbarOpen = false;
  openDropdown: 'assets' | 'maintenance' | 'reports' | null = null;

  constructor(
    private router: Router,
    private el: ElementRef,
    @Inject(PLATFORM_ID) private platformId: object
  ) {
    if (isPlatformBrowser(this.platformId)) {
      this.companyname = localStorage.getItem('companyname');
      this.userid = localStorage.getItem('user');
      this.username = localStorage.getItem('username') || this.username;
      this.userimgpath = localStorage.getItem('userimgpath') || '';

      if (this.userimgpath.startsWith('blob:')) {
        this.userimgpath = '';
        localStorage.removeItem('userimgpath');
      }

      this.imageurl = Boolean(this.userimgpath);
    }
  }

  logout(): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem('user');
      localStorage.removeItem('username');
      localStorage.removeItem('userimgpath');
    }
    this.router.navigate(['/login']);
  }

  myaccount(): void {
    this.router.navigate(['/adminpage/home']);
  }

  employees(): void {
    this.router.navigate(['/adminpage/employees']);
  }

  onUploadClick(fileInput: HTMLInputElement): void {
    fileInput.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file || !isPlatformBrowser(this.platformId)) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        return;
      }

      this.userimgpath = reader.result;
      this.imageurl = true;
      localStorage.setItem('userimgpath', this.userimgpath);
    };
    reader.readAsDataURL(file);
  }

  toggleMobileSearch(): void {
    this.showMobileSearch = !this.showMobileSearch;
  }

  closeMobileSearch(): void {
    this.showMobileSearch = false;
  }

  submitSearch(): void {
    const search = this.searchTerm.trim();
    this.showMobileSearch = false;
    this.router.navigate(['/adminpage/inventory'], {
      queryParams: search ? { search } : {},
    });
  }

  async toggleProfileSidebar(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const offcanvas = this.el.nativeElement.querySelector('#offcanvasNavbar');
    if (!offcanvas) {
      return;
    }

    const bootstrap = await import('bootstrap');
    bootstrap.Offcanvas.getOrCreateInstance(offcanvas).toggle();
  }

  async closeProfileSidebar(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const offcanvas = this.el.nativeElement.querySelector('#offcanvasNavbar');
    if (!offcanvas) {
      return;
    }

    const bootstrap = await import('bootstrap');
    bootstrap.Offcanvas.getOrCreateInstance(offcanvas).hide();
  }

  toggleNavbar(): void {
    this.isNavbarOpen = !this.isNavbarOpen;
    if (this.isNavbarOpen) {
      this.showMobileSearch = false;
    }
  }

  closeNavbar(): void {
    this.isNavbarOpen = false;
    this.showMobileSearch = false;
    this.openDropdown = null;
  }

  toggleDropdown(dropdown: 'assets' | 'maintenance' | 'reports'): void {
    this.openDropdown = this.openDropdown === dropdown ? null : dropdown;
  }

  closeDropdown(): void {
    this.openDropdown = null;
  }

  onDocumentClick(event: Event): void {
    const target = event.target;

    if (target instanceof Node && !this.el.nativeElement.contains(target)) {
      this.closeDropdown();
    }
  }
}
