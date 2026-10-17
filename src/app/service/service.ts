import { Injectable } from '@angular/core';
import { environment } from '../../environment/env';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay, tap } from 'rxjs';

export interface UserRecord {
  id?: number;
  firstName?: string;
  lastName?: string;
  name: string;
  email: string;
  employeeId: string;
  role: string;
  department: string;
  status: string;
}

@Injectable({
  providedIn: 'root',
})
export class Service {
  private api = environment.apiurl;
  private usersRequest$?: Observable<UserRecord[]>;

  constructor(private http:HttpClient,private router:Router) { }

  login(login:string,data:any):Observable<any>{

    // console.log('hrservice display:',data);
    return this.http.post<any>(`${this.api}${login}`,data)    
  }

  getUsers(): Observable<UserRecord[]> {
    if (!this.usersRequest$) {
      this.usersRequest$ = this.http.get<UserRecord[]>(`${this.api}users`).pipe(
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.usersRequest$;
  }

  createUser(data: object): Observable<UserRecord> {
    return this.http.post<UserRecord>(`${this.api}users`, data).pipe(
      tap(() => this.usersRequest$ = undefined),
    );
  }

  deleteUser(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}users/${id}`).pipe(
      tap(() => this.usersRequest$ = undefined),
    );
  }
  
}
