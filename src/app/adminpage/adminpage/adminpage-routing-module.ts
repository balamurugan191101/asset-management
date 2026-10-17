import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Home } from './home/home';
import { Adminpage } from './adminpage';
import { UserList } from './create-user/create-user';
import { Assets } from './assets/assets';
import { AssetCategoryPage } from './assets/category-page';
import { Maintenance } from './maintenance/maintenance';

const routes: Routes = [
 {
    path:"",
    component:Adminpage,
    children:[
      {
        path: '', 
       redirectTo : "home",
       pathMatch : "full"
      },
      {
        path: 'home',
        component: Home
      },
      {
        path: 'users',
        component: UserList
      },
      {
        path: 'users/new',
        redirectTo: 'users',
        pathMatch: 'full'
      },
      {
        path: 'inventory',
        component: Assets
      },
      {
        path: 'inventory/category/:category',
        component: AssetCategoryPage
      },
      {
        path: 'maintenance',
        component: Maintenance
      }
    ]
    }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminpageRoutingModule { }
