import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Login } from './login/login';

const routes: Routes = [
   {
    path: 'login',
    component: Login
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },
  {
    path:"adminpage",
    loadChildren:()=>import('./adminpage/adminpage/adminpage-module').then(m=>m.AdminpageModule),
    // canActivate: [authGuard]
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
