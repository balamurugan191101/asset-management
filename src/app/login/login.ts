import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Service } from '../service/service';
import { Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login implements OnInit {
  loginForm: FormGroup;
  showpasswordtextbox: boolean = false;
  errormessage: string = '';

  // Reset Password & UI States
  isresetpassword: boolean = false;
  isMailSent: boolean = false;
  isMailSent2: boolean = true;
  rsusername: string = '';
  resetToken = '';
  newPassword = '';
  confirmPassword = '';
  errormessage2: string = '';

  // Dropdown Data
  companyname: any[] = []; // Populate this from an API call if needed
  selectcompanyname: string = '';

  constructor(
    private fb: FormBuilder,
    private service: Service,
    private router: Router,
    private route: ActivatedRoute
  ) {
    // Added rememberMe control to match reactive form binding in HTML
    this.loginForm = this.fb.group({
      email: ['', [Validators.required]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      rememberMe: [false]
    });
  }

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const token = params.get('resetToken');
      if (token) {
        this.resetToken = token;
        this.isresetpassword = true;
        this.isMailSent = false;
        this.isMailSent2 = false;
      }
    });
  }

  togglepasswordvisibility(): void {
    this.showpasswordtextbox = !this.showpasswordtextbox;
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.errormessage = '';

    const payload = {
      email: this.loginForm.value.email.trim(),
      password: String(this.loginForm.value.password).trim(),
      rememberMe: this.loginForm.value.rememberMe
    };

    this.service.login('login', payload).subscribe({
      next: (response: any) => {
        const redirectRoute = response.user ? '/adminpage' : '/login';
        this.router.navigate([redirectRoute]);
      },
      error: (error) => {
        console.error('Login failed:', error);
        this.errormessage = error.error?.message || 'Invalid email or password';
      }
    });
  }

  restpassword(): void {
    this.resetToken = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.isresetpassword = true;
    this.isMailSent = false;
    this.isMailSent2 = true;
    this.errormessage2 = '';
  }

  backtologin(): void {
    this.isresetpassword = false;
    this.isMailSent = false;
    this.isMailSent2 = true;

    // Clear error messages
    this.errormessage = '';
    this.errormessage2 = '';

    // Clear reset form inputs
    this.rsusername = '';
    this.resetToken = '';
    this.newPassword = '';
    this.confirmPassword = '';

    // Reset login form validation states & values
    this.loginForm.reset({
      email: '',
      password: '',
      rememberMe: false
    });
  }

  clearerror(): void {
    this.errormessage2 = '';
  }

  onsend(): void {
    if (!this.rsusername.trim()) {
      this.errormessage2 = 'Please enter a username or employee number.';
      return;
    }

    const data2 = {
      company: this.selectcompanyname,
      username: this.rsusername.trim()
    };

    // Use 'this.service' since hrpageservices wasn't declared/injected
    this.service.login('reset', data2).subscribe({
      next: (response) => {
        this.isMailSent = true;
        this.isMailSent2 = false;
        console.log('Password reset response:', response);
      },
      error: (error) => {
        this.errormessage2 = 'Invalid username or emailid';
        console.error('Password reset failed:', error);
      }
    });
  }

  resetPassword(): void {
    this.errormessage2 = '';

    if (this.newPassword.length < 6) {
      this.errormessage2 = 'Password must be at least 6 characters.';
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.errormessage2 = 'Passwords do not match.';
      return;
    }

    this.service.login('reset-password', {
      token: this.resetToken,
      password: this.newPassword,
    }).subscribe({
      next: () => {
        this.resetToken = '';
        this.newPassword = '';
        this.confirmPassword = '';
        this.isMailSent = true;
        this.isMailSent2 = false;
        this.errormessage2 = '';
      },
      error: (error) => {
        this.errormessage2 = error.error?.message || 'This password link has expired or was already used.';
      }
    });
  }
}