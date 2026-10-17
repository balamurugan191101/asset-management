import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { Service, UserRecord } from '../../../service/service';
import { NewUser } from '../create-user-form/create-user-form';

@Component({
  selector: 'app-user-list',
  standalone: false,
  templateUrl: './create-user.html',
  styleUrl: './create-user.css',
})
export class UserList implements OnInit {
  isCreateUserModalOpen = false;
  searchTerm = '';
  createUserError = '';
  isSavingUser = false;
  showFilters = false;
  roleFilter = 'All';
  statusFilter = 'All';
  sortAscending = true;
  isImportPreviewOpen = false;
  importPreviewUsers: NewUser[] = [];
  importFileName = '';
  importError = '';
  isImporting = false;
  readonly selectedUserIds = new Set<string>();

  users: UserRecord[] = [];
  /* users: UserRecord[] = [
  //   { name: 'Sarah Smith', email: 'sarah.smith@ifluids.com', employeeId: 'EMP-1042', role: 'Administrator', department: 'Operations', status: 'Active' },
  //   { name: 'John Doe', email: 'john.doe@ifluids.com', employeeId: 'EMP-1078', role: 'Technician', department: 'Infrastructure', status: 'Active' },
  //   { name: 'Maya Patel', email: 'maya.patel@ifluids.com', employeeId: 'EMP-1091', role: 'Viewer', department: 'Finance', status: 'Pending' },
  //   { name: 'Daniel Brown', email: 'daniel.brown@ifluids.com', employeeId: 'EMP-1106', role: 'Technician', department: 'Support', status: 'Active' },
    
  // ]; */

  constructor(private readonly service: Service) {}

  ngOnInit(): void {
    this.service.getUsers().subscribe({
      next: (users) => {
        this.users = users;
      },
      error: () => {
        // Keep the sample rows visible while the API is unavailable locally.
      }
    });
  }

  get filteredUsers() {
    const searchTerm = this.searchTerm.trim().toLowerCase();
    return [...this.users]
      .filter((user) => {
        const matchesSearch = !searchTerm ||
          [user.name, user.email, user.employeeId, user.role, user.department, user.status]
            .some((value) => value.toLowerCase().includes(searchTerm));
        return matchesSearch &&
          (this.roleFilter === 'All' || user.role === this.roleFilter) &&
          (this.statusFilter === 'All' || user.status === this.statusFilter);
      })
      .sort((firstUser, secondUser) => {
        const comparison = firstUser.name.localeCompare(secondUser.name);
        return this.sortAscending ? comparison : -comparison;
      });
  }

  get roles(): string[] {
    return [...new Set(this.users.map((user) => user.role))].sort();
  }

  get hasActiveFilters(): boolean {
    return this.roleFilter !== 'All' || this.statusFilter !== 'All';
  }

  get allVisibleSelected(): boolean {
    return this.filteredUsers.length > 0 &&
      this.filteredUsers.every((user) => this.selectedUserIds.has(user.employeeId));
  }

  toggleFilters(): void {
    this.showFilters = !this.showFilters;
  }

  clearFilters(): void {
    this.roleFilter = 'All';
    this.statusFilter = 'All';
  }

  toggleSort(): void {
    this.sortAscending = !this.sortAscending;
  }

  toggleUserSelection(employeeId: string): void {
    if (this.selectedUserIds.has(employeeId)) {
      this.selectedUserIds.delete(employeeId);
    } else {
      this.selectedUserIds.add(employeeId);
    }
  }

  toggleAllVisible(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.filteredUsers.forEach((user) => {
      if (checked) {
        this.selectedUserIds.add(user.employeeId);
      } else {
        this.selectedUserIds.delete(user.employeeId);
      }
    });
  }

  deleteSelected(): void {
    const selectedUsers = this.users.filter((user) => this.selectedUserIds.has(user.employeeId));
    if (!selectedUsers.length) {
      return;
    }

    this.users = this.users.filter((user) => !this.selectedUserIds.has(user.employeeId));
    this.selectedUserIds.clear();
    selectedUsers.filter((user) => user.id !== undefined).forEach((user) => {
      this.service.deleteUser(user.id!).subscribe();
    });
  }

  exportUsers(): void {
    const headers = ['firstName', 'lastName', 'email', 'employeeId', 'role', 'department', 'status'];
    const rows = this.filteredUsers.map((user) => [
      user.firstName || user.name.split(' ')[0],
      user.lastName || user.name.split(' ').slice(1).join(' '),
      user.email, user.employeeId, user.role, user.department, user.status
    ]);
    const csv = [headers, ...rows].map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = 'users.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  importUsers(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const rows = String(reader.result).trim().split(/\r?\n/).filter(Boolean).slice(1);
      this.importPreviewUsers = rows.map((row) => this.parseCsvLine(row))
        .map(([firstName, lastName, email, password, employeeId, role, department]) =>
          ({ firstName, lastName, email, password, employeeId, role: role || 'Technician', department }))
        .filter((user) => user.firstName && user.lastName && user.email && user.password && user.employeeId && user.department);
      this.importFileName = file.name;
      this.importError = this.importPreviewUsers.length ? '' : 'No valid users found in this file.';
      this.isImportPreviewOpen = this.importPreviewUsers.length > 0;
      input.value = '';
    };
    reader.readAsText(file);
  }

  confirmImport(): void {
    if (!this.importPreviewUsers.length || this.isImporting) {
      return;
    }

    this.isImporting = true;
    this.importError = '';
    forkJoin(this.importPreviewUsers.map((user) => this.service.createUser(user))).subscribe({
      next: (createdUsers) => {
        this.users = [...createdUsers, ...this.users];
        this.cancelImportPreview();
        this.isImporting = false;
      },
      error: (error) => {
        this.importError = error.error?.message || 'Upload failed. No users were imported.';
        this.isImporting = false;
      }
    });
  }

  cancelImportPreview(): void {
    if (this.isImporting) {
      return;
    }

    this.isImportPreviewOpen = false;
    this.importPreviewUsers = [];
    this.importFileName = '';
  }

  private parseCsvLine(row: string): string[] {
    const values: string[] = [];
    let value = '';
    let quoted = false;

    for (let index = 0; index < row.length; index++) {
      const character = row[index];
      if (character === '"' && row[index + 1] === '"') {
        value += '"';
        index++;
      } else if (character === '"') {
        quoted = !quoted;
      } else if (character === ',' && !quoted) {
        values.push(value.trim());
        value = '';
      } else {
        value += character;
      }
    }

    values.push(value.trim());
    return values;
  }

  openCreateUserModal(): void {
    this.createUserError = '';
    this.isCreateUserModalOpen = true;
  }

  closeCreateUserModal(): void {
    this.isCreateUserModalOpen = false;
  }

  saveUser(user: NewUser): void {
    if (this.isSavingUser) {
      return;
    }

    this.createUserError = '';
    this.isSavingUser = true;

    this.service.createUser(user).subscribe({
      next: (createdUser) => {
        this.users = [createdUser, ...this.users];
        this.isSavingUser = false;
        this.closeCreateUserModal();
      },
      error: (error) => {
        this.isSavingUser = false;
        this.createUserError = error.error?.message || 'Unable to create user. Please try again.';
      }
    });
  }

}
