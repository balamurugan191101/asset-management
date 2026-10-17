import { Component, EventEmitter, Output } from '@angular/core';

export interface NewUser {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  employeeId: string;
  role: string;
  department: string;
}

@Component({
  selector: 'app-create-user-form',
  standalone: false,
  templateUrl: './create-user-form.html',
  styleUrl: './create-user-form.css',
})
export class CreateUserForm {
  @Output() readonly saved = new EventEmitter<NewUser>();
  @Output() readonly cancelled = new EventEmitter<void>();

  user: NewUser = {
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    employeeId: '',
    role: 'Technician',
    department: '',
  };

  submitted = false;

  get isValid(): boolean {
    return Boolean(this.user.firstName && this.user.lastName && this.user.email
      && this.user.password.length >= 6 && this.user.employeeId && this.user.department);
  }

  submit(): void {
    this.submitted = true;

    if (!this.isValid) {
      return;
    }

    this.saved.emit({ ...this.user });
    this.reset();
  }

  cancel(): void {
    this.reset();
    this.cancelled.emit();
  }

  private reset(): void {
    this.user = {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      employeeId: '',
      role: 'Technician',
      department: '',
    };
    this.submitted = false;
  }
}
